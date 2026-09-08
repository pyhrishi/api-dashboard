/**
 * Growth alert center, multi-channel delivery & the weekly PM digest — SSOT
 * (F-194 custom thresholds · F-526 scheduled report delivery · F-553 multi-channel delivery).
 *
 * `lib/growth-kpis.ts` *evaluates* the four alert rules. This module makes them
 * operational:
 *   - **Incidents** — a rule that fires opens one incident per rule, per ISO week, per
 *     org; it stays open until someone acknowledges it (with a note) or the rule
 *     recovers (auto-resolved). Rehearsal incidents (created while a scenario is
 *     selected on the Growth page) are tagged so they never masquerade as real ones.
 *   - **Delivery** — every incident is routed to its owner's channels (in-app, email,
 *     Slack, webhook). Each attempt is a ledger entry with a deterministic outcome
 *     derived from the routing configuration (no recipients → failed, not pretend-sent).
 *   - **Thresholds** — admins can tune each rule inside fixed bounds; the bounds are
 *     the guard-rail so an alert can be tightened or relaxed, never switched off.
 *   - **Weekly PM digest** — a cadence (weekly / daily, weekday, UTC hour), recipients
 *     and channels; the console runs the digest when it is due (the prototype's
 *     scheduler) and keeps every rendered report with its deliveries.
 *
 * Pure functions here; the persisted `useAlertCenter` store applies them. No
 * `Math.random`; ids are derived from rule + week + org so they are stable.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { ALERT_RULES, type AlertEvaluation, type AlertOwner, type AlertRule, type KpiScenario, type KpiScope } from '@/lib/growth-kpis';

// ── Types ────────────────────────────────────────────────────────────────────

export type ConsoleRole = 'admin' | 'developer' | 'billing';
export type DeliveryChannel = 'in-app' | 'email' | 'slack' | 'webhook';
export const DELIVERY_CHANNELS: readonly DeliveryChannel[] = ['in-app', 'email', 'slack', 'webhook'];
export type IncidentStatus = 'open' | 'acknowledged' | 'resolved';
export type IncidentSource = 'live' | 'rehearsal';
export type RuleId = AlertRule['id'];

export interface AlertIncident {
  /** `inc_<rule>_<week>_<source>_<org>` — one per rule, week, source and org. */
  id: string;
  ruleId: RuleId;
  label: string;
  owner: AlertOwner;
  orgId: string | null;
  weekKey: string;
  firedAt: number;
  value: number;
  threshold: number;
  unit: '%' | 'pp';
  comparator: 'lt' | 'gt';
  summary: string;
  source: IncidentSource;
  scenario: KpiScenario;
  status: IncidentStatus;
  acknowledgedAt?: number;
  acknowledgedBy?: string;
  note?: string;
  resolvedAt?: number;
  resolvedBy?: string;
  resolution?: 'auto' | 'manual';
}

export interface RoutingConfig {
  owner: AlertOwner;
  channels: DeliveryChannel[];
  emails: string[];
  slackChannel: string;
  webhookUrl: string;
}

export type DeliveryStatus = 'delivered' | 'failed' | 'skipped';
export interface DeliveryRecord {
  id: string;
  kind: 'alert' | 'digest' | 'test';
  refId: string;
  owner: AlertOwner | 'PM digest';
  channel: DeliveryChannel;
  target: string;
  status: DeliveryStatus;
  at: number;
  detail: string;
}

export interface ThresholdBounds { min: number; max: number; step: number }
/** Guard-rails per rule: tune within, never disable. */
export const THRESHOLD_BOUNDS: Record<RuleId, ThresholdBounds> = {
  activation_wow: { min: -30, max: -5, step: 1 },
  otp_completion: { min: 40, max: 90, step: 5 },
  topup_failure: { min: 1, max: 20, step: 1 },
  docs_no_results: { min: 5, max: 50, step: 5 },
};

export type DigestCadence = 'weekly' | 'daily';
export interface DigestSettings {
  enabled: boolean;
  cadence: DigestCadence;
  /** ISO weekday, 1 = Monday … 7 = Sunday (weekly cadence). */
  weekday: number;
  hourUtc: number;
  channels: DeliveryChannel[];
  recipients: string[];
  slackChannel: string;
  scope: KpiScope;
}

export interface DigestRecord {
  id: string;
  generatedAt: number;
  periodLabel: string;
  trigger: 'scheduled' | 'manual';
  scope: KpiScope;
  firing: number;
  markdown: string;
  deliveries: number;
  delivered: number;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

export const ALERT_OWNERS: readonly AlertOwner[] = ['Product', 'Eng', 'Docs owner'];

export const DEFAULT_ROUTING: Record<AlertOwner, RoutingConfig> = {
  Product: { owner: 'Product', channels: ['in-app', 'slack', 'email'], emails: ['product@zintlr.com'], slackChannel: '#growth-alerts', webhookUrl: '' },
  Eng: { owner: 'Eng', channels: ['in-app', 'slack', 'webhook'], emails: ['oncall@zintlr.com'], slackChannel: '#eng-oncall', webhookUrl: 'https://events.pagerduty.com/v2/enqueue' },
  'Docs owner': { owner: 'Docs owner', channels: ['in-app', 'email'], emails: ['docs@zintlr.com'], slackChannel: '', webhookUrl: '' },
};

export const DEFAULT_DIGEST: DigestSettings = {
  enabled: true, cadence: 'weekly', weekday: 1, hourUtc: 8, channels: ['in-app', 'email', 'slack'],
  recipients: ['product@zintlr.com', 'founders@zintlr.com'], slackChannel: '#growth-weekly', scope: 'population',
};

export const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Monday' }, { value: 2, label: 'Tuesday' }, { value: 3, label: 'Wednesday' }, { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' }, { value: 6, label: 'Saturday' }, { value: 7, label: 'Sunday' },
];

const DAY = 86_400_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ── Thresholds ───────────────────────────────────────────────────────────────

export function clampThreshold(ruleId: RuleId, value: number): number {
  const b = THRESHOLD_BOUNDS[ruleId];
  if (!Number.isFinite(value)) return ALERT_RULES.find((r) => r.id === ruleId)?.threshold ?? b.min;
  const snapped = Math.round(value / b.step) * b.step;
  return Math.min(b.max, Math.max(b.min, snapped));
}

/** The four rules with any org overrides applied (clamped to bounds). */
export function effectiveRules(overrides: Partial<Record<RuleId, number>>): AlertRule[] {
  return ALERT_RULES.map((r) => {
    const o = overrides[r.id];
    return o === undefined ? r : { ...r, threshold: clampThreshold(r.id, o) };
  });
}

export function isDefaultThreshold(ruleId: RuleId, value: number): boolean {
  return (ALERT_RULES.find((r) => r.id === ruleId)?.threshold ?? NaN) === value;
}

// ── Time helpers ─────────────────────────────────────────────────────────────

/** ISO-8601 week key, e.g. `2026-W37`. */
export function weekKey(now: number): string {
  const d = new Date(now);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7; // Monday = 0
  target.setUTCDate(target.getUTCDate() - dayNr + 3); // Thursday of this week
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / DAY - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Next time the digest is due, or null when disabled. */
export function nextDigestRunAt(settings: DigestSettings, now: number): number | null {
  if (!settings.enabled) return null;
  const d = new Date(now);
  const todayAt = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), settings.hourUtc, 0, 0);
  if (settings.cadence === 'daily') return todayAt > now ? todayAt : todayAt + DAY;
  const isoToday = ((d.getUTCDay() + 6) % 7) + 1; // 1..7
  let delta = (settings.weekday - isoToday + 7) % 7;
  if (delta === 0 && todayAt <= now) delta = 7;
  return todayAt + delta * DAY;
}

/** The most recent scheduled point at or before `now`, or null when disabled. */
export function lastDigestPoint(settings: DigestSettings, now: number): number | null {
  const next = nextDigestRunAt(settings, now);
  if (next === null) return null;
  const period = settings.cadence === 'daily' ? DAY : 7 * DAY;
  return next - period;
}

/** True when a run is due: a schedule point has passed since the last run. */
export function digestIsDue(settings: DigestSettings, lastRunAt: number | null, now: number): boolean {
  const lastPoint = lastDigestPoint(settings, now);
  if (lastPoint === null) return false;
  return lastPoint <= now && (lastRunAt === null || lastRunAt < lastPoint);
}

export function digestPeriodLabel(now: number, cadence: DigestCadence): string {
  const d = new Date(now);
  if (cadence === 'daily') return d.toISOString().slice(0, 10);
  return `Week ${weekKey(now).slice(6)} · ${d.toISOString().slice(0, 10)}`;
}

// ── Incidents ────────────────────────────────────────────────────────────────

export interface ReconcileContext { now: number; orgId: string | null; source: IncidentSource; scenario: KpiScenario }
export interface ReconcileResult { incidents: AlertIncident[]; fired: AlertIncident[]; resolved: AlertIncident[] }

const incidentId = (ruleId: RuleId, wk: string, source: IncidentSource, orgId: string | null) => `inc_${ruleId}_${wk}_${source}_${orgId ?? 'org'}`;

/**
 * Turn this moment's evaluations into incident state: open a new incident for every
 * firing rule that has none open this week; auto-resolve open incidents whose rule
 * has recovered. Pure — returns the new list plus what changed.
 */
export function reconcileIncidents(existing: AlertIncident[], evaluations: AlertEvaluation[], ctx: ReconcileContext): ReconcileResult {
  const wk = weekKey(ctx.now);
  const fired: AlertIncident[] = [];
  const resolved: AlertIncident[] = [];
  let incidents = existing.slice();

  evaluations.forEach((ev) => {
    const activeIdx = incidents.findIndex((i) => i.ruleId === ev.id && i.orgId === ctx.orgId && i.source === ctx.source && i.status !== 'resolved');
    if (ev.status === 'firing' && ev.value !== null) {
      if (activeIdx === -1) {
        const inc: AlertIncident = {
          id: incidentId(ev.id, wk, ctx.source, ctx.orgId), ruleId: ev.id, label: ev.label, owner: ev.owner, orgId: ctx.orgId, weekKey: wk,
          firedAt: ctx.now, value: ev.value, threshold: ev.threshold, unit: ev.unit, comparator: ev.comparator, summary: ev.summary,
          source: ctx.source, scenario: ctx.scenario, status: 'open',
        };
        // Never duplicate an id (e.g. a resolved incident from earlier this week re-fires): suffix a sequence.
        if (incidents.some((i) => i.id === inc.id)) inc.id = `${inc.id}_${incidents.filter((i) => i.id.startsWith(inc.id)).length + 1}`;
        incidents = [inc, ...incidents];
        fired.push(inc);
      } else {
        // Keep the latest reading on the open incident.
        const cur = incidents[activeIdx];
        incidents[activeIdx] = { ...cur, value: ev.value, summary: ev.summary };
      }
    } else if (ev.status === 'ok' && activeIdx !== -1) {
      const cur = incidents[activeIdx];
      const done: AlertIncident = { ...cur, status: 'resolved', resolvedAt: ctx.now, resolution: 'auto', summary: `Recovered — ${ev.summary}` };
      incidents[activeIdx] = done;
      resolved.push(done);
    }
  });

  return { incidents: incidents.slice(0, 200), fired, resolved };
}

export function acknowledgeIncident(inc: AlertIncident, by: string, note: string, now: number): AlertIncident {
  if (inc.status !== 'open') return inc;
  return { ...inc, status: 'acknowledged', acknowledgedAt: now, acknowledgedBy: by, note: note.trim().slice(0, 280) || undefined };
}

export function resolveIncident(inc: AlertIncident, by: string, now: number): AlertIncident {
  if (inc.status === 'resolved') return inc;
  return { ...inc, status: 'resolved', resolvedAt: now, resolvedBy: by, resolution: 'manual', acknowledgedAt: inc.acknowledgedAt ?? now, acknowledgedBy: inc.acknowledgedBy ?? by };
}

/** Median time from fired → acknowledged across acknowledged/resolved incidents (ms), or null. */
export function medianTimeToAcknowledge(incidents: AlertIncident[]): number | null {
  const v = incidents.filter((i) => i.acknowledgedAt !== undefined).map((i) => (i.acknowledgedAt as number) - i.firedAt).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2);
}

export function fmtIncidentValue(inc: Pick<AlertIncident, 'value' | 'unit'>): string {
  if (inc.unit === 'pp') return `${inc.value > 0 ? '+' : inc.value < 0 ? '−' : ''}${Math.abs(inc.value)} pp`;
  return `${inc.value}%`;
}

/** The message a channel receives — the same text for Slack, email and webhook payloads. */
export function renderAlertText(inc: AlertIncident): string {
  const cmp = inc.comparator === 'lt' ? 'below' : 'above';
  const thr = `${inc.threshold < 0 ? '−' : ''}${Math.abs(inc.threshold)}${inc.unit === 'pp' ? ' pp' : '%'}`;
  return `🔴 [Zinbit Growth] ${inc.label}: ${fmtIncidentValue(inc)} — ${cmp} the ${thr} threshold (${inc.weekKey}). Owner: ${inc.owner}.${inc.source === 'rehearsal' ? ' [REHEARSAL]' : ''} → /console/alerts`;
}

// ── Delivery ─────────────────────────────────────────────────────────────────

export function normalizeEmails(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  input.forEach((v) => {
    if (typeof v !== 'string') return;
    const e = v.trim().toLowerCase();
    if (EMAIL_RE.test(e) && !out.includes(e)) out.push(e);
  });
  return out.slice(0, 12);
}

export function isValidSlackChannel(s: string): boolean { return /^#[a-z0-9_-]{1,80}$/.test(s.trim()); }
export function isValidWebhookUrl(s: string): boolean { return /^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(s.trim()); }

interface Target { channel: DeliveryChannel; target: string; status: DeliveryStatus; detail: string }

/** Which targets a routing config actually reaches. Misconfiguration fails honestly. */
export function resolveTargets(routing: Pick<RoutingConfig, 'channels' | 'emails' | 'slackChannel' | 'webhookUrl'>): Target[] {
  const out: Target[] = [];
  DELIVERY_CHANNELS.forEach((ch) => {
    if (!routing.channels.includes(ch)) return;
    if (ch === 'in-app') { out.push({ channel: ch, target: 'console notifications', status: 'delivered', detail: 'Shown in the bell and on the Alert Center.' }); return; }
    if (ch === 'email') {
      const emails = normalizeEmails(routing.emails);
      if (emails.length === 0) out.push({ channel: ch, target: '—', status: 'failed', detail: 'No valid recipient — add an email under routing.' });
      else emails.forEach((e) => out.push({ channel: ch, target: e, status: 'delivered', detail: 'Accepted by the mail relay.' }));
      return;
    }
    if (ch === 'slack') {
      const ok = isValidSlackChannel(routing.slackChannel);
      out.push({ channel: ch, target: routing.slackChannel.trim() || '—', status: ok ? 'delivered' : 'failed', detail: ok ? 'Posted via the Zinbit Slack app.' : 'Channel must look like #growth-alerts.' });
      return;
    }
    const ok = isValidWebhookUrl(routing.webhookUrl);
    out.push({ channel: ch, target: routing.webhookUrl.trim() || '—', status: ok ? 'delivered' : 'failed', detail: ok ? 'HTTP 202 from the endpoint (signed payload).' : 'Webhook URL must be https://…' });
  });
  return out;
}

export function planDeliveries(kind: DeliveryRecord['kind'], refId: string, owner: DeliveryRecord['owner'], routing: Pick<RoutingConfig, 'channels' | 'emails' | 'slackChannel' | 'webhookUrl'>, now: number): DeliveryRecord[] {
  return resolveTargets(routing).map((t, i) => ({
    id: `dl_${refId}_${t.channel}_${i}`, kind, refId, owner, channel: t.channel, target: t.target, status: t.status, at: now, detail: t.detail,
  }));
}

export function deliverySummary(records: DeliveryRecord[]): { total: number; delivered: number; failed: number; failureRatePct: number } {
  const delivered = records.filter((r) => r.status === 'delivered').length;
  const failed = records.filter((r) => r.status === 'failed').length;
  const total = records.length;
  return { total, delivered, failed, failureRatePct: total === 0 ? 0 : Math.round((failed / total) * 1000) / 10 };
}

// ── Persisted store ──────────────────────────────────────────────────────────

export const canManageAlerts = (role: ConsoleRole | undefined) => role === 'admin';
export const canAcknowledge = (role: ConsoleRole | undefined) => role === 'admin' || role === 'billing' || role === 'developer';

export interface AlertCenterState {
  incidents: AlertIncident[];
  deliveries: DeliveryRecord[];
  routing: Record<AlertOwner, RoutingConfig>;
  thresholds: Partial<Record<RuleId, number>>;
  digest: DigestSettings;
  digests: DigestRecord[];
  lastDigestRunAt: number | null;
  /** When the bell was last opened — incidents fired after this are "unseen". */
  lastSeenAt: number;

  recordEvaluation: (evaluations: AlertEvaluation[], ctx: ReconcileContext) => ReconcileResult;
  acknowledge: (role: ConsoleRole | undefined, id: string, by: string, note: string, now?: number) => boolean;
  resolve: (role: ConsoleRole | undefined, id: string, by: string, now?: number) => boolean;
  clearRehearsals: () => void;
  /** Auto-resolve open rehearsal incidents (the Growth page switched back to the current week). */
  resolveRehearsals: (now?: number) => number;
  setThreshold: (role: ConsoleRole | undefined, ruleId: RuleId, value: number) => boolean;
  resetThreshold: (role: ConsoleRole | undefined, ruleId: RuleId) => boolean;
  updateRouting: (role: ConsoleRole | undefined, owner: AlertOwner, patch: Partial<Omit<RoutingConfig, 'owner'>>) => boolean;
  sendTest: (role: ConsoleRole | undefined, owner: AlertOwner, now?: number) => DeliveryRecord[];
  updateDigest: (role: ConsoleRole | undefined, patch: Partial<DigestSettings>) => boolean;
  runDigest: (input: { markdown: string; trigger: DigestRecord['trigger']; scope: KpiScope; firing: number; now?: number }) => DigestRecord;
  markSeen: (now?: number) => void;
  resetAlertCenter: () => void;
}

const initial = () => ({
  incidents: [] as AlertIncident[], deliveries: [] as DeliveryRecord[],
  routing: { Product: { ...DEFAULT_ROUTING.Product }, Eng: { ...DEFAULT_ROUTING.Eng }, 'Docs owner': { ...DEFAULT_ROUTING['Docs owner'] } } as Record<AlertOwner, RoutingConfig>,
  thresholds: {} as Partial<Record<RuleId, number>>, digest: { ...DEFAULT_DIGEST }, digests: [] as DigestRecord[], lastDigestRunAt: null as number | null, lastSeenAt: 0,
});

export const useAlertCenter = create<AlertCenterState>()(
  persist(
    (set, get) => ({
      ...initial(),

      recordEvaluation: (evaluations, ctx) => {
        const result = reconcileIncidents(get().incidents, evaluations, ctx);
        if (result.fired.length === 0 && result.resolved.length === 0) return result;
        const routing = get().routing;
        const newDeliveries = result.fired.flatMap((inc) => planDeliveries('alert', inc.id, inc.owner, routing[inc.owner], ctx.now));
        set((s) => ({ incidents: result.incidents, deliveries: [...newDeliveries, ...s.deliveries].slice(0, 500) }));
        return result;
      },

      acknowledge: (role, id, by, note, now = Date.now()) => {
        if (!canAcknowledge(role)) return false;
        const inc = get().incidents.find((i) => i.id === id);
        if (!inc || inc.status !== 'open') return false;
        set((s) => ({ incidents: s.incidents.map((i) => (i.id === id ? acknowledgeIncident(i, by, note, now) : i)) }));
        return true;
      },

      resolve: (role, id, by, now = Date.now()) => {
        if (!canAcknowledge(role)) return false;
        const inc = get().incidents.find((i) => i.id === id);
        if (!inc || inc.status === 'resolved') return false;
        set((s) => ({ incidents: s.incidents.map((i) => (i.id === id ? resolveIncident(i, by, now) : i)) }));
        return true;
      },

      resolveRehearsals: (now = Date.now()) => {
        const open = get().incidents.filter((i) => i.source === 'rehearsal' && i.status !== 'resolved');
        if (open.length === 0) return 0;
        set((s) => ({ incidents: s.incidents.map((i) => (i.source === 'rehearsal' && i.status !== 'resolved' ? { ...i, status: 'resolved' as const, resolvedAt: now, resolution: 'auto' as const, summary: `Rehearsal ended — ${i.summary}` } : i)) }));
        return open.length;
      },

      clearRehearsals: () => set((s) => {
        const ids = new Set(s.incidents.filter((i) => i.source === 'rehearsal').map((i) => i.id));
        return { incidents: s.incidents.filter((i) => i.source !== 'rehearsal'), deliveries: s.deliveries.filter((d) => !ids.has(d.refId)) };
      }),

      setThreshold: (role, ruleId, value) => {
        if (!canManageAlerts(role)) return false;
        set((s) => ({ thresholds: { ...s.thresholds, [ruleId]: clampThreshold(ruleId, value) } }));
        return true;
      },
      resetThreshold: (role, ruleId) => {
        if (!canManageAlerts(role)) return false;
        set((s) => { const t = { ...s.thresholds }; delete t[ruleId]; return { thresholds: t }; });
        return true;
      },

      updateRouting: (role, owner, patch) => {
        if (!canManageAlerts(role)) return false;
        set((s) => {
          const cur = s.routing[owner];
          const channels = patch.channels ? DELIVERY_CHANNELS.filter((c) => patch.channels?.includes(c)) : cur.channels;
          return {
            routing: {
              ...s.routing,
              [owner]: {
                ...cur,
                channels: channels.includes('in-app') ? channels : ['in-app', ...channels], // in-app is the floor: an alert always lands somewhere
                emails: patch.emails ? normalizeEmails(patch.emails) : cur.emails,
                slackChannel: patch.slackChannel !== undefined ? patch.slackChannel.trim().slice(0, 80) : cur.slackChannel,
                webhookUrl: patch.webhookUrl !== undefined ? patch.webhookUrl.trim().slice(0, 300) : cur.webhookUrl,
              },
            },
          };
        });
        return true;
      },

      sendTest: (role, owner, now = Date.now()) => {
        if (!canManageAlerts(role)) return [];
        const recs = planDeliveries('test', `test_${owner.replace(/\s+/g, '-').toLowerCase()}_${now}`, owner, get().routing[owner], now);
        set((s) => ({ deliveries: [...recs, ...s.deliveries].slice(0, 500) }));
        return recs;
      },

      updateDigest: (role, patch) => {
        if (!canManageAlerts(role)) return false;
        set((s) => ({
          digest: {
            ...s.digest,
            ...patch,
            weekday: patch.weekday !== undefined ? Math.min(7, Math.max(1, Math.round(patch.weekday))) : s.digest.weekday,
            hourUtc: patch.hourUtc !== undefined ? Math.min(23, Math.max(0, Math.round(patch.hourUtc))) : s.digest.hourUtc,
            recipients: patch.recipients ? normalizeEmails(patch.recipients) : s.digest.recipients,
            channels: patch.channels ? DELIVERY_CHANNELS.filter((c) => patch.channels?.includes(c)) : s.digest.channels,
            slackChannel: patch.slackChannel !== undefined ? patch.slackChannel.trim().slice(0, 80) : s.digest.slackChannel,
          },
        }));
        return true;
      },

      runDigest: ({ markdown, trigger, scope, firing, now = Date.now() }) => {
        const d = get().digest;
        const id = `dg_${now}`;
        const deliveries = planDeliveries('digest', id, 'PM digest', { channels: d.channels, emails: d.recipients, slackChannel: d.slackChannel, webhookUrl: '' }, now);
        const rec: DigestRecord = {
          id, generatedAt: now, periodLabel: digestPeriodLabel(now, d.cadence), trigger, scope, firing, markdown,
          deliveries: deliveries.length, delivered: deliveries.filter((x) => x.status === 'delivered').length,
        };
        set((s) => ({ digests: [rec, ...s.digests].slice(0, 26), deliveries: [...deliveries, ...s.deliveries].slice(0, 500), lastDigestRunAt: now }));
        return rec;
      },

      markSeen: (now = Date.now()) => set({ lastSeenAt: now }),
      resetAlertCenter: () => set(initial()),
    }),
    { name: 'zinbit-alert-center', storage: createJSONStorage(() => localStorage) },
  ),
);

// ── Selectors ────────────────────────────────────────────────────────────────

export const openIncidents = (incidents: AlertIncident[]) => incidents.filter((i) => i.status === 'open');
export const unseenIncidents = (incidents: AlertIncident[], lastSeenAt: number) => incidents.filter((i) => i.status === 'open' && i.firedAt > lastSeenAt);

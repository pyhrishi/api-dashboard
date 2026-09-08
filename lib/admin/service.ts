/**
 * Admin service — the in-memory backend of the prototype (production: the products'
 * admin APIs + a durable store behind Zintlr SSO). Sequences the pure engines in
 * `./insights`, keeps state, and writes an audit entry for every mutation.
 *
 * Invariants: no response bodies anywhere; no plaintext secrets at rest (a regenerated
 * or minted secret is returned exactly once); every mutation carries actor + reason.
 */

import { sha256Hex, keyFingerprint } from '@/lib/admin/key-hashing';
import { seedAll } from './seed';
import {
  keysNearExpiryInUse, walletSnapshot, walletSeries, summarizeLedger, summarizeFunnel, customerMetrics, evaluateTriggers, timeframe,
  type FunnelFilters, type TimeframeKey, type CustomerMetrics,
} from './insights';
import {
  DEFAULT_ALERT_RULES, evaluateAlerts, alertStats, sortAlerts,
  type Alert, type AlertRule, type AlertInputRow,
} from './alerts';
import { detectAbuse, riskScores, abuseStats } from './anomaly';
import { portfolioHealth, type HealthInput } from './health';
import { CHANGE_POLICY, validateChange, summarizeChange, approvalStats, APPROVAL_TTL_DAYS, type PendingChange, type ChangeKind, type ChangePayload } from './approvals';
import { MESSAGE_TEMPLATES, messageTemplate, deriveSuggestions, type CustomerMessage, type MessageChannel, type MessageTemplateId, type MessageSuggestion, type MessageVars } from './messaging';
import type {
  Customer, ManagedKey, LedgerEntry, Wallet, AccessRequest, SalesTrigger, Handoff, AuditEntry, AdminRole, ImpersonationSession,
  WalletSnapshot, KeyStatus, RateTier, HandoffState, AccessRequestStatus,
} from './types';

import { CONSOLE_BASE_URL } from '@/lib/admin/config';

const DAY = 86_400_000;
const HOUR = 3_600_000;
export const IMPERSONATION_TTL_MS = 30 * 60_000;

export interface Actor { email: string; role: AdminRole }

interface State {
  customers: Customer[];
  keys: ManagedKey[];
  ledger: LedgerEntry[];
  wallets: Wallet[];
  accessRequests: AccessRequest[];
  triggers: SalesTrigger[];
  handoffs: Handoff[];
  audit: AuditEntry[];
  sessions: ImpersonationSession[];
  alertRules: AlertRule[];
  alerts: Alert[];
  abuseDismissals: { signalId: string; actor: string; reason: string; at: string }[];
  changes: PendingChange[];
  messages: CustomerMessage[];
  seq: number;
}

let S: State = boot(Date.now());

function boot(now: number): State {
  const seed = seedAll(now);
  const st: State = { ...seed, handoffs: [], sessions: [], alertRules: [], alerts: [], abuseDismissals: [], changes: [], messages: [], seq: 0 };
  // Evaluate triggers once at boot so the handoff queue reads as continuous; age the fires a little.
  const metrics = new Map(st.customers.map((c) => [c.id, customerMetrics(c, st.ledger, walletSnapshot(walletFor(st, c.id), st.ledger, now))]));
  st.handoffs = evaluateTriggers(st.triggers, st.customers, metrics, [], now, (c, t) => `hnd_${sha256Hex(`${c.id}:${t.id}`).slice(0, 8)}`).map((h, i) => {
    const age = (i % 5) * 0.8 * DAY;
    const state: HandoffState = i % 4 === 1 ? 'contacted' : i % 7 === 3 ? 'converted' : 'new';
    return { ...h, firedAt: new Date(now - age).toISOString(), state, notes: state === 'contacted' ? [{ at: new Date(now - age + 3_600_000).toISOString(), actor: 'ananya.iyer@zintlr.com', note: 'Intro call booked for Thursday.' }] : [] };
  });
  // Operational alerts (deep feature 1): seed the rules and raise a continuous stream.
  st.alertRules = DEFAULT_ALERT_RULES.map((r) => ({ ...r }));
  let aseq = 0;
  const arows = st.customers.map((c) => alertRowFor(st, c, now));
  const ainsights = keysNearExpiryInUse(st.keys, st.customers, now);
  const araw = evaluateAlerts(arows, ainsights, st.alertRules, [], now, (kind) => `alr_${sha256Hex(`${kind}:${aseq++}`).slice(0, 10)}`);
  st.alerts = araw.map((a, i) => {
    const firedAt = new Date(now - (i % 8) * 40 * 60_000).toISOString();
    if (i % 5 === 2) return { ...a, firedAt, state: 'acked' as const, ackedBy: 'sofia.reyes@zintlr.com', ackedAt: new Date(Date.parse(firedAt) + 600_000).toISOString() };
    if (i % 9 === 4) return { ...a, firedAt, state: 'resolved' as const, ackedBy: 'sofia.reyes@zintlr.com', ackedAt: new Date(Date.parse(firedAt) + 600_000).toISOString(), resolvedAt: new Date(Date.parse(firedAt) + 1_200_000).toISOString() };
    return { ...a, firedAt };
  });
  // Maker-checker queue (deep feature 4): a couple of pending high-risk changes + one applied, for a continuous queue.
  const helLive = st.keys.find((k) => k.customerId === 'cus_helioz' && k.environment === 'live');
  const orbLive = st.keys.find((k) => k.customerId === 'cus_orbit' && k.environment === 'live');
  const isoAt = (ms: number) => new Date(ms).toISOString();
  st.changes = [
    { id: 'chg_seed_1', kind: 'grant_credits', status: 'pending', customerId: 'cus_saffron', customerName: 'Saffron Retail', keyId: null, keyLabel: null, payload: { amount: 120000 }, requestedBy: 'marcus.lee@zintlr.com', requestedByRole: 'finance', requestedAt: isoAt(now - 6 * HOUR), reason: 'Goodwill credit — wallet hit zero mid-month during the provider incident; AM approved verbally.', decidedBy: null, decidedAt: null, decisionReason: null, appliedResult: null, expiresAt: isoAt(now + APPROVAL_TTL_DAYS * DAY - 6 * HOUR) },
    ...(helLive ? [{ id: 'chg_seed_2', kind: 'raise_limit' as const, status: 'pending' as const, customerId: 'cus_helioz', customerName: 'Helioz AI', keyId: helLive.id, keyLabel: `${helLive.name} (${helLive.prefix}••••${helLive.last4})`, payload: { creditLimit: 250000 }, requestedBy: 'sofia.reyes@zintlr.com', requestedByRole: 'ops' as const, requestedAt: isoAt(now - 20 * HOUR), reason: 'Batch backfill on the 15th needs headroom; customer confirmed on ticket #4802.', decidedBy: null, decidedAt: null, decisionReason: null, appliedResult: null, expiresAt: isoAt(now + APPROVAL_TTL_DAYS * DAY - 20 * HOUR) }] : []),
    ...(orbLive ? [{ id: 'chg_seed_3', kind: 'raise_limit' as const, status: 'approved' as const, customerId: 'cus_orbit', customerName: 'Orbit Recruit', keyId: orbLive.id, keyLabel: `${orbLive.name} (${orbLive.prefix}••••${orbLive.last4})`, payload: { creditLimit: 80000 }, requestedBy: 'sofia.reyes@zintlr.com', requestedByRole: 'ops' as const, requestedAt: isoAt(now - 3 * DAY), reason: 'Standard limit bump for a paying customer.', decidedBy: 'dev7@zintlr.com', decidedAt: isoAt(now - 3 * DAY + 2 * HOUR), decisionReason: 'Approved — paying customer, within policy.', appliedResult: 'Credit limit raised to 80,000.', expiresAt: isoAt(now - 3 * DAY + APPROVAL_TTL_DAYS * DAY) }] : []),
  ];
  // Customer messages outbox (deep feature 5): a couple already sent, for a continuous log.
  const mkMsg = (id: string, cid: string, cname: string, to: string, tpl: MessageTemplateId, vars: Partial<MessageVars>, by: string, ago: number): CustomerMessage => {
    const r = (messageTemplate(tpl) as { render: (v: MessageVars) => { subject: string; body: string } }).render({ ...vars, customerName: cname });
    return { id, customerId: cid, customerName: cname, to, channel: 'email', templateId: tpl, subject: r.subject, body: r.body, sentBy: by, sentAt: isoAt(now - ago), relatedTo: null };
  };
  st.messages = [
    mkMsg('msg_seed_1', 'cus_lumen', 'Lumen Health', 'dev@lumenhealth.io', 'limit_available', {}, 'ananya.iyer@zintlr.com', 2 * DAY),
    mkMsg('msg_seed_2', 'cus_zerodha', 'Zerodha', 'ops@zerodha.com', 'wallet_zero', { balance: 0 }, 'marcus.lee@zintlr.com', 20 * HOUR),
  ];
  return st;
}

function walletFor(st: State, customerId: string): Wallet {
  return st.wallets.find((w) => w.customerId === customerId) ?? { customerId, balance: 0, topUps: [] };
}
function nextId(prefix: string): string { S.seq += 1; return `${prefix}_${sha256Hex(`${prefix}:${S.seq}:${Date.now()}`).slice(0, 10)}`; }

function audit(actor: Actor, customerId: string | null, action: string, target: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null, reason: string, now: number): AuditEntry {
  const e: AuditEntry = { id: nextId('aud'), at: new Date(now).toISOString(), actor: actor.email, actorRole: actor.role, customerId, action, target, before, after, reason };
  S.audit.unshift(e);
  return e;
}

export class AdminError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const requireReason = (reason: string) => { if (!reason || reason.trim().length < 4) throw new AdminError(400, 'REASON_REQUIRED', 'A reason (4+ characters) is required for every change.'); };
const can = (actor: Actor, roles: AdminRole[]) => { if (!roles.includes(actor.role)) throw new AdminError(403, 'FORBIDDEN', `Your role (${actor.role}) cannot do this. Needs: ${roles.join(' or ')}.`); };

// ── Reads ────────────────────────────────────────────────────────────────────

export function listCustomers(): Customer[] { return S.customers.slice(); }
export function getCustomer(id: string): Customer | null { return S.customers.find((c) => c.id === id) ?? null; }
export function listKeys(customerId?: string): ManagedKey[] { return S.keys.filter((k) => !customerId || k.customerId === customerId); }
export function getKey(id: string): ManagedKey | null { return S.keys.find((k) => k.id === id) ?? null; }
export function listTriggers(): SalesTrigger[] { return S.triggers.slice(); }
export function listHandoffs(): Handoff[] { return S.handoffs.slice().sort((a, b) => Date.parse(b.firedAt) - Date.parse(a.firedAt)); }
export function listAccessRequests(): AccessRequest[] { return S.accessRequests.slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)); }
export function getAccessRequest(id: string): AccessRequest | null { return S.accessRequests.find((r) => r.id === id) ?? null; }
export function listAudit(filter: { customerId?: string; actor?: string } = {}): AuditEntry[] {
  return S.audit.filter((a) => (!filter.customerId || a.customerId === filter.customerId) && (!filter.actor || a.actor === filter.actor));
}
export function listSessions(): ImpersonationSession[] { return S.sessions.slice().reverse(); }
export function activeSessions(customerId?: string, now: number = Date.now()): ImpersonationSession[] {
  return S.sessions.filter((s) => !s.endedAt && Date.parse(s.expiresAt) > now && (!customerId || s.customerId === customerId));
}

export function walletSnapshots(now: number = Date.now()): WalletSnapshot[] {
  return S.wallets.map((w) => walletSnapshot(w, S.ledger, now));
}
export function walletDetail(customerId: string, now: number = Date.now()) {
  const w = walletFor(S, customerId);
  return { snapshot: walletSnapshot(w, S.ledger, now), series: walletSeries(w, S.ledger, now), topUps: w.topUps.slice().sort((a, b) => Date.parse(b.at) - Date.parse(a.at)) };
}
export function keyInsights(now: number = Date.now()) { return keysNearExpiryInUse(S.keys, S.customers, now); }
export function funnel(filters: FunnelFilters, now: number = Date.now()) { return summarizeFunnel(S.customers, now, filters); }

export interface LedgerQuery { customerId?: string; keyId?: string; status?: number | '2xx' | '4xx' | '5xx'; endpoint?: string; frame: TimeframeKey; cursor?: number; limit?: number }
export function ledger(q: LedgerQuery, now: number = Date.now()) {
  const frame = timeframe(q.frame, now);
  const rows = S.ledger.filter((e) =>
    e.ts >= frame.from && e.ts <= frame.to &&
    (!q.customerId || e.customerId === q.customerId) && (!q.keyId || e.keyId === q.keyId) && (!q.endpoint || e.endpoint === q.endpoint) &&
    (q.status === undefined || (typeof q.status === 'number' ? e.status === q.status : q.status === '2xx' ? e.status < 300 : q.status === '4xx' ? e.status >= 400 && e.status < 500 : e.status >= 500)));
  const summary = summarizeLedger(rows, S.keys, frame);
  const limit = Math.min(200, q.limit ?? 50);
  const cursor = q.cursor ?? 0;
  return { frame, summary, entries: rows.slice(cursor, cursor + limit), nextCursor: cursor + limit < rows.length ? cursor + limit : null, total: rows.length };
}
export function ledgerCsv(q: LedgerQuery, now: number = Date.now()): string {
  const { entries } = ledger({ ...q, limit: 200, cursor: 0 }, now);
  const head = 'request_id,customer_id,key_fingerprint,timestamp,method,endpoint,status,latency_ms,credits,region,cache,idempotent';
  const fp = new Map(S.keys.map((k) => [k.id, k.fingerprint]));
  return [head, ...entries.map((e) => [e.requestId, e.customerId, fp.get(e.keyId) ?? '', new Date(e.ts).toISOString(), e.method, e.endpoint, e.status, e.latencyMs, e.credits, e.region, e.cache ?? '', e.idempotent].join(','))].join('\n');
}

export function overview(now: number = Date.now()) {
  const snaps = walletSnapshots(now);
  const fun = funnel({}, now);
  const insights = keyInsights(now);
  const al = alertStats(S.alerts, now);
  const ab = abuseStats(detectAbuse(S.customers, S.keys, S.ledger, now).filter((sig) => !S.abuseDismissals.some((d) => d.signalId === sig.id)));
  const pendingApprovals = S.changes.filter((c) => c.status === 'pending').length;
  return {
    customers: S.customers.length,
    activeTrials: S.customers.filter((c) => c.plan === 'Trial' && c.stage !== 'churned').length,
    paying: S.customers.filter((c) => c.stage === 'paying' || c.stage === 'expanding').length,
    walletsBelowTenPct: snaps.filter((s) => s.belowTenPct).length,
    walletsAtZero: snaps.filter((s) => s.atZero).length,
    keysNearExpiryInUse: insights.length,
    openAccessRequests: S.accessRequests.filter((r) => r.status === 'open' || r.status === 'needs_info').length,
    newHandoffs: S.handoffs.filter((h) => h.state === 'new').length,
    calls24h: S.ledger.filter((e) => e.ts >= now - DAY).length,
    credits24h: S.ledger.filter((e) => e.ts >= now - DAY).reduce((s, e) => s + e.credits, 0),
    funnel: fun,
    walletFlags: snaps.filter((s) => s.belowTenPct || s.atZero).map((s) => ({ ...s, customerName: getCustomer(s.customerId)?.name ?? s.customerId })),
    keyInsights: insights,
    firingAlerts: al.firing,
    criticalAlerts: al.critical,
    alertsByTeam: al.byTeam,
    topAlerts: sortAlerts(S.alerts.filter((a) => a.state === 'firing')).slice(0, 4),
    openAbuseSignals: ab.total,
    criticalAbuse: ab.critical,
    pendingApprovals,
    activeSessions: activeSessions(undefined, now).length,
    previewCustomers: Array.from(new Set(activeSessions(undefined, now).map((s) => s.customerId))).map((id) => ({ id, name: getCustomer(id)?.name ?? id })),
  };
}

export function customerMetricsFor(customerId: string, now: number = Date.now()): CustomerMetrics | null {
  const c = getCustomer(customerId);
  if (!c) return null;
  return customerMetrics(c, S.ledger, walletSnapshot(walletFor(S, customerId), S.ledger, now));
}

// ── Operational alerts (deep feature 1) ─────────────────────────────────────

function alertRowFor(st: State, c: Customer, now: number): AlertInputRow {
  const snap = walletSnapshot(walletFor(st, c.id), st.ledger, now);
  const last24 = st.ledger.filter((e) => e.customerId === c.id && e.ts >= now - DAY);
  const calls24h = last24.length;
  const errors = last24.filter((e) => e.status >= 400).length;
  const lat = last24.map((e) => e.latencyMs).sort((a, b) => a - b);
  const prior = st.ledger.filter((e) => e.customerId === c.id && e.ts >= now - 8 * DAY && e.ts < now - DAY);
  return {
    customer: c, wallet: snap,
    errorRate24h: calls24h ? Math.round((errors / calls24h) * 1000) / 10 : 0,
    p95_24h: lat.length ? lat[Math.min(lat.length - 1, Math.floor(0.95 * (lat.length - 1)))] : 0,
    calls24h, credits24h: last24.reduce((s, e) => s + e.credits, 0),
    dailyAvgCredits7d: prior.reduce((s, e) => s + e.credits, 0) / 7,
  };
}

export function listAlerts(): Alert[] { return sortAlerts(S.alerts); }
export function listAlertRules(): AlertRule[] { return S.alertRules.slice(); }
export function alertsOverview(now: number = Date.now()) {
  return { alerts: sortAlerts(S.alerts).map((a) => ({ ...a, customerName: getCustomer(a.customerId)?.name ?? a.customerName })), rules: S.alertRules.slice(), stats: alertStats(S.alerts, now) };
}

function raiseAlerts(now: number): Alert[] {
  const created = evaluateAlerts(S.customers.map((c) => alertRowFor(S, c, now)), keyInsights(now), S.alertRules, S.alerts, now, (kind) => nextId(`alr_${kind}`));
  S.alerts.unshift(...created);
  return created;
}

export function evaluateAlertsNow(actor: Actor, now: number = Date.now()): Alert[] {
  can(actor, ['superadmin', 'ops', 'finance', 'sales']);
  const created = raiseAlerts(now);
  if (created.length) audit(actor, null, 'alerts.evaluated', 'all', null, { created: created.length }, 'Manual alert evaluation.', now);
  return created;
}

function findAlert(id: string): Alert {
  const a = S.alerts.find((x) => x.id === id);
  if (!a) throw new AdminError(404, 'ALERT_NOT_FOUND', 'Unknown alert.');
  return a;
}

export function ackAlert(actor: Actor, id: string, reason: string, now: number = Date.now()): Alert {
  can(actor, ['superadmin', 'ops', 'finance']);
  requireReason(reason);
  const a = findAlert(id);
  if (a.state === 'resolved') throw new AdminError(409, 'ALERT_RESOLVED', 'This alert is already resolved.');
  const before = { state: a.state };
  a.state = 'acked'; a.ackedBy = actor.email; a.ackedAt = new Date(now).toISOString(); a.snoozedUntil = null;
  audit(actor, a.customerId, 'alert.acked', a.id, before, { state: a.state }, reason, now);
  return a;
}

export function resolveAlert(actor: Actor, id: string, reason: string, now: number = Date.now()): Alert {
  can(actor, ['superadmin', 'ops', 'finance']);
  requireReason(reason);
  const a = findAlert(id);
  const before = { state: a.state };
  a.state = 'resolved'; a.resolvedAt = new Date(now).toISOString(); a.snoozedUntil = null;
  if (!a.ackedBy) { a.ackedBy = actor.email; a.ackedAt = a.resolvedAt; }
  audit(actor, a.customerId, 'alert.resolved', a.id, before, { state: a.state }, reason, now);
  return a;
}

export function snoozeAlert(actor: Actor, id: string, hours: number, reason: string, now: number = Date.now()): Alert {
  can(actor, ['superadmin', 'ops', 'finance']);
  requireReason(reason);
  const a = findAlert(id);
  if (a.state === 'resolved') throw new AdminError(409, 'ALERT_RESOLVED', 'This alert is already resolved.');
  const h = Math.min(168, Math.max(1, Math.round(hours || 4)));
  const before = { state: a.state };
  a.state = 'snoozed'; a.snoozedUntil = new Date(now + h * HOUR).toISOString();
  audit(actor, a.customerId, 'alert.snoozed', a.id, before, { state: a.state, hours: h }, reason, now);
  return a;
}

export function updateAlertRule(actor: Actor, id: string, patch: unknown, reason: string, now: number = Date.now()): AlertRule {
  can(actor, ['superadmin', 'ops', 'finance']);
  requireReason(reason);
  const r = S.alertRules.find((x) => x.id === id);
  if (!r) throw new AdminError(404, 'RULE_NOT_FOUND', 'Unknown alert rule.');
  const p = (patch && typeof patch === 'object' ? patch : {}) as Record<string, unknown>;
  const before: Record<string, unknown> = {}; const after: Record<string, unknown> = {};
  if (typeof p.enabled === 'boolean') { before.enabled = r.enabled; r.enabled = p.enabled; after.enabled = r.enabled; }
  if (typeof p.threshold === 'number' && Number.isFinite(p.threshold)) { before.threshold = r.threshold; r.threshold = Math.max(0, p.threshold); after.threshold = r.threshold; }
  if (p.severity === 'critical' || p.severity === 'warning' || p.severity === 'info') { before.severity = r.severity; r.severity = p.severity; after.severity = r.severity; }
  if (p.team === 'ops' || p.team === 'finance' || p.team === 'sales') { before.team = r.team; r.team = p.team; after.team = r.team; }
  if (p.channel === 'pagerduty' || p.channel === 'slack' || p.channel === 'email') { before.channel = r.channel; r.channel = p.channel; after.channel = r.channel; }
  if (typeof p.cooldownHours === 'number' && p.cooldownHours >= 1) { before.cooldownHours = r.cooldownHours; r.cooldownHours = Math.round(p.cooldownHours); after.cooldownHours = r.cooldownHours; }
  if (typeof p.minActivity === 'number' && p.minActivity >= 0) { before.minActivity = r.minActivity; r.minActivity = Math.round(p.minActivity); after.minActivity = r.minActivity; }
  if (!Object.keys(after).length) throw new AdminError(400, 'NO_CHANGES', 'Nothing valid to change.');
  audit(actor, null, 'alert_rule.updated', r.id, before, after, reason, now);
  return r;
}

// ── Account health scoring (deep feature 3) ─────────────────────────────────

function healthInputFor(st: State, c: Customer, now: number): HealthInput {
  const mine = st.ledger.filter((e) => e.customerId === c.id);
  const win = (from: number, to: number) => mine.filter((e) => e.ts >= from && e.ts < to);
  const last7 = win(now - 7 * DAY, now + 1);
  const last24 = win(now - DAY, now + 1);
  const lastTs = mine.reduce((m, e) => Math.max(m, e.ts), 0);
  return {
    customer: c,
    calls7d: last7.length,
    callsPrior7d: win(now - 14 * DAY, now - 7 * DAY).length,
    credits7d: last7.reduce((s, e) => s + e.credits, 0),
    errorRate24h: last24.length ? Math.round((last24.filter((e) => e.status >= 400).length / last24.length) * 1000) / 10 : 0,
    lastCallAgoDays: lastTs ? (now - lastTs) / DAY : null,
    wallet: walletSnapshot(walletFor(st, c.id), st.ledger, now),
    activeKeys: st.keys.filter((k) => k.customerId === c.id && k.status === 'active').length,
    openRequests: st.accessRequests.filter((r) => r.customerId === c.id && (r.status === 'open' || r.status === 'needs_info')).length,
    ageDays: (now - Date.parse(c.createdAt)) / DAY,
  };
}

export function health(now: number = Date.now()) {
  return portfolioHealth(S.customers.map((c) => healthInputFor(S, c, now)));
}

export function createFollowup(actor: Actor, customerId: string, kind: 'churn' | 'expansion', note: string, now: number = Date.now()): Handoff {
  can(actor, ['superadmin', 'sales', 'ops']);
  requireReason(note);
  const c = getCustomer(customerId);
  if (!c) throw new AdminError(404, 'CUSTOMER_NOT_FOUND', 'Unknown customer.');
  const h: Handoff = { id: nextId('hnd'), customerId, triggerId: `health_${kind}`, triggerName: kind === 'churn' ? 'Health: churn risk' : 'Health: expansion ready', firedAt: new Date(now).toISOString(), evidence: note.trim(), state: 'new', ownerId: c.owner, notes: [] };
  S.handoffs.push(h);
  audit(actor, customerId, 'health.followup_created', h.id, null, { kind }, note, now);
  return h;
}

// ── Anomaly & abuse detection (deep feature 2) ──────────────────────────────

export function abuse(now: number = Date.now()) {
  const all = detectAbuse(S.customers, S.keys, S.ledger, now);
  const dismissedIds = new Set(S.abuseDismissals.map((d) => d.signalId));
  const active = all.filter((s) => !dismissedIds.has(s.id));
  const dismissed = all.filter((s) => dismissedIds.has(s.id)).map((s) => {
    const d = S.abuseDismissals.find((x) => x.signalId === s.id);
    return { ...s, dismissedBy: d?.actor ?? null, dismissedReason: d?.reason ?? null };
  });
  return { signals: active, dismissed, risk: riskScores(active), stats: abuseStats(active) };
}

export function dismissAbuseSignal(actor: Actor, signalId: string, reason: string, now: number = Date.now()): { signalId: string; dismissed: true } {
  can(actor, ['superadmin', 'ops']);
  requireReason(reason);
  if (!signalId) throw new AdminError(400, 'VALIDATION_ERROR', 'A signal id is required.');
  if (!S.abuseDismissals.some((d) => d.signalId === signalId)) S.abuseDismissals.push({ signalId, actor: actor.email, reason: reason.trim(), at: new Date(now).toISOString() });
  audit(actor, null, 'abuse.dismissed', signalId, null, { signalId }, reason, now);
  return { signalId, dismissed: true };
}

// ── Maker-checker approvals (deep feature 4) ────────────────────────────────

export interface SubmitChangeInput { customerId: string; keyId?: string | null; payload?: ChangePayload }

export function submitChange(actor: Actor, kind: ChangeKind, input: SubmitChangeInput, reason: string, now: number = Date.now()): PendingChange {
  const policy = CHANGE_POLICY[kind];
  can(actor, policy.submitRoles);
  requireReason(reason);
  const c = getCustomer(input.customerId);
  if (!c) throw new AdminError(404, 'CUSTOMER_NOT_FOUND', 'Unknown customer.');
  const keyId = input.keyId ?? null;
  const v = validateChange(kind, input.payload ?? {}, keyId);
  if (!v.ok) throw new AdminError(400, 'VALIDATION_ERROR', v.error ?? 'Invalid change.');
  let keyLabel: string | null = null;
  if (keyId) { const k = getKey(keyId); if (!k || k.customerId !== input.customerId) throw new AdminError(404, 'KEY_NOT_FOUND', 'Unknown key for this customer.'); keyLabel = `${k.name} (${k.prefix}••••${k.last4})`; }
  const iso = new Date(now).toISOString();
  const change: PendingChange = {
    id: nextId('chg'), kind, status: 'pending', customerId: c.id, customerName: c.name, keyId, keyLabel, payload: input.payload ?? {},
    requestedBy: actor.email, requestedByRole: actor.role, requestedAt: iso, reason: reason.trim(),
    decidedBy: null, decidedAt: null, decisionReason: null, appliedResult: null, expiresAt: new Date(now + APPROVAL_TTL_DAYS * DAY).toISOString(),
  };
  S.changes.unshift(change);
  audit(actor, c.id, 'change.submitted', change.id, null, { kind, payload: change.payload, summary: summarizeChange(change) }, reason, now);
  return change;
}

function grantCredits(customerId: string, amount: number, now: number): string {
  let w = S.wallets.find((x) => x.customerId === customerId);
  if (!w) { w = { customerId, balance: 0, topUps: [] }; S.wallets.push(w); }
  w.balance += amount;
  w.topUps.push({ at: new Date(now).toISOString(), amount, kind: 'manual_credit' });
  return `Granted ${amount.toLocaleString()} credits — balance is now ${w.balance.toLocaleString()}.`;
}

function applyChange(actor: Actor, c: PendingChange, now: number): string {
  if (c.kind === 'grant_credits') return grantCredits(c.customerId, c.payload.amount ?? 0, now);
  if (c.kind === 'raise_limit' && c.keyId) { updateKey(actor, c.keyId, { creditLimit: c.payload.creditLimit ?? null }, `Approved change ${c.id}`, now); return `Credit limit raised to ${(c.payload.creditLimit ?? 0).toLocaleString()}.`; }
  if (c.kind === 'delete_key' && c.keyId) { deleteKey(actor, c.keyId, `Approved change ${c.id}`, now); return 'Key deleted from every registry.'; }
  return 'No-op.';
}

export function decideChange(actor: Actor, id: string, decision: 'approve' | 'reject', reason: string, now: number = Date.now()): PendingChange {
  requireReason(reason);
  const c = S.changes.find((x) => x.id === id);
  if (!c) throw new AdminError(404, 'CHANGE_NOT_FOUND', 'Unknown change request.');
  if (c.status !== 'pending') throw new AdminError(409, 'CHANGE_CLOSED', `This change is already ${c.status}.`);
  can(actor, CHANGE_POLICY[c.kind].approveRoles);
  if (actor.email === c.requestedBy) throw new AdminError(409, 'FOUR_EYES', 'A change must be approved by someone other than the person who requested it.');
  if (Date.parse(c.expiresAt) < now) { c.status = 'expired'; throw new AdminError(409, 'CHANGE_EXPIRED', 'This request expired before it was decided.'); }
  c.decidedBy = actor.email; c.decidedAt = new Date(now).toISOString(); c.decisionReason = reason.trim();
  if (decision === 'reject') { c.status = 'rejected'; audit(actor, c.customerId, 'change.rejected', c.id, { status: 'pending' }, { status: 'rejected' }, reason, now); return c; }
  c.appliedResult = applyChange(actor, c, now);
  c.status = 'approved';
  audit(actor, c.customerId, 'change.approved', c.id, { status: 'pending' }, { status: 'approved', result: c.appliedResult }, reason, now);
  return c;
}

export function approvalsOverview(now: number = Date.now()) {
  S.changes.forEach((c) => { if (c.status === 'pending' && Date.parse(c.expiresAt) < now) c.status = 'expired'; });
  return { changes: S.changes.slice(), stats: approvalStats(S.changes) };
}

// ── Customer communication loop (deep feature 5) ────────────────────────────

export function messageSuggestions(now: number = Date.now()): MessageSuggestion[] {
  const insights = keyInsights(now);
  const recent = (cid: string, tpl: MessageTemplateId) => S.messages.some((m) => m.customerId === cid && m.templateId === tpl && now - Date.parse(m.sentAt) < 3 * DAY);
  const out: MessageSuggestion[] = [];
  S.customers.forEach((c) => {
    const w = walletSnapshot(walletFor(S, c.id), S.ledger, now);
    deriveSuggestions(c, w, insights).forEach((sug) => { if (!recent(sug.customerId, sug.templateId)) out.push(sug); });
  });
  return out.sort((a, b) => a.priority - b.priority);
}

export function messagingOverview(now: number = Date.now()) {
  return {
    templates: MESSAGE_TEMPLATES.map((t) => ({ id: t.id, label: t.label, description: t.description, category: t.category, channelDefault: t.channelDefault })),
    suggestions: messageSuggestions(now),
    messages: S.messages.slice(0, 50),
    sent: S.messages.length,
  };
}

export interface SendMessageInput { customerId: string; templateId: MessageTemplateId; channel?: MessageChannel; vars?: MessageVars; relatedTo?: string | null }

export function sendCustomerMessage(actor: Actor, input: SendMessageInput, now: number = Date.now()): CustomerMessage {
  can(actor, ['superadmin', 'ops', 'finance']);
  const c = getCustomer(input.customerId);
  if (!c) throw new AdminError(404, 'CUSTOMER_NOT_FOUND', 'Unknown customer.');
  const tpl = messageTemplate(input.templateId);
  if (!tpl) throw new AdminError(400, 'VALIDATION_ERROR', 'Unknown message template.');
  const channel: MessageChannel = input.channel === 'in_app' ? 'in_app' : 'email';
  const rendered = tpl.render({ ...(input.vars ?? {}), customerName: c.name });
  const msg: CustomerMessage = {
    id: nextId('msg'), customerId: c.id, customerName: c.name, to: channel === 'email' ? c.contactEmail : `in-app · ${c.name}`,
    channel, templateId: input.templateId, subject: rendered.subject, body: rendered.body, sentBy: actor.email, sentAt: new Date(now).toISOString(), relatedTo: input.relatedTo ?? null,
  };
  S.messages.unshift(msg);
  audit(actor, c.id, 'customer_message.sent', msg.id, null, { template: input.templateId, channel, subject: rendered.subject }, `Sent “${tpl.label}” to ${c.name} (${msg.to}).`, now);
  return msg;
}

// ── Preview / impersonation ──────────────────────────────────────────────────

export function startPreview(actor: Actor, customerId: string, reason: string, now: number = Date.now()): { session: ImpersonationSession; token: string; consoleUrl: string } {
  can(actor, ['superadmin', 'ops']);
  requireReason(reason);
  const c = getCustomer(customerId);
  if (!c) throw new AdminError(404, 'CUSTOMER_NOT_FOUND', 'Unknown customer.');
  // A well-formed sandbox token (sk_test_ + 20 url-safe chars) — the customer console's gateway lazily provisions it.
  const token = `sk_test_${sha256Hex(`imp:${customerId}:${actor.email}:${now}`).slice(0, 20)}`;
  const session: ImpersonationSession = {
    id: nextId('imp'), operator: actor.email, customerId, environment: 'sandbox', keyFingerprint: keyFingerprint(token),
    startedAt: new Date(now).toISOString(), expiresAt: new Date(now + IMPERSONATION_TTL_MS).toISOString(), endedAt: null,
  };
  S.sessions.push(session);
  audit(actor, customerId, 'preview.started', session.id, null, { keyFingerprint: session.keyFingerprint, expiresAt: session.expiresAt }, reason, now);
  // The deep link (with the one-time token) is returned to the operator once and never stored.
  const consoleUrl = `${CONSOLE_BASE_URL}/console/preview-session?token=${encodeURIComponent(token)}&customer=${encodeURIComponent(c.name)}&expires=${now + IMPERSONATION_TTL_MS}&operator=${encodeURIComponent(actor.email)}`;
  return { session, token, consoleUrl };
}
export function endPreview(actor: Actor, sessionId: string, now: number = Date.now()): ImpersonationSession {
  const s = S.sessions.find((x) => x.id === sessionId);
  if (!s) throw new AdminError(404, 'SESSION_NOT_FOUND', 'Unknown preview session.');
  if (!s.endedAt) { s.endedAt = new Date(now).toISOString(); audit(actor, s.customerId, 'preview.ended', s.id, null, null, 'Preview ended by operator.', now); }
  return s;
}

// ── Token management ─────────────────────────────────────────────────────────

export interface KeyPatch { name?: string; scopes?: string[]; allowedIps?: string[]; creditLimit?: number | null; rateTier?: RateTier; expiresAt?: string | null }
const IP_RE = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;

function cleanPatch(p: unknown): KeyPatch {
  const out: KeyPatch = {};
  if (typeof p !== 'object' || p === null) return out;
  const r = p as Record<string, unknown>;
  if (typeof r.name === 'string' && r.name.trim()) out.name = r.name.trim().slice(0, 60);
  if (Array.isArray(r.scopes)) out.scopes = Array.from(new Set(r.scopes.filter((s): s is string => typeof s === 'string'))).slice(0, 12);
  if (Array.isArray(r.allowedIps)) out.allowedIps = Array.from(new Set(r.allowedIps.filter((s): s is string => typeof s === 'string' && IP_RE.test(s.trim())).map((s) => s.trim()))).slice(0, 20);
  if ('creditLimit' in r) out.creditLimit = r.creditLimit === null ? null : typeof r.creditLimit === 'number' && r.creditLimit >= 0 ? Math.round(r.creditLimit) : undefined;
  if (r.rateTier === 'Starter' || r.rateTier === 'Growth' || r.rateTier === 'Enterprise') out.rateTier = r.rateTier;
  if ('expiresAt' in r) out.expiresAt = r.expiresAt === null ? null : typeof r.expiresAt === 'string' && !Number.isNaN(Date.parse(r.expiresAt)) ? new Date(r.expiresAt).toISOString() : undefined;
  return out;
}

export function createKey(actor: Actor, customerId: string, input: KeyPatch & { environment: 'sandbox' | 'live' }, reason: string, now: number = Date.now()): { key: ManagedKey; secret: string } {
  can(actor, ['superadmin', 'ops']);
  requireReason(reason);
  const c = getCustomer(customerId);
  if (!c) throw new AdminError(404, 'CUSTOMER_NOT_FOUND', 'Unknown customer.');
  const env = input.environment === 'live' ? 'live' : 'sandbox';
  const secret = `${env === 'live' ? 'sk_live_' : 'sk_test_'}${sha256Hex(`new:${customerId}:${now}:${S.seq}`).slice(0, 20)}`;
  const patch = cleanPatch(input);
  const key: ManagedKey = {
    id: nextId('key'), customerId, name: patch.name ?? (env === 'live' ? 'Production' : 'Sandbox key'), environment: env, fingerprint: keyFingerprint(secret),
    prefix: env === 'live' ? 'sk_live_' : 'sk_test_', last4: secret.slice(-4), scopes: patch.scopes ?? ['identity:read', 'corporate:read'], status: 'active',
    allowedIps: patch.allowedIps ?? [], creditLimit: patch.creditLimit ?? null, rateTier: patch.rateTier ?? (c.plan === 'Trial' ? 'Starter' : (c.plan as RateTier)),
    expiresAt: patch.expiresAt ?? null, createdAt: new Date(now).toISOString(), lastUsedAt: null, requests7d: 0, regeneratedAt: null,
  };
  S.keys.push(key);
  audit(actor, customerId, 'key.created', key.id, null, { fingerprint: key.fingerprint, environment: env, scopes: key.scopes }, reason, now);
  return { key, secret };
}

export function updateKey(actor: Actor, keyId: string, patchIn: unknown, reason: string, now: number = Date.now()): ManagedKey {
  can(actor, ['superadmin', 'ops']);
  requireReason(reason);
  const k = getKey(keyId);
  if (!k) throw new AdminError(404, 'KEY_NOT_FOUND', 'Unknown key.');
  const patch = cleanPatch(patchIn);
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  (Object.keys(patch) as (keyof KeyPatch)[]).forEach((f) => {
    if (patch[f] === undefined) return;
    before[f] = k[f]; after[f] = patch[f];
    (k as unknown as Record<string, unknown>)[f] = patch[f];
  });
  if (!Object.keys(after).length) throw new AdminError(400, 'NO_CHANGES', 'Nothing valid to change.');
  audit(actor, k.customerId, 'key.updated', k.id, before, after, reason, now);
  return k;
}

export function setKeyStatus(actor: Actor, keyId: string, status: KeyStatus, reason: string, now: number = Date.now()): ManagedKey {
  can(actor, ['superadmin', 'ops']);
  requireReason(reason);
  const k = getKey(keyId);
  if (!k) throw new AdminError(404, 'KEY_NOT_FOUND', 'Unknown key.');
  if (k.status === 'revoked') throw new AdminError(409, 'KEY_REVOKED', 'A revoked key cannot change status — regenerate or create a new one.');
  const before = { status: k.status };
  k.status = status;
  audit(actor, k.customerId, 'key.status_changed', k.id, before, { status }, reason, now);
  return k;
}

export function regenerateKey(actor: Actor, keyId: string, reason: string, now: number = Date.now()): { key: ManagedKey; secret: string } {
  can(actor, ['superadmin', 'ops']);
  requireReason(reason);
  const k = getKey(keyId);
  if (!k) throw new AdminError(404, 'KEY_NOT_FOUND', 'Unknown key.');
  const secret = `${k.prefix}${sha256Hex(`regen:${k.id}:${now}:${S.seq}`).slice(0, 20)}`;
  const before = { fingerprint: k.fingerprint, last4: k.last4 };
  k.fingerprint = keyFingerprint(secret); k.last4 = secret.slice(-4); k.regeneratedAt = new Date(now).toISOString(); k.status = 'active';
  audit(actor, k.customerId, 'key.regenerated', k.id, before, { fingerprint: k.fingerprint, last4: k.last4 }, reason, now);
  return { key: k, secret };
}

export function deleteKey(actor: Actor, keyId: string, reason: string, now: number = Date.now()): ManagedKey {
  can(actor, ['superadmin']);
  requireReason(reason);
  const k = getKey(keyId);
  if (!k) throw new AdminError(404, 'KEY_NOT_FOUND', 'Unknown key.');
  S.keys = S.keys.filter((x) => x.id !== keyId);
  audit(actor, k.customerId, 'key.deleted', k.id, { fingerprint: k.fingerprint, status: k.status }, null, reason, now);
  return k;
}

// ── Access requests ──────────────────────────────────────────────────────────

export function decideAccessRequest(actor: Actor, id: string, action: 'approved' | 'denied' | 'needs_info', reason: string, now: number = Date.now()): AccessRequest {
  can(actor, ['superadmin', 'ops']);
  requireReason(reason);
  const r = getAccessRequest(id);
  if (!r) throw new AdminError(404, 'REQUEST_NOT_FOUND', 'Unknown access request.');
  if (r.status === 'approved' || r.status === 'denied') throw new AdminError(409, 'REQUEST_CLOSED', `This request is already ${r.status}.`);
  const before = { status: r.status };
  const at = new Date(now).toISOString();
  r.status = action as AccessRequestStatus;
  r.log.push({ at, actor: actor.email, action, note: reason.trim() });
  if (action !== 'needs_info') r.decision = { action, actor: actor.email, reason: reason.trim(), at };
  audit(actor, r.customerId, `access_request.${action}`, r.id, before, { status: r.status }, reason, now);
  return r;
}
export function commentAccessRequest(actor: Actor, id: string, note: string, now: number = Date.now()): AccessRequest {
  requireReason(note);
  const r = getAccessRequest(id);
  if (!r) throw new AdminError(404, 'REQUEST_NOT_FOUND', 'Unknown access request.');
  r.log.push({ at: new Date(now).toISOString(), actor: actor.email, action: 'comment', note: note.trim() });
  return r;
}

// ── Triggers & handoffs ──────────────────────────────────────────────────────

export function updateTrigger(actor: Actor, id: string, patch: Partial<Pick<SalesTrigger, 'enabled' | 'value' | 'channel' | 'owner' | 'cooldownDays'>>, reason: string, now: number = Date.now()): SalesTrigger {
  can(actor, ['superadmin', 'sales']);
  requireReason(reason);
  const t = S.triggers.find((x) => x.id === id);
  if (!t) throw new AdminError(404, 'TRIGGER_NOT_FOUND', 'Unknown trigger.');
  const before: Record<string, unknown> = {}; const after: Record<string, unknown> = {};
  if (typeof patch.enabled === 'boolean') { before.enabled = t.enabled; t.enabled = patch.enabled; after.enabled = patch.enabled; }
  if (typeof patch.value === 'number' && Number.isFinite(patch.value) && t.kind === 'metric') { before.value = t.value; t.value = Math.max(0, Math.round(patch.value)); after.value = t.value; }
  if (patch.channel === 'slack' || patch.channel === 'crm' || patch.channel === 'email') { before.channel = t.channel; t.channel = patch.channel; after.channel = patch.channel; }
  if (typeof patch.owner === 'string' && patch.owner.trim()) { before.owner = t.owner; t.owner = patch.owner.trim(); after.owner = t.owner; }
  if (typeof patch.cooldownDays === 'number' && patch.cooldownDays >= 1) { before.cooldownDays = t.cooldownDays; t.cooldownDays = Math.round(patch.cooldownDays); after.cooldownDays = t.cooldownDays; }
  if (!Object.keys(after).length) throw new AdminError(400, 'NO_CHANGES', 'Nothing valid to change.');
  audit(actor, null, 'trigger.updated', t.id, before, after, reason, now);
  return t;
}

/** Re-evaluate all triggers now; returns the handoffs created. */
export function runTriggers(actor: Actor, now: number = Date.now()): Handoff[] {
  can(actor, ['superadmin', 'sales', 'ops']);
  const metrics = new Map(S.customers.map((c) => [c.id, customerMetrics(c, S.ledger, walletSnapshot(walletFor(S, c.id), S.ledger, now))]));
  const created = evaluateTriggers(S.triggers, S.customers, metrics, S.handoffs, now, () => nextId('hnd'));
  S.handoffs.push(...created);
  if (created.length) audit(actor, null, 'triggers.evaluated', 'all', null, { created: created.length }, 'Manual trigger evaluation.', now);
  return created;
}

export function updateHandoff(actor: Actor, id: string, state: HandoffState, note: string, now: number = Date.now()): Handoff {
  can(actor, ['superadmin', 'sales']);
  const h = S.handoffs.find((x) => x.id === id);
  if (!h) throw new AdminError(404, 'HANDOFF_NOT_FOUND', 'Unknown handoff.');
  const before = { state: h.state };
  h.state = state;
  if (note.trim()) h.notes.push({ at: new Date(now).toISOString(), actor: actor.email, note: note.trim() });
  audit(actor, h.customerId, 'handoff.updated', h.id, before, { state }, note.trim() || `Moved to ${state}.`, now);
  return h;
}

/** Test/demo hook. */
export function __resetAdmin(now: number = Date.now()): void { S = boot(now); }

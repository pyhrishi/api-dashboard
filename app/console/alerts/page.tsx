'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Siren, ShieldCheck, Bell, Mail, MessageSquare, Webhook, Send, Copy, Check, AlertTriangle, Clock, RotateCw, Plus, X, ArrowRight, Sparkles,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import RoleGuard from '@/components/RoleGuard';
import { useToast } from '@/components/Toast';
import { track } from '@/lib/telemetry';
import { cn } from '@/lib/utils';
import {
  PageHeader, KpiTile, GlassCard, DataTable, EmptyState, StatusBadge, SegmentedControl, Button, Skeleton, Drawer, ConfirmAction,
  type Column, type BadgeTone,
} from '@/components/ui';
import { buildSnapshot, pmReportMarkdown, formatDuration, ALERT_RULES, type AlertEvaluation, type KpiScope, type AlertOwner } from '@/lib/growth-kpis';
import {
  useAlertCenter, effectiveRules, isDefaultThreshold, THRESHOLD_BOUNDS, DELIVERY_CHANNELS, WEEKDAYS, ALERT_OWNERS,
  nextDigestRunAt, medianTimeToAcknowledge, deliverySummary, fmtIncidentValue, renderAlertText, normalizeEmails, isValidSlackChannel, isValidWebhookUrl,
  canManageAlerts, canAcknowledge, openIncidents,
  type AlertIncident, type DeliveryRecord, type DeliveryChannel, type DigestRecord, type IncidentStatus, type RuleId,
} from '@/lib/growth-alerts';
import { useGrowthLiveInputs } from '@/components/GrowthAlertsWatcher';

// ─── helpers ──────────────────────────────────────────────────────────────────

const SECTION = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };
const OWNER_TONE: Record<AlertOwner, BadgeTone> = { Product: 'teal', Eng: 'warning', 'Docs owner': 'info' };
const STATUS_TONE: Record<IncidentStatus, BadgeTone> = { open: 'error', acknowledged: 'warning', resolved: 'success' };
const DELIVERY_TONE: Record<DeliveryRecord['status'], BadgeTone> = { delivered: 'success', failed: 'error', skipped: 'neutral' };
const CHANNEL_ICON: Record<DeliveryChannel, ReactNode> = { 'in-app': <Bell className="w-3.5 h-3.5" />, email: <Mail className="w-3.5 h-3.5" />, slack: <MessageSquare className="w-3.5 h-3.5" />, webhook: <Webhook className="w-3.5 h-3.5" /> };
const CHANNEL_LABEL: Record<DeliveryChannel, string> = { 'in-app': 'In-app', email: 'Email', slack: 'Slack', webhook: 'Webhook' };

const relTime = (ms: number, now: number) => {
  const diff = ms - now;
  const abs = Math.abs(diff);
  const unit = abs < 3_600_000 ? [Math.max(1, Math.round(abs / 60_000)), 'm'] : abs < 86_400_000 ? [Math.round(abs / 3_600_000), 'h'] : [Math.round(abs / 86_400_000), 'd'];
  return diff >= 0 ? `in ${unit[0]}${unit[1]}` : `${unit[0]}${unit[1]} ago`;
};
const fmtUtc = (ms: number) => new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
const fmtThreshold = (a: Pick<AlertEvaluation, 'comparator' | 'threshold' | 'unit'>) => `${a.comparator === 'lt' ? '<' : '>'} ${a.threshold < 0 ? `−${Math.abs(a.threshold)}` : a.threshold}${a.unit === 'pp' ? ' pp' : '%'}`;

function SectionTitle({ icon, title, note, badge }: { icon?: ReactNode; title: string; note: string; badge?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
      <div>
        <h3 className="text-xs font-black uppercase tracking-widest text-fg-muted flex items-center gap-2">
          {icon && <span className="text-teal [&>svg]:w-4 [&>svg]:h-4">{icon}</span>}
          {title}
        </h3>
        <p className="text-xs text-fg-muted mt-1">{note}</p>
      </div>
      {badge && <div className="shrink-0">{badge}</div>}
    </div>
  );
}

function Toggle({ on, onChange, label, disabled, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} title={hint} onClick={() => onChange(!on)}
      className={cn('inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 disabled:opacity-60 disabled:cursor-not-allowed', on ? 'border-teal/40 bg-teal/10 text-teal' : 'border-border bg-glass text-fg-muted hover:text-fg')}>
      <span className={cn('relative inline-block w-7 h-4 rounded-full transition-colors', on ? 'bg-teal' : 'bg-overlay')}>
        <span className={cn('absolute top-0.5 w-3 h-3 rounded-full bg-surface shadow transition-all', on ? 'left-3.5' : 'left-0.5')} />
      </span>
      {label}
    </button>
  );
}

function ChipEditor({ values, onChange, placeholder, validate, disabled, label }: { values: string[]; onChange: (v: string[]) => void; placeholder: string; validate: (v: string) => boolean; disabled?: boolean; label: string }) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = () => {
    const v = draft.trim().toLowerCase();
    if (!v) return;
    if (!validate(v)) { setError('Not a valid email address.'); return; }
    if (values.includes(v)) { setError('Already on the list.'); return; }
    onChange([...values, v]); setDraft(''); setError(null);
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.length === 0 && <span className="text-[11px] text-fg-muted">No recipients yet.</span>}
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full border border-border bg-glass px-2 py-0.5 font-mono text-[11px] text-fg">
            {v}
            {!disabled && <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`} className="text-fg-muted hover:text-semantic-error rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50"><X className="w-3 h-3" /></button>}
          </span>
        ))}
      </div>
      {!disabled && (
        <div className="flex items-center gap-2">
          <input value={draft} onChange={(e) => { setDraft(e.target.value); setError(null); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder={placeholder} aria-label={label} aria-invalid={!!error}
            className="flex-1 min-w-0 rounded-lg border border-border bg-surface px-3 py-1.5 font-mono text-[12px] text-fg placeholder:text-fg-muted focus:outline-none focus:border-teal focus-visible:ring-2 focus-visible:ring-teal/40" />
          <Button size="sm" variant="secondary" onClick={add} icon={<Plus className="w-3.5 h-3.5" />}>Add</Button>
        </div>
      )}
      {error && <p className="text-[11px] text-semantic-error mt-1" role="alert">{error}</p>}
    </div>
  );
}

function TextSetting({ label, value, onCommit, validate, invalidHint, placeholder, disabled }: { label: string; value: string; onCommit: (v: string) => void; validate: (v: string) => boolean; invalidHint: string; placeholder: string; disabled?: boolean }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  const invalid = draft.trim() !== '' && !validate(draft);
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-widest text-fg-muted">{label}</span>
      <input value={draft} disabled={disabled} onChange={(e) => setDraft(e.target.value)} onBlur={() => { if (!invalid && draft !== value) onCommit(draft); }} placeholder={placeholder} aria-invalid={invalid}
        className={cn('mt-1 w-full rounded-lg border bg-surface px-3 py-1.5 font-mono text-[12px] text-fg placeholder:text-fg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 disabled:opacity-60', invalid ? 'border-semantic-error/50' : 'border-border focus:border-teal')} />
      {invalid && <span className="text-[11px] text-semantic-error mt-1 block" role="alert">{invalidHint}</span>}
    </label>
  );
}

const selectCls = 'rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12px] text-fg focus:outline-none focus:border-teal focus-visible:ring-2 focus-visible:ring-teal/40 disabled:opacity-60';

// ─── page ─────────────────────────────────────────────────────────────────────

type Filter = IncidentStatus | 'all';

function AlertCenterInner() {
  const { user } = useStore();
  const toast = useToast();
  const router = useRouter();
  const role = user?.role;
  const actor = user?.email ?? 'you';
  const isAdmin = canManageAlerts(role);
  const canAck = canAcknowledge(role);

  const center = useAlertCenter();
  const { incidents, deliveries, routing, thresholds, digest, digests, lastDigestRunAt } = center;
  const { live, liveAlerts } = useGrowthLiveInputs();

  const [now, setNow] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setNow(Date.now());
    const t = setTimeout(() => setReady(true), 240);
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => { clearTimeout(t); clearInterval(tick); };
  }, []);

  const snapshot = useMemo(() => (now === null ? null : buildSnapshot({ scope: digest.scope, scenario: 'current', now, live, liveAlerts, rules: effectiveRules(thresholds) })), [now, live, liveAlerts, thresholds, digest.scope]);
  const rules = useMemo(() => effectiveRules(thresholds), [thresholds]);

  const open = openIncidents(incidents);
  const acked = incidents.filter((i) => i.status === 'acknowledged');
  const resolved = incidents.filter((i) => i.status === 'resolved');
  const hasRehearsals = incidents.some((i) => i.source === 'rehearsal');
  const mtta = medianTimeToAcknowledge(incidents);
  const dsum = deliverySummary(deliveries);
  const nextRun = now === null ? null : nextDigestRunAt(digest, now);

  useEffect(() => {
    track('alert_center_viewed', { open: open.length, acknowledged: acked.length, resolved: resolved.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one view event per visit
  }, []);

  // ── incidents ──
  const [filter, setFilter] = useState<Filter>('open');
  const shown = useMemo(() => (filter === 'all' ? incidents : incidents.filter((i) => i.status === filter)).slice().sort((a, b) => b.firedAt - a.firedAt), [incidents, filter]);
  const [ackTarget, setAckTarget] = useState<AlertIncident | null>(null);
  const [note, setNote] = useState('');
  const confirmAck = () => {
    if (!ackTarget) return;
    if (center.acknowledge(role, ackTarget.id, actor, note)) {
      track('growth_alert_acknowledged', { rule: ackTarget.ruleId, source: ackTarget.source, hasNote: note.trim().length > 0, surface: 'alert-center' });
      toast.success('Acknowledged', `${ackTarget.label} is now owned by ${actor}.`);
    }
    setAckTarget(null); setNote('');
  };
  const doResolve = (inc: AlertIncident) => {
    if (center.resolve(role, inc.id, actor)) {
      track('growth_alert_resolved', { rule: inc.ruleId, source: inc.source });
      toast.success('Resolved', `${inc.label} closed by ${actor}.`);
    }
  };

  const incidentColumns: Column<AlertIncident>[] = [
    { key: 'status', header: 'Status', render: (i) => <StatusBadge tone={STATUS_TONE[i.status]} dot pulse={i.status === 'open'}>{i.status}</StatusBadge>, sortValue: (i) => i.status },
    { key: 'label', header: 'Alert', render: (i) => (
      <div className="min-w-0 max-w-[26rem]">
        <div className="flex items-center gap-2 flex-wrap"><span className="text-[13px] font-bold text-fg">{i.label}</span>{i.source === 'rehearsal' && <StatusBadge tone="neutral">rehearsal</StatusBadge>}</div>
        <div className="text-[11px] text-fg-muted truncate">{i.summary}</div>
      </div>
    ) },
    { key: 'value', header: 'Value · threshold', render: (i) => <span className="text-[12px] tabular-nums"><span className={cn('font-bold', i.status === 'open' ? 'text-semantic-error' : 'text-fg')}>{fmtIncidentValue(i)}</span> <span className="text-fg-muted">· {fmtThreshold(i)}</span></span> },
    { key: 'owner', header: 'Owner', render: (i) => <StatusBadge tone={OWNER_TONE[i.owner]}>→ {i.owner}</StatusBadge>, sortValue: (i) => i.owner },
    { key: 'firedAt', header: 'Fired', render: (i) => <span className="text-[12px] text-fg-muted whitespace-nowrap" title={fmtUtc(i.firedAt)}>{now ? relTime(i.firedAt, now) : ''}</span>, sortValue: (i) => i.firedAt },
    { key: 'ack', header: 'Acknowledged by', render: (i) => i.acknowledgedBy ? <div className="min-w-0 max-w-[14rem]"><div className="text-[12px] text-fg truncate">{i.acknowledgedBy}</div>{i.note && <div className="text-[11px] text-fg-muted truncate" title={i.note}>{i.note}</div>}{i.resolution === 'auto' && <div className="text-[11px] text-fg-muted">auto-resolved</div>}</div> : <span className="text-[12px] text-fg-muted">{i.resolution === 'auto' ? 'auto-resolved' : '—'}</span> },
    { key: 'actions', header: '', align: 'right', render: (i) => (
      <div className="flex items-center justify-end gap-1.5">
        {i.status === 'open' && <Button size="sm" onClick={() => { setAckTarget(i); setNote(''); }} disabled={!canAck} title={canAck ? 'Acknowledge with a note' : 'Your role cannot acknowledge alerts'} icon={<Check className="w-3.5 h-3.5" />}>Acknowledge</Button>}
        {i.status !== 'resolved' && <ConfirmAction size="sm" variant="ghost" actionId="resolve_growth_alert" onConfirm={() => doResolve(i)} disabled={!canAck} confirmLabel="Confirm resolve">Resolve</ConfirmAction>}
      </div>
    ) },
  ];

  // ── deliveries ──
  const deliveryColumns: Column<DeliveryRecord>[] = [
    { key: 'at', header: 'When', render: (d) => <span className="text-[12px] text-fg-muted whitespace-nowrap" title={fmtUtc(d.at)}>{now ? relTime(d.at, now) : ''}</span>, sortValue: (d) => d.at },
    { key: 'kind', header: 'Kind', render: (d) => <StatusBadge tone={d.kind === 'alert' ? 'error' : d.kind === 'digest' ? 'teal' : 'neutral'}>{d.kind}</StatusBadge>, sortValue: (d) => d.kind },
    { key: 'owner', header: 'Owner', render: (d) => <span className="text-[12px] text-fg">{d.owner}</span> },
    { key: 'channel', header: 'Channel', render: (d) => <span className="inline-flex items-center gap-1.5 text-[12px] text-fg">{CHANNEL_ICON[d.channel]}{CHANNEL_LABEL[d.channel]}</span>, sortValue: (d) => d.channel },
    { key: 'target', header: 'Target', render: (d) => <span className="font-mono text-[11px] text-fg-muted truncate block max-w-[16rem]" title={d.target}>{d.target}</span> },
    { key: 'status', header: 'Status', render: (d) => <StatusBadge tone={DELIVERY_TONE[d.status]}>{d.status}</StatusBadge>, sortValue: (d) => d.status },
    { key: 'detail', header: 'Detail', render: (d) => <span className="text-[11px] text-fg-muted">{d.detail}</span> },
  ];

  // ── digest ──
  const [digestView, setDigestView] = useState<DigestRecord | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (text: string, tag: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(tag); setTimeout(() => setCopied(null), 1400); }
    catch { toast.error('Copy failed', 'Your browser blocked clipboard access.'); }
  };
  const sendDigestNow = () => {
    if (!snapshot || now === null) return;
    const firing = snapshot.alerts.filter((a) => a.status === 'firing').length;
    const rec = center.runDigest({ markdown: pmReportMarkdown(snapshot), trigger: 'manual', scope: digest.scope, firing, now });
    track('pm_digest_sent', { trigger: 'manual', delivered: rec.delivered, deliveries: rec.deliveries, scope: digest.scope });
    toast.success('Digest sent', `Delivered to ${rec.delivered} of ${rec.deliveries} targets.`);
  };
  const updateDigest = (patch: Parameters<typeof center.updateDigest>[1], field: string) => {
    if (center.updateDigest(role, patch)) track('pm_digest_settings_updated', { field });
  };
  const digestColumns: Column<DigestRecord>[] = [
    { key: 'period', header: 'Period', render: (d) => <span className="text-[12px] font-bold text-fg">{d.periodLabel}</span> },
    { key: 'trigger', header: 'Trigger', render: (d) => <StatusBadge tone={d.trigger === 'scheduled' ? 'teal' : 'neutral'}>{d.trigger}</StatusBadge> },
    { key: 'scope', header: 'Scope', render: (d) => <span className="text-[12px] text-fg-muted">{d.scope === 'population' ? 'sample cohort + you' : 'your workspace'}</span> },
    { key: 'firing', header: 'Alerts firing', align: 'right', render: (d) => <span className={cn('text-[12px] tabular-nums font-bold', d.firing > 0 ? 'text-semantic-error' : 'text-fg')}>{d.firing}</span> },
    { key: 'deliveries', header: 'Delivered', align: 'right', render: (d) => <span className="text-[12px] tabular-nums text-fg">{d.delivered}/{d.deliveries}</span> },
    { key: 'at', header: 'Generated', render: (d) => <span className="text-[12px] text-fg-muted whitespace-nowrap">{fmtUtc(d.generatedAt)}</span>, sortValue: (d) => d.generatedAt },
    { key: 'view', header: '', align: 'right', render: (d) => <Button size="sm" variant="secondary" onClick={() => setDigestView(d)}>View</Button> },
  ];

  const preview = snapshot ? pmReportMarkdown(snapshot) : '';
  const previewLines = preview.split('\n').slice(0, 14).join('\n');
  const readOnlyHint = isAdmin ? undefined : 'Only org admins change alert configuration';

  return (
    <div className="max-w-[1180px] mx-auto pb-16 space-y-6">
      <PageHeader
        icon={<Siren />}
        title="Alert Center"
        description="Every Growth KPI alert that fired, who it reached, who owns it now, and the weekly PM digest. Thresholds and routing are tuned here; the rules themselves are evaluated on the Growth dashboard's data."
        actions={
          <>
            <StatusBadge tone={open.length > 0 ? 'error' : 'success'} dot pulse={open.length > 0}>{open.length > 0 ? `${open.length} open` : 'all clear'}</StatusBadge>
            {hasRehearsals && <Button size="sm" variant="ghost" onClick={() => { center.clearRehearsals(); toast.info('Rehearsals cleared', 'Rehearsal incidents and their deliveries were removed.'); }}>Clear rehearsals</Button>}
            <Button size="sm" variant="secondary" onClick={() => router.push('/console/growth')} icon={<ArrowRight className="w-4 h-4" />}>Growth dashboard</Button>
          </>
        }
      />

      {!ready ? (
        <div className="space-y-6" aria-busy="true" aria-label="Loading alert center">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{['Open alerts', 'Median time to acknowledge', 'Deliveries', 'Next PM digest'].map((l) => <KpiTile key={l} label={l} value="" loading />)}</div>
          <Skeleton variant="block" className="h-[320px]" />
          <Skeleton variant="block" className="h-[420px]" />
          <Skeleton variant="block" className="h-[300px]" />
          <Skeleton variant="block" className="h-[420px]" />
        </div>
      ) : (
        <>
          <motion.div {...SECTION} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiTile label="Open alerts" value={open.length} icon={<Siren />} hint={`${acked.length} acknowledged · ${resolved.length} resolved`} lowerIsBetter />
            <KpiTile label="Median time to acknowledge" value={mtta === null ? '—' : formatDuration(mtta)} icon={<Clock />} hint={mtta === null ? 'no acknowledgements yet' : 'fired → acknowledged'} lowerIsBetter />
            <KpiTile label="Deliveries" value={`${dsum.delivered}/${dsum.total}`} icon={<Send />} hint={`${dsum.failed} failed · ${dsum.failureRatePct}% failure rate`} />
            <KpiTile label="Next PM digest" value={nextRun === null ? 'paused' : now ? relTime(nextRun, now) : '—'} icon={<Mail />} hint={digest.enabled ? `${digest.cadence}${digest.cadence === 'weekly' ? ` · ${WEEKDAYS.find((w) => w.value === digest.weekday)?.label ?? ''}` : ''} ${String(digest.hourUtc).padStart(2, '0')}:00 UTC · ${digests.length} sent` : 'digest disabled'} />
          </motion.div>

          {/* Incidents */}
          <motion.div {...SECTION} transition={{ delay: 0.05 }}>
            <GlassCard>
              <SectionTitle icon={<AlertTriangle />} title="Incidents" note="One incident per rule, per ISO week, per organization. Open until acknowledged or the rule recovers."
                badge={<SegmentedControl<Filter> layoutId="alert-filter" size="sm" value={filter} onChange={setFilter} options={[{ value: 'open', label: `Open · ${open.length}` }, { value: 'acknowledged', label: `Acked · ${acked.length}` }, { value: 'resolved', label: `Resolved · ${resolved.length}` }, { value: 'all', label: 'All' }]} />} />
              {shown.length === 0 ? (
                <EmptyState icon={<ShieldCheck />} title={filter === 'open' ? 'No open alerts' : `No ${filter === 'all' ? '' : filter + ' '}incidents yet`}
                  description={filter === 'open' ? 'Every rule is within its threshold. Rehearse one from the Growth dashboard’s scenario switch to walk the delivery path.' : 'Incidents appear here as rules fire and are handled.'}
                  action={<Button size="sm" onClick={() => router.push('/console/growth')}>Open Growth dashboard</Button>} />
              ) : (
                <DataTable columns={incidentColumns} rows={shown} rowKey={(i) => i.id} pageSize={8} />
              )}
            </GlassCard>
          </motion.div>

          {/* Rules & routing */}
          <motion.div {...SECTION} transition={{ delay: 0.1 }}>
            <GlassCard>
              <SectionTitle icon={<Sparkles />} title="Rules & thresholds" note="Tune each rule inside its guard-rails — tighten or relax, never switch off. Changes apply to the Growth dashboard and the watcher immediately."
                badge={!isAdmin ? <StatusBadge tone="neutral">read-only · admin edits</StatusBadge> : undefined} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {ALERT_RULES.map((base) => {
                  const rule = rules.find((r) => r.id === base.id) ?? base;
                  const ev = snapshot?.alerts.find((a) => a.id === rule.id);
                  const b = THRESHOLD_BOUNDS[rule.id];
                  const isDefault = isDefaultThreshold(rule.id, rule.threshold);
                  return (
                    <div key={rule.id} className={cn('rounded-2xl border p-4', ev?.status === 'firing' ? 'border-semantic-error/30 bg-semantic-error/5' : 'border-border bg-glass')}>
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-fg">{rule.label}</div>
                          <div className="text-[11px] text-fg-muted">{rule.metricLabel}</div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {ev && <StatusBadge tone={ev.status === 'firing' ? 'error' : ev.status === 'ok' ? 'success' : 'neutral'} dot pulse={ev.status === 'firing'}>{ev.status === 'insufficient-data' ? 'no data' : ev.status}</StatusBadge>}
                          <StatusBadge tone={OWNER_TONE[rule.owner]}>→ {rule.owner}</StatusBadge>
                          <StatusBadge tone={rule.source === 'auth service' ? 'info' : 'neutral'}>{rule.source}</StatusBadge>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <span className="text-[11px] text-fg-muted whitespace-nowrap">now <span className={cn('font-bold tabular-nums', ev?.status === 'firing' ? 'text-semantic-error' : 'text-fg')}>{ev && ev.value !== null ? (rule.unit === 'pp' ? `${ev.value > 0 ? '+' : ''}${ev.value} pp` : `${ev.value}%`) : '—'}</span></span>
                        <span className="text-[11px] text-fg-muted">·</span>
                        <span className="text-[11px] text-fg-muted whitespace-nowrap">threshold <span className="font-bold text-fg tabular-nums">{fmtThreshold(rule)}</span>{!isDefault && <span className="ml-1 text-teal">(custom)</span>}</span>
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <span className="text-[10px] text-fg-muted tabular-nums w-10 text-right">{b.min}{rule.unit === 'pp' ? 'pp' : '%'}</span>
                        <input type="range" min={b.min} max={b.max} step={b.step} value={rule.threshold} disabled={!isAdmin} title={readOnlyHint}
                          aria-label={`${rule.label} threshold`} aria-valuetext={fmtThreshold(rule)}
                          onChange={(e) => { if (center.setThreshold(role, rule.id as RuleId, Number(e.target.value))) track('alert_threshold_changed', { rule: rule.id, value: Number(e.target.value) }); }}
                          className="flex-1 accent-[var(--color-brand,#46BDC6)] disabled:opacity-60" />
                        <span className="text-[10px] text-fg-muted tabular-nums w-10">{b.max}{rule.unit === 'pp' ? 'pp' : '%'}</span>
                        {!isDefault && isAdmin && <button type="button" onClick={() => { if (center.resetThreshold(role, rule.id as RuleId)) track('alert_threshold_changed', { rule: rule.id, value: base.threshold, reset: true }); }} className="text-[11px] font-bold text-fg-muted hover:text-teal inline-flex items-center gap-1 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 rounded"><RotateCw className="w-3 h-3" /> default {fmtThreshold(base)}</button>}
                      </div>
                      <p className="text-[11px] text-fg-muted mt-3">{rule.hypothesis}</p>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6">
                <SectionTitle icon={<Send />} title="Routing" note="Where each owner is reached. In-app is always on; misconfigured channels fail honestly in the delivery ledger." />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {ALERT_OWNERS.map((owner) => {
                    const r = routing[owner];
                    const upd = (patch: Partial<Omit<typeof r, 'owner'>>, field: string) => { if (center.updateRouting(role, owner, patch)) track('alert_routing_updated', { owner, field }); };
                    const toggleChannel = (ch: DeliveryChannel, on: boolean) => upd({ channels: on ? [...r.channels, ch] : r.channels.filter((c) => c !== ch) }, `channel:${ch}`);
                    return (
                      <div key={owner} className="rounded-2xl border border-border bg-glass p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <StatusBadge tone={OWNER_TONE[owner]}>→ {owner}</StatusBadge>
                          <Button size="sm" variant="secondary" disabled={!isAdmin} title={readOnlyHint ?? 'Send a test alert through this routing'} icon={<Send className="w-3.5 h-3.5" />}
                            onClick={() => { const recs = center.sendTest(role, owner, Date.now()); const ok = recs.filter((x) => x.status === 'delivered').length; track('alert_test_sent', { owner, delivered: ok, failed: recs.length - ok }); (recs.length - ok > 0 ? toast.warning : toast.success)('Test alert sent', `${ok} of ${recs.length} channels delivered — see the ledger.`); }}>
                            Test
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {DELIVERY_CHANNELS.map((ch) => (
                            <Toggle key={ch} label={CHANNEL_LABEL[ch]} on={r.channels.includes(ch)} disabled={!isAdmin || ch === 'in-app'} hint={ch === 'in-app' ? 'In-app is the floor — an alert always lands somewhere' : readOnlyHint} onChange={(v) => toggleChannel(ch, v)} />
                          ))}
                        </div>
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-widest text-fg-muted">Email recipients</span>
                          <div className="mt-1"><ChipEditor label={`${owner} email recipients`} values={r.emails} onChange={(v) => upd({ emails: v }, 'emails')} placeholder="name@company.com" validate={(v) => normalizeEmails([v]).length === 1} disabled={!isAdmin} /></div>
                        </div>
                        <TextSetting label="Slack channel" value={r.slackChannel} onCommit={(v) => upd({ slackChannel: v }, 'slack')} validate={isValidSlackChannel} invalidHint="Must look like #growth-alerts" placeholder="#growth-alerts" disabled={!isAdmin} />
                        <TextSetting label="Webhook URL" value={r.webhookUrl} onCommit={(v) => upd({ webhookUrl: v }, 'webhook')} validate={isValidWebhookUrl} invalidHint="Must be an https:// URL" placeholder="https://events.pagerduty.com/v2/enqueue" disabled={!isAdmin} />
                      </div>
                    );
                  })}
                </div>
              </div>
            </GlassCard>
          </motion.div>

          {/* Delivery ledger */}
          <motion.div {...SECTION} transition={{ delay: 0.15 }}>
            <GlassCard>
              <SectionTitle icon={<Bell />} title="Delivery ledger" note="Every attempt to reach someone — alerts, tests and digests — with the outcome per channel." badge={<StatusBadge tone={dsum.failed > 0 ? 'warning' : 'neutral'}>{dsum.total} attempts · {dsum.failed} failed</StatusBadge>} />
              {deliveries.length === 0 ? (
                <EmptyState icon={<Send />} title="No deliveries yet" description="Entries appear when an alert fires, when you send a test alert, or when the digest runs." />
              ) : (
                <DataTable columns={deliveryColumns} rows={deliveries.slice(0, 100)} rowKey={(d) => d.id} pageSize={10} initialSort={{ key: 'at', dir: 'desc' }} />
              )}
            </GlassCard>
          </motion.div>

          {/* Weekly PM digest */}
          <motion.div {...SECTION} transition={{ delay: 0.2 }} id="digest">
            <GlassCard>
              <SectionTitle icon={<Mail />} title="Weekly PM digest" note="The KPI framework as a report, on a cadence, to the people who run the business. The console runs it when it falls due; you can also send it now."
                badge={<StatusBadge tone={digest.enabled ? 'success' : 'neutral'} dot pulse={false}>{digest.enabled && nextRun !== null ? `next run ${fmtUtc(nextRun)}` : 'paused'}</StatusBadge>} />
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                <div className="lg:col-span-3 rounded-2xl border border-border bg-glass p-4 space-y-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <Toggle label={digest.enabled ? 'Scheduled' : 'Paused'} on={digest.enabled} disabled={!isAdmin} hint={readOnlyHint} onChange={(v) => updateDigest({ enabled: v }, 'enabled')} />
                    <SegmentedControl<'weekly' | 'daily'> layoutId="digest-cadence" size="sm" value={digest.cadence} onChange={(v) => { if (isAdmin) updateDigest({ cadence: v }, 'cadence'); }} options={[{ value: 'weekly', label: 'Weekly' }, { value: 'daily', label: 'Daily' }]} />
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {digest.cadence === 'weekly' && (
                      <label className="text-[12px] text-fg-muted inline-flex items-center gap-2">Weekday
                        <select className={selectCls} value={digest.weekday} disabled={!isAdmin} onChange={(e) => updateDigest({ weekday: Number(e.target.value) }, 'weekday')} aria-label="Digest weekday">
                          {WEEKDAYS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
                        </select>
                      </label>
                    )}
                    <label className="text-[12px] text-fg-muted inline-flex items-center gap-2">Hour (UTC)
                      <select className={selectCls} value={digest.hourUtc} disabled={!isAdmin} onChange={(e) => updateDigest({ hourUtc: Number(e.target.value) }, 'hourUtc')} aria-label="Digest hour UTC">
                        {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                      </select>
                    </label>
                    <label className="text-[12px] text-fg-muted inline-flex items-center gap-2">Scope
                      <select className={selectCls} value={digest.scope} disabled={!isAdmin} onChange={(e) => updateDigest({ scope: e.target.value as KpiScope }, 'scope')} aria-label="Digest scope">
                        <option value="population">Sample cohort + you</option>
                        <option value="workspace">Your workspace</option>
                      </select>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {DELIVERY_CHANNELS.filter((c) => c !== 'webhook').map((ch) => (
                      <Toggle key={ch} label={CHANNEL_LABEL[ch]} on={digest.channels.includes(ch)} disabled={!isAdmin} hint={readOnlyHint} onChange={(v) => updateDigest({ channels: v ? [...digest.channels, ch] : digest.channels.filter((c) => c !== ch) }, `channel:${ch}`)} />
                    ))}
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-fg-muted">Recipients</span>
                    <div className="mt-1"><ChipEditor label="Digest recipients" values={digest.recipients} onChange={(v) => updateDigest({ recipients: v }, 'recipients')} placeholder="founders@company.com" validate={(v) => normalizeEmails([v]).length === 1} disabled={!isAdmin} /></div>
                  </div>
                  <TextSetting label="Slack channel" value={digest.slackChannel} onCommit={(v) => updateDigest({ slackChannel: v }, 'slack')} validate={isValidSlackChannel} invalidHint="Must look like #growth-weekly" placeholder="#growth-weekly" disabled={!isAdmin} />
                  <p className="text-[11px] text-fg-muted">{lastDigestRunAt ? `Last run ${fmtUtc(lastDigestRunAt)}.` : 'Not run yet.'} {nextRun !== null && now ? `Next ${fmtUtc(nextRun)} (${relTime(nextRun, now)}).` : ''}</p>
                </div>
                <div className="lg:col-span-2 rounded-2xl border border-border bg-glass p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-fg-muted">Preview · this run</span>
                    <button type="button" onClick={() => copy(preview, 'preview')} aria-label={copied === 'preview' ? 'Copied report' : 'Copy full report'} className="text-[11px] font-bold text-fg-muted hover:text-teal inline-flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 rounded">{copied === 'preview' ? <Check className="w-3 h-3 text-teal" /> : <Copy className="w-3 h-3" />} {copied === 'preview' ? 'Copied' : 'Copy'}</button>
                  </div>
                  <pre className="flex-1 min-h-[200px] max-h-[280px] overflow-auto rounded-xl border border-border bg-surface p-3 font-mono text-[11px] leading-relaxed text-fg-muted whitespace-pre-wrap">{previewLines}{preview.split('\n').length > 14 ? '\n…' : ''}</pre>
                  <Button onClick={sendDigestNow} disabled={!snapshot} icon={<Send className="w-4 h-4" />}>Send now</Button>
                  <p className="text-[11px] text-fg-muted">Sends to {digest.recipients.length} recipient{digest.recipients.length === 1 ? '' : 's'}{digest.channels.includes('slack') && digest.slackChannel ? ` and ${digest.slackChannel}` : ''}, and records the run below.</p>
                </div>
              </div>

              <div className="mt-6">
                <SectionTitle icon={<Clock />} title="Digest history" note="Every report that went out, exactly as rendered." />
                {digests.length === 0 ? (
                  <EmptyState icon={<Mail />} title="No digests yet" description={nextRun !== null ? `The first one runs ${fmtUtc(nextRun)} — or send one now.` : 'Enable the schedule or send one now.'} action={<Button size="sm" onClick={sendDigestNow} disabled={!snapshot} icon={<Send className="w-3.5 h-3.5" />}>Send now</Button>} />
                ) : (
                  <DataTable columns={digestColumns} rows={digests} rowKey={(d) => d.id} pageSize={6} />
                )}
              </div>
            </GlassCard>
          </motion.div>

          <nav aria-label="Related pages" className="flex flex-wrap items-center gap-2 text-xs text-fg-muted pt-2">
            <span className="font-black uppercase tracking-widest text-[10px]">Go deeper</span>
            {[['/console/growth', 'Growth dashboard'], ['/console/settings/team', 'Team'], ['/console/billing', 'Billing']].map(([href, label]) => (
              <Link key={href} href={href} className="rounded-full border border-border bg-glass px-3 py-1 font-bold hover:text-teal hover:border-teal/40 transition-colors inline-flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50">{label} <ArrowRight className="w-3 h-3" /></Link>
            ))}
          </nav>
        </>
      )}

      {/* Acknowledge drawer */}
      <Drawer open={ackTarget !== null} onClose={() => setAckTarget(null)} title="Acknowledge alert" description={ackTarget?.label}
        footer={<div className="flex items-center justify-end gap-2"><Button variant="ghost" onClick={() => setAckTarget(null)}>Cancel</Button><Button onClick={confirmAck} icon={<Check className="w-4 h-4" />}>Acknowledge as {actor}</Button></div>}>
        {ackTarget && (
          <div className="space-y-4">
            <div className="rounded-xl border border-semantic-error/30 bg-semantic-error/5 p-3 text-sm text-fg">{ackTarget.summary}</div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">As delivered</div>
              <pre className="rounded-xl border border-border bg-surface p-3 font-mono text-[11px] text-fg-muted whitespace-pre-wrap">{renderAlertText(ackTarget)}</pre>
            </div>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-fg-muted">Note for the team (optional)</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 280))} rows={3} placeholder="What you found, what you're doing about it…"
                className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-teal focus-visible:ring-2 focus-visible:ring-teal/40" />
              <span className="text-[11px] text-fg-muted">{note.length}/280</span>
            </label>
          </div>
        )}
      </Drawer>

      {/* Digest viewer */}
      <Drawer open={digestView !== null} onClose={() => setDigestView(null)} title={digestView?.periodLabel ?? 'Digest'} description={digestView ? `${digestView.trigger} · ${digestView.delivered}/${digestView.deliveries} delivered · ${fmtUtc(digestView.generatedAt)}` : undefined} widthClass="max-w-2xl"
        footer={<div className="flex items-center justify-end gap-2"><Button variant="secondary" onClick={() => digestView && copy(digestView.markdown, 'digest')} icon={copied === 'digest' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}>{copied === 'digest' ? 'Copied' : 'Copy Markdown'}</Button><Button onClick={() => setDigestView(null)}>Close</Button></div>}>
        {digestView && <pre className="rounded-xl border border-border bg-surface p-4 font-mono text-[11px] leading-relaxed text-fg whitespace-pre-wrap">{digestView.markdown}</pre>}
      </Drawer>
    </div>
  );
}

export default function AlertCenterPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <AlertCenterInner />
    </RoleGuard>
  );
}

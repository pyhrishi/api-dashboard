/**
 * Operational alerting engine (deep feature 1) — pure, deterministic.
 *
 * The admin console already *computes* the signals that matter (wallets at zero or
 * below 10%, keys near expiry and in use, error/latency/spend in the ledger) but
 * nobody is told. This turns those signals into routed, actionable alerts: each rule
 * has a severity, an owning team and a channel, alerts dedupe per rule+customer and
 * respect a cooldown, and every alert carries the evidence plus one-click actions.
 *
 * No I/O and no randomness: the service computes per-customer metrics and passes them
 * in; the same inputs always produce the same alerts. Designed to lift into the real
 * admin service where the channel becomes a PagerDuty/Slack/email delivery.
 */

import type { Customer, WalletSnapshot, KeyInsight } from './types';

export type AlertKind =
  | 'wallet_at_zero' | 'wallet_below_10pct' | 'trial_near_exhaustion'
  | 'error_rate_spike' | 'latency_spike' | 'spend_spike'
  | 'key_near_expiry_in_use';

export type AlertSeverity = 'critical' | 'warning' | 'info';
/** The internal team an alert routes to; maps onto the admin RBAC roles. */
export type AlertTeam = 'ops' | 'finance' | 'sales';
export type AlertChannel = 'pagerduty' | 'slack' | 'email';
export type AlertState = 'firing' | 'acked' | 'snoozed' | 'resolved';

export const ALERT_KINDS: AlertKind[] = [
  'wallet_at_zero', 'wallet_below_10pct', 'trial_near_exhaustion',
  'error_rate_spike', 'latency_spike', 'spend_spike', 'key_near_expiry_in_use',
];

export interface AlertRule {
  id: string;
  kind: AlertKind;
  label: string;
  description: string;
  severity: AlertSeverity;
  team: AlertTeam;
  channel: AlertChannel;
  /** Threshold value (semantics per kind); null for boolean kinds. */
  threshold: number | null;
  unit: string | null;
  /** Minimum activity before the rule can fire (calls or credits), to avoid noise on quiet accounts. */
  minActivity: number;
  cooldownHours: number;
  enabled: boolean;
}

export interface AlertActionRef {
  id: 'open_customer' | 'open_wallet' | 'open_ledger' | 'extend_key';
  label: string;
  href?: string;
  keyId?: string;
}

export interface AlertDelivery { channel: AlertChannel; team: AlertTeam; at: string }

export interface Alert {
  id: string;
  ruleId: string;
  kind: AlertKind;
  severity: AlertSeverity;
  team: AlertTeam;
  channel: AlertChannel;
  customerId: string;
  customerName: string;
  title: string;
  evidence: string;
  /** Numeric value that tripped, for sorting and threshold display. */
  value: number | null;
  firedAt: string;
  state: AlertState;
  ackedBy: string | null;
  ackedAt: string | null;
  resolvedAt: string | null;
  snoozedUntil: string | null;
  /** rule + customer (+ key) — one open incident per dedupe key at a time. */
  dedupeKey: string;
  actions: AlertActionRef[];
  delivered: AlertDelivery[];
}

// ── Default rules (routing is baked in; editable per org) ─────────────────────

export const DEFAULT_ALERT_RULES: AlertRule[] = [
  { id: 'rule_wallet_zero', kind: 'wallet_at_zero', label: 'Wallet hit zero', description: 'A customer’s wallet balance reached 0 — calls are being rejected (402).', severity: 'critical', team: 'finance', channel: 'pagerduty', threshold: null, unit: null, minActivity: 0, cooldownHours: 24, enabled: true },
  { id: 'rule_wallet_low', kind: 'wallet_below_10pct', label: 'Wallet below 10%', description: 'Balance dropped under 10% of the last top-up — top up before it exhausts.', severity: 'warning', team: 'finance', channel: 'slack', threshold: 10, unit: '%', minActivity: 0, cooldownHours: 24, enabled: true },
  { id: 'rule_trial_exhaust', kind: 'trial_near_exhaustion', label: 'Trial nearly exhausted', description: 'A trial account has burned most of its grant — a sales moment before it stalls.', severity: 'warning', team: 'sales', channel: 'slack', threshold: 85, unit: '% used', minActivity: 0, cooldownHours: 48, enabled: true },
  { id: 'rule_error_spike', kind: 'error_rate_spike', label: 'Error-rate spike', description: 'A customer’s 24h error rate crossed the threshold — likely an integration or upstream problem.', severity: 'critical', team: 'ops', channel: 'pagerduty', threshold: 5, unit: '%', minActivity: 50, cooldownHours: 6, enabled: true },
  { id: 'rule_latency_spike', kind: 'latency_spike', label: 'Latency spike', description: 'A customer’s p95 latency crossed the threshold over the last 24h.', severity: 'warning', team: 'ops', channel: 'slack', threshold: 800, unit: 'ms p95', minActivity: 50, cooldownHours: 6, enabled: true },
  { id: 'rule_spend_spike', kind: 'spend_spike', label: 'Spend spike', description: 'A customer’s 24h credit spend is a multiple of its trailing daily average — surprise-overage risk.', severity: 'warning', team: 'finance', channel: 'slack', threshold: 3, unit: '× avg', minActivity: 200, cooldownHours: 12, enabled: true },
  { id: 'rule_key_expiry', kind: 'key_near_expiry_in_use', label: 'Key expiring on live traffic', description: 'A key is within 14 days of expiry and still serving requests — traffic will fail on the expiry date.', severity: 'warning', team: 'ops', channel: 'email', threshold: 14, unit: 'days', minActivity: 1, cooldownHours: 72, enabled: true },
];

export const SEVERITY_RANK: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
export const TEAM_LABEL: Record<AlertTeam, string> = { ops: 'Ops on-call', finance: 'Finance', sales: 'Sales' };
export const CHANNEL_LABEL: Record<AlertChannel, string> = { pagerduty: 'PagerDuty', slack: 'Slack', email: 'Email' };

// ── Per-customer inputs (computed by the service from the ledger + wallet) ────

export interface AlertInputRow {
  customer: Customer;
  wallet: WalletSnapshot;
  errorRate24h: number;
  p95_24h: number;
  calls24h: number;
  credits24h: number;
  /** Trailing 7-day daily average credit spend (excludes the last 24h window's spike). */
  dailyAvgCredits7d: number;
}

interface Candidate { kind: AlertKind; customerId: string; customerName: string; title: string; evidence: string; value: number | null; dedupeSuffix?: string; actions: AlertActionRef[] }

function walletActions(id: string): AlertActionRef[] {
  return [
    { id: 'open_customer', label: 'Open customer', href: `/customers/${id}` },
    { id: 'open_wallet', label: 'Wallets', href: `/wallets` },
  ];
}
function ledgerActions(id: string): AlertActionRef[] {
  return [
    { id: 'open_ledger', label: 'Inspect ledger', href: `/ledger?customer=${id}` },
    { id: 'open_customer', label: 'Open customer', href: `/customers/${id}` },
  ];
}

function candidatesFor(rule: AlertRule, rows: AlertInputRow[], keyInsights: KeyInsight[]): Candidate[] {
  const out: Candidate[] = [];
  if (rule.kind === 'key_near_expiry_in_use') {
    keyInsights.filter((k) => k.daysLeft <= (rule.threshold ?? 14) && k.requests7d >= rule.minActivity).forEach((k) => {
      out.push({
        kind: rule.kind, customerId: k.key.customerId, customerName: k.customerName,
        title: `Key ${k.key.prefix}••••${k.key.last4} expires in ${k.daysLeft}d`,
        evidence: `${k.requests7d.toLocaleString()} calls this week · expires in ${k.daysLeft} day${k.daysLeft === 1 ? '' : 's'} (${k.key.fingerprint})`,
        value: k.daysLeft, dedupeSuffix: k.key.id,
        actions: [{ id: 'extend_key', label: 'Extend 90 days', keyId: k.key.id }, { id: 'open_customer', label: 'Open customer', href: `/customers/${k.key.customerId}` }],
      });
    });
    return out;
  }
  rows.forEach((r) => {
    const name = r.customer.name;
    switch (rule.kind) {
      case 'wallet_at_zero':
        if (r.wallet.atZero) out.push({ kind: rule.kind, customerId: r.customer.id, customerName: name, title: 'Wallet at zero — calls rejected', evidence: `Balance 0 for ${r.wallet.hoursAtZero ?? 0}h · ${r.calls24h.toLocaleString()} calls attempted in 24h`, value: 0, actions: walletActions(r.customer.id) });
        break;
      case 'wallet_below_10pct':
        if (!r.wallet.atZero && r.wallet.belowTenPct) { const pctLeft = r.wallet.remainingOfLastTopUp !== null ? Math.round(r.wallet.remainingOfLastTopUp * 100) : null; out.push({ kind: rule.kind, customerId: r.customer.id, customerName: name, title: 'Wallet below 10% of last top-up', evidence: `${r.wallet.balance.toLocaleString()} left of ${r.wallet.lastTopUpAmount.toLocaleString()}${pctLeft !== null ? ` (${pctLeft}%)` : ''} · ${r.wallet.dailyBurn.toLocaleString()}/day · exhausts ${r.wallet.daysToExhaust !== null ? `in ~${Math.max(0, Math.round(r.wallet.daysToExhaust))}d` : 'n/a'}`, value: pctLeft, actions: walletActions(r.customer.id) }); }
        break;
      case 'trial_near_exhaustion': {
        if (r.customer.plan !== 'Trial' || r.wallet.remainingOfLastTopUp === null) break;
        const usedPct = Math.round((1 - r.wallet.remainingOfLastTopUp) * 100);
        if (!r.wallet.atZero && usedPct >= (rule.threshold ?? 85)) out.push({ kind: rule.kind, customerId: r.customer.id, customerName: name, title: `Trial ${usedPct}% used`, evidence: `${usedPct}% of the trial grant burned · ${r.calls24h.toLocaleString()} calls in 24h — reach out before it stalls`, value: usedPct, actions: [{ id: 'open_customer', label: 'Open customer', href: `/customers/${r.customer.id}` }] });
        break;
      }
      case 'error_rate_spike':
        if (r.calls24h >= rule.minActivity && r.errorRate24h >= (rule.threshold ?? 5)) out.push({ kind: rule.kind, customerId: r.customer.id, customerName: name, title: `Error rate ${r.errorRate24h}% (24h)`, evidence: `${r.errorRate24h}% of ${r.calls24h.toLocaleString()} calls failed in 24h (threshold ${rule.threshold}%)`, value: r.errorRate24h, actions: ledgerActions(r.customer.id) });
        break;
      case 'latency_spike':
        if (r.calls24h >= rule.minActivity && r.p95_24h >= (rule.threshold ?? 800)) out.push({ kind: rule.kind, customerId: r.customer.id, customerName: name, title: `p95 latency ${r.p95_24h}ms`, evidence: `p95 ${r.p95_24h}ms over ${r.calls24h.toLocaleString()} calls in 24h (threshold ${rule.threshold}ms)`, value: r.p95_24h, actions: ledgerActions(r.customer.id) });
        break;
      case 'spend_spike': {
        const ratio = r.dailyAvgCredits7d > 0 ? r.credits24h / r.dailyAvgCredits7d : 0;
        if (r.credits24h >= rule.minActivity && ratio >= (rule.threshold ?? 3)) out.push({ kind: rule.kind, customerId: r.customer.id, customerName: name, title: `Spend ${Math.round(ratio * 10) / 10}× daily average`, evidence: `${r.credits24h.toLocaleString()} credits in 24h vs ~${Math.round(r.dailyAvgCredits7d).toLocaleString()}/day trailing avg (${Math.round(ratio * 10) / 10}× · threshold ${rule.threshold}×)`, value: Math.round(ratio * 10) / 10, actions: ledgerActions(r.customer.id) });
        break;
      }
    }
  });
  return out;
}

/**
 * Evaluate every enabled rule and return the *new* alerts to raise. An alert is
 * suppressed when an open one (firing / acked / still-snoozed) already exists for the
 * same dedupe key, or when a resolved one is still inside its cooldown window.
 */
export function evaluateAlerts(
  rows: AlertInputRow[], keyInsights: KeyInsight[], rules: AlertRule[], existing: Alert[], now: number,
  mkId: (kind: AlertKind, customerId: string) => string,
): Alert[] {
  const openByKey = new Set(existing.filter((a) => a.state === 'firing' || a.state === 'acked' || (a.state === 'snoozed' && a.snoozedUntil !== null && Date.parse(a.snoozedUntil) > now)).map((a) => a.dedupeKey));
  const lastResolvedByKey = new Map<string, number>();
  existing.filter((a) => a.state === 'resolved' && a.resolvedAt).forEach((a) => { const t = Date.parse(a.resolvedAt as string); const cur = lastResolvedByKey.get(a.dedupeKey); if (cur === undefined || t > cur) lastResolvedByKey.set(a.dedupeKey, t); });
  const iso = new Date(now).toISOString();
  const created: Alert[] = [];
  rules.filter((r) => r.enabled).forEach((rule) => {
    candidatesFor(rule, rows, keyInsights).forEach((c) => {
      const dedupeKey = `${rule.id}:${c.customerId}${c.dedupeSuffix ? `:${c.dedupeSuffix}` : ''}`;
      if (openByKey.has(dedupeKey)) return;
      const resolvedAt = lastResolvedByKey.get(dedupeKey);
      if (resolvedAt !== undefined && now - resolvedAt < rule.cooldownHours * 3_600_000) return;
      created.push({
        id: mkId(rule.kind, c.customerId), ruleId: rule.id, kind: rule.kind, severity: rule.severity, team: rule.team, channel: rule.channel,
        customerId: c.customerId, customerName: c.customerName, title: c.title, evidence: c.evidence, value: c.value,
        firedAt: iso, state: 'firing', ackedBy: null, ackedAt: null, resolvedAt: null, snoozedUntil: null, dedupeKey,
        actions: c.actions, delivered: [{ channel: rule.channel, team: rule.team, at: iso }],
      });
      openByKey.add(dedupeKey);
    });
  });
  return created;
}

export interface AlertStats {
  firing: number;
  critical: number;
  warning: number;
  acked: number;
  snoozed: number;
  resolved24h: number;
  byTeam: Record<AlertTeam, number>;
  byKind: Partial<Record<AlertKind, number>>;
}

export function alertStats(alerts: Alert[], now: number): AlertStats {
  const open = alerts.filter((a) => a.state === 'firing' || a.state === 'acked' || (a.state === 'snoozed' && a.snoozedUntil !== null && Date.parse(a.snoozedUntil) > now));
  const byTeam: Record<AlertTeam, number> = { ops: 0, finance: 0, sales: 0 };
  const byKind: Partial<Record<AlertKind, number>> = {};
  open.forEach((a) => { byTeam[a.team] += 1; byKind[a.kind] = (byKind[a.kind] ?? 0) + 1; });
  return {
    firing: alerts.filter((a) => a.state === 'firing').length,
    critical: open.filter((a) => a.severity === 'critical').length,
    warning: open.filter((a) => a.severity === 'warning').length,
    acked: alerts.filter((a) => a.state === 'acked').length,
    snoozed: alerts.filter((a) => a.state === 'snoozed' && a.snoozedUntil !== null && Date.parse(a.snoozedUntil) > now).length,
    resolved24h: alerts.filter((a) => a.state === 'resolved' && a.resolvedAt && now - Date.parse(a.resolvedAt) < 86_400_000).length,
    byTeam, byKind,
  };
}

/** Newest + most severe first; open before resolved. */
export function sortAlerts(alerts: Alert[]): Alert[] {
  const stateRank: Record<AlertState, number> = { firing: 0, acked: 1, snoozed: 2, resolved: 3 };
  return alerts.slice().sort((a, b) => stateRank[a.state] - stateRank[b.state] || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || Date.parse(b.firedAt) - Date.parse(a.firedAt));
}

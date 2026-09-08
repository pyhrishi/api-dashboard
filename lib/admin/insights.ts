/**
 * Deterministic insight engines for the admin console — pure functions over the
 * admin data model. No I/O, no randomness: the same inputs always produce the same
 * funnel, projection, flag or trigger decision.
 */

import {
  FUNNEL_ORDER, STAGE_BAND,
  type Customer, type ManagedKey, type LedgerEntry, type Wallet, type WalletSnapshot, type KeyInsight, type LedgerSummary,
  type FunnelSummary, type FunnelStage, type SalesTrigger, type Handoff, type Plan, type Region, type ProductId, type Timeframe,
} from './types';

const DAY = 86_400_000;
const HOUR = 3_600_000;

// ── Time frames ──────────────────────────────────────────────────────────────

export type TimeframeKey = '1h' | '24h' | '7d' | '30d';
export const TIMEFRAMES: Record<TimeframeKey, { label: string; ms: number }> = {
  '1h': { label: 'Last hour', ms: HOUR }, '24h': { label: 'Last 24 hours', ms: DAY }, '7d': { label: 'Last 7 days', ms: 7 * DAY }, '30d': { label: 'Last 30 days', ms: 30 * DAY },
};
export function timeframe(key: TimeframeKey, now: number): Timeframe {
  return { from: now - TIMEFRAMES[key].ms, to: now, label: TIMEFRAMES[key].label };
}

// ── Keys: near expiry AND in use ─────────────────────────────────────────────

export const NEAR_EXPIRY_DAYS = 14;
export const IN_USE_MIN_REQUESTS_7D = 1;

export function keysNearExpiryInUse(keys: ManagedKey[], customers: Customer[], now: number, windowDays = NEAR_EXPIRY_DAYS): KeyInsight[] {
  const names = new Map(customers.map((c) => [c.id, c.name]));
  return keys
    .filter((k) => k.status === 'active' && k.expiresAt && k.requests7d >= IN_USE_MIN_REQUESTS_7D)
    .map((k) => ({ key: k, daysLeft: Math.ceil((Date.parse(k.expiresAt as string) - now) / DAY) }))
    .filter((x) => x.daysLeft <= windowDays)
    .map((x): KeyInsight => ({ key: x.key, customerName: names.get(x.key.customerId) ?? x.key.customerId, daysLeft: x.daysLeft, requests7d: x.key.requests7d, severity: x.daysLeft <= 7 ? 'critical' : 'warning' }))
    .sort((a, b) => a.daysLeft - b.daysLeft || b.requests7d - a.requests7d);
}

// ── Wallets: balance vs usage, projection, flags ────────────────────────────

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function walletSnapshot(wallet: Wallet, ledger: LedgerEntry[], now: number): WalletSnapshot {
  const mine = ledger.filter((e) => e.customerId === wallet.customerId);
  const burn7d = mine.filter((e) => e.ts >= now - 7 * DAY).reduce((s, e) => s + e.credits, 0);
  const burn30d = mine.filter((e) => e.ts >= now - 30 * DAY).reduce((s, e) => s + e.credits, 0);
  const dailyBurn = burn7d / 7;
  const tops = wallet.topUps.slice().sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const last = tops[tops.length - 1] ?? null;
  const gaps = tops.slice(1).map((t, i) => (Date.parse(t.at) - Date.parse(tops[i].at)) / DAY);
  const cadence = median(gaps);
  const nextExpected = last && cadence ? Date.parse(last.at) + cadence * DAY : null;
  const daysToExhaust = dailyBurn > 0 ? wallet.balance / dailyBurn : null;
  const projectedExhaustAt = daysToExhaust !== null ? now + daysToExhaust * DAY : null;
  const atZero = wallet.balance <= 0;
  const lastZeroHit = atZero ? mine.find((e) => e.status === 402) : undefined;
  const remaining = last ? wallet.balance / last.amount : null;
  let label: WalletSnapshot['label'] = 'idle';
  if (atZero) label = 'exhausted';
  else if (dailyBurn <= 0) label = 'idle';
  else if (nextExpected !== null && projectedExhaustAt !== null) label = projectedExhaustAt < nextExpected - DAY ? 'early' : projectedExhaustAt > nextExpected + 3 * DAY ? 'delayed' : 'on_track';
  else if (daysToExhaust !== null) label = daysToExhaust < 14 ? 'early' : 'on_track';
  return {
    customerId: wallet.customerId, balance: wallet.balance, lastTopUpAmount: last?.amount ?? 0, lastTopUpAt: last?.at ?? null,
    burn7d, burn30d, dailyBurn: Math.round(dailyBurn), topUpCadenceDays: cadence === null ? null : Math.round(cadence),
    nextExpectedTopUpAt: nextExpected ? new Date(nextExpected).toISOString() : null,
    projectedExhaustAt: projectedExhaustAt ? new Date(projectedExhaustAt).toISOString() : null,
    daysToExhaust: daysToExhaust === null ? null : Math.round(daysToExhaust * 10) / 10,
    label,
    belowTenPct: !atZero && last !== null && wallet.balance < 0.1 * last.amount,
    atZero,
    hoursAtZero: atZero ? Math.round((now - (lastZeroHit ? lastZeroHit.ts : now)) / HOUR) : null,
    remainingOfLastTopUp: remaining === null ? null : Math.round(remaining * 1000) / 1000,
  };
}

/** Daily balance-vs-usage series for the trend chart, reconstructed from the ledger and top-ups. */
export function walletSeries(wallet: Wallet, ledger: LedgerEntry[], now: number, days = 30): { day: string; usage: number; balance: number; projected: number | null }[] {
  const mine = ledger.filter((e) => e.customerId === wallet.customerId);
  const start = now - days * DAY;
  const usageByDay = new Map<number, number>();
  mine.forEach((e) => { if (e.ts >= start) { const d = Math.floor((e.ts - start) / DAY); usageByDay.set(d, (usageByDay.get(d) ?? 0) + e.credits); } });
  // Walk backwards from today's balance to reconstruct history (adding back usage, removing top-ups).
  const bal: number[] = new Array(days).fill(0);
  let running = wallet.balance;
  for (let d = days - 1; d >= 0; d--) {
    bal[d] = Math.max(0, Math.round(running));
    running += usageByDay.get(d) ?? 0;
    const dayStart = start + d * DAY;
    wallet.topUps.forEach((t) => { const at = Date.parse(t.at); if (at >= dayStart && at < dayStart + DAY) running -= t.amount; });
  }
  const snap = walletSnapshot(wallet, ledger, now);
  const out = bal.map((b, d) => ({ day: new Date(start + d * DAY).toISOString().slice(5, 10), usage: usageByDay.get(d) ?? 0, balance: b, projected: null as number | null }));
  // Projection: next 14 days at the trailing burn.
  for (let d = 1; d <= 14; d++) {
    const projected = Math.max(0, Math.round(wallet.balance - snap.dailyBurn * d));
    out.push({ day: new Date(now + d * DAY).toISOString().slice(5, 10), usage: 0, balance: NaN, projected });
    if (projected === 0) break;
  }
  return out;
}

// ── Ledger: metadata-only summaries ─────────────────────────────────────────

function pct(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
}

export function summarizeLedger(entries: LedgerEntry[], keys: ManagedKey[], frame: Timeframe): LedgerSummary {
  const rows = entries.filter((e) => e.ts >= frame.from && e.ts <= frame.to);
  const calls = rows.length;
  const credits = rows.reduce((s, e) => s + e.credits, 0);
  const successes = rows.filter((e) => e.status < 400).length;
  const byStatusMap = new Map<number, number>();
  rows.forEach((e) => byStatusMap.set(e.status, (byStatusMap.get(e.status) ?? 0) + 1));
  const byStatus = Array.from(byStatusMap.entries()).map(([code, count]) => ({ code, count, share: calls ? Math.round((count / calls) * 1000) / 10 : 0 })).sort((a, b) => a.code - b.code);
  const byClass = { '2xx': 0, '4xx': 0, '5xx': 0 };
  rows.forEach((e) => { if (e.status < 300) byClass['2xx'] += 1; else if (e.status < 500) byClass['4xx'] += 1; else byClass['5xx'] += 1; });
  const epMap = new Map<string, { calls: number; credits: number; successes: number; errors: number }>();
  rows.forEach((e) => {
    const cur = epMap.get(e.endpoint) ?? { calls: 0, credits: 0, successes: 0, errors: 0 };
    cur.calls += 1; cur.credits += e.credits; if (e.status < 400) cur.successes += 1; else cur.errors += 1;
    epMap.set(e.endpoint, cur);
  });
  const keyName = new Map(keys.map((k) => [k.id, k]));
  const keyMap = new Map<string, { calls: number; credits: number }>();
  rows.forEach((e) => { const cur = keyMap.get(e.keyId) ?? { calls: 0, credits: 0 }; cur.calls += 1; cur.credits += e.credits; keyMap.set(e.keyId, cur); });
  const dayCount = Math.max(1, Math.ceil((frame.to - frame.from) / DAY));
  const daily: LedgerSummary['daily'] = [];
  for (let d = dayCount - 1; d >= 0; d--) {
    const from = frame.to - (d + 1) * DAY;
    const dayRows = rows.filter((e) => e.ts >= from && e.ts < from + DAY);
    daily.push({ day: new Date(from + DAY).toISOString().slice(5, 10), calls: dayRows.length, credits: dayRows.reduce((s, e) => s + e.credits, 0) });
  }
  const lat = rows.map((e) => e.latencyMs);
  return {
    from: frame.from, to: frame.to, calls, credits, successes,
    errorRate: calls ? Math.round(((calls - successes) / calls) * 1000) / 10 : 0,
    p50LatencyMs: pct(lat, 0.5), p95LatencyMs: pct(lat, 0.95),
    byStatus, byClass,
    byEndpoint: Array.from(epMap.entries()).map(([endpoint, v]) => ({ endpoint, ...v })).sort((a, b) => b.credits - a.credits),
    byKey: Array.from(keyMap.entries()).map(([keyId, v]) => ({ keyId, keyName: keyName.get(keyId)?.name ?? keyId, fingerprint: keyName.get(keyId)?.fingerprint ?? '', ...v })).sort((a, b) => b.calls - a.calls),
    costPerSuccess: successes ? Math.round((credits / successes) * 100) / 100 : null,
    daily,
  };
}

// ── Funnel across customers ─────────────────────────────────────────────────

export interface FunnelFilters { product?: ProductId | 'all'; plan?: Plan | 'all'; region?: Region | 'all'; sinceDays?: number }

export function summarizeFunnel(customers: Customer[], now: number, f: FunnelFilters = {}): FunnelSummary {
  const rows = customers.filter((c) =>
    (!f.product || f.product === 'all' || c.productIds.includes(f.product)) &&
    (!f.plan || f.plan === 'all' || c.plan === f.plan) &&
    (!f.region || f.region === 'all' || c.region === f.region) &&
    (!f.sinceDays || Date.parse(c.createdAt) >= now - f.sinceDays * DAY));
  const reached = (stage: FunnelStage) => rows.filter((c) => c.stage !== 'churned' ? FUNNEL_ORDER.indexOf(c.stage) >= FUNNEL_ORDER.indexOf(stage) : ['signed_up', 'activated', 'integrated', 'paying'].indexOf(stage) >= 0 && Boolean(c.paidAt || stage !== 'paying')).length;
  const stages = FUNNEL_ORDER.map((stage, i) => {
    const count = reached(stage);
    const prev = i === 0 ? null : reached(FUNNEL_ORDER[i - 1]);
    return { stage, band: STAGE_BAND[stage] as 'TOFU' | 'MOFU' | 'BOFU', count, dropOffPct: prev ? Math.round(((prev - count) / prev) * 1000) / 10 : null };
  });
  const tta = rows.filter((c) => c.activatedAt).map((c) => (Date.parse(c.activatedAt as string) - Date.parse(c.createdAt)) / 60_000);
  const ttp = rows.filter((c) => c.paidAt).map((c) => (Date.parse(c.paidAt as string) - Date.parse(c.createdAt)) / DAY);
  const count = <K extends string>(keys: readonly K[], get: (c: Customer) => K[]) => keys.reduce((acc, k) => { acc[k] = rows.filter((c) => get(c).includes(k)).length; return acc; }, {} as Record<K, number>);
  return {
    total: rows.length,
    stages,
    churned: rows.filter((c) => c.stage === 'churned').length,
    timeToActivateMinutes: { median: median(tta) === null ? null : Math.round(median(tta) as number), p90: tta.length ? Math.round(pct(tta, 0.9)) : null, underTenMinPct: tta.length ? Math.round((tta.filter((m) => m <= 10).length / tta.length) * 100) : null, sample: tta.length },
    timeToPayDays: { median: median(ttp) === null ? null : Math.round(median(ttp) as number), sample: ttp.length },
    byPlan: count(['Trial', 'Starter', 'Growth', 'Enterprise'] as const, (c) => [c.plan]),
    byRegion: count(['IN', 'US', 'EU'] as const, (c) => [c.region]),
    byProduct: count(['zinbit', 'zintlr-intent', 'zintlr-context'] as const, (c) => c.productIds),
  };
}

// ── Sales triggers ──────────────────────────────────────────────────────────

export interface CustomerMetrics { calls7d: number; credits7d: number; trialUsagePct: number | null; walletPct: number | null }

export function customerMetrics(c: Customer, ledger: LedgerEntry[], snap: WalletSnapshot): CustomerMetrics {
  const wk = ledger.filter((e) => e.customerId === c.id && e.ts >= Date.now() - 7 * DAY);
  const calls7d = wk.length;
  const credits7d = wk.reduce((s, e) => s + e.credits, 0);
  const trialUsagePct = c.plan === 'Trial' && snap.lastTopUpAmount > 0 ? Math.round(((snap.lastTopUpAmount - snap.balance) / snap.lastTopUpAmount) * 100) : null;
  const walletPct = snap.lastTopUpAmount > 0 ? Math.round((snap.balance / snap.lastTopUpAmount) * 100) : null;
  return { calls7d, credits7d, trialUsagePct, walletPct };
}

export function triggerFires(t: SalesTrigger, c: Customer, m: CustomerMetrics): { fires: boolean; evidence: string } {
  if (!t.enabled) return { fires: false, evidence: 'disabled' };
  if (t.kind === 'stage') {
    const fires = c.stage !== 'churned' && t.stage !== undefined && FUNNEL_ORDER.indexOf(c.stage) >= FUNNEL_ORDER.indexOf(t.stage);
    return { fires, evidence: `stage ${c.stage}` };
  }
  const value = t.metric ? m[t.metric] : null;
  if (value === null || value === undefined || t.value === undefined) return { fires: false, evidence: `${t.metric} n/a` };
  const fires = t.op === '>=' ? value >= t.value : value <= t.value;
  return { fires, evidence: `${t.metric} = ${value}${t.metric?.endsWith('Pct') ? '%' : ''} (${t.op} ${t.value}${t.metric?.endsWith('Pct') ? '%' : ''})` };
}

/** New handoffs for every enabled trigger that fires and is outside its cooldown for that account. */
export function evaluateTriggers(triggers: SalesTrigger[], customers: Customer[], metrics: Map<string, CustomerMetrics>, existing: Handoff[], now: number, mkId: (c: Customer, t: SalesTrigger) => string): Handoff[] {
  const out: Handoff[] = [];
  customers.forEach((c) => {
    const m = metrics.get(c.id);
    if (!m) return;
    triggers.forEach((t) => {
      const { fires, evidence } = triggerFires(t, c, m);
      if (!fires) return;
      const recent = existing.find((h) => h.customerId === c.id && h.triggerId === t.id && now - Date.parse(h.firedAt) < t.cooldownDays * DAY);
      if (recent) return;
      out.push({ id: mkId(c, t), customerId: c.id, triggerId: t.id, triggerName: t.name, firedAt: new Date(now).toISOString(), evidence, state: 'new', ownerId: t.owner, notes: [] });
    });
  });
  return out;
}

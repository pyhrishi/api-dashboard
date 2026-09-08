'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Calculator, Plus, Trash2, Zap, TrendingUp, Sparkles, ArrowRight, Check,
  AlertTriangle, Gauge, Wallet, BarChart3, Info,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { GlassCard } from '@/components/ui/GlassCard';
import { KpiTile } from '@/components/ui/KpiTile';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Sparkline } from '@/components/ui/Sparkline';
import { useStore } from '@/lib/store';
import { track } from '@/lib/telemetry';
import { ENDPOINTS } from '@/data/endpoints';
import { LANDING_CATALOG, LANDING_CATEGORIES, type LandingCategory } from '@/lib/landing-catalog';
import {
  PRICING_TIERS, estimateCost, recommendTier, forecast, nextVolumeBand,
  endpointCredits, formatUsd, tierById, monthlyPlanCost, billedAmount,
  type TierId, type BillingCycle, type OverageMode, type LineItem,
} from '@/lib/pricing';
import { usePricingCalc } from '@/lib/pricing-calc';

const NAME_BY_ID: Record<string, string> = ENDPOINTS.reduce((a, e) => { a[e.id] = e.name; return a; }, {} as Record<string, string>);

/** A representative sample mix (popular enrichment calls) for a first-time visitor. */
const SAMPLE_MIX: LineItem[] = [
  { endpointId: 'people-search', callsPerMonth: 40_000 },
  { endpointId: 'company-employees', callsPerMonth: 15_000 },
];

/** Strip the /api prefix and any query string, so a log path matches an endpoint path. */
function normalizePath(p: string): string {
  const noQuery = p.split('?')[0];
  return noQuery.startsWith('/api/') ? noQuery.slice(4) : noQuery;
}

/** Project the user's real recent call-mix (from live logs) onto a representative month. */
function mixFromUsage(logs: { path: string; environment: string }[]): LineItem[] {
  const byPath = new Map<string, number>();
  for (const l of logs) {
    if (l.environment !== 'live') continue;
    const np = normalizePath(l.path);
    byPath.set(np, (byPath.get(np) ?? 0) + 1);
  }
  if (byPath.size === 0) return [];
  // Map matched paths to endpoint ids (exact, then prefix).
  const counts = new Map<string, number>();
  byPath.forEach((count, path) => {
    let ep = ENDPOINTS.find((e) => e.path === path);
    if (!ep) ep = ENDPOINTS.find((e) => path.startsWith(e.path + '/') || path.startsWith(e.path));
    if (ep && endpointCredits(ep.id) > 0) counts.set(ep.id, (counts.get(ep.id) ?? 0) + count);
  });
  if (counts.size === 0) return [];
  const max = Math.max(...Array.from(counts.values()));
  const factor = 50_000 / max; // busiest endpoint ≈ 50k/mo, others proportional
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([endpointId, c]) => ({ endpointId, callsPerMonth: Math.max(500, Math.round(c * factor)) }));
}

export default function PricingCalculatorPage() {
  const [hydrated, setHydrated] = useState(false);
  const [pickerCat, setPickerCat] = useState<LandingCategory>('people');
  const apiLogs = useStore((s) => s.apiLogs);
  const billingDetails = useStore((s) => s.billingDetails);

  const {
    lineItems, tierId, cycle, overageMode, growthPct, customized,
    addLineItem, removeLineItem, setCalls, replaceMix,
    setTier, setCycle, setOverageMode, setGrowthPct, reset,
  } = usePricingCalc();

  // Persisted store rehydrates after mount — gate on it to avoid a hydration mismatch.
  useEffect(() => { setHydrated(true); }, []);

  // First-view prefill from real usage (kept as a suggestion until the user edits).
  useEffect(() => {
    if (!hydrated || customized || lineItems.length > 0) return;
    const mix = mixFromUsage(apiLogs);
    if (mix.length > 0) {
      replaceMix(mix, false);
      track('pricing_prefilled_from_usage', { endpoints: mix.length });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  useEffect(() => {
    if (hydrated) track('pricing_calculator_viewed', { lineItems: lineItems.length, tier: tierId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const estimate = useMemo(
    () => estimateCost(lineItems, tierId, cycle, overageMode),
    [lineItems, tierId, cycle, overageMode],
  );
  const rec = useMemo(
    () => recommendTier(lineItems, cycle, overageMode),
    [lineItems, cycle, overageMode],
  );
  const forecastPts = useMemo(
    () => forecast(lineItems, tierId, growthPct, 12, cycle, overageMode),
    [lineItems, tierId, growthPct, cycle, overageMode],
  );
  const nextBand = useMemo(() => nextVolumeBand(estimate.rawCredits), [estimate.rawCredits]);

  const catalogForCat = useMemo(
    () => LANDING_CATALOG.filter((c) => c.category === pickerCat && !lineItems.some((l) => l.endpointId === c.id)),
    [pickerCat, lineItems],
  );

  const recTier = tierById(rec.recommended);
  const recDiffers = rec.recommended !== tierId;
  const currentTierTotal = rec.byTier.find((t) => t.tierId === tierId)?.totalMonthly ?? estimate.totalMonthly;
  const recTotal = rec.byTier.find((t) => t.tierId === rec.recommended)?.totalMonthly ?? 0;
  const savings = Math.max(0, currentTierTotal - recTotal);

  // --- Loading state (pre-hydration) ---
  if (!hydrated) {
    return (
      <div className="space-y-6">
        <PageHeader icon={<Calculator />} title="Cost Calculator" description="Model your monthly spend against your real call-mix — the exact numbers the gateway bills." />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
        <div className="grid lg:grid-cols-3 gap-6">
          <Skeleton className="h-96 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    );
  }

  const forecastMonth = (m: number) => forecastPts[m - 1]?.totalMonthly ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Calculator />}
        title="Cost Calculator"
        description="Model your monthly spend against your real call-mix — the exact numbers the gateway bills."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={<Sparkles className="w-4 h-4" />}
              onClick={() => {
                const mix = mixFromUsage(apiLogs);
                if (mix.length > 0) { replaceMix(mix); track('pricing_prefilled_from_usage', { endpoints: mix.length, manual: true }); }
              }}
              disabled={mixFromUsage(apiLogs).length === 0}
            >
              Prefill from my usage
            </Button>
            <Button variant="ghost" size="sm" onClick={() => reset()}>Reset</Button>
          </div>
        }
      />

      {/* KPI summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="Credits / month" value={estimate.effectiveCredits.toLocaleString()} icon={<Zap />} hint={estimate.volumeDiscountPct > 0 ? `after ${estimate.volumeDiscountPct}% volume discount` : 'no volume discount yet'} />
        <KpiTile label="Est. monthly cost" value={formatUsd(estimate.totalMonthly)} icon={<Wallet />} hint={cycle === 'yearly' ? 'billed yearly' : 'billed monthly'} />
        <KpiTile label="Effective $ / call" value={estimate.totalCalls > 0 ? formatUsd(estimate.effectivePricePerCall) : '—'} icon={<TrendingUp />} hint={`${estimate.totalCalls.toLocaleString()} calls / mo`} />
        <KpiTile label="Volume discount" value={`${estimate.volumeDiscountPct}%`} icon={<Gauge />} hint={estimate.volumeBandLabel} />
      </div>

      {/* Recommendation / savings nudge */}
      <AnimatePresence>
        {lineItems.length > 0 && recDiffers && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <GlassCard className="p-4 border-teal/30">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-teal"><Sparkles className="w-5 h-5" /></span>
                  <div>
                    <p className="text-sm font-bold text-fg">
                      {savings > 0
                        ? <>You&rsquo;d save {formatUsd(savings)}/mo on <span className="text-teal">{recTier.name}</span> for this mix.</>
                        : <><span className="text-teal">{recTier.name}</span> fits this mix better than {tierById(tierId).name}.</>}
                    </p>
                    <p className="text-xs text-fg-muted mt-0.5">Recommended from your modeled volume — {recTier.blurb}</p>
                  </div>
                </div>
                <Button size="sm" variant="secondary" icon={<ArrowRight className="w-4 h-4" />} onClick={() => { setTier(rec.recommended); track('pricing_tier_compared', { picked: rec.recommended, from: tierId }); }}>
                  Switch to {recTier.name}
                </Button>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Call-mix builder */}
        <GlassCard className="p-6 lg:col-span-2 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-fg flex items-center gap-2"><BarChart3 className="w-5 h-5 text-teal" /> Your call-mix</h2>
            {!customized && lineItems.length > 0 && (
              <span className="text-[11px] font-bold uppercase tracking-wider text-teal bg-teal/10 border border-teal/20 rounded-full px-2.5 py-1">Projected from your usage</span>
            )}
          </div>

          {/* Add-endpoint picker */}
          <div className="flex flex-col sm:flex-row gap-3">
            <SegmentedControl<LandingCategory>
              size="sm"
              value={pickerCat}
              onChange={(v) => setPickerCat(v)}
              options={LANDING_CATEGORIES.map((c) => ({ value: c.id, label: c.name }))}
            />
            <select
              value=""
              onChange={(e) => { if (e.target.value) { addLineItem(e.target.value); track('pricing_mix_edited', { action: 'add', endpoint: e.target.value }); } }}
              className="flex-1 bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-teal/40 transition-shadow"
            >
              <option value="">{catalogForCat.length ? `Add a ${pickerCat} endpoint…` : 'All added — pick another category'}</option>
              {catalogForCat.map((c) => (
                <option key={c.id} value={c.id}>{c.name} · {c.price} {c.price === 1 ? 'credit' : 'credits'}/call</option>
              ))}
            </select>
          </div>

          {/* Line items */}
          {lineItems.length === 0 ? (
            <EmptyState
              icon={<Calculator />}
              title="Model your API spend"
              description="Add the endpoints you'll call and how often, and we'll show the exact monthly cost — the same numbers the gateway bills."
              action={<Button size="sm" variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={() => { replaceMix(SAMPLE_MIX); track('pricing_mix_edited', { action: 'sample' }); }}>Load a sample mix</Button>}
            />
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 px-2 text-[11px] font-bold uppercase tracking-wider text-fg-subtle">
                <span className="col-span-5">Endpoint</span>
                <span className="col-span-3 text-right">Calls / mo</span>
                <span className="col-span-2 text-right">Credits</span>
                <span className="col-span-2 text-right">Cost</span>
              </div>
              <AnimatePresence initial={false}>
                {estimate.perLine.map((line) => (
                  <motion.div
                    key={line.endpointId}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="grid grid-cols-12 gap-2 items-center bg-surface-2 rounded-xl px-2 py-2 border border-border-subtle"
                  >
                    <div className="col-span-5 min-w-0">
                      <p className="text-sm font-medium text-fg truncate">{NAME_BY_ID[line.endpointId] ?? line.endpointId}</p>
                      <p className="text-[11px] text-fg-subtle">
                        {line.unitCredits} {line.unitCredits === 1 ? 'credit' : 'credits'}/call
                        {line.effectiveUnitCredits < line.unitCredits && <span className="text-teal"> → {line.effectiveUnitCredits} after discount</span>}
                      </p>
                    </div>
                    <div className="col-span-3">
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        value={line.callsPerMonth}
                        onChange={(e) => setCalls(line.endpointId, Number(e.target.value))}
                        className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-sm text-right font-mono text-fg focus:outline-none focus:ring-2 focus:ring-teal/40"
                      />
                    </div>
                    <span className="col-span-2 text-right text-sm font-mono text-fg-muted">{line.credits.toLocaleString()}</span>
                    <div className="col-span-2 flex items-center justify-end gap-1">
                      <span className="text-sm font-mono text-fg">{formatUsd(line.credits * (estimate.tier.monthlyPrice / estimate.tier.includedCredits))}</span>
                      <button onClick={() => { removeLineItem(line.endpointId); track('pricing_mix_edited', { action: 'remove', endpoint: line.endpointId }); }} className="p-1 text-fg-subtle hover:text-semantic-error transition-colors rounded" aria-label="Remove">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Totals + volume-discount progress */}
              <div className="pt-3 mt-1 border-t border-border-subtle space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-fg-muted">Total credits / month</span>
                  <span className="font-mono font-bold text-fg">
                    {estimate.effectiveCredits.toLocaleString()}
                    {estimate.rawCredits !== estimate.effectiveCredits && <span className="text-fg-subtle line-through ml-2 font-normal">{estimate.rawCredits.toLocaleString()}</span>}
                  </span>
                </div>
                {nextBand ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-fg-muted">
                      <span>{estimate.volumeDiscountPct}% discount</span>
                      <span>{nextBand.creditsToUnlock.toLocaleString()} more credits → {nextBand.band.discountPct}%</span>
                    </div>
                    <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-teal rounded-full"
                        initial={false}
                        animate={{ width: `${Math.min(100, (estimate.rawCredits / nextBand.band.minCredits) * 100)}%` }}
                        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-teal flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Top volume-discount band reached ({estimate.volumeDiscountPct}%).</p>
                )}
              </div>
            </div>
          )}
        </GlassCard>

        {/* Plan & options */}
        <div className="space-y-6">
          <GlassCard className="p-6 space-y-4">
            <h2 className="text-lg font-bold text-fg">Plan</h2>
            <SegmentedControl<TierId>
              value={tierId}
              onChange={(v) => { setTier(v); track('pricing_tier_compared', { picked: v }); }}
              options={PRICING_TIERS.map((t) => ({ value: t.id, label: t.name }))}
            />
            <div className="flex items-center gap-2">
              <SegmentedControl<BillingCycle>
                size="sm"
                value={cycle}
                onChange={(v) => { setCycle(v); track('pricing_cycle_changed', { cycle: v }); }}
                options={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly · 2 mo free' }]}
              />
            </div>
            <div className="flex items-center gap-2">
              <SegmentedControl<OverageMode>
                size="sm"
                value={overageMode}
                onChange={(v) => setOverageMode(v)}
                options={[{ value: 'soft', label: 'Soft overage' }, { value: 'hard', label: 'Hard cap' }]}
              />
            </div>

            {/* Cost breakdown */}
            <div className="pt-2 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-fg-muted">Subscription</span><span className="font-mono text-fg">{formatUsd(monthlyPlanCost(estimate.tier, cycle))}/mo</span></div>
              {estimate.overageCost > 0 && (
                <div className="flex justify-between"><span className="text-fg-muted">Overage ({estimate.overageCredits.toLocaleString()} cr)</span><span className="font-mono text-semantic-warning">{formatUsd(estimate.overageCost)}</span></div>
              )}
              <div className="flex justify-between pt-2 border-t border-border-subtle"><span className="font-bold text-fg">Total / month</span><span className="font-mono font-black text-fg text-lg">{formatUsd(estimate.totalMonthly)}</span></div>
              {cycle === 'yearly' && <p className="text-[11px] text-fg-subtle text-right">{formatUsd(billedAmount(estimate.tier, cycle))} billed once a year</p>}
            </div>

            {/* Overage / block warning */}
            {estimate.blocked && (
              <div className="flex items-start gap-2 text-xs bg-semantic-error/10 border border-semantic-error/30 rounded-xl p-3 text-semantic-error">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>This mix exceeds the plan&rsquo;s {estimate.includedCredits.toLocaleString()} credits under a hard cap — calls would be refused (402). Upgrade or switch to soft overage.</span>
              </div>
            )}

            {billingDetails.tier !== estimate.tier.name ? (
              <Link href={`/console/billing`} onClick={() => track('pricing_plan_applied', { tier: estimate.tier.id })}>
                <Button className="w-full" icon={<ArrowRight className="w-4 h-4" />}>Apply {estimate.tier.name} in Billing</Button>
              </Link>
            ) : (
              <p className="text-xs text-center text-fg-subtle flex items-center justify-center gap-1"><Check className="w-3.5 h-3.5 text-teal" /> This is your current plan.</p>
            )}
          </GlassCard>

          {/* Plan comparison */}
          <GlassCard className="p-6 space-y-3">
            <h3 className="text-sm font-bold text-fg-muted uppercase tracking-wider">This mix, priced on each plan</h3>
            {rec.byTier.map((t) => {
              const tier = tierById(t.tierId);
              const isRec = t.tierId === rec.recommended;
              const isSel = t.tierId === tierId;
              return (
                <button
                  key={t.tierId}
                  onClick={() => { setTier(t.tierId); track('pricing_tier_compared', { picked: t.tierId }); }}
                  className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 border transition-colors text-left ${isSel ? 'border-teal/50 bg-teal/10' : 'border-border-subtle bg-surface-2 hover:border-border'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-fg">{tier.name}</span>
                    {isRec && <span className="text-[10px] font-bold uppercase tracking-wider text-teal bg-teal/10 border border-teal/20 rounded-full px-2 py-0.5">Best fit</span>}
                    {t.blocked && <span className="text-[10px] font-bold uppercase tracking-wider text-semantic-error bg-semantic-error/10 border border-semantic-error/20 rounded-full px-2 py-0.5">Over cap</span>}
                  </div>
                  <span className="text-sm font-mono text-fg">{formatUsd(t.totalMonthly)}/mo</span>
                </button>
              );
            })}
          </GlassCard>
        </div>
      </div>

      {/* Forecast */}
      <GlassCard className="p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-fg flex items-center gap-2"><TrendingUp className="w-5 h-5 text-teal" /> 12-month spend forecast</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-fg-muted whitespace-nowrap">Monthly growth</span>
            <input
              type="range" min={0} max={30} step={1} value={growthPct}
              onChange={(e) => setGrowthPct(Number(e.target.value))}
              onMouseUp={() => track('pricing_forecast_run', { growthPct })}
              className="w-40 accent-teal cursor-pointer"
            />
            <span className="text-sm font-mono font-bold text-fg w-10">{growthPct}%</span>
          </div>
        </div>
        {lineItems.length === 0 ? (
          <p className="text-sm text-fg-subtle flex items-center gap-2"><Info className="w-4 h-4" /> Add a call-mix to project spend forward.</p>
        ) : (
          <div className="grid md:grid-cols-4 gap-6 items-center">
            <div className="md:col-span-1 grid grid-cols-3 md:grid-cols-1 gap-3">
              {[3, 6, 12].map((m) => (
                <div key={m} className="bg-surface-2 rounded-xl px-3 py-2 border border-border-subtle">
                  <p className="text-[11px] text-fg-subtle">Month {m}</p>
                  <p className="text-base font-mono font-bold text-fg">{formatUsd(forecastMonth(m))}</p>
                </div>
              ))}
            </div>
            <div className="md:col-span-3 text-teal">
              <Sparkline values={forecastPts.map((p) => p.totalMonthly)} width={640} height={120} className="w-full" />
              <div className="flex justify-between text-[11px] text-fg-subtle mt-1"><span>Month 1</span><span>Month 12</span></div>
            </div>
          </div>
        )}
      </GlassCard>

      {/* Cross-links */}
      <div className="flex flex-wrap gap-2 text-xs">
        <Link href="/console/billing" className="inline-flex items-center gap-1 text-fg-muted hover:text-teal transition-colors bg-surface-2 border border-border-subtle rounded-full px-3 py-1.5">Billing & plans <ArrowRight className="w-3 h-3" /></Link>
        <Link href="/console/analytics" className="inline-flex items-center gap-1 text-fg-muted hover:text-teal transition-colors bg-surface-2 border border-border-subtle rounded-full px-3 py-1.5">Actual usage <ArrowRight className="w-3 h-3" /></Link>
        <Link href="/console/thresholds" className="inline-flex items-center gap-1 text-fg-muted hover:text-teal transition-colors bg-surface-2 border border-border-subtle rounded-full px-3 py-1.5">Spend guardrails <ArrowRight className="w-3 h-3" /></Link>
        <Link href="/console/explorer" className="inline-flex items-center gap-1 text-fg-muted hover:text-teal transition-colors bg-surface-2 border border-border-subtle rounded-full px-3 py-1.5">Per-endpoint cost in docs <ArrowRight className="w-3 h-3" /></Link>
      </div>
    </div>
  );
}

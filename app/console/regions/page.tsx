'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Globe, MapPin, Users, Building2, Clock, Info, ArrowRight, Mail, Phone, Cpu, Share2, TrendingUp } from 'lucide-react';
import { track } from '@/lib/telemetry';
import {
  getCoverageSnapshot, coverageBand,
  type RegionKey, type CoverageDataType, type RegionCoverage,
} from '@/lib/region-coverage';
import RoleGuard from '@/components/RoleGuard';
import {
  PageHeader, KpiTile, GlassCard, EmptyState, Skeleton, StatusBadge, SegmentedControl,
  type BadgeTone,
} from '@/components/ui';

const DATA_TYPE_ICON: Record<CoverageDataType, React.ElementType> = {
  email: Mail, phone: Phone, company: Building2, technographic: Cpu, social: Share2,
};
const TIER_TONE: Record<RegionCoverage['tier'], BadgeTone> = {
  core: 'success', strong: 'teal', developing: 'warning',
};
const BAND_CELL: Record<'high' | 'good' | 'fair' | 'low', string> = {
  high: 'bg-semantic-success/15 text-semantic-success border-semantic-success/30',
  good: 'bg-teal/10 text-teal border-teal/30',
  fair: 'bg-semantic-warning/10 text-semantic-warning border-semantic-warning/30',
  low: 'bg-semantic-error/10 text-semantic-error border-semantic-error/30',
};
const BAND_BAR: Record<'high' | 'good' | 'fair' | 'low', string> = {
  high: 'bg-semantic-success', good: 'bg-teal', fair: 'bg-semantic-warning', low: 'bg-semantic-error',
};

const pct = (n: number) => `${Math.round(n * 100)}%`;
const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

function RegionsInner() {
  const snapshot = useMemo(() => getCoverageSnapshot(), []);
  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [activeKey, setActiveKey] = useState<RegionKey>(snapshot.strongestRegion);

  useEffect(() => {
    setPhase('loading');
    track('region_coverage_viewed', { regions: snapshot.regions.length, contacts: snapshot.totals.contacts });
    const t = setTimeout(() => setPhase('ready'), 550);
    return () => clearTimeout(t);
  }, [snapshot]);

  const active = snapshot.regions.find((r) => r.key === activeKey) ?? snapshot.regions[0];

  if (phase === 'loading') return <RegionsSkeleton />;

  if (snapshot.regions.length === 0) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <Header />
        <GlassCard className="p-0 mt-6">
          <EmptyState icon={<Globe className="w-8 h-8" />} title="No coverage data" description="Regional coverage is being computed. Check back shortly." />
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto">
      <Header />

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile label="Contacts in dataset" value={compact(snapshot.totals.contacts)} icon={<Users />} hint="Across all regions" />
        <KpiTile label="Companies" value={compact(snapshot.totals.companies)} icon={<Building2 />} hint="Firmographic records" />
        <KpiTile label="Countries covered" value={String(snapshot.totals.countries)} icon={<MapPin />} hint="With material coverage" />
        <KpiTile label="Global match rate" value={pct(snapshot.totals.matchRate)} icon={<TrendingUp />} hint="Contact-weighted across regions" />
      </div>

      {/* Coverage matrix */}
      <GlassCard className="p-5 mt-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Coverage by region &amp; data type</span>
          <div className="flex items-center gap-3 text-[11px] text-fg-subtle">
            {(['high', 'good', 'fair', 'low'] as const).map((b) => (
              <span key={b} className="inline-flex items-center gap-1"><span className={`w-2.5 h-2.5 rounded-sm ${BAND_BAR[b]}`} aria-hidden />{b === 'high' ? '≥90%' : b === 'good' ? '78–90%' : b === 'fair' ? '65–78%' : '<65%'}</span>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-1 min-w-[640px]">
            <thead>
              <tr>
                <th className="text-left text-[10px] font-black uppercase tracking-widest text-fg-subtle p-2 w-40">Region</th>
                {snapshot.dataTypes.map((d) => {
                  const Icon = DATA_TYPE_ICON[d.type];
                  return (
                    <th key={d.type} className="text-center text-[10px] font-black uppercase tracking-widest text-fg-subtle p-2">
                      <span className="inline-flex flex-col items-center gap-1"><Icon className="w-3.5 h-3.5" />{d.label}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {snapshot.regions.map((r) => (
                <tr key={r.key}>
                  <td className="p-2">
                    <button
                      onClick={() => { setActiveKey(r.key); track('region_selected', { region: r.key }); }}
                      className={`flex items-center gap-2 text-left w-full rounded-lg px-2 py-1.5 transition-colors ${r.key === activeKey ? 'bg-teal/10' : 'hover:bg-glass'}`}
                    >
                      <span className="text-sm font-bold text-fg">{r.short}</span>
                      <StatusBadge tone={TIER_TONE[r.tier]}>{r.tier}</StatusBadge>
                    </button>
                  </td>
                  {snapshot.dataTypes.map((d) => {
                    const cell = r.byDataType.find((x) => x.type === d.type);
                    const v = cell?.coverage ?? 0;
                    return (
                      <td key={d.type} className="p-1">
                        <div className={`rounded-lg border text-center py-2.5 text-sm font-black tabular-nums ${BAND_CELL[coverageBand(v)]}`} title={`${r.name} · ${d.label}: ${pct(v)} coverage, ${pct(cell?.matchRate ?? 0)} match rate`}>
                          {pct(v)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Region focus */}
      <div className="flex items-center justify-between mt-8 mb-4 flex-wrap gap-3">
        <h2 className="text-lg font-black text-fg">Region detail</h2>
        <SegmentedControl
          options={snapshot.regions.map((r) => ({ value: r.key, label: r.short }))}
          value={activeKey}
          onChange={(k) => { setActiveKey(k as RegionKey); track('region_selected', { region: k }); }}
          layoutId="region-detail"
        />
      </div>

      <motion.div key={active.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* Left: per-type + gaps */}
        <GlassCard className="p-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-black text-fg">{active.name}</h3>
                <StatusBadge tone={TIER_TONE[active.tier]}>{active.tier}</StatusBadge>
              </div>
              <p className="text-sm text-fg-muted mt-0.5">{compact(active.contacts)} contacts · {compact(active.companies)} companies</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black text-fg tabular-nums">{pct(active.matchRate)}</div>
              <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">match rate</div>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {active.byDataType.map((d, i) => {
              const Icon = DATA_TYPE_ICON[d.type];
              const band = coverageBand(d.coverage);
              return (
                <motion.div key={d.type} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i }}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg"><Icon className="w-3.5 h-3.5 text-fg-subtle" />{d.label}</span>
                    <span className="text-[11px] font-mono tabular-nums text-fg-subtle">{pct(d.coverage)} coverage · {pct(d.matchRate)} match</span>
                  </div>
                  <div className="h-2 rounded-full bg-glass overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: pct(d.coverage) }} transition={{ duration: 0.6, ease: 'easeOut' }} className={`h-full rounded-full ${BAND_BAR[band]}`} />
                  </div>
                </motion.div>
              );
            })}
          </div>

          {active.gaps.length > 0 && (
            <div className="mt-6">
              <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-2">Coverage notes</div>
              <ul className="space-y-2">
                {active.gaps.map((g) => (
                  <li key={g} className="flex items-start gap-2 text-[13px] text-fg-muted"><Info className="w-3.5 h-3.5 text-teal mt-0.5 shrink-0" />{g}</li>
                ))}
              </ul>
            </div>
          )}
        </GlassCard>

        {/* Right: top countries + freshness */}
        <div className="space-y-6">
          <GlassCard className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Top countries</span>
              <span className="inline-flex items-center gap-1 text-[11px] text-fg-subtle"><Clock className="w-3 h-3" />~{active.freshnessDays}d median age</span>
            </div>
            <ul className="space-y-3">
              {active.topCountries.map((c, i) => (
                <motion.li key={c.code} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-fg">{c.country}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge tone={c.matchRate >= 0.85 ? 'success' : c.matchRate >= 0.75 ? 'teal' : 'warning'}>{pct(c.matchRate)}</StatusBadge>
                      <span className="text-[11px] font-mono tabular-nums text-fg-subtle w-12 text-right">{compact(c.contacts)}</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-glass mt-1.5 overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: pct(c.matchRate) }} transition={{ duration: 0.6, ease: 'easeOut' }} className={`h-full rounded-full ${BAND_BAR[coverageBand(c.matchRate)]}`} />
                  </div>
                </motion.li>
              ))}
            </ul>
          </GlassCard>

          <GlassCard className="p-5 border-teal/20">
            <div className="text-sm font-bold text-fg">Need coverage confirmed before you buy?</div>
            <p className="text-[13px] text-fg-muted mt-1 leading-relaxed">Run a live lookup against your own market in the Studio — the result is drawn from this same dataset.</p>
            <Link href="/console/studio" className="text-xs font-bold text-teal hover:text-fg transition-colors inline-flex items-center gap-1 mt-3">Open the Studio <ArrowRight className="w-3 h-3" /></Link>
          </GlassCard>
        </div>
      </motion.div>

      {/* Methodology */}
      <GlassCard className="p-5 mt-6 border-teal/20">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal/10 border border-teal/30 flex items-center justify-center shrink-0"><Info className="w-4 h-4 text-teal" /></div>
          <div>
            <div className="text-sm font-bold text-fg">How coverage is measured</div>
            <p className="text-[13px] text-fg-muted mt-1 leading-relaxed">
              Coverage is the share of in-region records for which an attribute is present; match rate is how often a request for that attribute resolves. Both are contact-weighted when rolled up globally, so a large region moves the global number more than a small one. Figures are a stable snapshot of the dataset — the same region always reports the same coverage — and are refreshed as the dataset grows. This is the honest map: North America is the core, EMEA and APAC are strong, and LATAM is developing (email-first, with direct dials thinner outside Brazil and Mexico).
            </p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

function Header() {
  return (
    <PageHeader
      title="Regional Coverage"
      description="Where Zinbit's dataset is deep and where it's thin — coverage and match rate across EMEA, APAC, LATAM, and North America, by data type and country."
      icon={<Globe />}
    />
  );
}

function RegionsSkeleton() {
  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="space-y-2"><Skeleton className="h-7 w-52" /><Skeleton className="h-4 w-[32rem] max-w-full" /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <Skeleton className="h-64 rounded-2xl mt-6" />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 mt-8">
        <Skeleton className="h-80 rounded-2xl" /><Skeleton className="h-80 rounded-2xl" />
      </div>
    </div>
  );
}

export default function RegionsPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <RegionsInner />
    </RoleGuard>
  );
}

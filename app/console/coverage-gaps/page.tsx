'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Radar, Target, TrendingDown, CreditCard, TrendingUp, Globe, Filter, AlertTriangle,
  Mail, Phone, Building2, Cpu, Share2, ArrowRight, Info, Inbox, Check, Send, MapPinned,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import RoleGuard from '@/components/RoleGuard';
import {
  analyzeCoverageGaps, isRealGap, relativeDays,
  type CoverageGap, type GapSeverity, type RegionKey, type CoverageDataType,
} from '@/lib/coverage-gaps';
import {
  PageHeader, KpiTile, GlassCard, EmptyState, Skeleton, StatusBadge, Button, SegmentedControl,
  Modal, Textarea, type BadgeTone,
} from '@/components/ui';

const DT_ICON: Record<CoverageDataType, React.ElementType> = {
  email: Mail, phone: Phone, company: Building2, technographic: Cpu, social: Share2,
};
const SEVERITY_META: Record<GapSeverity, { tone: BadgeTone; text: string; bar: string }> = {
  critical: { tone: 'error', text: 'text-semantic-error', bar: 'bg-semantic-error' },
  high: { tone: 'warning', text: 'text-semantic-warning', bar: 'bg-semantic-warning' },
  medium: { tone: 'teal', text: 'text-teal', bar: 'bg-teal' },
  low: { tone: 'neutral', text: 'text-fg-muted', bar: 'bg-fg-subtle' },
};
const REGION_FILTERS: { value: RegionKey | 'all'; label: string }[] = [
  { value: 'all', label: 'All regions' },
  { value: 'namer', label: 'NAMER' },
  { value: 'emea', label: 'EMEA' },
  { value: 'apac', label: 'APAC' },
  { value: 'latam', label: 'LATAM' },
];
const fmt = (n: number) => n.toLocaleString();

function CoverageGapsInner() {
  const { activeOrganizationId, coverageExpansionRequests, requestCoverageExpansion, user } = useStore();
  const toast = useToast();
  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [region, setRegion] = useState<RegionKey | 'all'>('all');
  const [gapsOnly, setGapsOnly] = useState(true);
  const [modalGap, setModalGap] = useState<CoverageGap | null>(null);
  const [note, setNote] = useState('');
  const canMutate = user?.role !== 'billing';

  useEffect(() => {
    setPhase('loading');
    track('coverage_gaps_viewed', {});
    const t = setTimeout(() => setPhase('ready'), 500);
    return () => clearTimeout(t);
  }, []);

  const report = useMemo(() => analyzeCoverageGaps(activeOrganizationId), [activeOrganizationId]);
  const requestedSegments = useMemo(
    () => new Set(coverageExpansionRequests.map((r) => r.segmentId)),
    [coverageExpansionRequests],
  );

  const visible = useMemo(() => report.gaps.filter((g) => {
    if (region !== 'all' && g.region !== region) return false;
    if (gapsOnly && !isRealGap(g)) return false;
    return true;
  }), [report.gaps, region, gapsOnly]);

  const onFilterRegion = (r: RegionKey | 'all') => {
    setRegion(r);
    track('coverage_gaps_filtered', { region: r });
  };

  const openRequest = (gap: CoverageGap) => { setModalGap(gap); setNote(''); };
  const submitRequest = () => {
    if (!modalGap || !canMutate) return;
    try {
      requestCoverageExpansion(modalGap.id, note || `Expand ${modalGap.regionName} ${modalGap.dataTypeLabel} coverage`);
      track('coverage_expansion_requested', { region: modalGap.region, dataType: modalGap.dataType, severity: modalGap.severity });
      toast.success('Expansion requested', `${modalGap.regionName} ${modalGap.dataTypeLabel} — our data team will follow up.`);
      setModalGap(null);
    } catch (e) {
      toast.error('Could not submit', e instanceof Error ? e.message : 'Unexpected error');
    }
  };

  if (phase === 'loading') return <GapsSkeleton />;

  const s = report.summary;

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title="Coverage Gaps"
        description="Where your enrichment traffic meets thin data. We overlay your request mix on our regional coverage and rank the segments costing you the most — with a fix and a one-click expansion request for each."
        icon={<Radar />}
        actions={
          <Link href="/console/regions">
            <Button variant="secondary"><Globe className="w-4 h-4" /> Regional coverage</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile label="Your match rate" value={`${(s.overallMatchRate * 100).toFixed(1)}%`} icon={<Target />} hint={`${fmt(s.totalRequests)} lookups · ${report.period}`} />
        <KpiTile label="Missed lookups" value={fmt(s.totalMissed)} icon={<TrendingDown />} hint="Returned no data" lowerIsBetter />
        <KpiTile label="Wasted credits" value={fmt(s.totalWastedCredits)} icon={<CreditCard />} hint="On unmatched lookups /mo" lowerIsBetter />
        <KpiTile label="Addressable uplift" value={`+${fmt(s.addressableUplift)}`} icon={<TrendingUp />} hint="Contacts if gaps closed" />
      </div>

      <div className="mt-4 flex items-center gap-2 text-[12px] text-fg-muted flex-wrap">
        <span className="inline-flex items-center gap-1.5"><MapPinned className="w-3.5 h-3.5 text-fg-subtle" /> Profiled industry: <span className="font-semibold text-fg">{report.industry}</span></span>
        {!canMutate && <span className="inline-flex items-center gap-1.5 ml-2"><Info className="w-3.5 h-3.5 text-semantic-warning" /> Billing role is read-only — expansion requests are disabled.</span>}
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between gap-3 mt-6 mb-4 flex-wrap">
        <SegmentedControl<RegionKey | 'all'>
          options={REGION_FILTERS}
          value={region}
          onChange={onFilterRegion}
          size="sm"
          layoutId="gap-region"
        />
        <button
          onClick={() => setGapsOnly((v) => !v)}
          aria-pressed={gapsOnly}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-border text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50"
        >
          <Filter className="w-3.5 h-3.5" /> {gapsOnly ? 'Gaps only' : 'All segments'}
        </button>
      </div>

      {visible.length === 0 ? (
        <GlassCard className="p-0">
          <EmptyState
            icon={<Check className="w-8 h-8" />}
            title={gapsOnly ? 'No material gaps here' : 'No segments in this view'}
            description={gapsOnly
              ? 'Your traffic in this view is well within our coverage — nothing is costing you material misses. Switch to “All segments” to see every region × data type.'
              : 'No traffic matches this filter. Try another region.'}
            action={gapsOnly ? <Button variant="secondary" onClick={() => setGapsOnly(false)}>Show all segments <ArrowRight className="w-4 h-4" /></Button> : undefined}
          />
        </GlassCard>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map((g) => (
              <GapRow
                key={g.id}
                gap={g}
                canMutate={canMutate}
                requested={requestedSegments.has(g.id)}
                onRequest={() => openRequest(g)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Submitted expansion requests */}
      {coverageExpansionRequests.length > 0 && (
        <GlassCard className="p-5 mt-6">
          <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3 flex items-center gap-1.5"><Inbox className="w-3.5 h-3.5" /> Expansion requests</div>
          <ul className="divide-y divide-border-subtle">
            {coverageExpansionRequests.map((r) => {
              const DtIcon = DT_ICON[r.dataType];
              const d = relativeDays(r.createdAt);
              return (
                <li key={r.id} className="py-2.5 flex items-center gap-3">
                  <span className="w-7 h-7 rounded-lg bg-surface-2 border border-border flex items-center justify-center shrink-0 text-fg-subtle"><DtIcon className="w-3.5 h-3.5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-fg">{r.region.toUpperCase()} · {r.dataType}</div>
                    {r.note && <div className="text-[11px] text-fg-subtle truncate">{r.note}</div>}
                  </div>
                  <StatusBadge tone="teal">{r.status === 'open' ? 'Submitted' : 'Acknowledged'}</StatusBadge>
                  <span className="text-[11px] text-fg-subtle shrink-0 w-16 text-right">{d === 0 ? 'today' : `${d}d ago`}</span>
                </li>
              );
            })}
          </ul>
        </GlassCard>
      )}

      {/* Cross-links */}
      <div className="mt-6 flex items-center gap-4 text-[12px] text-fg-subtle flex-wrap">
        <Link href="/console/coverage" className="inline-flex items-center gap-1.5 hover:text-teal transition-colors">Match Rate <ArrowRight className="w-3.5 h-3.5" /></Link>
        <Link href="/console/regions" className="inline-flex items-center gap-1.5 hover:text-teal transition-colors">Regional Coverage <ArrowRight className="w-3.5 h-3.5" /></Link>
        <Link href="/console/billing" className="inline-flex items-center gap-1.5 hover:text-teal transition-colors">Billing <ArrowRight className="w-3.5 h-3.5" /></Link>
      </div>

      {/* Expansion request modal */}
      <Modal
        open={modalGap !== null}
        onClose={() => setModalGap(null)}
        title="Request coverage expansion"
        description={modalGap ? `${modalGap.regionName} · ${modalGap.dataTypeLabel} — ${fmt(modalGap.missed)} missed lookups/mo` : undefined}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setModalGap(null)}>Cancel</Button>
            <Button variant="primary" onClick={submitRequest} disabled={!canMutate}><Send className="w-4 h-4" /> Submit request</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-[13px] text-fg-muted leading-relaxed">
            This flags the segment to our data team to prioritize for expansion. Add any context on your use case or volume.
          </p>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={modalGap ? `e.g. We route ~${fmt(modalGap.requests)} ${modalGap.dataTypeLabel.toLowerCase()} lookups/mo through ${modalGap.regionName}…` : ''}
            aria-label="Expansion request note"
          />
        </div>
      </Modal>
    </div>
  );
}

function GapRow({ gap, canMutate, requested, onRequest }: {
  gap: CoverageGap;
  canMutate: boolean;
  requested: boolean;
  onRequest: () => void;
}) {
  const sev = SEVERITY_META[gap.severity];
  const DtIcon = DT_ICON[gap.dataType];
  const matchedPct = Math.round(gap.matchRate * 100);
  const missedPct = 100 - matchedPct;

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.2 }}>
      <GlassCard className="p-4">
        <div className="flex items-start gap-3">
          <span className={`w-9 h-9 rounded-lg bg-surface-2 border border-border flex items-center justify-center shrink-0 ${sev.text}`}>
            <DtIcon className="w-4 h-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-fg">{gap.regionName}</span>
              <span className="text-[12px] text-fg-subtle">· {gap.dataTypeLabel}</span>
              <StatusBadge tone={sev.tone}>{gap.severity}</StatusBadge>
            </div>
            <div className="text-[11px] text-fg-subtle mt-0.5 tabular-nums">{fmt(gap.requests)} lookups/mo · your data</div>
          </div>
          <div className="text-right shrink-0">
            <div className={`text-lg font-bold tabular-nums leading-none ${sev.text}`}>{matchedPct}%</div>
            <div className="text-[10px] text-fg-subtle mt-1">match rate</div>
          </div>
        </div>

        {/* Matched vs missed bar (missed = the gap) */}
        <div className="mt-3 flex h-2 rounded-full overflow-hidden bg-surface-2" role="img" aria-label={`${matchedPct}% matched, ${missedPct}% missed`}>
          <motion.div className="h-full bg-teal" initial={{ width: 0 }} animate={{ width: `${matchedPct}%` }} transition={{ duration: 0.5, ease: 'easeOut' }} />
          <motion.div className={`h-full ${sev.bar} opacity-70`} initial={{ width: 0 }} animate={{ width: `${missedPct}%` }} transition={{ duration: 0.5, ease: 'easeOut' }} />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[11px] tabular-nums">
          <span className="text-fg-subtle">{fmt(gap.matched)} matched</span>
          <span className={sev.text}>{fmt(gap.missed)} missed · {fmt(gap.wastedCredits)} credits</span>
        </div>

        {/* Recommendation + action */}
        <div className="mt-3 flex items-start justify-between gap-3 flex-wrap">
          <p className="text-[12px] text-fg-muted leading-snug flex-1 min-w-[240px] flex gap-1.5">
            <AlertTriangle className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${sev.text}`} /> {gap.recommendation}
          </p>
          {gap.addressableContacts > 0 && (
            requested ? (
              <StatusBadge tone="teal"><Check className="w-3 h-3" /> Requested</StatusBadge>
            ) : canMutate ? (
              <Button variant="secondary" size="sm" onClick={onRequest}>Request expansion</Button>
            ) : null
          )}
        </div>
      </GlassCard>
    </motion.div>
  );
}

function GapsSkeleton() {
  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="space-y-2"><Skeleton className="h-7 w-48" /><Skeleton className="h-4 w-[38rem] max-w-full" /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <div className="flex items-center justify-between mt-6 mb-4">
        <Skeleton className="h-9 w-80 rounded-lg" />
        <Skeleton className="h-8 w-28 rounded-lg" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
      </div>
    </div>
  );
}

export default function CoverageGapsPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <CoverageGapsInner />
    </RoleGuard>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ScrollText, ShieldCheck, Link2, Copy, Check, ArrowRight, ChevronDown, GitMerge, Fingerprint, ListFilter } from 'lucide-react';
import { useStore, type ApiLog } from '@/lib/store';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import { buildMatchAuditTrail, verifyAuditIntegrity, type MatchAuditEntry, type MatchAuditVerdict } from '@/lib/match-audit';
import type { MergeableEntity } from '@/lib/merge-seed';
import RoleGuard from '@/components/RoleGuard';
import {
  PageHeader, KpiTile, GlassCard, EmptyState, Skeleton, StatusBadge, SegmentedControl, Button,
  type BadgeTone,
} from '@/components/ui';

type Timeframe = '24h' | '7d' | '30d' | 'all';
const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: '24h', label: '24h' }, { value: '7d', label: '7d' }, { value: '30d', label: '30d' }, { value: 'all', label: 'All' },
];
const WINDOW_MS: Record<Timeframe, number> = { '24h': 86_400_000, '7d': 7 * 86_400_000, '30d': 30 * 86_400_000, all: Number.POSITIVE_INFINITY };

type VerdictFilter = 'all' | 'matched' | 'missed' | 'manual';
const VERDICT_FILTERS: { value: VerdictFilter; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'matched', label: 'Matched' }, { value: 'missed', label: 'Missed' }, { value: 'manual', label: 'Manual' },
];

const VERDICT_TONE: Record<MatchAuditVerdict, BadgeTone> = {
  matched: 'success', missed: 'warning', error: 'error', excluded: 'neutral', merged: 'teal', reverted: 'neutral',
};
const timeAgo = (ts: number) => {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

function MatchAuditInner() {
  const { environment, apiLogs, seedRequestHistory, mergeableEntities, entityMerges, seedMergeCandidates } = useStore();
  const toast = useToast();
  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [timeframe, setTimeframe] = useState<Timeframe>('7d');
  const [verdict, setVerdict] = useState<VerdictFilter>('all');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setPhase('loading');
    seedRequestHistory();
    seedMergeCandidates();
    track('match_audit_viewed', { environment });
    const t = setTimeout(() => setPhase('ready'), 550);
    return () => clearTimeout(t);
  }, [seedRequestHistory, seedMergeCandidates, environment]);

  const entitiesById = useMemo(() => {
    const m = new Map<string, MergeableEntity>();
    mergeableEntities.forEach((e) => m.set(e.id, e));
    return m;
  }, [mergeableEntities]);

  const fullTrail = useMemo(
    () => buildMatchAuditTrail(apiLogs as ApiLog[], entityMerges, { environment, entitiesById }),
    [apiLogs, entityMerges, environment, entitiesById],
  );

  // Integrity is verified over the WHOLE trail (the chain is unbroken end to end).
  const integrity = useMemo(() => verifyAuditIntegrity(fullTrail), [fullTrail]);

  const trail = useMemo(() => {
    const cutoff = Date.now() - WINDOW_MS[timeframe];
    return fullTrail.filter((e) => {
      if (e.timestamp < cutoff) return false;
      if (verdict === 'matched') return e.verdict === 'matched';
      if (verdict === 'missed') return e.verdict === 'missed';
      if (verdict === 'manual') return e.type === 'merge' || e.type === 'unmerge';
      return true;
    });
  }, [fullTrail, timeframe, verdict]);

  const stats = useMemo(() => ({
    total: trail.length,
    matched: trail.filter((e) => e.verdict === 'matched').length,
    missed: trail.filter((e) => e.verdict === 'missed').length,
  }), [trail]);

  const toggle = (seq: number) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(seq)) next.delete(seq); else next.add(seq);
    return next;
  });

  const exportTrail = () => {
    navigator.clipboard.writeText(JSON.stringify(trail, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
    track('match_audit_exported', { entries: trail.length, environment });
    toast.success('Audit trail copied', `${trail.length} entries copied as JSON.`);
  };

  if (phase === 'loading') return <AuditSkeleton />;

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title="Match Audit Trail"
        description="A tamper-evident ledger of every match decision — the sources and rules behind each resolved record, chained by hash so the trail can be verified end to end."
        icon={<ScrollText />}
        actions={<SegmentedControl options={TIMEFRAMES} value={timeframe} onChange={setTimeframe} layoutId="audit-timeframe" />}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile label="Decisions" value={String(stats.total)} icon={<ScrollText />} hint="In this window" />
        <KpiTile label="Matched" value={String(stats.matched)} icon={<Check />} hint="Resolved to a record" />
        <KpiTile label="Missed" value={String(stats.missed)} icon={<ListFilter />} hint="Outside coverage" lowerIsBetter />
        <KpiTile
          label="Chain integrity"
          value={integrity.valid ? 'Verified' : 'Broken'}
          icon={<ShieldCheck />}
          hint={integrity.valid ? `${integrity.entries} entries, unbroken` : `Tampered at #${integrity.brokenAt}`}
        />
      </div>

      {/* Integrity banner */}
      <GlassCard className={`p-4 mt-6 flex items-center gap-3 ${integrity.valid ? 'border-semantic-success/25' : 'border-semantic-error/30'}`}>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${integrity.valid ? 'bg-semantic-success/10 text-semantic-success' : 'bg-semantic-error/10 text-semantic-error'}`}>
          <ShieldCheck className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold text-fg">{integrity.valid ? 'Tamper-evident — hash chain verified' : `Integrity check failed at entry #${integrity.brokenAt}`}</div>
          <p className="text-[12px] text-fg-muted">Each entry’s SHA-256 chains the previous entry, so any edit, insertion, or deletion breaks the chain and is detected. {integrity.entries} entries in the ledger.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={exportTrail} className="ml-auto shrink-0">
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Export
        </Button>
      </GlassCard>

      <div className="flex items-center justify-between mt-6 mb-3 flex-wrap gap-3">
        <SegmentedControl options={VERDICT_FILTERS} value={verdict} onChange={setVerdict} layoutId="audit-verdict" />
        <Link href="/console/logs" className="text-xs font-bold text-teal hover:text-fg transition-colors inline-flex items-center gap-1">Raw request logs <ArrowRight className="w-3 h-3" /></Link>
      </div>

      {trail.length === 0 ? (
        <GlassCard className="p-0">
          <EmptyState
            icon={<ScrollText className="w-8 h-8" />}
            title="No decisions in this window"
            description="Match decisions appear here as you run lookups and confirm merges. Widen the timeframe or run a lookup to populate the trail."
            action={<Link href="/console/studio"><Button variant="primary">Open the Studio <ArrowRight className="w-4 h-4" /></Button></Link>}
          />
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {trail.map((e) => (
            <AuditRow key={e.id} entry={e} open={expanded.has(e.seq)} onToggle={() => toggle(e.seq)} />
          ))}
        </div>
      )}
    </div>
  );
}

function AuditRow({ entry, open, onToggle }: { entry: MatchAuditEntry; open: boolean; onToggle: () => void }) {
  const TypeIcon = entry.type === 'lookup' ? Fingerprint : GitMerge;
  return (
    <GlassCard className="p-0 overflow-hidden">
      <button type="button" onClick={onToggle} className="w-full text-left p-4 flex items-center gap-3 hover:bg-glass transition-colors">
        <span className="text-[11px] font-mono text-fg-subtle w-8 shrink-0 tabular-nums">#{entry.seq}</span>
        <span className="w-8 h-8 rounded-lg bg-surface-2 border border-border flex items-center justify-center shrink-0 text-fg-subtle"><TypeIcon className="w-4 h-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-fg truncate">{entry.subject}</span>
            <StatusBadge tone={VERDICT_TONE[entry.verdict]}>{entry.verdict}</StatusBadge>
            <span className="text-[11px] text-fg-subtle">{entry.endpointLabel}</span>
          </div>
          <div className="text-[11px] text-fg-subtle mt-0.5">{entry.identifier} · {entry.actor} · {timeAgo(entry.timestamp)}</div>
        </div>
        {entry.confidence !== null && (
          <span className="text-xs font-black text-fg tabular-nums shrink-0">{Math.round(entry.confidence * 100)}%</span>
        )}
        <ChevronDown className={`w-4 h-4 text-fg-subtle shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-border-subtle">
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-2">Rules applied</div>
                <ul className="space-y-1">
                  {entry.rules.map((r) => <li key={r} className="text-[12px] text-fg-muted flex items-start gap-1.5"><Check className="w-3 h-3 text-teal mt-0.5 shrink-0" />{r}</li>)}
                </ul>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-2">Sources consulted</div>
                {entry.sources.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {entry.sources.map((s) => <span key={s} className="text-[11px] font-semibold px-2 py-1 rounded-md bg-glass text-fg-muted border border-border-subtle">{s}</span>)}
                  </div>
                ) : <span className="text-[12px] text-fg-subtle">—</span>}
              </div>
              <div className="sm:col-span-2 pt-2 border-t border-border-subtle">
                <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-1.5 flex items-center gap-1.5"><Link2 className="w-3 h-3" /> Hash chain</div>
                <div className="grid grid-cols-1 gap-1 font-mono text-[11px] text-fg-subtle break-all">
                  <div><span className="text-fg-muted">prev</span> {entry.prevHash.slice(0, 32)}…</div>
                  <div><span className="text-fg-muted">this</span> <span className="text-teal">{entry.hash.slice(0, 32)}…</span></div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}

function AuditSkeleton() {
  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="space-y-2"><Skeleton className="h-7 w-52" /><Skeleton className="h-4 w-[34rem] max-w-full" /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <Skeleton className="h-16 rounded-2xl mt-6" />
      <div className="space-y-2 mt-6">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
    </div>
  );
}

export default function MatchAuditPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <MatchAuditInner />
    </RoleGuard>
  );
}

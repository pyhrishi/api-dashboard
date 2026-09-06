'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquareWarning, Check, X, Undo2, Sparkles, ArrowRight, ScrollText,
  ClipboardCheck, ShieldCheck, TriangleAlert, HelpCircle, Clock,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import RoleGuard from '@/components/RoleGuard';
import {
  summarizeCorrections, type Correction, type CorrectionStatus, type CorrectionTriage,
} from '@/lib/corrections';
import {
  PageHeader, KpiTile, GlassCard, EmptyState, Skeleton, StatusBadge, Button, SegmentedControl,
  DataTable, type Column, type BadgeTone,
} from '@/components/ui';

type StatusFilter = 'all' | CorrectionStatus;

const VERDICT_META: Record<CorrectionTriage['verdict'], { tone: BadgeTone; label: string; icon: React.ElementType }> = {
  likely_valid: { tone: 'success', label: 'Likely valid', icon: ShieldCheck },
  needs_review: { tone: 'warning', label: 'Needs review', icon: HelpCircle },
  suspect: { tone: 'error', label: 'Suspect', icon: TriangleAlert },
};

const STATUS_META: Record<CorrectionStatus, { tone: BadgeTone; label: string }> = {
  pending: { tone: 'info', label: 'Pending' },
  accepted: { tone: 'success', label: 'Accepted' },
  rejected: { tone: 'neutral', label: 'Rejected' },
};

const timeAgo = (ts: number) => {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
};

function TriageCell({ triage }: { triage: CorrectionTriage }) {
  const meta = VERDICT_META[triage.verdict];
  const Icon = meta.icon;
  return (
    <div className="flex flex-col gap-1" title={triage.reasons.join(' · ')}>
      <StatusBadge tone={meta.tone}>
        <Icon className="w-3 h-3" /> {meta.label} · {Math.round(triage.score * 100)}%
      </StatusBadge>
      <span className="text-[11px] text-fg-subtle line-clamp-1 max-w-[16rem]">{triage.reasons[0]}</span>
    </div>
  );
}

function CorrectionsInner() {
  const corrections = useStore((s) => s.corrections);
  const seedCorrections = useStore((s) => s.seedCorrections);
  const reviewCorrection = useStore((s) => s.reviewCorrection);
  const revertCorrectionReview = useStore((s) => s.revertCorrectionReview);
  const user = useStore((s) => s.user);
  const toast = useToast();

  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const canReview = user?.role !== 'billing';

  useEffect(() => {
    seedCorrections();
    track('corrections_viewed', { total: useStore.getState().corrections.length });
    const t = setTimeout(() => setPhase('ready'), 450);
    return () => clearTimeout(t);
  }, [seedCorrections]);

  const summary = useMemo(() => summarizeCorrections(corrections), [corrections]);
  const counts = useMemo(() => ({
    all: corrections.length,
    pending: summary.pending,
    accepted: summary.accepted,
    rejected: summary.rejected,
  }), [corrections.length, summary]);

  const rows = useMemo(() => {
    const list = filter === 'all' ? corrections : corrections.filter((c) => c.status === filter);
    return [...list].sort((a, b) => b.reportedAt - a.reportedAt);
  }, [corrections, filter]);

  const onReview = (c: Correction, decision: CorrectionStatus & ('accepted' | 'rejected')) => {
    try {
      reviewCorrection(c.id, decision);
      track('correction_reviewed', { decision, verdict: c.triage.verdict, field: c.field, presetId: c.presetId, environment: c.environment });
      if (decision === 'accepted') toast.success('Correction accepted', `"${c.field}" will now return the corrected value for ${c.input}.`);
      else toast.success('Correction rejected', `"${c.field}" keeps its current value.`);
    } catch (e) {
      toast.error('Could not review', e instanceof Error ? e.message : 'Unexpected error');
    }
  };

  const onRevert = (c: Correction) => {
    try {
      revertCorrectionReview(c.id);
      toast.success('Sent back to pending', `"${c.field}" is awaiting review again.`);
    } catch (e) {
      toast.error('Could not revert', e instanceof Error ? e.message : 'Unexpected error');
    }
  };

  const columns: Column<Correction>[] = [
    {
      key: 'field',
      header: 'Field',
      render: (c) => (
        <div className="min-w-0">
          <div className="font-bold text-fg">{c.field}</div>
          <div className="text-[11px] text-fg-subtle truncate max-w-[15rem]">{c.presetLabel} · {c.input}</div>
        </div>
      ),
      sortValue: (c) => c.field,
    },
    {
      key: 'change',
      header: 'Proposed change',
      render: (c) => (
        <div className="flex items-center gap-2 min-w-0 text-sm">
          <span className="text-fg-subtle line-through truncate max-w-[8rem]">{c.oldValue}</span>
          <ArrowRight className="w-3.5 h-3.5 text-fg-subtle shrink-0" />
          <span className="font-semibold text-teal truncate max-w-[9rem]">{c.newValue}</span>
        </div>
      ),
    },
    {
      key: 'triage',
      header: 'AI triage',
      render: (c) => <TriageCell triage={c.triage} />,
      sortValue: (c) => c.triage.score,
    },
    {
      key: 'reporter',
      header: 'Reporter',
      render: (c) => (
        <div className="min-w-0">
          <div className="text-xs text-fg-muted truncate max-w-[12rem]">{c.reportedBy}</div>
          <div className="text-[11px] text-fg-subtle flex items-center gap-1"><Clock className="w-3 h-3" /> {timeAgo(c.reportedAt)}</div>
        </div>
      ),
      sortValue: (c) => c.reportedAt,
    },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (c) => (
        <div className="flex items-center justify-end gap-2">
          {c.status === 'pending' ? (
            canReview ? (
              <>
                <Button size="sm" variant="secondary" onClick={() => onReview(c, 'rejected')}><X className="w-4 h-4" /> Reject</Button>
                <Button size="sm" onClick={() => onReview(c, 'accepted')}><Check className="w-4 h-4" /> Accept</Button>
              </>
            ) : <StatusBadge tone="info">Pending</StatusBadge>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex flex-col items-end">
                <StatusBadge tone={STATUS_META[c.status].tone}>{STATUS_META[c.status].label}</StatusBadge>
                {c.reviewedBy && <span className="text-[10px] text-fg-subtle mt-0.5">{c.reviewedBy.split('@')[0]}</span>}
              </div>
              {canReview && (
                <Button size="sm" variant="ghost" onClick={() => onRevert(c)} title="Send back to pending"><Undo2 className="w-4 h-4" /></Button>
              )}
            </div>
          )}
        </div>
      ),
    },
  ];

  if (phase === 'loading') return <CorrectionsSkeleton />;

  const filterOptions: { value: StatusFilter; label: string }[] = [
    { value: 'pending', label: `Pending${counts.pending ? ` (${counts.pending})` : ''}` },
    { value: 'accepted', label: `Accepted${counts.accepted ? ` (${counts.accepted})` : ''}` },
    { value: 'rejected', label: `Rejected${counts.rejected ? ` (${counts.rejected})` : ''}` },
    { value: 'all', label: `All (${counts.all})` },
  ];

  return (
    <div className="max-w-[1200px] mx-auto pb-16">
      <PageHeader
        icon={<MessageSquareWarning />}
        title="Corrections"
        description="Customers flag wrong values right on a result; you triage them here. An accepted correction is overlaid on future enrichments and attributed to Customer Correction."
        actions={
          <Link href="/console/studio"><Button variant="secondary" size="sm"><Sparkles className="w-4 h-4" /> Open Studio</Button></Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile label="Total reported" value={summary.total} icon={<MessageSquareWarning />} />
        <KpiTile label="Pending review" value={summary.pending} icon={<ClipboardCheck />} hint={summary.likelyValidPending > 0 ? `${summary.likelyValidPending} look likely-valid` : undefined} />
        <KpiTile label="Accepted & applied" value={summary.accepted} icon={<Check />} />
        <KpiTile label="Accept rate" value={`${Math.round(summary.acceptRate * 100)}%`} icon={<ShieldCheck />} hint={summary.accepted + summary.rejected === 0 ? 'nothing reviewed yet' : `${summary.accepted + summary.rejected} reviewed`} />
      </div>

      <AnimatePresence>
        {summary.likelyValidPending > 0 && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-6">
            <GlassCard className="p-4 border-teal/30 bg-teal/5 flex items-center gap-3">
              <span className="text-teal shrink-0"><Sparkles className="w-5 h-5" /></span>
              <p className="text-sm text-fg-muted">
                <span className="font-bold text-fg">{summary.likelyValidPending} pending correction{summary.likelyValidPending === 1 ? '' : 's'}</span> {summary.likelyValidPending === 1 ? 'reads' : 'read'} as likely-valid on triage — format-checked, materially different, and clearly explained. Accept to apply {summary.likelyValidPending === 1 ? 'it' : 'them'} to future results.
              </p>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between gap-4 mt-6 flex-wrap">
        <SegmentedControl<StatusFilter> options={filterOptions} value={filter} onChange={setFilter} layoutId="corrections-filter" />
        <Link href="/console/logs" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">
          <ScrollText className="w-3.5 h-3.5" /> Every review is in the audit log
        </Link>
      </div>

      <div className="mt-4">
        {rows.length === 0 ? (
          <GlassCard className="p-0 overflow-hidden">
            <EmptyState
              icon={<MessageSquareWarning className="w-8 h-8" />}
              title={filter === 'pending' ? 'No corrections awaiting review' : filter === 'all' ? 'No corrections reported yet' : `No ${filter} corrections`}
              description={filter === 'all' || filter === 'pending'
                ? 'When a customer spots a wrong value on an enrichment result, they flag it in the Studio and it lands here for triage.'
                : `Nothing has been ${filter} yet. Check the other tabs.`}
              action={<Link href="/console/studio"><Button variant="secondary" size="sm"><Sparkles className="w-4 h-4" /> Run a lookup in the Studio</Button></Link>}
            />
          </GlassCard>
        ) : (
          <DataTable<Correction>
            columns={columns}
            rows={rows}
            rowKey={(c) => c.id}
            pageSize={10}
            initialSort={{ key: 'triage', dir: 'desc' }}
          />
        )}
      </div>
    </div>
  );
}

function CorrectionsSkeleton() {
  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="space-y-2"><Skeleton className="h-7 w-48" /><Skeleton className="h-4 w-[38rem] max-w-full" /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <Skeleton className="h-10 w-72 rounded-xl mt-6" />
      <Skeleton className="h-96 rounded-2xl mt-4" />
    </div>
  );
}

export default function CorrectionsPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer']}>
      <CorrectionsInner />
    </RoleGuard>
  );
}

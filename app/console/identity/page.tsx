'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { GitMerge, RotateCcw, Users, Layers, ShieldCheck, Check, ArrowRight, Info, Building2 } from 'lucide-react';
import { useStore } from '@/lib/store';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import type { MergeableEntity, EntityMerge } from '@/lib/merge-seed';
import RoleGuard from '@/components/RoleGuard';
import {
  PageHeader, KpiTile, GlassCard, EmptyState, Skeleton, StatusBadge, Button, Input, ConfirmAction,
  type BadgeTone,
} from '@/components/ui';

const SOURCE_TONE: Record<string, BadgeTone> = {
  Salesforce: 'info', HubSpot: 'warning', 'CSV Import': 'neutral', API: 'teal', LinkedIn: 'info',
};
const pct = (n: number) => `${Math.round(n * 100)}%`;
const timeAgo = (ts: number) => {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

function IdentityInner() {
  const { mergeableEntities, entityMerges, seedMergeCandidates, mergeEntities, revertMerge, user } = useStore();
  const toast = useToast();
  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const canMutate = user?.role !== 'billing';

  useEffect(() => {
    setPhase('loading');
    seedMergeCandidates();
    track('merge_center_viewed', {});
    const t = setTimeout(() => setPhase('ready'), 550);
    return () => clearTimeout(t);
  }, [seedMergeCandidates]);

  const byId = useMemo(() => {
    const m = new Map<string, MergeableEntity>();
    mergeableEntities.forEach((e) => m.set(e.id, e));
    return m;
  }, [mergeableEntities]);

  const absorbed = useMemo(() => {
    const s = new Set<string>();
    entityMerges.filter((m) => m.status === 'active').forEach((m) => m.mergedEntityIds.forEach((id) => s.add(id)));
    return s;
  }, [entityMerges]);

  const suspected = useMemo(() => {
    const groups = new Map<string, MergeableEntity[]>();
    mergeableEntities.forEach((e) => {
      const a = groups.get(e.groupId) ?? [];
      a.push(e);
      groups.set(e.groupId, a);
    });
    return Array.from(groups.entries())
      .map(([groupId, members]) => ({ groupId, active: members.filter((m) => !absorbed.has(m.id)) }))
      .filter((g) => g.active.length >= 2);
  }, [mergeableEntities, absorbed]);

  const activeMerges = entityMerges.filter((m) => m.status === 'active');
  const recordsMerged = activeMerges.reduce((n, m) => n + m.mergedEntityIds.length, 0);

  const onMerge = (survivingId: string, mergedIds: string[], reason: string) => {
    try {
      mergeEntities(survivingId, mergedIds, reason);
      track('entities_merged', { merged: mergedIds.length, canonical: byId.get(survivingId)?.zid ?? '' });
      toast.success('Records merged', `${mergedIds.length + 1} records collapsed into one canonical entity.`);
    } catch (e) {
      toast.error('Could not merge', e instanceof Error ? e.message : 'Unexpected error');
    }
  };
  const onRevert = (mergeId: string) => {
    try {
      revertMerge(mergeId);
      track('merge_reverted', { mergeId });
      toast.success('Merge reverted', 'The records were split back into separate entities.');
    } catch (e) {
      toast.error('Could not unmerge', e instanceof Error ? e.message : 'Unexpected error');
    }
  };

  if (phase === 'loading') return <IdentitySkeleton />;

  const nothing = suspected.length === 0 && entityMerges.length === 0;

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title="Identity Resolution"
        description="Confirm or split entity-resolution decisions. Merge suspected duplicates into one canonical record, and unmerge any decision — every action is audited and reversible."
        icon={<GitMerge />}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile label="Records" value={String(mergeableEntities.length)} icon={<Users />} hint="Across all sources" />
        <KpiTile label="Suspected duplicate groups" value={String(suspected.length)} icon={<Layers />} hint="Awaiting a decision" />
        <KpiTile label="Active merges" value={String(activeMerges.length)} icon={<GitMerge />} hint="Confirmed golden records" />
        <KpiTile label="Records merged away" value={String(recordsMerged)} icon={<ShieldCheck />} hint="Collapsed into a canonical entity" />
      </div>

      {!canMutate && (
        <div className="mt-4 flex items-center gap-2 text-[13px] text-fg-muted"><Info className="w-4 h-4 text-semantic-warning" /> Billing role is read-only — merge and unmerge are disabled.</div>
      )}

      {nothing ? (
        <GlassCard className="p-0 mt-6">
          <EmptyState
            icon={<GitMerge className="w-8 h-8" />}
            title="No entities to resolve"
            description="Suspected duplicates surface here as records arrive from your sources. Enrich or import records to see merge suggestions."
            action={<Link href="/console/studio"><Button variant="primary">Open the Studio <ArrowRight className="w-4 h-4" /></Button></Link>}
          />
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 mt-6 items-start">
          {/* Suspected duplicates */}
          <div className="space-y-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Suspected duplicates</div>
            {suspected.length === 0 ? (
              <GlassCard className="p-6 text-sm text-fg-muted flex items-center gap-2">
                <Check className="w-4 h-4 text-semantic-success" /> All suspected duplicates have been resolved.
              </GlassCard>
            ) : (
              <AnimatePresence initial={false}>
                {suspected.map((g) => (
                  <DuplicateGroupCard key={g.groupId} members={g.active} canMutate={canMutate} onMerge={onMerge} />
                ))}
              </AnimatePresence>
            )}
          </div>

          {/* Merge history */}
          <div className="space-y-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Merge history</div>
            {entityMerges.length === 0 ? (
              <GlassCard className="p-6 text-sm text-fg-muted">No merges yet. Confirm a suspected duplicate to start.</GlassCard>
            ) : (
              <div className="space-y-3">
                {entityMerges.map((m) => (
                  <MergeHistoryCard key={m.id} merge={m} byId={byId} canMutate={canMutate} onRevert={onRevert} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DuplicateGroupCard({ members, canMutate, onMerge }: {
  members: MergeableEntity[]; canMutate: boolean; onMerge: (survivingId: string, mergedIds: string[], reason: string) => void;
}) {
  // Default the surviving record to the highest-confidence (canonical) source.
  const initial = [...members].sort((a, b) => b.confidence - a.confidence)[0]?.id ?? members[0]?.id;
  const [survivingId, setSurvivingId] = useState(initial);
  const [reason, setReason] = useState('');

  const surviving = members.find((m) => m.id === survivingId) ?? members[0];
  const others = members.filter((m) => m.id !== survivingId);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
      <GlassCard className="p-5">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-teal" />
            <span className="text-sm font-bold text-fg">{members.length} likely-duplicate records</span>
          </div>
          <StatusBadge tone={surviving.confidence >= 0.95 ? 'success' : surviving.confidence >= 0.85 ? 'teal' : 'warning'}>
            {pct(Math.min(...members.map((m) => m.confidence)))}–{pct(Math.max(...members.map((m) => m.confidence)))} match
          </StatusBadge>
        </div>

        <div className="space-y-2">
          {members.map((m) => {
            const isSurviving = m.id === survivingId;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSurvivingId(m.id)}
                className={`w-full text-left rounded-xl border p-3 transition-colors ${isSurviving ? 'border-teal/40 bg-teal/5' : 'border-border-subtle bg-surface-2 hover:bg-glass'}`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${isSurviving ? 'border-teal bg-teal text-surface' : 'border-border'}`}>
                    {isSurviving && <Check className="w-3 h-3" />}
                  </span>
                  <span className="text-sm font-bold text-fg">{m.name}</span>
                  <span className="text-[12px] text-fg-muted inline-flex items-center gap-1"><Building2 className="w-3 h-3" />{m.company}</span>
                  <StatusBadge tone={SOURCE_TONE[m.source] ?? 'neutral'}>{m.source}</StatusBadge>
                  {isSurviving && <StatusBadge tone="teal">Survivor</StatusBadge>}
                  <span className="ml-auto text-[11px] font-mono text-fg-subtle">{m.zid}</span>
                </div>
                <div className="text-[12px] text-fg-subtle mt-1 ml-6 font-mono">{m.email}</div>
              </button>
            );
          })}
        </div>

        {canMutate && (
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="flex-1 min-w-[160px]" />
            <Button
              variant="primary"
              size="sm"
              onClick={() => onMerge(survivingId, others.map((o) => o.id), reason.trim() || `Confirmed duplicate — kept ${surviving.name} (${surviving.source})`)}
            >
              <GitMerge className="w-4 h-4" /> Merge {members.length} into {surviving.name}
            </Button>
          </div>
        )}
      </GlassCard>
    </motion.div>
  );
}

function MergeHistoryCard({ merge, byId, canMutate, onRevert }: {
  merge: EntityMerge; byId: Map<string, MergeableEntity>; canMutate: boolean; onRevert: (id: string) => void;
}) {
  const surviving = byId.get(merge.survivingEntityId);
  const mergedNames = merge.mergedEntityIds.map((id) => byId.get(id)?.name ?? id);
  const reverted = merge.status === 'reverted';
  return (
    <GlassCard className={`p-4 ${reverted ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-fg">{surviving?.name ?? 'Entity'}</span>
        {reverted ? <StatusBadge tone="neutral">Reverted</StatusBadge> : <StatusBadge tone="success">Merged</StatusBadge>}
        <span className="ml-auto text-[11px] font-mono text-fg-subtle">{merge.canonicalZid}</span>
      </div>
      <p className="text-[12px] text-fg-muted mt-1">
        Absorbed <span className="font-semibold text-fg">{mergedNames.join(', ')}</span>
      </p>
      <p className="text-[12px] text-fg-subtle mt-1 italic">“{merge.reason}”</p>
      <div className="flex items-center justify-between gap-2 mt-2.5">
        <span className="text-[11px] text-fg-subtle">{merge.mergedBy} · {timeAgo(merge.mergedAt)}</span>
        {!reverted && canMutate && (
          <ConfirmAction onConfirm={() => onRevert(merge.id)} confirmLabel="Confirm unmerge" variant="ghost" size="sm">
            <RotateCcw className="w-3.5 h-3.5" /> Unmerge
          </ConfirmAction>
        )}
      </div>
    </GlassCard>
  );
}

function IdentitySkeleton() {
  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="space-y-2"><Skeleton className="h-7 w-52" /><Skeleton className="h-4 w-[34rem] max-w-full" /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 mt-6">
        <Skeleton className="h-72 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}

export default function IdentityPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <IdentityInner />
    </RoleGuard>
  );
}

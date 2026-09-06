'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  UserCheck, Users, Tag, Plus, X, AlertTriangle, ArrowRight, Zap, FlaskConical, ShieldAlert,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import RoleGuard from '@/components/RoleGuard';
import {
  computeOwnership, summarizeOwnership, allLabels, filterKeys, memberLabel, normalizeLabel,
  type OwnershipFilter,
} from '@/lib/key-ownership';
import type { MockKey } from '@/lib/store';
import {
  PageHeader, KpiTile, GlassCard, EmptyState, Button, StatusBadge, Skeleton, Select,
} from '@/components/ui';

function KeyOwnershipInner() {
  const { activeKeys, teamMembers, setKeyLabels, assignKeyOwner, user } = useStore();
  const toast = useToast();
  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [filter, setFilter] = useState<OwnershipFilter>({});
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    track('key_ownership_viewed', {})
    const t = setTimeout(() => setPhase('ready'), 400);
    return () => clearTimeout(t);
  }, []);

  const summary = useMemo(() => summarizeOwnership(activeKeys, teamMembers), [activeKeys, teamMembers]);
  const labels = useMemo(() => allLabels(activeKeys), [activeKeys]);
  const visible = useMemo(() => computeOwnership(filterKeys(activeKeys, filter), teamMembers), [activeKeys, teamMembers, filter]);

  const onOwner = (id: string, ownerId: string) => {
    try {
      assignKeyOwner(id, ownerId || null);
      track('key_owner_assigned', { assigned: !!ownerId })
    } catch (e) { toast.error('Could not assign owner', e instanceof Error ? e.message : 'Unexpected error'); }
  };
  const onLabels = (key: MockKey, next: string[]) => {
    try {
      setKeyLabels(key.id, next);
      track('key_labeled', { count: next.length })
    } catch (e) { toast.error('Could not update labels', e instanceof Error ? e.message : 'Unexpected error'); }
  };

  if (phase === 'loading') return <OwnershipSkeleton />;

  if (activeKeys.length === 0) {
    return (
      <div className="max-w-[1100px] mx-auto">
        <PageHeader title="Key Ownership" description="Assign an accountable owner and labels to every API key." icon={<UserCheck />} />
        <GlassCard className="p-0 mt-6"><EmptyState icon={<Users className="w-8 h-8" />} title="No keys yet" description="Generate an API key and you can assign an owner and labels here." action={<Link href="/console/keys"><Button variant="primary">Create a key <ArrowRight className="w-4 h-4" /></Button></Link>} /></GlassCard>
      </div>
    );
  }

  return (
    <div className="max-w-[1100px] mx-auto">
      <PageHeader
        title="Key Ownership"
        description="Who owns each API key, and what it's for. Assign an accountable owner and tag keys by team, environment, or purpose — so a security review never has to guess. Unowned keys are a governance gap."
        icon={<UserCheck />}
        actions={<Link href="/console/keys"><Button variant="secondary">Manage keys <ArrowRight className="w-4 h-4" /></Button></Link>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile label="Keys" value={String(summary.total)} icon={<UserCheck />} />
        <KpiTile label="Owned" value={String(summary.owned)} icon={<Users />} hint="Have an owner" />
        <KpiTile label="Unowned" value={String(summary.unowned)} icon={<AlertTriangle />} hint="Governance gap" lowerIsBetter />
        <KpiTile label="Labels in use" value={String(summary.labelCount)} icon={<Tag />} />
      </div>

      {summary.unowned > 0 && (
        <GlassCard className="p-4 mt-4 border-semantic-warning/30">
          <div className="flex items-start gap-2 text-[13px]">
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-semantic-warning" />
            <span className="text-fg-muted"><span className="font-semibold text-fg">{summary.unowned} key{summary.unowned === 1 ? '' : 's'}</span> {summary.unowned === 1 ? 'has' : 'have'} no owner. Assign one so someone is accountable if it needs rotating.
              <button onClick={() => setFilter({ ownerId: 'unowned' })} className="ml-1.5 text-teal hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 rounded">Show unowned →</button>
            </span>
          </div>
        </GlassCard>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mt-6 mb-4 flex-wrap">
        <Select value={(filter.ownerId as string) ?? ''} onChange={(e) => setFilter((f) => ({ ...f, ownerId: e.target.value || undefined }))} className="max-w-[220px]">
          <option value="">All owners</option>
          <option value="unowned">Unowned</option>
          {teamMembers.map((m) => <option key={m.id} value={m.id}>{memberLabel(m)}</option>)}
        </Select>
        {labels.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-fg-subtle">Label:</span>
            <button onClick={() => setFilter((f) => ({ ...f, label: undefined }))} className={`text-[11px] font-mono px-2 py-0.5 rounded-md border transition-colors ${!filter.label ? 'bg-teal/10 border-teal/30 text-teal' : 'bg-surface-2 border-border-subtle text-fg-muted hover:text-fg'}`}>all</button>
            {labels.map((l) => (
              <button key={l} onClick={() => setFilter((f) => ({ ...f, label: l }))} className={`text-[11px] font-mono px-2 py-0.5 rounded-md border transition-colors ${filter.label === l ? 'bg-teal/10 border-teal/30 text-teal' : 'bg-surface-2 border-border-subtle text-fg-muted hover:text-fg'}`}>{l}</button>
            ))}
          </div>
        )}
        <span className="text-[11px] text-fg-subtle ml-auto">{visible.length} of {activeKeys.length}</span>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={<UserCheck className="w-8 h-8" />} title="No keys match" description="Try a different owner or label." action={<Button variant="secondary" onClick={() => setFilter({})}>Clear filters</Button>} />
      ) : (
        <div className="space-y-3">
          {visible.map((o, i) => (
            <motion.div key={o.key.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <OwnershipRow keyObj={o.key} isAdmin={isAdmin} teamMembers={teamMembers} onOwner={onOwner} onLabels={onLabels} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function OwnershipRow({ keyObj, isAdmin, teamMembers, onOwner, onLabels }: {
  keyObj: MockKey;
  isAdmin: boolean;
  teamMembers: { id: string; email: string }[];
  onOwner: (id: string, ownerId: string) => void;
  onLabels: (key: MockKey, next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const labels = keyObj.labels ?? [];
  const EnvIcon = keyObj.environment === 'live' ? Zap : FlaskConical;

  const addLabel = () => {
    const l = normalizeLabel(draft);
    if (!l || labels.includes(l)) { setDraft(''); return; }
    onLabels(keyObj, [...labels, l]);
    setDraft('');
  };

  return (
    <GlassCard className="p-4">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 md:items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-fg truncate">{keyObj.name}</span>
            <StatusBadge tone={keyObj.environment === 'live' ? 'teal' : 'neutral'}><EnvIcon className="w-3 h-3" /> {keyObj.environment === 'live' ? 'Live' : 'Test'}</StatusBadge>
            {!keyObj.ownerId && <StatusBadge tone="warning">Unowned</StatusBadge>}
          </div>
          {/* Labels */}
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            {labels.map((l) => (
              <span key={l} className="inline-flex items-center gap-1 text-[10.5px] font-mono text-fg-muted pl-2 pr-1 py-0.5 rounded-md bg-surface-2 border border-border-subtle">
                <Tag className="w-2.5 h-2.5 text-teal" /> {l}
                {isAdmin && <button onClick={() => onLabels(keyObj, labels.filter((x) => x !== l))} aria-label={`Remove label ${l}`} className="text-fg-subtle hover:text-semantic-error transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 rounded"><X className="w-3 h-3" /></button>}
              </span>
            ))}
            {isAdmin && labels.length < 8 && (
              <span className="inline-flex items-center gap-1">
                <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLabel(); } }} placeholder="add label" aria-label="Add a label" className="w-24 bg-surface-2 border border-border-subtle rounded-md px-2 py-0.5 text-[11px] font-mono text-fg placeholder:text-fg-subtle focus:outline-none focus:border-teal/50" />
                {draft.trim() && <button onClick={addLabel} aria-label="Add label" className="text-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 rounded"><Plus className="w-3.5 h-3.5" /></button>}
              </span>
            )}
            {labels.length === 0 && !isAdmin && <span className="text-[11px] text-fg-subtle">No labels</span>}
          </div>
        </div>
        {/* Owner */}
        <div className="shrink-0 md:w-56">
          {isAdmin ? (
            <Select value={keyObj.ownerId ?? ''} onChange={(e) => onOwner(keyObj.id, e.target.value)} aria-label={`Owner of ${keyObj.name}`}>
              <option value="">Unassigned</option>
              {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.email}</option>)}
            </Select>
          ) : (
            <div className="text-[12px] text-fg-muted inline-flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-fg-subtle" /> {teamMembers.find((m) => m.id === keyObj.ownerId)?.email ?? 'Unassigned'}</div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}

function OwnershipSkeleton() {
  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="space-y-2"><Skeleton className="h-7 w-44" /><Skeleton className="h-4 w-[36rem] max-w-full" /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      <div className="space-y-3 mt-10">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
    </div>
  );
}

export default function KeyOwnershipPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <KeyOwnershipInner />
    </RoleGuard>
  );
}

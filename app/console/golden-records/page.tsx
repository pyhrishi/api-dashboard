'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  History, Camera, Pin, GitCompareArrows, Trash2, Tag, CalendarClock,
  Search, RefreshCw, ArrowRight, ShieldCheck, Combine, Sparkles, Minus, Plus, GitCommitVertical,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import RoleGuard from '@/components/RoleGuard';
import { PageHeader, KpiTile, GlassCard, Button, Input, EmptyState, StatusBadge, ConfirmAction, type BadgeTone } from '@/components/ui';
import { diffSnapshots, type GoldenSnapshot, type FieldDiff } from '@/lib/golden-record';

const EXAMPLES = ['stripe.com', 'datadoghq.com', 'jane.doe@acme.com'];

function confTone(c: number): BadgeTone {
  if (c >= 0.85) return 'success'; if (c >= 0.6) return 'teal'; if (c >= 0.4) return 'warning'; return 'error';
}

const STATUS_META: Record<FieldDiff['status'], { tone: BadgeTone; label: string }> = {
  changed: { tone: 'warning', label: 'changed' },
  added: { tone: 'success', label: 'added' },
  removed: { tone: 'error', label: 'removed' },
  unchanged: { tone: 'neutral', label: 'unchanged' },
};

function DiffRow({ d }: { d: FieldDiff }) {
  const meta = STATUS_META[d.status];
  const confDelta = d.confidenceBefore !== null && d.confidenceAfter !== null ? d.confidenceAfter - d.confidenceBefore : null;
  return (
    <li className={`rounded-xl border px-3.5 py-2.5 ${d.status === 'unchanged' ? 'border-border-subtle bg-surface opacity-70' : 'border-border bg-surface-2'}`}>
      <div className="flex items-center gap-3">
        <span className="w-28 shrink-0 text-[10px] font-black uppercase tracking-widest text-fg-subtle truncate">{d.field}</span>
        <div className="min-w-0 flex-1 flex items-center gap-2 text-[12px]">
          {d.status === 'changed' ? (
            <>
              <span className="min-w-0 truncate text-fg-muted line-through decoration-fg-subtle/50">{d.before}</span>
              <ArrowRight className="w-3.5 h-3.5 text-fg-subtle shrink-0" />
              <span className="min-w-0 truncate text-fg font-semibold">{d.after}</span>
            </>
          ) : d.status === 'added' ? (
            <span className="min-w-0 truncate text-fg font-semibold">{d.after}</span>
          ) : d.status === 'removed' ? (
            <span className="min-w-0 truncate text-fg-muted line-through decoration-fg-subtle/50">{d.before}</span>
          ) : (
            <span className="min-w-0 truncate text-fg-muted">{d.after}</span>
          )}
        </div>
        <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
      </div>
      {(d.status === 'changed' && (d.sourceBefore !== d.sourceAfter || confDelta)) && (
        <div className="flex items-center gap-3 mt-1.5 pl-[7.75rem] text-[10.5px] text-fg-subtle">
          {d.sourceBefore !== d.sourceAfter && <span>source: {d.sourceBefore} → {d.sourceAfter}</span>}
          {confDelta !== null && confDelta !== 0 && (
            <span className={confDelta > 0 ? 'text-teal' : 'text-semantic-warning'}>
              {confDelta > 0 ? '+' : ''}{Math.round(confDelta * 100)}% confidence
            </span>
          )}
        </div>
      )}
    </li>
  );
}

function GoldenRecordsInner() {
  const goldenSnapshots = useStore((s) => s.goldenSnapshots);
  const seedGoldenSnapshots = useStore((s) => s.seedGoldenSnapshots);
  const captureGoldenSnapshot = useStore((s) => s.captureGoldenSnapshot);
  const pinGoldenSnapshot = useStore((s) => s.pinGoldenSnapshot);
  const labelGoldenSnapshot = useStore((s) => s.labelGoldenSnapshot);
  const deleteGoldenSnapshot = useStore((s) => s.deleteGoldenSnapshot);
  const environment = useStore((s) => s.environment);
  const role = useStore((s) => s.user?.role);
  const canMutate = role !== 'billing';
  const toast = useToast();

  const [query, setQuery] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [fromV, setFromV] = useState<number | null>(null);
  const [toV, setToV] = useState<number | null>(null);
  const [labelEditId, setLabelEditId] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState('');

  useEffect(() => { seedGoldenSnapshots(); track('golden_records_viewed', { environment }); }, [seedGoldenSnapshots, environment]);

  // Entities that have at least one snapshot, newest-capture first.
  const entities = useMemo(() => {
    const map = new Map<string, { key: string; display: string; type: GoldenSnapshot['entityType']; count: number; latest: GoldenSnapshot }>();
    goldenSnapshots.forEach((s) => {
      const e = map.get(s.entityKey);
      if (!e) map.set(s.entityKey, { key: s.entityKey, display: s.display, type: s.entityType, count: 1, latest: s });
      else { e.count += 1; if (s.version > e.latest.version) e.latest = s; }
    });
    return Array.from(map.values()).sort((a, b) => b.latest.capturedAt.localeCompare(a.latest.capturedAt));
  }, [goldenSnapshots]);

  // Keep a valid selection.
  useEffect(() => {
    if (entities.length === 0) { setSelectedKey(null); return; }
    if (!selectedKey || !entities.some((e) => e.key === selectedKey)) setSelectedKey(entities[0].key);
  }, [entities, selectedKey]);

  const chain = useMemo(() =>
    goldenSnapshots.filter((s) => s.entityKey === selectedKey).sort((a, b) => b.version - a.version),
    [goldenSnapshots, selectedKey]);

  // Default the diff to (previous → latest) whenever the chain changes.
  useEffect(() => {
    if (chain.length >= 2) { setToV(chain[0].version); setFromV(chain[1].version); }
    else if (chain.length === 1) { setToV(chain[0].version); setFromV(chain[0].version); }
    else { setToV(null); setFromV(null); }
  }, [chain]);

  const diff = useMemo(() => {
    if (fromV === null || toV === null) return null;
    const a = chain.find((s) => s.version === fromV);
    const b = chain.find((s) => s.version === toV);
    if (!a || !b) return null;
    const [lo, hi] = a.version <= b.version ? [a, b] : [b, a];
    return diffSnapshots(lo, hi);
  }, [chain, fromV, toV]);

  const capture = useCallback((raw?: string) => {
    const q = (raw ?? query).trim();
    if (!q || !canMutate) return;
    setCapturing(true);
    try {
      const id = captureGoldenSnapshot(q);
      if (!id) {
        toast.info('No new version', 'That identifier either resolved to no entity, or its golden record is unchanged since the last snapshot.');
      } else {
        const snap = useStore.getState().goldenSnapshots.find((s) => s.id === id);
        if (snap) { setSelectedKey(snap.entityKey); track('golden_record_captured', { entity_type: snap.entityType, version: snap.version, fields: snap.fields.length, environment }); }
        toast.success('Snapshot captured', `Version ${snap?.version ?? ''} pinned as the record of truth.`);
        setQuery('');
      }
    } catch {
      toast.error('Capture failed', 'Only admins and developers can capture snapshots.');
    } finally {
      setCapturing(false);
    }
  }, [query, canMutate, captureGoldenSnapshot, toast, environment]);

  const onPin = (s: GoldenSnapshot) => { try { pinGoldenSnapshot(s.id); track('golden_record_pinned', { version: s.version, environment }); toast.success('Pinned', `Version ${s.version} is now the record of truth.`); } catch { toast.error('Not allowed', 'Billing users cannot pin snapshots.'); } };
  const onDelete = (s: GoldenSnapshot) => { try { deleteGoldenSnapshot(s.id); track('golden_record_deleted', { version: s.version, environment }); toast.success('Deleted', `Version ${s.version} removed.`); } catch { toast.error('Not allowed', 'Billing users cannot delete snapshots.'); } };
  const saveLabel = (s: GoldenSnapshot) => { try { labelGoldenSnapshot(s.id, labelDraft); setLabelEditId(null); } catch { toast.error('Not allowed', 'Billing users cannot label snapshots.'); } };

  const totalSnapshots = goldenSnapshots.length;
  const pinnedCount = goldenSnapshots.filter((s) => s.pinned).length;

  return (
    <div className="max-w-[1200px] mx-auto pb-16">
      <PageHeader
        icon={<History />}
        title="Golden-Record Snapshots"
        description="Version the canonical record for every entity. Capture an immutable, point-in-time snapshot of an entity’s reconciled golden record, then diff any two versions field-by-field — what changed, which source drove it, and how confidence moved. Pin the version that is your record of truth for audit and governance."
        actions={<Link href="/console/reconciliation"><Button variant="secondary" size="sm"><Combine className="w-4 h-4" /> Reconciliation</Button></Link>}
      />

      {/* Capture */}
      <GlassCard className="p-5 mt-6">
        <label htmlFor="gr-input" className="block text-sm font-bold text-fg mb-2">Capture a golden-record snapshot</label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-fg-subtle absolute left-3 top-1/2 -translate-y-1/2" />
            <Input id="gr-input" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') capture(); }} placeholder="company domain or corporate email" className="pl-9" autoComplete="off" disabled={!canMutate} />
          </div>
          <Button onClick={() => capture()} disabled={!query.trim() || capturing || !canMutate}>{capturing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />} Capture</Button>
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-[11px] text-fg-subtle">Try:</span>
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => capture(ex)} disabled={!canMutate} className="text-[11px] font-mono px-2 py-1 rounded-md bg-glass text-fg-muted border border-border-subtle hover:text-teal hover:border-teal/30 transition-colors disabled:opacity-50">{ex}</button>
          ))}
          {!canMutate && <span className="text-[11px] text-fg-subtle ml-auto inline-flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Read-only for billing role</span>}
        </div>
      </GlassCard>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
        <KpiTile label="Entities tracked" value={entities.length} icon={<History />} />
        <KpiTile label="Total snapshots" value={totalSnapshots} icon={<CalendarClock />} />
        <KpiTile label="Pinned records" value={pinnedCount} icon={<Pin />} hint="records of truth" />
      </div>

      {entities.length === 0 ? (
        <GlassCard className="p-0 overflow-hidden mt-6">
          <EmptyState icon={<History className="w-8 h-8" />} title="No snapshots yet" description="Capture a golden-record snapshot for a company or contact to start a version history you can diff and pin." />
        </GlassCard>
      ) : (
        <div className="grid lg:grid-cols-[300px_1fr] gap-5 mt-6">
          {/* Entity list */}
          <div className="space-y-2">
            <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-1">Entities</div>
            {entities.map((e) => (
              <button
                key={e.key}
                onClick={() => setSelectedKey(e.key)}
                className={`w-full text-left rounded-xl border px-3.5 py-3 transition-colors ${selectedKey === e.key ? 'border-teal/40 bg-teal/10' : 'border-border bg-surface-2 hover:border-border'}`}
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{e.display}</span>
                  <StatusBadge tone="info">{e.type}</StatusBadge>
                </div>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-fg-subtle">
                  <span>v{e.latest.version} · {e.count} snapshot{e.count === 1 ? '' : 's'}</span>
                  <span className="ml-auto tabular-nums">{Math.round(e.latest.overallConfidence * 100)}%</span>
                </div>
              </button>
            ))}
          </div>

          {/* Detail */}
          <div className="min-w-0">
            {/* Diff */}
            {chain.length > 0 && (
              <GlassCard className="p-5">
                <div className="flex items-center gap-2 flex-wrap mb-4">
                  <GitCompareArrows className="w-4 h-4 text-teal" />
                  <span className="text-sm font-bold text-fg">Compare versions</span>
                  <div className="flex items-center gap-2 ml-auto">
                    <select value={fromV ?? ''} onChange={(e) => setFromV(Number(e.target.value))} className="text-[12px] rounded-lg border border-border bg-surface-2 text-fg px-2 py-1 focus:border-teal/50 outline-none">
                      {chain.map((s) => <option key={s.id} value={s.version}>v{s.version} · {s.asOf}</option>)}
                    </select>
                    <ArrowRight className="w-3.5 h-3.5 text-fg-subtle" />
                    <select value={toV ?? ''} onChange={(e) => setToV(Number(e.target.value))} className="text-[12px] rounded-lg border border-border bg-surface-2 text-fg px-2 py-1 focus:border-teal/50 outline-none">
                      {chain.map((s) => <option key={s.id} value={s.version}>v{s.version} · {s.asOf}</option>)}
                    </select>
                  </div>
                </div>

                {diff && (
                  <>
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      <StatusBadge tone="warning"><Plus className="w-3 h-3" /> {diff.changedCount} changed</StatusBadge>
                      <StatusBadge tone="success"><Plus className="w-3 h-3" /> {diff.addedCount} added</StatusBadge>
                      <StatusBadge tone="error"><Minus className="w-3 h-3" /> {diff.removedCount} removed</StatusBadge>
                      {diff.confidenceDelta !== 0 && (
                        <span className={`text-[11px] font-semibold ${diff.confidenceDelta > 0 ? 'text-teal' : 'text-semantic-warning'}`}>
                          {diff.confidenceDelta > 0 ? '+' : ''}{Math.round(diff.confidenceDelta * 100)}% overall confidence
                        </span>
                      )}
                      {diff.fromVersion === diff.toVersion && <span className="text-[11px] text-fg-subtle">— pick two different versions to see changes</span>}
                    </div>
                    <ul className="space-y-2">
                      {diff.fields.map((d) => <DiffRow key={d.field} d={d} />)}
                    </ul>
                  </>
                )}
              </GlassCard>
            )}

            {/* Version timeline */}
            <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mt-6 mb-3">Version history</div>
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {chain.map((s) => (
                  <motion.div
                    key={s.id}
                    layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
                    className={`rounded-xl border px-4 py-3 ${s.pinned ? 'border-teal/40 bg-teal/5' : 'border-border bg-surface-2'}`}
                  >
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-fg-subtle shrink-0"><GitCommitVertical className="w-4 h-4" /></span>
                      <span className="text-sm font-bold text-fg">v{s.version}</span>
                      {s.pinned && <StatusBadge tone="success"><Pin className="w-3 h-3" /> record of truth</StatusBadge>}
                      <StatusBadge tone="neutral">{s.origin}</StatusBadge>
                      <StatusBadge tone={confTone(s.overallConfidence)}>{Math.round(s.overallConfidence * 100)}%</StatusBadge>
                      <span className="font-mono text-[10.5px] text-fg-subtle">#{s.hash}</span>
                      <div className="ml-auto flex items-center gap-1.5">
                        {canMutate && !s.pinned && (
                          <button onClick={() => onPin(s)} title="Pin as record of truth" className="p-1.5 rounded-lg text-fg-subtle hover:text-teal hover:bg-glass transition-colors"><Pin className="w-3.5 h-3.5" /></button>
                        )}
                        {canMutate && (
                          <button onClick={() => { setLabelEditId(s.id); setLabelDraft(s.label); }} title="Label" className="p-1.5 rounded-lg text-fg-subtle hover:text-fg hover:bg-glass transition-colors"><Tag className="w-3.5 h-3.5" /></button>
                        )}
                        {canMutate && chain.length > 1 && (
                          <ConfirmAction
                            variant="ghost"
                            size="sm"
                            confirmLabel={<><Trash2 className="w-3.5 h-3.5" /> Confirm</>}
                            onConfirm={() => onDelete(s)}
                            title={`Delete version ${s.version}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </ConfirmAction>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-fg-subtle flex-wrap">
                      <span className="inline-flex items-center gap-1"><Camera className="w-3 h-3" /> captured {s.capturedAt}</span>
                      <span className="inline-flex items-center gap-1"><CalendarClock className="w-3 h-3" /> reflects {s.asOf}</span>
                      <span>{s.fields.length} fields</span>
                      {s.label && labelEditId !== s.id && <span className="inline-flex items-center gap-1 text-fg-muted"><Tag className="w-3 h-3" /> {s.label}</span>}
                    </div>
                    {labelEditId === s.id && (
                      <div className="flex items-center gap-2 mt-2">
                        <Input value={labelDraft} onChange={(e) => setLabelDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveLabel(s); if (e.key === 'Escape') setLabelEditId(null); }} placeholder="e.g. Renewal review" className="h-8 text-[12px]" autoFocus maxLength={60} />
                        <Button size="sm" onClick={() => saveLabel(s)}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setLabelEditId(null)}>Cancel</Button>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            <p className="text-[11px] text-fg-subtle mt-3 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Each snapshot is immutable and content-hashed; capturing again only creates a version when the golden record actually changed.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GoldenRecordsPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <GoldenRecordsInner />
    </RoleGuard>
  );
}

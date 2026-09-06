'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Combine, Search, Play, RefreshCw, AlertTriangle, ChevronRight, ShieldCheck, GitMerge, Sparkles, ArrowRight } from 'lucide-react';
import { useStore } from '@/lib/store';
import { authHeaderValue } from '@/lib/api-config';
import { track } from '@/lib/telemetry';
import RoleGuard from '@/components/RoleGuard';
import { PageHeader, KpiTile, GlassCard, Button, Input, EmptyState, Skeleton, StatusBadge, type BadgeTone } from '@/components/ui';
import type { ReconciliationResult, ReconciledField } from '@/lib/reconciliation';

const EXAMPLES = ['jane.doe@acme.com', 'marcus@stripe.com', 'priya.nair@zomato.in'];

function confTone(c: number): BadgeTone {
  if (c >= 0.85) return 'success'; if (c >= 0.6) return 'teal'; if (c >= 0.4) return 'warning'; return 'error';
}

function FieldRow({ f }: { f: ReconciledField }) {
  const [open, setOpen] = useState(false);
  const expandable = f.candidates.length > 1;
  return (
    <div className={`rounded-xl border ${f.conflict ? 'border-semantic-warning/30 bg-semantic-warning/5' : 'border-border bg-surface-2'}`}>
      <button
        onClick={() => expandable && setOpen((o) => !o)}
        className={`w-full text-left p-4 flex items-center gap-3 ${expandable ? 'cursor-pointer' : 'cursor-default'}`}
        aria-expanded={open}
      >
        <div className="w-28 shrink-0 text-[10px] font-black uppercase tracking-widest text-fg-subtle">{f.field}</div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-fg truncate">{f.value || '—'}</div>
          <div className="text-[11px] text-fg-subtle mt-0.5">via {f.winningSource} · {f.candidates.length} source{f.candidates.length === 1 ? '' : 's'}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {f.conflict && <StatusBadge tone="warning">Conflict</StatusBadge>}
          <StatusBadge tone={confTone(f.confidence)}>{Math.round(f.confidence * 100)}%</StatusBadge>
          {expandable && <ChevronRight className={`w-4 h-4 text-fg-subtle transition-transform ${open ? 'rotate-90' : ''}`} />}
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && expandable && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-4 pb-4 pt-1 space-y-2 border-t border-border-subtle">
              {f.candidates.map((c, i) => {
                const winner = c.value === f.value;
                return (
                  <div key={i} className="flex items-center gap-3 text-[12px]">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${winner ? 'bg-teal' : 'bg-fg-subtle'}`} />
                    <span className={`min-w-0 flex-1 truncate ${winner ? 'font-semibold text-fg' : 'text-fg-muted'}`}>{c.value}</span>
                    <span className="text-fg-subtle truncate max-w-[12rem]">{c.sources.join(', ')}</span>
                    <span className="text-fg-subtle tabular-nums">{c.latestObservedAt}</span>
                    <span className="text-fg-subtle tabular-nums w-10 text-right">{c.score.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ReconciliationInner() {
  const { activeKeys, environment } = useStore();
  const apiKey = useMemo(() => activeKeys.find(k => k.environment === environment)?.key ?? activeKeys[0]?.key ?? '', [activeKeys, environment]);

  const [value, setValue] = useState('');
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ok' | 'not_found' | 'error'>('idle');
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [subject, setSubject] = useState('');

  const run = useCallback(async (raw?: string) => {
    const email = (raw ?? value).trim();
    if (!email) return;
    setValue(email); setPhase('loading');
    try {
      const res = await fetch(`/api/v1/reconcile?email=${encodeURIComponent(email)}`, { headers: { Authorization: authHeaderValue(apiKey) } });
      const body = await res.json();
      const data = body?.data;
      if (data && Array.isArray(data.fields)) {
        setResult(data as ReconciliationResult); setSubject(email); setPhase('ok');
        track('reconciliation_run', { fields: data.fieldCount, conflicts: data.conflictCount, confidence: data.overallConfidence, environment });
      } else {
        setPhase('not_found');
      }
    } catch {
      setPhase('error');
    }
  }, [value, apiKey, environment]);

  useEffect(() => { track('reconciliation_viewed', { environment }); }, [environment]);

  return (
    <div className="max-w-[1100px] mx-auto pb-16">
      <PageHeader
        icon={<Combine />}
        title="Cross-Source Reconciliation"
        description="When providers disagree on a field, reconciliation picks the value to trust — weighted by each provider's reliability and how recently it observed the value — clusters formatting variants, and flags genuine conflicts with every candidate shown."
        actions={<Link href="/console/identity"><Button variant="secondary" size="sm"><GitMerge className="w-4 h-4" /> Identity Resolution</Button></Link>}
      />

      {/* Input */}
      <GlassCard className="p-5 mt-6">
        <label htmlFor="recon-input" className="block text-sm font-bold text-fg mb-2">Reconcile a contact across sources</label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-fg-subtle absolute left-3 top-1/2 -translate-y-1/2" />
            <Input id="recon-input" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') run(); }} placeholder="jane.doe@acme.com" className="pl-9" autoComplete="off" />
          </div>
          <Button onClick={() => run()} disabled={!value.trim() || phase === 'loading'}>{phase === 'loading' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Reconcile</Button>
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-[11px] text-fg-subtle">Try:</span>
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => run(ex)} className="text-[11px] font-semibold px-2 py-1 rounded-md bg-glass text-fg-muted border border-border-subtle hover:text-teal hover:border-teal/30 transition-colors">{ex}</button>
          ))}
        </div>
      </GlassCard>

      {phase === 'loading' && (
        <div className="mt-6 space-y-3"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>
      )}

      {phase === 'error' && (
        <GlassCard className="p-0 overflow-hidden mt-6">
          <EmptyState icon={<AlertTriangle className="w-8 h-8" />} title="Couldn’t reconcile" description="The gateway didn’t respond. Check your API key and try again." action={<Button variant="secondary" size="sm" onClick={() => run()}><RefreshCw className="w-4 h-4" /> Retry</Button>} />
        </GlassCard>
      )}

      {phase === 'not_found' && (
        <GlassCard className="p-0 overflow-hidden mt-6">
          <EmptyState icon={<Combine className="w-8 h-8" />} title="No record to reconcile" description="No company/contact could be resolved for that identifier (personal-email domains have no multi-source record)." />
        </GlassCard>
      )}

      {phase === 'idle' && (
        <GlassCard className="p-0 overflow-hidden mt-6">
          <EmptyState icon={<Combine className="w-8 h-8" />} title="Reconcile a contact" description="Enter a work email (or tap an example) to see its golden record — the trusted value per field, which source won, and where providers conflict." />
        </GlassCard>
      )}

      {phase === 'ok' && result && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <KpiTile label="Fields reconciled" value={result.fieldCount} icon={<Combine />} />
            <KpiTile label="Conflicts" value={result.conflictCount} icon={<AlertTriangle />} hint={result.conflictCount > 0 ? 'sources disagree' : 'all agree'} />
            <KpiTile label="Overall confidence" value={`${Math.round(result.overallConfidence * 100)}%`} icon={<ShieldCheck />} />
          </div>
          <div className="flex items-center justify-between mt-6 mb-3">
            <h3 className="text-sm font-bold text-fg">Golden record — {subject}</h3>
            <Link href={`/console/studio?preset=person`} className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Enrich in Studio <ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
          <div className="space-y-2">
            {result.fields.map((f) => <FieldRow key={f.field} f={f} />)}
          </div>
          <p className="text-[11px] text-fg-subtle mt-3 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Each value is weighted by provider reliability × recency; expand a conflicted field to see every candidate.</p>
        </motion.div>
      )}
    </div>
  );
}

export default function ReconciliationPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer']}>
      <ReconciliationInner />
    </RoleGuard>
  );
}

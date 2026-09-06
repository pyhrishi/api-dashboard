'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { SlidersHorizontal, Check, RotateCcw, Save, Sparkles, Lock, CheckCircle2, XCircle } from 'lucide-react';
import { useStore } from '@/lib/store';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import RoleGuard from '@/components/RoleGuard';
import {
  USE_CASES, getSamplePairs, evaluateThreshold, suggestThreshold, type MatchUseCase,
} from '@/lib/threshold-tuning';
import {
  PageHeader, GlassCard, Button, KpiTile, StatusBadge, SegmentedControl, Skeleton,
} from '@/components/ui';

function pct(n: number) { return `${Math.round(n * 100)}%`; }

function ThresholdsInner() {
  const { user, matchThresholds, setMatchThreshold, resetMatchThresholds } = useStore();
  const toast = useToast();
  const canMutate = user?.role !== 'billing';

  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [useCase, setUseCase] = useState<MatchUseCase>('contact_match');
  const [draft, setDraft] = useState(0.85);

  useEffect(() => {
    track('thresholds_viewed', {});
    const t = setTimeout(() => setPhase('ready'), 500);
    return () => clearTimeout(t);
  }, []);

  // Sync the draft when the use case (or the saved value) changes.
  useEffect(() => { setDraft(matchThresholds[useCase]); }, [useCase, matchThresholds]);

  const pairs = useMemo(() => getSamplePairs(useCase), [useCase]);
  const evalNow = useMemo(() => evaluateThreshold(pairs, draft), [pairs, draft]);
  const suggested = useMemo(() => suggestThreshold(pairs), [pairs]);
  const savedValue = matchThresholds[useCase];
  const dirty = Math.abs(draft - savedValue) > 0.0001;
  const meta = USE_CASES.find((u) => u.id === useCase)!;

  function onSave() {
    if (!canMutate) return;
    setMatchThreshold(useCase, draft);
    track('threshold_saved', { useCase, value: draft, precision: evalNow.precision, recall: evalNow.recall });
    toast.success('Threshold saved', `${meta.label} floor set to ${pct(draft)}.`);
  }
  function onReset() {
    if (!canMutate) return;
    resetMatchThresholds();
    track('threshold_changed', { useCase, value: meta.recommended, reset: true });
    toast.success('Thresholds reset', 'All use cases restored to recommended defaults.');
  }

  if (phase === 'loading') {
    return (
      <div className="max-w-[1100px] mx-auto">
        <div className="space-y-2"><Skeleton className="h-7 w-52" /><Skeleton className="h-4 w-96" /></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
        <Skeleton className="h-64 rounded-2xl mt-6" />
      </div>
    );
  }

  return (
    <div className="max-w-[1100px] mx-auto">
      <PageHeader
        title="Match Thresholds"
        description="Set the confidence floor for each matching use case, and see exactly what it accepts and rejects on a labeled sample — scored with the same engine that governs your real matches."
        icon={<SlidersHorizontal />}
        actions={
          <SegmentedControl
            options={USE_CASES.map((u) => ({ value: u.id, label: u.label }))}
            value={useCase}
            onChange={(v) => setUseCase(v)}
            layoutId="threshold-usecase"
            size="sm"
          />
        }
      />

      {!canMutate && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-[13px] text-fg-muted">
          <Lock className="w-4 h-4 text-fg-subtle" /> Your role can view thresholds but not change them. Ask an admin or developer to tune the floor.
        </div>
      )}

      {/* Live metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile label="Precision" value={pct(evalNow.precision)} icon={<CheckCircle2 />} hint="of accepted, how many are real" />
        <KpiTile label="Recall" value={pct(evalNow.recall)} icon={<Sparkles />} hint="of real matches, how many accepted" />
        <KpiTile label="F1 score" value={pct(evalNow.f1)} icon={<SlidersHorizontal />} hint="precision + recall balance" />
        <KpiTile label="Accepted" value={`${evalNow.accepted} / ${evalNow.total}`} icon={<Check />} hint={`${evalNow.falsePos} false, ${evalNow.falseNeg} missed`} />
      </div>

      {/* The slider */}
      <GlassCard className="p-5 mt-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Confidence floor · {meta.label}</div>
            <p className="text-[13px] text-fg-muted mt-0.5 max-w-xl">{meta.blurb}</p>
          </div>
          <div className="text-3xl font-black text-fg tabular-nums">{pct(draft)}</div>
        </div>

        <div className="relative mt-5">
          <input
            type="range" min={0.5} max={0.99} step={0.01} value={draft}
            disabled={!canMutate}
            onChange={(e) => { const v = Number(e.target.value); setDraft(v); track('threshold_changed', { useCase, value: v }); }}
            className="w-full accent-teal disabled:opacity-50 cursor-pointer"
            aria-label={`${meta.label} confidence floor`}
          />
          {/* Suggested marker */}
          <div className="absolute -bottom-5 -translate-x-1/2 text-[10px] text-teal font-bold whitespace-nowrap" style={{ left: `${((suggested - 0.5) / 0.49) * 100}%` }}>
            ▲ suggested {pct(suggested)}
          </div>
        </div>

        <div className="flex items-center justify-between mt-8 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-fg-subtle">Recommended for this use case: <span className="font-bold text-fg">{pct(meta.recommended)}</span></span>
            {dirty && <StatusBadge tone="warning">Unsaved</StatusBadge>}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDraft(suggested)} disabled={!canMutate}><Sparkles className="w-4 h-4" /> Use suggested</Button>
            <Button variant="ghost" size="sm" onClick={onReset} disabled={!canMutate}><RotateCcw className="w-4 h-4" /> Reset all</Button>
            <Button variant="primary" size="sm" onClick={onSave} disabled={!canMutate || !dirty}><Save className="w-4 h-4" /> Save floor</Button>
          </div>
        </div>
      </GlassCard>

      {/* Sample pairs table */}
      <GlassCard className="p-5 mt-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Labeled sample · {pairs.length} pairs</div>
          <span className="text-[11px] text-fg-subtle">Green row = the floor classified it correctly</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-widest text-fg-subtle border-b border-border">
                <th className="text-left py-2 font-black">Record A</th>
                <th className="text-left py-2 font-black">Record B</th>
                <th className="text-right py-2 font-black">Score</th>
                <th className="text-center py-2 font-black">Truth</th>
                <th className="text-center py-2 font-black">At floor</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((p, i) => {
                const accepted = p.score >= draft;
                const correct = accepted === p.isMatch;
                return (
                  <motion.tr key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.02 * i }}
                    className={`border-b border-border-subtle last:border-0 ${correct ? '' : 'bg-semantic-error/5'}`}>
                    <td className="py-2 text-fg">{p.left}</td>
                    <td className="py-2 text-fg-muted">{p.right}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-fg">{pct(p.score)}</td>
                    <td className="py-2 text-center">
                      <span className={`text-[11px] font-bold ${p.isMatch ? 'text-semantic-success' : 'text-fg-subtle'}`}>{p.isMatch ? 'Same' : 'Different'}</span>
                    </td>
                    <td className="py-2">
                      <div className="flex items-center justify-center gap-1.5">
                        {accepted
                          ? <StatusBadge tone={correct ? 'success' : 'error'}>Accepted</StatusBadge>
                          : <StatusBadge tone={correct ? 'neutral' : 'warning'}>Rejected</StatusBadge>}
                        {correct ? <CheckCircle2 className="w-3.5 h-3.5 text-semantic-success" /> : <XCircle className="w-3.5 h-3.5 text-semantic-error" />}
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-3 pt-3 text-[11px] text-fg-subtle">
          <Link href="/console/studio?preset=fuzzy" className="hover:text-fg transition-colors">Try Fuzzy match</Link>
          <span>·</span>
          <Link href="/console/studio?preset=dedupe" className="hover:text-fg transition-colors">De-duplicate records</Link>
        </div>
      </GlassCard>
    </div>
  );
}

export default function ThresholdsPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <ThresholdsInner />
    </RoleGuard>
  );
}

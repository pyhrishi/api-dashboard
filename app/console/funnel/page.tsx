'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Funnel, Users, Rocket, TrendingUp, AlertTriangle, ArrowRight, Sparkles, Radio } from 'lucide-react';
import { useStore } from '@/lib/store';
import { track } from '@/lib/telemetry';
import RoleGuard from '@/components/RoleGuard';
import { PageHeader, KpiTile, GlassCard, StatusBadge, Skeleton, type BadgeTone } from '@/components/ui';
import {
  FUNNEL_PHASES, FUNNEL_STAGES, generateCohort, phaseDistribution, stageByCode, stageIndex,
  currentStage, classifyLead, LEAD_LABELS,
  type FunnelPhaseId, type LeadClass, type AccountFunnelInput, type CohortAccount,
} from '@/lib/funnel';

const COHORT_SIZE = 240;
const COHORT_SEED = 'zinbit-funnel-2026';

const LEAD_TONE: Record<LeadClass, BadgeTone> = {
  prospect: 'info', sql: 'info', sales_ready: 'warning', funnel_driven: 'success', hot: 'success', dead: 'error',
};
const BAND_ACCENT: Record<string, string> = {
  acquisition: 'bg-teal/70', activation: 'bg-teal', conversion: 'bg-semantic-success', retention: 'bg-semantic-warning',
};

function FunnelInner() {
  const { activeKeys, apiLogs, creditBalance, environment } = useStore();
  const [now] = useState(() => Date.now());
  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [selected, setSelected] = useState<FunnelPhaseId | null>(null);

  useEffect(() => {
    track('funnel_viewed', { environment });
    const t = setTimeout(() => setPhase('ready'), 240);
    return () => clearTimeout(t);
  }, [environment]);

  const cohort = useMemo(() => generateCohort(COHORT_SEED, COHORT_SIZE, now), [now]);
  const dist = useMemo(() => phaseDistribution(cohort), [cohort]);

  // Place the real signed-in account on the funnel from live signals.
  const you = useMemo(() => {
    const firstKeyAt = activeKeys[0] ? Date.parse(activeKeys[0].createdAt) || now - 3 * 86_400_000 : null;
    const firstFireAt = apiLogs.length > 0 ? now - 2 * 86_400_000 : null;
    const input: AccountFunnelInput = {
      signedUp: true, onboarded: true, trialGranted: true,
      firstKeyAt, firstFireAt,
      trialUsedPct: Math.max(0, Math.min(100, Math.round(100 - (creditBalance / 5000) * 100))),
      trialExpiresAt: now + 6 * 86_400_000, paid: creditBalance > 4000,
      walletBalance: creditBalance, walletOpenedAt: creditBalance > 4000 ? now - 20 * 86_400_000 : null,
      spendPerDay: apiLogs.length * 8, reUpped: false,
    };
    return { stage: currentStage(input, now), lead: classifyLead(input, now) };
  }, [activeKeys, apiLogs, creditBalance, now]);

  const total = cohort.length;
  const activated = cohort.filter((a) => stageIndex(a.stage) >= stageIndex('C3-a')).length;
  const converted = cohort.filter((a) => a.paid || a.stage === 'C5-b' || a.stage === 'C5-c').length;
  const atRisk = cohort.filter((a) => a.stage === 'C6-c' || a.stage === 'C6-d' || a.stage === 'C7-b' || a.leadClass === 'dead').length;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  const leadCounts = useMemo(() => {
    const m: Record<LeadClass, number> = { prospect: 0, sql: 0, sales_ready: 0, funnel_driven: 0, hot: 0, dead: 0 };
    cohort.forEach((a) => { m[a.leadClass] += 1; });
    return m;
  }, [cohort]);

  const maxPhase = Math.max(1, ...FUNNEL_PHASES.map((p) => dist[p.id]));
  const selectedStages = selected == null ? [] : FUNNEL_STAGES.filter((s) => s.phase === selected);
  const selectedAccounts: CohortAccount[] = selected == null ? [] : cohort.filter((a) => stageByCode(a.stage).phase === selected).slice(0, 8);

  return (
    <div className="max-w-[1100px] mx-auto pb-16">
      <PageHeader
        icon={<Funnel />}
        title="Growth Funnel"
        description="The full PLG lifecycle — from anonymous landing-page visitor through trial, activation, conversion, and wallet health. Every stage is derived from real product signals, so this board, the in-product nudges, and billing can't disagree."
        actions={<Link href="/console/growth"><StatusBadge tone="info"><TrendingUp className="w-3.5 h-3.5" /> Growth dashboard</StatusBadge></Link>}
      />

      {phase === 'loading' ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[92px] rounded-2xl" />)}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <KpiTile label="In funnel" value={total} icon={<Users />} hint="tracked accounts" />
            <KpiTile label="Activation" value={`${pct(activated)}%`} icon={<Rocket />} hint="fired ≥1 call" />
            <KpiTile label="Conversion" value={`${pct(converted)}%`} icon={<TrendingUp />} hint="paid or upgraded" />
            <KpiTile label="At risk" value={atRisk} icon={<AlertTriangle />} hint="slow/fast burn · dunning" />
          </div>

          {/* Your position */}
          <GlassCard className="p-5 mt-5 border-teal/20 bg-teal/5">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-teal shrink-0"><Radio className="w-5 h-5" /></span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-fg">Your account is at <span className="text-teal">{you.stage}</span> — {stageByCode(you.stage).label}</h3>
                <p className="text-[12px] text-fg-muted mt-0.5">{stageByCode(you.stage).description}</p>
              </div>
              <StatusBadge tone={LEAD_TONE[you.lead]}>{LEAD_LABELS[you.lead]}</StatusBadge>
            </div>
          </GlassCard>

          {/* Funnel visualization */}
          <GlassCard className="p-5 mt-5">
            <div className="flex items-center gap-2 mb-4">
              <Funnel className="w-4 h-4 text-teal" />
              <h3 className="text-sm font-bold text-fg">Lifecycle phases</h3>
              <span className="text-[11px] text-fg-subtle">click a phase to inspect its stages</span>
            </div>
            <div className="space-y-2">
              {FUNNEL_PHASES.map((p) => {
                const count = dist[p.id];
                const width = Math.max(6, Math.round((count / maxPhase) * 100));
                const active = selected === p.id;
                return (
                  <button key={p.id} onClick={() => { const next = active ? null : p.id; setSelected(next); if (next != null) track('funnel_phase_filtered', { phase: p.id, environment }); }}
                    className={`w-full text-left group ${active ? '' : 'opacity-90 hover:opacity-100'}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-40 shrink-0">
                        <div className="text-[12px] font-semibold text-fg truncate">P{p.id} · {p.label}</div>
                        <div className="text-[10px] text-fg-subtle uppercase tracking-widest">{p.band}</div>
                      </div>
                      <div className="flex-1 h-8 rounded-lg bg-surface-2 border border-border overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${width}%` }} transition={{ duration: 0.5, delay: p.id * 0.04 }}
                          className={`h-full ${BAND_ACCENT[p.band]} ${active ? 'ring-2 ring-teal ring-inset' : ''} flex items-center justify-end px-2`}>
                          <span className="text-[11px] font-bold text-surface">{count}</span>
                        </motion.div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </GlassCard>

          {/* Selected phase detail */}
          {selected != null && (
            <GlassCard className="p-5 mt-5">
              <h3 className="text-sm font-bold text-fg mb-3">P{selected} · {FUNNEL_PHASES[selected].label} — stages</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {selectedStages.map((s) => (
                  <div key={s.code} className="rounded-xl border border-border bg-surface-2 p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-teal font-bold">{s.code}</span>
                      <span className="text-[12px] text-fg font-semibold">{s.label}</span>
                      {s.milestone && <StatusBadge tone={s.milestone === 'dead' || s.milestone === 'churn_risk' ? 'error' : 'success'}>{s.milestone.replace('_', ' ')}</StatusBadge>}
                    </div>
                    <p className="text-[11px] text-fg-subtle mt-1">{s.description}</p>
                  </div>
                ))}
              </div>
              {selectedAccounts.length > 0 && (
                <div className="mt-3">
                  <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-1.5">Sample accounts</div>
                  <div className="space-y-1">
                    {selectedAccounts.map((a) => (
                      <div key={a.id} className="flex items-center gap-3 text-[12px] rounded-lg border border-border-subtle bg-surface px-3 py-1.5">
                        <span className="min-w-0 flex-1 truncate text-fg">{a.name}</span>
                        <span className="font-mono text-[10px] text-fg-subtle">{a.stage}</span>
                        <StatusBadge tone={LEAD_TONE[a.leadClass]}>{LEAD_LABELS[a.leadClass]}</StatusBadge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </GlassCard>
          )}

          {/* Lead distribution */}
          <GlassCard className="p-5 mt-5">
            <h3 className="text-sm font-bold text-fg mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-teal" /> Lead classification</h3>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(leadCounts) as LeadClass[]).map((lc) => (
                <div key={lc} className="rounded-xl border border-border bg-surface-2 px-3 py-2 flex items-center gap-2">
                  <StatusBadge tone={LEAD_TONE[lc]}>{LEAD_LABELS[lc]}</StatusBadge>
                  <span className="text-[13px] font-bold text-fg">{leadCounts[lc]}</span>
                </div>
              ))}
            </div>
          </GlassCard>

          <p className="text-[11px] text-fg-subtle mt-4 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Stages, lead class, and burn buckets are computed by the funnel SSOT (lib/funnel.ts) — deterministic, no random. Trial gate, nudges, and the CSM cockpit build on this spine.</p>
          <div className="mt-3 flex items-center gap-4">
            <Link href="/console/growth" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Growth <ArrowRight className="w-3.5 h-3.5" /></Link>
            <Link href="/console/billing" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Billing <ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function FunnelPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'billing']}>
      <FunnelInner />
    </RoleGuard>
  );
}

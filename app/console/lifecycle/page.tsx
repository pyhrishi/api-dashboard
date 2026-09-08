'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { HeartHandshake, Timer, Flame, RotateCcw, UserCheck, Send, ArrowRight, Sparkles, Check } from 'lucide-react';
import { track } from '@/lib/telemetry';
import RoleGuard from '@/components/RoleGuard';
import { useToast } from '@/components/Toast';
import { PageHeader, KpiTile, GlassCard, Button, StatusBadge, type BadgeTone } from '@/components/ui';
import { generateCohort, LEAD_LABELS, type LeadClass, type CohortAccount } from '@/lib/funnel';
import { useLifecycleOps } from '@/lib/lifecycle-ops';

const COHORT_SEED = 'zinbit-funnel-2026';
const LEAD_TONE: Record<LeadClass, BadgeTone> = {
  prospect: 'info', sql: 'info', sales_ready: 'warning', funnel_driven: 'success', hot: 'success', dead: 'error',
};
// Board ordering — hottest first.
const BOARD_ORDER: LeadClass[] = ['hot', 'sales_ready', 'funnel_driven', 'sql', 'prospect', 'dead'];

function expiryLabel(d: number | null): string {
  if (d === null) return '—';
  if (d < 0) return 'expired';
  if (d === 0) return 'today';
  return `${d}d left`;
}

function LifecycleInner() {
  const [now] = useState(() => Date.now());
  const toast = useToast();
  const ops = useLifecycleOps();

  useEffect(() => { track('lifecycle_viewed', {}); }, []);

  const cohort = useMemo(() => generateCohort(COHORT_SEED, 240, now), [now]);

  const windowAccounts = useMemo(
    () => cohort.filter((a) => a.inWindow).sort((x, y) => (x.daysToExpiry ?? 99) - (y.daysToExpiry ?? 99) || y.trialUsedPct - x.trialUsedPct),
    [cohort],
  );
  const deadAccounts = useMemo(() => cohort.filter((a) => a.leadClass === 'dead'), [cohort]);
  const hotCount = cohort.filter((a) => a.leadClass === 'hot').length;
  const aeCount = cohort.filter((a) => a.aeAssigned).length;

  const byClass = useMemo(() => {
    const m: Record<LeadClass, CohortAccount[]> = { prospect: [], sql: [], sales_ready: [], funnel_driven: [], hot: [], dead: [] };
    cohort.forEach((a) => m[a.leadClass].push(a));
    return m;
  }, [cohort]);

  const sendPrompt = (a: CohortAccount) => {
    ops.sendPrompt(a.id);
    track('conversion_prompt_sent', { account: a.id, usedPct: a.trialUsedPct, daysToExpiry: a.daysToExpiry });
    toast.success('Upgrade prompt sent', `${a.name} — tailored proof + offer delivered.`);
  };
  const startWinback = (a: CohortAccount) => {
    ops.startWinback(a.id);
    track('winback_started', { account: a.id });
    toast.success('Win-back started', `${a.name} — re-engagement sequence running.`);
  };

  return (
    <div className="max-w-[1100px] mx-auto pb-16">
      <PageHeader
        icon={<HeartHandshake />}
        title="Lifecycle (CSM)"
        description="The daily conversion desk: accounts in the decision window before their trial lapses, leads classified by intent, high-spenders routed to an AE, and a win-back queue for lapsed trials."
        actions={<Link href="/console/funnel"><StatusBadge tone="info"><Sparkles className="w-3.5 h-3.5" /> Funnel</StatusBadge></Link>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile label="Conversion window" value={windowAccounts.length} icon={<Timer />} hint="≥80% or ≤2d" />
        <KpiTile label="Hot leads" value={hotCount} icon={<Flame />} hint="paying / fast burn" />
        <KpiTile label="Win-back queue" value={deadAccounts.length} icon={<RotateCcw />} hint="lapsed trials" />
        <KpiTile label="AE-assigned" value={aeCount} icon={<UserCheck />} hint="high spend" />
      </div>

      {/* Conversion window — daily watchlist */}
      <div className="flex items-center justify-between mt-6 mb-3">
        <h3 className="text-sm font-bold text-fg flex items-center gap-2"><Timer className="w-4 h-4" /> Conversion window — monitor daily</h3>
        <StatusBadge tone="warning">{windowAccounts.length} to action</StatusBadge>
      </div>
      <GlassCard className="p-3">
        <div className="space-y-1.5 max-h-[360px] overflow-y-auto">
          {windowAccounts.map((a) => {
            const sent = ops.promptSent.includes(a.id);
            const urgent = (a.daysToExpiry ?? 9) <= 2;
            return (
              <div key={a.id} className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 flex items-center gap-3 flex-wrap">
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">{a.name}</span>
                <StatusBadge tone={a.trialUsedPct >= 100 ? 'error' : 'warning'}>{a.trialUsedPct}% used</StatusBadge>
                <StatusBadge tone={urgent ? 'error' : 'info'}>{expiryLabel(a.daysToExpiry)}</StatusBadge>
                <StatusBadge tone={LEAD_TONE[a.leadClass]}>{LEAD_LABELS[a.leadClass]}</StatusBadge>
                {sent ? (
                  <span className="text-[12px] font-bold text-semantic-success inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Prompt sent</span>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => sendPrompt(a)}><Send className="w-3.5 h-3.5" /> Send upgrade prompt</Button>
                )}
              </div>
            );
          })}
          {windowAccounts.length === 0 && <p className="text-[12px] text-fg-subtle p-3">No accounts in the conversion window right now.</p>}
        </div>
      </GlassCard>

      {/* Lead board */}
      <h3 className="text-sm font-bold text-fg flex items-center gap-2 mt-6 mb-3"><Flame className="w-4 h-4" /> Lead board</h3>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {BOARD_ORDER.map((lc) => (
          <GlassCard key={lc} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <StatusBadge tone={LEAD_TONE[lc]}>{LEAD_LABELS[lc]}</StatusBadge>
              <span className="text-[15px] font-bold text-fg">{byClass[lc].length}</span>
            </div>
            <div className="space-y-1">
              {byClass[lc].slice(0, 4).map((a) => (
                <div key={a.id} className="flex items-center gap-2 text-[11px] text-fg-muted">
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  {a.aeAssigned && <StatusBadge tone="success"><UserCheck className="w-3 h-3" /> AE</StatusBadge>}
                </div>
              ))}
              {byClass[lc].length > 4 && <div className="text-[10px] text-fg-subtle">+{byClass[lc].length - 4} more</div>}
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Win-back queue */}
      <div className="flex items-center justify-between mt-6 mb-3">
        <h3 className="text-sm font-bold text-fg flex items-center gap-2"><RotateCcw className="w-4 h-4" /> Win-back queue</h3>
        <StatusBadge tone="error">{deadAccounts.length} lapsed</StatusBadge>
      </div>
      <GlassCard className="p-3">
        <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
          {deadAccounts.slice(0, 20).map((a) => {
            const running = ops.winbackStarted.includes(a.id);
            return (
              <div key={a.id} className="rounded-xl border border-semantic-error/20 bg-semantic-error/5 px-4 py-2.5 flex items-center gap-3 flex-wrap">
                <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{a.name}</span>
                <span className="text-[11px] text-fg-subtle">trial lapsed · {a.trialUsedPct}% used</span>
                {running ? (
                  <span className="text-[12px] font-bold text-semantic-success inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Win-back running</span>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => startWinback(a)}><RotateCcw className="w-3.5 h-3.5" /> Start win-back</Button>
                )}
              </div>
            );
          })}
        </div>
      </GlassCard>

      <p className="text-[11px] text-fg-subtle mt-4 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Leads are classified by the funnel SSOT from real signals; Hot + high-spend accounts are auto-routed to an AE. Actions persist for the session.</p>
      <div className="mt-3 flex items-center gap-4">
        <Link href="/console/funnel" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Funnel <ArrowRight className="w-3.5 h-3.5" /></Link>
        <Link href="/console/trial-credits" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Trial &amp; Credits <ArrowRight className="w-3.5 h-3.5" /></Link>
      </div>
    </div>
  );
}

export default function LifecyclePage() {
  return (
    <RoleGuard allowedRoles={['admin', 'billing']}>
      <LifecycleInner />
    </RoleGuard>
  );
}

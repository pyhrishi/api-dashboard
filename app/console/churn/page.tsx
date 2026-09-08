'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RotateCcw, AlertTriangle, Ban, RefreshCw, Send, UserCheck, ArrowRight, Sparkles, Check, TrendingUp } from 'lucide-react';
import { track } from '@/lib/telemetry';
import RoleGuard from '@/components/RoleGuard';
import { useToast } from '@/components/Toast';
import { PageHeader, KpiTile, GlassCard, Button, StatusBadge, type BadgeTone } from '@/components/ui';
import { generateCohort, type CohortAccount } from '@/lib/funnel';
import { dunningStage, DUNNING_META, needsSalesOutreach, useDunningOps, type DunningStage } from '@/lib/dunning';

const COHORT_SEED = 'zinbit-funnel-2026';
const STAGE_TONE: Record<DunningStage, BadgeTone> = { grace_retry: 'warning', revocation_warning: 'warning', revoked: 'error' };

function ChurnInner() {
  const [now] = useState(() => Date.now());
  const toast = useToast();
  const ops = useDunningOps();

  useEffect(() => { track('churn_desk_viewed', {}); }, []);

  const cohort = useMemo(() => generateCohort(COHORT_SEED, 240, now), [now]);
  const reUpped = useMemo(() => cohort.filter((a) => a.reUpped), [cohort]);
  const dunning = useMemo(
    () => cohort.filter((a) => a.depletedDaysAgo !== null)
      .map((a) => ({ ...a, dstage: dunningStage(a.depletedDaysAgo as number) }))
      .sort((x, y) => (y.depletedDaysAgo as number) - (x.depletedDaysAgo as number)),
    [cohort],
  );
  const warnings = dunning.filter((a) => a.dstage === 'revocation_warning' || a.dstage === 'revoked').length;
  const salesTargets = dunning.filter((a) => needsSalesOutreach(a.dstage, a.highValue)).length;

  const retry = (a: CohortAccount) => { ops.retryPayment(a.id); track('dunning_payment_retried', { account: a.id }); toast.success('Payment retried', `${a.name} — card retry queued (48h window).`); };
  const warn = (a: CohortAccount) => { ops.sendWarning(a.id); track('dunning_warning_sent', { account: a.id }); toast.success('Revocation warning sent', a.name); };
  const revoke = (a: CohortAccount) => { ops.revokeAccess(a.id); track('dunning_access_revoked', { account: a.id }); toast.info('Access revoked', `${a.name} — keys suspended.`); };
  const flagSales = (a: CohortAccount) => { ops.flagSales(a.id); track('dunning_sales_flagged', { account: a.id }); toast.success('Flagged to sales', `${a.name} — prior high-value, AE outreach.`); };

  return (
    <div className="max-w-[1100px] mx-auto pb-16">
      <PageHeader
        icon={<RotateCcw />}
        title="Re-up & Churn"
        description="Top-ups are the retention signal; a balance stuck at zero starts dunning — a 48-hour payment retry, then a key-revocation warning, then suspension. Previously high-value accounts get sales outreach instead of a silent lapse."
        actions={<Link href="/console/wallet-health"><StatusBadge tone="info"><Sparkles className="w-3.5 h-3.5" /> Wallet health</StatusBadge></Link>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile label="Re-upped" value={reUpped.length} icon={<TrendingUp />} hint="retention / LTV" />
        <KpiTile label="In dunning" value={dunning.length} icon={<AlertTriangle />} hint="zero balance" />
        <KpiTile label="Revocation risk" value={warnings} icon={<Ban />} hint="warning / revoked" />
        <KpiTile label="Sales-flagged" value={salesTargets} icon={<UserCheck />} hint="prior high-value" />
      </div>

      {/* Re-up / retention */}
      <GlassCard className="p-5 mt-5 border-semantic-success/25 bg-semantic-success/5">
        <div className="flex items-center gap-2 mb-1"><TrendingUp className="w-4 h-4 text-semantic-success" /><h3 className="text-sm font-bold text-fg">Re-ups — healthy retention</h3><StatusBadge tone="success">{reUpped.length} topped up again</StatusBadge></div>
        <p className="text-[12px] text-fg-muted">These accounts topped up their wallet again — the strongest retention / LTV signal. {reUpped.slice(0, 5).map((a) => a.name).join(', ')}{reUpped.length > 5 ? ` +${reUpped.length - 5} more` : ''}.</p>
      </GlassCard>

      {/* Dunning queue */}
      <div className="flex items-center justify-between mt-6 mb-3">
        <h3 className="text-sm font-bold text-fg flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Dunning queue</h3>
        <StatusBadge tone="error">{dunning.length} at zero balance</StatusBadge>
      </div>
      <GlassCard className="p-3">
        <div className="space-y-1.5 max-h-[440px] overflow-y-auto">
          {dunning.map((a) => {
            const meta = DUNNING_META[a.dstage];
            const sales = needsSalesOutreach(a.dstage, a.highValue);
            return (
              <div key={a.id} className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 flex items-center gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-fg truncate">{a.name}{a.highValue && <span className="ml-1.5 text-[10px] font-bold text-teal">HIGH-VALUE</span>}</div>
                  <div className="text-[11px] text-fg-subtle">{a.depletedDaysAgo}d since depletion · {meta.action}</div>
                </div>
                <StatusBadge tone={STAGE_TONE[a.dstage]}>{meta.label}</StatusBadge>
                {/* Stage-appropriate actions */}
                {a.dstage === 'grace_retry' && (ops.retried.includes(a.id)
                  ? <span className="text-[12px] font-bold text-semantic-success inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Retried</span>
                  : <Button size="sm" variant="ghost" onClick={() => retry(a)}><RefreshCw className="w-3.5 h-3.5" /> Retry payment</Button>)}
                {a.dstage === 'revocation_warning' && (ops.warned.includes(a.id)
                  ? <span className="text-[12px] font-bold text-semantic-warning inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Warned</span>
                  : <Button size="sm" variant="ghost" onClick={() => warn(a)}><Send className="w-3.5 h-3.5" /> Send warning</Button>)}
                {a.dstage === 'revoked' && (ops.revoked.includes(a.id)
                  ? <span className="text-[12px] font-bold text-semantic-error inline-flex items-center gap-1"><Ban className="w-3.5 h-3.5" /> Revoked</span>
                  : <Button size="sm" variant="ghost" onClick={() => revoke(a)}><Ban className="w-3.5 h-3.5" /> Revoke access</Button>)}
                {sales && (ops.salesFlagged.includes(a.id)
                  ? <StatusBadge tone="success"><UserCheck className="w-3 h-3" /> Sales flagged</StatusBadge>
                  : <Button size="sm" variant="secondary" onClick={() => flagSales(a)}><UserCheck className="w-3.5 h-3.5" /> Flag to sales</Button>)}
              </div>
            );
          })}
          {dunning.length === 0 && <p className="text-[12px] text-fg-subtle p-3">No accounts in dunning right now.</p>}
        </div>
      </GlassCard>

      <p className="text-[11px] text-fg-subtle mt-4 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Dunning stage is computed from days since depletion (0–48h retry → ≤4d warning → revoked). Actions persist for the session.</p>
      <div className="mt-3 flex items-center gap-4">
        <Link href="/console/wallet-health" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Wallet health <ArrowRight className="w-3.5 h-3.5" /></Link>
        <Link href="/console/lifecycle" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Lifecycle <ArrowRight className="w-3.5 h-3.5" /></Link>
      </div>
    </div>
  );
}

export default function ChurnPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'billing']}>
      <ChurnInner />
    </RoleGuard>
  );
}

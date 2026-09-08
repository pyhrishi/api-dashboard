'use client';

import { useEffect } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { Wallet as WalletIcon, TrendingDown, AlertTriangle } from 'lucide-react';
import { fmt } from '@/lib/admin/api';
import { useLoad } from '@/lib/admin/useLoad';
import { track } from '@/lib/admin/telemetry';
import { GlassCard, KpiTile, Skeleton, StatusBadge } from '@/components/admin/ui';
import { ErrorCard, WALLET_TONE, WALLET_LABEL } from '@/components/admin/shared';
import type { WalletSnapshot, TopUp } from '@/lib/admin/types';

interface WalletDetail { snapshot: WalletSnapshot; series: { day: string; usage: number; balance: number; projected: number | null }[]; topUps: TopUp[] }

/** Balance vs usage with a projection at the trailing 7-day burn, plus the exhaustion verdict. */
export function WalletPanel({ customerId }: { customerId: string }) {
  const { state, reload } = useLoad<WalletDetail>(`wallets/${customerId}`);
  useEffect(() => { track('wallet_viewed', { customerId }); }, [customerId]);

  if (state.status === 'loading') return <div className="space-y-4" aria-busy="true"><div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <KpiTile key={i} loading label="" value="" />)}</div><Skeleton variant="block" className="h-[300px]" /></div>;
  if (state.status === 'error') return <ErrorCard message={state.message} onRetry={reload} />;
  const { snapshot: s, series, topUps } = state.data;
  const verdict = s.label === 'exhausted' ? `At zero for ${s.hoursAtZero ?? 0}h — every billed call returns 402.`
    : s.label === 'idle' ? 'No consumption in the last 7 days.'
      : s.label === 'early' ? `At the current burn the wallet exhausts ${fmt.inDays(s.projectedExhaustAt)} — before the next expected top-up (${fmt.inDays(s.nextExpectedTopUpAt)}).`
        : s.label === 'delayed' ? `Usage has slowed: exhaustion ${fmt.inDays(s.projectedExhaustAt)}, well after the usual top-up (${fmt.inDays(s.nextExpectedTopUpAt)}).`
          : `On track: exhaustion ${fmt.inDays(s.projectedExhaustAt)} lines up with the top-up cadence (${s.topUpCadenceDays ?? '—'} days).`;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile label="Balance" value={fmt.n(s.balance)} icon={<WalletIcon />} hint={s.remainingOfLastTopUp !== null ? `${Math.round(s.remainingOfLastTopUp * 100)}% of last top-up (${fmt.n(s.lastTopUpAmount)})` : 'no top-ups yet'} />
        <KpiTile label="Burn (7d)" value={fmt.n(s.burn7d)} icon={<TrendingDown />} hint={`${fmt.n(s.dailyBurn)} / day · ${fmt.n(s.burn30d)} in 30d`} />
        <KpiTile label="Projected exhaustion" value={s.daysToExhaust === null ? '—' : `${s.daysToExhaust}d`} hint={s.projectedExhaustAt ? fmt.date(s.projectedExhaustAt) : 'no burn to project'} lowerIsBetter />
        <KpiTile label="Top-up cadence" value={s.topUpCadenceDays === null ? '—' : `${s.topUpCadenceDays}d`} hint={s.nextExpectedTopUpAt ? `next expected ${fmt.inDays(s.nextExpectedTopUpAt)}` : 'fewer than two top-ups'} />
      </div>
      <GlassCard className="p-4">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <div className="text-[12px] font-bold text-fg">Wallet balance vs usage · 30 days + 14-day projection</div>
          <StatusBadge tone={WALLET_TONE[s.label]}>{WALLET_LABEL[s.label]}</StatusBadge>
          {s.belowTenPct && <StatusBadge tone="warning"><AlertTriangle className="w-3 h-3" /> below 10% of last top-up</StatusBadge>}
          {s.atZero && <StatusBadge tone="error"><AlertTriangle className="w-3 h-3" /> wallet at 0</StatusBadge>}
        </div>
        <p className="text-[12px] text-fg-muted mb-3">{verdict}</p>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: 'var(--color-fg-muted)', fontSize: 10 }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} interval={4} />
              <YAxis yAxisId="bal" tick={{ fill: 'var(--color-fg-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={56} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
              <YAxis yAxisId="use" orientation="right" tick={{ fill: 'var(--color-fg-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
              <Tooltip contentStyle={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 12, fontSize: 11, color: 'var(--color-fg)' }} labelStyle={{ color: 'var(--color-fg-muted)' }} formatter={(v: unknown, name: unknown) => [typeof v === 'number' && !Number.isNaN(v) ? fmt.n(v) : '—', name === 'usage' ? 'usage (credits)' : name === 'balance' ? 'balance' : 'projected']} />
              <Bar yAxisId="use" dataKey="usage" fill="var(--color-brand)" fillOpacity={0.35} radius={[3, 3, 0, 0]} />
              <Line yAxisId="bal" type="monotone" dataKey="balance" stroke="var(--color-brand)" strokeWidth={2} dot={false} connectNulls={false} />
              <Line yAxisId="bal" type="monotone" dataKey="projected" stroke="var(--color-fg-muted)" strokeWidth={2} strokeDasharray="5 4" dot={false} />
              <ReferenceLine yAxisId="bal" y={s.lastTopUpAmount * 0.1} stroke="var(--color-fg-subtle)" strokeDasharray="2 4" label={{ value: '10% of last top-up', fill: 'var(--color-fg-muted)', fontSize: 10, position: 'insideTopRight' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>
      <GlassCard className="p-4">
        <div className="text-[12px] font-bold text-fg mb-2">Top-ups</div>
        {topUps.length === 0 ? <p className="text-[11px] text-fg-muted">No top-ups recorded.</p> : (
          <ul className="divide-y divide-border-subtle">{topUps.map((t, i) => <li key={`${t.at}-${i}`} className="py-1.5 flex items-center justify-between text-[11px]"><span className="text-fg-muted">{fmt.dateTime(t.at)} · {t.kind.replace('_', ' ')}</span><span className="font-mono text-fg font-bold">+{fmt.n(t.amount)}</span></li>)}</ul>
        )}
      </GlassCard>
    </div>
  );
}

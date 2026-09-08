'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet, AlertTriangle, TrendingDown } from 'lucide-react';
import { fmt } from '@/lib/admin/api';
import { useLoad } from '@/lib/admin/useLoad';
import { PageHeader, GlassCard, KpiTile, DataTable, StatusBadge, Skeleton, type Column } from '@/components/admin/ui';
import { ErrorCard, CustomerLink, WALLET_TONE, WALLET_LABEL } from '@/components/admin/shared';
import { WalletPanel } from '@/components/admin/WalletPanel';
import type { WalletSnapshot } from '@/lib/admin/types';

type Row = WalletSnapshot & { customerName: string };

export default function WalletsPage() {
  const { state, reload } = useLoad<Row[]>('insights/wallets');
  const [selected, setSelected] = useState<string | null>(null);
  const rows = useMemo(() => (state.status === 'ok' ? state.data.slice().sort((a, b) => {
    const rank = (s: WalletSnapshot) => (s.atZero ? 0 : s.belowTenPct ? 1 : s.label === 'early' ? 2 : 3);
    return rank(a) - rank(b) || (a.daysToExhaust ?? 1e9) - (b.daysToExhaust ?? 1e9);
  }) : []), [state]);
  const sel = selected ?? rows[0]?.customerId ?? null;

  const columns: Column<Row>[] = [
    { key: 'customer', header: 'Customer', render: (w) => <CustomerLink id={w.customerId} name={w.customerName} /> },
    { key: 'balance', header: 'Balance', align: 'right', sortValue: (w) => w.balance, render: (w) => <div className="text-right"><div className="font-mono text-[11px] text-fg">{fmt.n(w.balance)}</div><div className="text-[10px] text-fg-muted">{w.remainingOfLastTopUp !== null ? `${Math.round(w.remainingOfLastTopUp * 100)}% of last top-up` : '—'}</div></div> },
    { key: 'burn', header: 'Burn / day', align: 'right', className: 'hidden md:table-cell', sortValue: (w) => w.dailyBurn, render: (w) => <span className="font-mono text-[11px] text-fg-muted">{fmt.n(w.dailyBurn)}</span> },
    { key: 'exhaust', header: 'Projected exhaustion', align: 'right', sortValue: (w) => w.daysToExhaust ?? 1e9, render: (w) => <span className="text-[11px] text-fg">{w.atZero ? `at 0 for ${w.hoursAtZero ?? 0}h` : w.daysToExhaust === null ? '—' : `${w.daysToExhaust}d · ${fmt.date(w.projectedExhaustAt)}`}</span> },
    { key: 'cadence', header: 'Next top-up (expected)', align: 'right', className: 'hidden lg:table-cell', render: (w) => <span className="text-[11px] text-fg-muted">{w.nextExpectedTopUpAt ? fmt.inDays(w.nextExpectedTopUpAt) : '—'}{w.topUpCadenceDays ? ` · every ${w.topUpCadenceDays}d` : ''}</span> },
    { key: 'label', header: 'Verdict', align: 'right', render: (w) => <div className="flex justify-end gap-1 flex-wrap"><StatusBadge tone={WALLET_TONE[w.label]}>{WALLET_LABEL[w.label]}</StatusBadge>{w.belowTenPct && <StatusBadge tone="warning">&lt; 10%</StatusBadge>}</div> },
  ];

  return (
    <div className="max-w-[1200px] mx-auto pb-16">
      <PageHeader icon={<Wallet />} title="Wallets & consumption trends" description="Balance versus usage for every customer, with exhaustion projected from the trailing 7-day burn and compared against each account’s top-up cadence — early, on track or delayed. Flags at 10% of the last top-up and at zero." />
      {state.status === 'error' ? <div className="mt-6"><ErrorCard message={state.message} onRetry={reload} /></div> : (
        <>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <KpiTile loading={state.status === 'loading'} label="Wallets at zero" value={rows.filter((r) => r.atZero).length} icon={<AlertTriangle />} hint="every billed call returns 402" lowerIsBetter />
            <KpiTile loading={state.status === 'loading'} label="Below 10% of last top-up" value={rows.filter((r) => r.belowTenPct).length} icon={<Wallet />} hint="sales trigger candidates" lowerIsBetter />
            <KpiTile loading={state.status === 'loading'} label="Exhausting early" value={rows.filter((r) => r.label === 'early').length} icon={<TrendingDown />} hint="before the usual top-up" lowerIsBetter />
            <KpiTile loading={state.status === 'loading'} label="Total balance" value={fmt.n(rows.reduce((s, r) => s + r.balance, 0))} hint={`${fmt.n(rows.reduce((s, r) => s + r.burn7d, 0))} consumed this week`} />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
            <GlassCard className="p-5 mt-5">
              <h3 className="text-sm font-bold text-fg mb-3">All wallets · sorted by urgency</h3>
              {state.status === 'loading' ? <div className="space-y-2" aria-busy="true">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div> : <DataTable columns={columns} rows={rows} rowKey={(w) => w.customerId} pageSize={14} emptyTitle="No wallets" emptyDescription="Wallets appear as soon as a customer has a top-up or a trial grant." onRowClick={(w) => { setSelected(w.customerId); document.getElementById('wallet-trend')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} />}
              <p className="text-[11px] text-fg-muted mt-2">Click a row to load its trend below.</p>
            </GlassCard>
          </motion.div>
          {sel && (
            <motion.div id="wallet-trend" key={sel} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5 scroll-mt-4">
              <h3 className="text-sm font-bold text-fg mb-3">{rows.find((r) => r.customerId === sel)?.customerName ?? sel}</h3>
              <WalletPanel customerId={sel} />
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}

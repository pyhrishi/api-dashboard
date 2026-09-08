'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, Eye, ExternalLink, Copy, Check, ArrowLeft, Clock, ShieldCheck, Mail, UserRound, KeyRound, ScrollText, Wallet, Inbox, History } from 'lucide-react';
import { api, fmt } from '@/lib/admin/api';
import { useLoad } from '@/lib/admin/useLoad';
import { useStore, CAN } from '@/lib/admin/store';
import { track } from '@/lib/admin/telemetry';
import { useToast } from '@/components/admin/Toast';
import { PageHeader, GlassCard, KpiTile, Button, SegmentedControl, Skeleton, StatusBadge, EmptyState, DataTable, type Column } from '@/components/admin/ui';
import { ErrorCard, StageBadge, PLAN_TONE, REQUEST_TONE } from '@/components/admin/shared';
import { ReasonModal } from '@/components/admin/ReasonModal';
import { TokensPanel } from '@/components/admin/TokensPanel';
import { LedgerPanel } from '@/components/admin/LedgerPanel';
import { WalletPanel } from '@/components/admin/WalletPanel';
import type { Customer, ManagedKey, WalletSnapshot, AccessRequest, AuditEntry, ImpersonationSession } from '@/lib/admin/types';
import type { CustomerMetrics } from '@/lib/admin/insights';

interface Detail { customer: Customer; keys: ManagedKey[]; wallet: { snapshot: WalletSnapshot }; metrics: CustomerMetrics | null; accessRequests: AccessRequest[]; audit: AuditEntry[]; sessions: ImpersonationSession[] }
type Tab = 'tokens' | 'ledger' | 'wallet' | 'access' | 'audit';

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const role = useStore((s) => s.operator?.role ?? 'ops');
  const toast = useToast();
  const { state, reload } = useLoad<Detail>(`customers/${id}`);
  const allCustomers = useLoad<Customer[]>('customers');
  const [tab, setTab] = useState<Tab>('tokens');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [session, setSession] = useState<{ session: ImpersonationSession; token: string; consoleUrl: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);

  useEffect(() => { if (state.status === 'ok') track('customer_opened', { customerId: id, stage: state.data.customer.stage }); }, [state.status, id]); // eslint-disable-line react-hooks/exhaustive-deps -- once per load

  const startPreview = async (reason: string) => {
    setBusy(true); setErr(null);
    const res = await api.post<{ session: ImpersonationSession; token: string; consoleUrl: string }>('preview/start', { customerId: id, reason });
    setBusy(false);
    if (!res.ok) { setErr(res.error.message); return; }
    setSession(res.data); setPreviewOpen(false);
    track('preview_started', { customerId: id });
    window.open(res.data.consoleUrl, '_blank', 'noopener');
    reload();
  };
  const endPreview = async (sessionId: string) => {
    await api.post('preview/end', { sessionId });
    track('preview_ended', { customerId: id });
    toast.info('Preview ended', 'The sandbox token stops working in the console.');
    setSession(null); reload();
  };

  if (state.status === 'loading') return <div className="max-w-[1200px] mx-auto" aria-busy="true"><Skeleton className="h-8 w-72 mt-2" /><Skeleton className="h-4 w-96 mt-3" /><div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">{[0, 1, 2, 3].map((i) => <KpiTile key={i} loading label="" value="" />)}</div><Skeleton variant="block" className="h-[400px] mt-5" /></div>;
  if (state.status === 'error') return <div className="max-w-[1200px] mx-auto mt-6"><ErrorCard message={state.message} onRetry={reload} /></div>;
  const { customer: c, keys, wallet, metrics, accessRequests, audit, sessions } = state.data;
  // A session started in this tab has the one-time link; one resumed from the server does not (token never stored).
  const live = session ?? (sessions[0] ? { session: sessions[0], token: null, consoleUrl: null } : null);
  const minutesLeft = live ? Math.max(0, Math.round((Date.parse(live.session.expiresAt) - now) / 60_000)) : 0;

  const auditCols: Column<AuditEntry>[] = [
    { key: 'at', header: 'When', render: (a) => <span className="font-mono text-[11px] text-fg-muted whitespace-nowrap">{fmt.dateTime(a.at)}</span> },
    { key: 'action', header: 'Action', render: (a) => <div><div className="font-mono text-[11px] text-fg">{a.action}</div><div className="text-[11px] text-fg-muted">{a.actor} · {a.actorRole}</div></div> },
    { key: 'change', header: 'Change', className: 'hidden md:table-cell', render: (a) => <span className="font-mono text-[10px] text-fg-muted break-all">{a.before ? `${JSON.stringify(a.before)} → ` : ''}{a.after ? JSON.stringify(a.after) : '—'}</span> },
    { key: 'reason', header: 'Reason', render: (a) => <span className="text-[11px] text-fg">{a.reason}</span> },
  ];
  const reqCols: Column<AccessRequest>[] = [
    { key: 'type', header: 'Request', render: (r) => <div><Link href={`/admin/access-requests/${r.id}`} className="text-[12px] font-bold text-fg hover:text-teal transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 rounded">{r.type.replace(/_/g, ' ')}</Link><div className="text-[11px] text-fg-muted">{r.requesterEmail} · {fmt.ago(r.createdAt)}</div></div> },
    { key: 'status', header: 'Status', align: 'right', render: (r) => <StatusBadge tone={REQUEST_TONE[r.status]}>{r.status.replace('_', ' ')}</StatusBadge> },
  ];

  return (
    <div className="max-w-[1200px] mx-auto pb-16">
      <Link href="/admin/customers" className="text-[11px] font-bold text-fg-muted hover:text-teal inline-flex items-center gap-1 mb-2"><ArrowLeft className="w-3 h-3" /> Customers</Link>
      <PageHeader
        icon={<Building2 />}
        title={c.name}
        description={<span className="inline-flex items-center gap-2 flex-wrap"><span>{c.domain}</span><StatusBadge tone={PLAN_TONE[c.plan]}>{c.plan}</StatusBadge><StageBadge stage={c.stage} /><span className="text-fg-muted">{c.region} · {c.productIds.join(', ')}</span><span className="text-fg-muted inline-flex items-center gap-1"><UserRound className="w-3 h-3" /> {c.owner}</span><span className="text-fg-muted inline-flex items-center gap-1"><Mail className="w-3 h-3" /> {c.contactEmail}</span></span>}
        actions={CAN.preview(role) ? <Button size="sm" onClick={() => { setPreviewOpen(true); setErr(null); }} icon={<Eye className="w-4 h-4" />} title="Open the customer console as this customer, in sandbox, with a short-lived token">Preview as customer</Button> : undefined}
      />

      <AnimatePresence>
        {live && minutesLeft > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-4 rounded-2xl border border-teal/30 bg-teal/5 p-4">
              <div className="flex items-center gap-2 flex-wrap mb-2"><ShieldCheck className="w-4 h-4 text-teal" /><span className="text-sm font-bold text-fg">Preview session active</span><StatusBadge tone="teal" dot pulse>sandbox · expires in {minutesLeft} min</StatusBadge><span className="text-[11px] text-fg-muted">{live.session.keyFingerprint} · started by {live.session.operator}</span></div>
              <p className="text-[12px] text-fg-muted mb-2">{live.consoleUrl ? <>The customer console opened in a new tab with a <span className="font-mono">sk_test_</span> token minted for this session — a real, header-safe key, so sandbox calls succeed. It expires in 30 minutes and every action is attributed to you. If the tab was blocked, use the link.</> : <>A preview session is open for this customer. The one-time link lives in the tab that started it; you can end the session here.</>}</p>
              <div className="flex items-center gap-2 flex-wrap">
                {live.consoleUrl && <Button size="sm" variant="secondary" onClick={() => window.open(live.consoleUrl as string, '_blank', 'noopener')} icon={<ExternalLink className="w-4 h-4" />}>Open console as {c.name}</Button>}
                {live.token && <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard?.writeText(live.token as string).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }).catch(() => {}); }} icon={copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}>{copied ? 'Copied' : 'Copy token (shown once)'}</Button>}
                <Button size="sm" variant="ghost" onClick={() => endPreview(live.session.id)} icon={<Clock className="w-4 h-4" />}>End preview</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile label="Wallet" value={fmt.n(wallet.snapshot.balance)} hint={wallet.snapshot.label === 'exhausted' ? 'at zero' : wallet.snapshot.daysToExhaust !== null ? `exhausts in ${wallet.snapshot.daysToExhaust}d · ${wallet.snapshot.label.replace('_', ' ')}` : 'no burn'} />
        <KpiTile label="Calls (7d)" value={metrics ? fmt.n(metrics.calls7d) : '—'} hint={metrics ? `${fmt.n(metrics.credits7d)} credits` : ''} />
        <KpiTile label="Active keys" value={keys.filter((k) => k.status === 'active').length} hint={`${keys.length} total · ${keys.filter((k) => k.environment === 'live').length} live`} />
        <KpiTile label="Open requests" value={accessRequests.filter((r) => r.status === 'open' || r.status === 'needs_info').length} hint={`${accessRequests.length} all time`} />
      </div>

      <div className="mt-5">
        <SegmentedControl layoutId="customer-tabs" value={tab} onChange={setTab} options={[
          { value: 'tokens', label: <span className="inline-flex items-center gap-1"><KeyRound className="w-3.5 h-3.5" /> Tokens</span> },
          { value: 'ledger', label: <span className="inline-flex items-center gap-1"><ScrollText className="w-3.5 h-3.5" /> Ledger</span> },
          { value: 'wallet', label: <span className="inline-flex items-center gap-1"><Wallet className="w-3.5 h-3.5" /> Wallet</span> },
          { value: 'access', label: <span className="inline-flex items-center gap-1"><Inbox className="w-3.5 h-3.5" /> Access</span> },
          { value: 'audit', label: <span className="inline-flex items-center gap-1"><History className="w-3.5 h-3.5" /> Audit</span> },
        ]} />
      </div>
      <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
        <GlassCard className="p-5 mt-4">
          {tab === 'tokens' && <TokensPanel keys={keys} customers={allCustomers.state.status === 'ok' ? allCustomers.state.data : [c]} customerId={c.id} onChanged={reload} />}
          {tab === 'ledger' && <LedgerPanel customers={[c]} keys={keys} customerId={c.id} />}
          {tab === 'wallet' && <WalletPanel customerId={c.id} />}
          {tab === 'access' && (accessRequests.length === 0 ? <EmptyState icon={<Inbox className="w-8 h-8" />} title="No access requests" description="Requests for live keys, limits, regions or features appear here with their full log." /> : <DataTable columns={reqCols} rows={accessRequests} rowKey={(r) => r.id} />)}
          {tab === 'audit' && (audit.length === 0 ? <EmptyState icon={<History className="w-8 h-8" />} title="No audit entries" description="Every operator change to this customer is recorded here with actor and reason." /> : <DataTable columns={auditCols} rows={audit} rowKey={(a) => a.id} pageSize={10} />)}
        </GlassCard>
      </motion.div>

      <ReasonModal open={previewOpen} title={`Preview the console as ${c.name}?`} description="Mints a sandbox-only token valid for 30 minutes and opens the customer console in a new tab. Real sandbox calls will succeed. The session and everything you do in it are audit-logged under your identity." confirmLabel="Start preview" busy={busy} error={err} onClose={() => setPreviewOpen(false)} onConfirm={startPreview} />
    </div>
  );
}

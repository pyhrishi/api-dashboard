'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, MessageSquare, Mail, MonitorSmartphone, Sparkles, ArrowRight, ChevronDown, Clock } from 'lucide-react';
import { api, fmt } from '@/lib/admin/api';
import { useLoad } from '@/lib/admin/useLoad';
import { useStore } from '@/lib/admin/store';
import { track } from '@/lib/admin/telemetry';
import { useToast } from '@/components/admin/Toast';
import { PageHeader, KpiTile, GlassCard, Button, StatusBadge, EmptyState, Skeleton, Select, Modal, type BadgeTone } from '@/components/admin/ui';
import { ErrorCard, CustomerLink } from '@/components/admin/shared';
import { renderMessage, type CustomerMessage, type MessageSuggestion, type MessageTemplateId, type MessageChannel, type MessageVars, type MessageCategory } from '@/lib/admin/messaging';
import type { Customer } from '@/lib/admin/types';

interface TemplateMeta { id: MessageTemplateId; label: string; description: string; category: MessageCategory; channelDefault: MessageChannel }
interface MessagesData { templates: TemplateMeta[]; suggestions: MessageSuggestion[]; messages: CustomerMessage[]; sent: number }
const SECTION = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };
const CAT_TONE: Record<MessageCategory, BadgeTone> = { lifecycle: 'teal', billing: 'warning', ops: 'info' };
const CHANNEL_ICON: Record<MessageChannel, React.ReactNode> = { email: <Mail className="w-3.5 h-3.5" />, in_app: <MonitorSmartphone className="w-3.5 h-3.5" /> };

interface Compose { customerId: string; templateId: MessageTemplateId; channel: MessageChannel; vars: MessageVars }

export default function MessagesPage() {
  const toast = useToast();
  const operator = useStore((s) => s.operator);
  const canSend = operator ? ['superadmin', 'ops', 'finance'].includes(operator.role) : false;
  const { state, reload } = useLoad<MessagesData>('messages');
  const { state: custState } = useLoad<Customer[]>('customers');
  const customers = custState.status === 'ok' ? custState.data : [];

  const [compose, setCompose] = useState<Compose | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [openMsg, setOpenMsg] = useState<string | null>(null);

  const d = state.status === 'ok' ? state.data : null;
  useMemo(() => { if (state.status === 'ok') track('messages_viewed', { suggestions: state.data.suggestions.length, sent: state.data.sent }); }, [state.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? id;
  const preview = compose ? renderMessage(compose.templateId, { ...compose.vars, customerName: customerName(compose.customerId) || 'there' }) : null;

  const openBlank = () => { setErr(null); setCompose({ customerId: '', templateId: (d?.templates[0]?.id ?? 'incident_notice'), channel: 'email', vars: {} as MessageVars }); };
  const openFromSuggestion = (s: MessageSuggestion) => { setErr(null); setCompose({ customerId: s.customerId, templateId: s.templateId, channel: s.channel, vars: s.vars }); };

  const send = async () => {
    if (!compose || !compose.customerId) { setErr('Pick a customer.'); return; }
    setBusy(true); setErr(null);
    const res = await api.post('messages/send', { customerId: compose.customerId, templateId: compose.templateId, channel: compose.channel, vars: compose.vars });
    setBusy(false);
    if (!res.ok) { setErr(res.error.message); return; }
    track('customer_message_sent', { template: compose.templateId, channel: compose.channel });
    toast.success('Message sent', `${compose.channel === 'email' ? 'Email' : 'In-app'} to ${customerName(compose.customerId)}.`);
    setCompose(null);
    reload();
  };

  return (
    <div className="max-w-[1100px] mx-auto pb-16">
      <PageHeader icon={<MessageSquare />} title="Customer messages" description="Close the loop: when the panel spots a key about to expire or a wallet running dry, tell the customer — email or in-app — from a small catalog of templates. The suggestions below come straight from the current signals. Every send is audit-logged." actions={
        canSend ? <Button size="sm" onClick={openBlank} icon={<Send className="w-4 h-4" />}>Compose</Button> : undefined
      } />

      {state.status === 'error' ? <div className="mt-6"><ErrorCard message={state.message} onRetry={reload} /></div> : (
        <>
          <motion.div {...SECTION} className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <KpiTile loading={!d} label="Suggested" value={d ? d.suggestions.length : ''} icon={<Sparkles />} hint="from live signals" />
            <KpiTile loading={!d} label="Sent" value={d ? d.sent : ''} icon={<Send />} hint="in the outbox" />
            <KpiTile loading={!d} label="Templates" value={d ? d.templates.length : ''} icon={<MessageSquare />} hint="lifecycle · billing · ops" />
            <KpiTile loading={!d} label="Channels" value={2} icon={<Mail />} hint="email · in-app" />
          </motion.div>

          {/* Suggestions */}
          <motion.div {...SECTION} transition={{ delay: 0.05 }}>
            <GlassCard className="p-5 mt-5">
              <div className="flex items-center gap-2 mb-3 flex-wrap"><Sparkles className="w-4 h-4 text-teal" /><h3 className="text-sm font-bold text-fg">Suggested messages</h3>{d && <StatusBadge tone="neutral">{d.suggestions.length}</StatusBadge>}</div>
              {!d ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
                : d.suggestions.length === 0 ? <EmptyState icon={<MessageSquare className="w-8 h-8" />} title="Nothing to send right now" description="No customer has an open key-expiry, low-wallet or trial signal that isn’t already handled." />
                : (
                  <ul className="space-y-2">{d.suggestions.map((s, i) => (
                    <li key={`${s.customerId}-${s.templateId}-${i}`} className="rounded-xl border border-border bg-surface px-3 py-2 flex items-center gap-3 flex-wrap">
                      <span className="text-fg-muted">{CHANNEL_ICON[s.channel]}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap"><span className="text-[13px] font-bold text-fg">{d.templates.find((t) => t.id === s.templateId)?.label ?? s.templateId}</span><CustomerLink id={s.customerId} name={s.customerName} /></div>
                        <div className="text-[11px] text-fg-muted">{s.reason}</div>
                      </div>
                      {canSend && <Button size="sm" variant="secondary" onClick={() => openFromSuggestion(s)} icon={<Send className="w-3.5 h-3.5" />}>Compose</Button>}
                    </li>
                  ))}</ul>
                )}
            </GlassCard>
          </motion.div>

          {/* Outbox */}
          <motion.div {...SECTION} transition={{ delay: 0.1 }}>
            <GlassCard className="p-5 mt-5">
              <div className="flex items-center gap-2 mb-3"><Clock className="w-4 h-4 text-teal" /><h3 className="text-sm font-bold text-fg">Outbox</h3>{d && <StatusBadge tone="neutral">{d.messages.length}</StatusBadge>}</div>
              {!d ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
                : d.messages.length === 0 ? <EmptyState icon={<Send className="w-8 h-8" />} title="No messages sent yet" description="Composed and suggested messages appear here once sent." />
                : (
                  <ul className="space-y-1.5">{d.messages.map((m) => (
                    <li key={m.id} className="rounded-xl border border-border bg-surface overflow-hidden">
                      <button type="button" onClick={() => setOpenMsg(openMsg === m.id ? null : m.id)} aria-expanded={openMsg === m.id} className="w-full text-left px-3 py-2 flex items-center gap-2 flex-wrap hover:bg-glass transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50">
                        <span className="text-fg-muted">{CHANNEL_ICON[m.channel]}</span>
                        <span className="text-[12px] font-bold text-fg truncate flex-1 min-w-[180px]">{m.subject}</span>
                        <CustomerLink id={m.customerId} name={m.customerName} />
                        <span className="text-[10px] text-fg-subtle">{m.to} · {fmt.ago(m.sentAt)} · {m.sentBy}</span>
                        <ChevronDown className={`w-4 h-4 text-fg-muted transition-transform ${openMsg === m.id ? 'rotate-180' : ''}`} />
                      </button>
                      <AnimatePresence initial={false}>
                        {openMsg === m.id && <motion.div key="b" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-border"><pre className="px-3 py-2 text-[11px] text-fg-muted whitespace-pre-wrap font-sans">{m.body}</pre></motion.div>}
                      </AnimatePresence>
                    </li>
                  ))}</ul>
                )}
            </GlassCard>
          </motion.div>

          <div className="mt-4 flex items-center gap-4 flex-wrap">
            <Link href="/admin/alerts" className="text-[11px] font-bold text-fg-muted hover:text-teal inline-flex items-center gap-1">Alerts <ArrowRight className="w-3 h-3" /></Link>
            <Link href="/admin/health" className="text-[11px] font-bold text-fg-muted hover:text-teal inline-flex items-center gap-1">Account health <ArrowRight className="w-3 h-3" /></Link>
          </div>
        </>
      )}

      {/* Compose */}
      <Modal open={compose !== null} onClose={() => setCompose(null)} title="Compose a customer message" description="Sent as the account team; the customer replies to support." widthClass="max-w-xl" footer={
        <div className="flex items-center justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setCompose(null)} disabled={busy}>Cancel</Button><Button size="sm" loading={busy} disabled={!compose?.customerId} onClick={send} icon={<Send className="w-4 h-4" />}>Send {compose?.channel === 'in_app' ? 'in-app' : 'email'}</Button></div>
      }>
        {compose && d && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">Customer</label>
                <Select aria-label="Customer" value={compose.customerId} onChange={(e) => setCompose({ ...compose, customerId: e.target.value })} className="text-[12px]"><option value="">Select…</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">Channel</label>
                <Select aria-label="Channel" value={compose.channel} onChange={(e) => setCompose({ ...compose, channel: e.target.value as MessageChannel })} className="text-[12px]"><option value="email">Email</option><option value="in_app">In-app</option></Select>
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">Template</label>
                <Select aria-label="Template" value={compose.templateId} onChange={(e) => setCompose({ ...compose, templateId: e.target.value as MessageTemplateId })} className="text-[12px]">{d.templates.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select>
                <p className="text-[11px] text-fg-muted mt-1 inline-flex items-center gap-1"><StatusBadge tone={CAT_TONE[d.templates.find((t) => t.id === compose.templateId)?.category ?? 'ops']}>{d.templates.find((t) => t.id === compose.templateId)?.category}</StatusBadge> {d.templates.find((t) => t.id === compose.templateId)?.description}</p>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-surface p-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted mb-1">Preview</div>
              <div className="text-[12px] font-bold text-fg">{preview?.subject}</div>
              <pre className="text-[11px] text-fg-muted whitespace-pre-wrap font-sans mt-1 max-h-[220px] overflow-auto">{preview?.body}</pre>
            </div>
            {err && <p role="alert" className="text-[12px] text-semantic-error">{err}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Webhook, Send, RefreshCw, ShieldCheck, CircleAlert, Check, Clock, Loader2,
  ChevronRight, Copy, ArrowRight, Signature, Radio,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/Toast';
import { track } from '@/lib/telemetry';
import { authHeaderValue } from '@/lib/api-config';
import RoleGuard from '@/components/RoleGuard';
import {
  PageHeader, GlassCard, KpiTile, Skeleton, StatusBadge, Button, EmptyState,
  type BadgeTone,
} from '@/components/ui';

type DeliveryStatus = 'pending' | 'delivered' | 'retrying' | 'failed';

interface DeliveryAttempt {
  number: number;
  at: string;
  outcome: 'delivered' | 'failed';
  status_code: number;
  latency_ms: number;
  detail: string;
}
interface DeliveryView {
  id: string;
  job_id: string;
  callback_url: string;
  event: string;
  status: DeliveryStatus;
  attempts: DeliveryAttempt[];
  attempt_count: number;
  max_attempts: number;
  created_at: string;
  scheduled_at: string;
  next_retry_at?: string;
  delivered_at?: string;
  signature: string;
  signature_header: string;
  payload_preview: string;
  payload_size: number;
  replayed: boolean;
}
interface DeliveryStats {
  total: number;
  delivered: number;
  retrying: number;
  failed: number;
  pending: number;
  success_rate: number;
  recent: DeliveryView[];
}

const STATUS_META: Record<DeliveryStatus, { label: string; tone: BadgeTone; text: string }> = {
  delivered: { label: 'Delivered', tone: 'success', text: 'text-semantic-success' },
  retrying: { label: 'Retrying', tone: 'warning', text: 'text-semantic-warning' },
  failed: { label: 'Dead-letter', tone: 'error', text: 'text-semantic-error' },
  pending: { label: 'Pending', tone: 'neutral', text: 'text-fg-muted' },
};

function relTime(iso?: string): string {
  if (!iso) return '';
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60000);
  const unit = m < 60 ? `${m}m` : `${Math.round(m / 60)}h`;
  return diff >= 0 ? `in ${unit}` : `${unit} ago`;
}

function WebhookDeliveriesInner() {
  const activeKeys = useStore((s) => s.activeKeys);
  const environment = useStore((s) => s.environment);
  const toast = useToast();
  const apiKey = activeKeys[0]?.key ?? '';

  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [stats, setStats] = useState<DeliveryStats | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [replayingId, setReplayingId] = useState<string | null>(null);

  // Test-job form
  const [kind, setKind] = useState<'people' | 'companies'>('people');
  const [inputs, setInputs] = useState('ceo@example.com\ncto@acme.com\nfounder@startup.io');
  const [callbackUrl, setCallbackUrl] = useState('https://hooks.your-app.com/zinbit/results');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/deliveries', { headers: { Authorization: authHeaderValue(apiKey) } });
      const body = (await res.json()) as { success?: boolean; data?: DeliveryStats; error?: { message?: string } };
      if (!res.ok || body.success === false || !body.data) throw new Error(body.error?.message || `Gateway returned ${res.status}`);
      setStats(body.data);
      setPhase('ready');
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load deliveries.');
      setPhase('error');
    }
  }, [apiKey]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { track('webhook_delivery_viewed', {}); }, []);

  // Poll while anything is still in flight, so the timeline advances live.
  const inFlight = stats ? stats.pending + stats.retrying > 0 : false;
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!inFlight) return;
    const t = setInterval(() => loadRef.current(), 4000);
    return () => clearInterval(t);
  }, [inFlight]);

  const submit = async () => {
    const list = inputs.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) { toast.error('Add some inputs', 'One identifier per line.'); return; }
    if (!callbackUrl.trim()) { toast.error('Add a callback URL', 'Where should we push the result?'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/jobs', {
        method: 'POST',
        headers: { Authorization: authHeaderValue(apiKey), 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: kind === 'people' ? 'people-search' : 'company-enrich', inputs: list, callback_url: callbackUrl.trim() }),
      });
      const body = (await res.json()) as { success?: boolean; data?: { id?: string; delivery_id?: string }; error?: { message?: string } };
      if (!res.ok || body.success === false) throw new Error(body.error?.message || `Gateway returned ${res.status}`);
      track('async_result_dispatched', { kind, inputs: list.length, has_callback: true });
      toast.success('Job submitted', `Result will be pushed to your endpoint when it finishes (job ${body.data?.id ?? ''}).`);
      await load();
    } catch (e) {
      toast.error('Submit failed', e instanceof Error ? e.message : 'Could not reach the gateway.');
    } finally {
      setSubmitting(false);
    }
  };

  const replay = async (id: string) => {
    setReplayingId(id);
    try {
      const res = await fetch(`/api/v1/deliveries/${id}/replay`, { method: 'POST', headers: { Authorization: authHeaderValue(apiKey) } });
      const body = (await res.json()) as { success?: boolean; error?: { message?: string } };
      if (!res.ok || body.success === false) throw new Error(body.error?.message || `Gateway returned ${res.status}`);
      track('webhook_delivery_replayed', { delivery: id });
      toast.success('Replayed', 'The delivery was re-driven and acknowledged.');
      await load();
    } catch (e) {
      toast.error('Replay failed', e instanceof Error ? e.message : 'Could not reach the gateway.');
    } finally {
      setReplayingId(null);
    }
  };

  const copySig = (v: string) => { navigator.clipboard?.writeText(v); toast.success('Copied', 'Signature copied.'); };

  const successRatePct = stats ? Math.round(stats.success_rate * 100) : 0;
  const deliveries = useMemo(() => stats?.recent ?? [], [stats]);

  return (
    <div className="max-w-[1100px] mx-auto">
      <PageHeader
        title="Result Delivery"
        description="Submit a long-running job with a callback URL and Zinbit pushes the signed result to your endpoint when it finishes — with automatic retries, a dead-letter queue, and one-click replay. No polling."
        icon={<Webhook />}
        actions={
          <button onClick={load} className="inline-flex items-center gap-1.5 text-xs font-bold text-fg-muted hover:text-teal transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        }
      />

      {/* Test dispatch */}
      <GlassCard className="p-5 mt-6">
        <div className="flex items-center gap-2 mb-3">
          <Radio className="w-4 h-4 text-teal" />
          <div className="text-sm font-bold text-fg">Push a result to your endpoint</div>
          <StatusBadge tone="neutral">{environment}</StatusBadge>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[160px_1fr] gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-1.5">Kind</div>
            <div className="flex lg:flex-col gap-1.5">
              {(['people', 'companies'] as const).map((k) => (
                <button key={k} onClick={() => setKind(k)}
                  className={`flex-1 px-3 py-2 rounded-lg border text-xs font-bold transition-colors ${kind === k ? 'border-teal/40 bg-teal/10 text-teal' : 'border-border bg-surface-2 text-fg-muted hover:border-border-strong'}`}>
                  {k === 'people' ? 'People' : 'Companies'}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-1.5">Inputs (one per line)</div>
              <textarea value={inputs} onChange={(e) => setInputs(e.target.value)} rows={3}
                className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-xs text-fg font-mono focus:border-teal outline-none resize-none" />
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
              <label className="flex-1">
                <span className="block text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-1.5">Callback URL</span>
                <input value={callbackUrl} onChange={(e) => setCallbackUrl(e.target.value)}
                  className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-sm text-fg font-mono focus:border-teal outline-none" />
              </label>
              <Button onClick={submit} disabled={submitting} className="shrink-0">
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : <><Send className="w-4 h-4" /> Submit job</>}
              </Button>
            </div>
            <p className="text-[11px] text-fg-subtle">Tip: a URL containing <code className="text-fg-muted">fail</code> exercises the retry → dead-letter path; one containing <code className="text-fg-muted">ok</code> always delivers first try.</p>
          </div>
        </div>
      </GlassCard>

      {phase === 'loading' && (
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      )}

      {phase === 'error' && (
        <GlassCard className="p-4 mt-6 border-semantic-error/30 bg-semantic-error/5 flex items-center gap-3">
          <CircleAlert className="w-5 h-5 text-semantic-error shrink-0" />
          <div className="text-sm text-fg flex-1">{error}</div>
          <Button onClick={load} variant="ghost" size="sm">Retry</Button>
        </GlassCard>
      )}

      {phase === 'ready' && stats && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <KpiTile label="Delivered" value={String(stats.delivered)} icon={<Check />} hint="Acknowledged 200" />
            <KpiTile label="Retrying" value={String(stats.retrying)} icon={<RefreshCw />} hint="Backing off" />
            <KpiTile label="Dead-letter" value={String(stats.failed)} icon={<CircleAlert />} hint="Exhausted retries" lowerIsBetter />
            <KpiTile label="Success rate" value={`${successRatePct}%`} icon={<ShieldCheck />} hint="Of terminal deliveries" />
          </div>

          {deliveries.length === 0 ? (
            <GlassCard className="mt-6">
              <EmptyState icon={<Webhook className="w-7 h-7" />} title="No deliveries yet" description="Submit a job with a callback URL above and the signed result lands here." />
            </GlassCard>
          ) : (
            <div className="mt-6 space-y-2">
              {deliveries.map((d, i) => {
                const meta = STATUS_META[d.status];
                const open = expanded === d.id;
                return (
                  <motion.div key={d.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.2) }}>
                    <GlassCard className="p-0 overflow-hidden">
                      <button onClick={() => setExpanded(open ? null : d.id)} className="w-full flex items-center gap-3 p-4 text-left hover:bg-surface-2/40 transition-colors">
                        <ChevronRight className={`w-4 h-4 text-fg-subtle shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-fg font-mono truncate">{d.callback_url}</span>
                            {d.replayed && <StatusBadge tone="neutral">replayed</StatusBadge>}
                          </div>
                          <div className="text-[11px] text-fg-subtle font-mono mt-0.5">{d.job_id} · {d.event}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                          <div className="text-[10px] text-fg-subtle mt-1">
                            {d.status === 'retrying' && d.next_retry_at ? `next ${relTime(d.next_retry_at)}` :
                             d.status === 'pending' ? `fires ${relTime(d.scheduled_at)}` :
                             `${d.attempt_count} attempt${d.attempt_count === 1 ? '' : 's'}`}
                          </div>
                        </div>
                      </button>

                      <AnimatePresence initial={false}>
                        {open && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-border-subtle">
                            <div className="p-4 space-y-4">
                              {/* Attempt timeline */}
                              <div>
                                <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-2">Delivery attempts</div>
                                <ol className="space-y-2">
                                  {d.attempts.map((a) => (
                                    <li key={a.number} className="flex items-start gap-3">
                                      <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border ${a.outcome === 'delivered' ? 'bg-semantic-success/10 border-semantic-success/30 text-semantic-success' : 'bg-semantic-error/10 border-semantic-error/30 text-semantic-error'}`}>
                                        {a.outcome === 'delivered' ? <Check className="w-3 h-3" /> : <CircleAlert className="w-3 h-3" />}
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-xs font-bold text-fg">Attempt {a.number}</span>
                                          <span className={`text-[11px] font-mono ${a.outcome === 'delivered' ? 'text-semantic-success' : 'text-semantic-error'}`}>{a.status_code === 0 ? 'timeout' : a.status_code}</span>
                                          <span className="text-[10px] text-fg-subtle">{a.latency_ms}ms · {relTime(a.at)}</span>
                                        </div>
                                        <div className="text-[11px] text-fg-muted">{a.detail}</div>
                                      </div>
                                    </li>
                                  ))}
                                  {d.status === 'retrying' && d.next_retry_at && (
                                    <li className="flex items-center gap-3 text-fg-subtle">
                                      <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 border border-border"><Clock className="w-3 h-3" /></span>
                                      <span className="text-[11px]">Next retry {relTime(d.next_retry_at)} (exponential backoff)</span>
                                    </li>
                                  )}
                                </ol>
                              </div>

                              {/* Signature + payload */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="bg-surface-2 border border-border rounded-xl p-3">
                                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-1.5"><Signature className="w-3 h-3" /> {d.signature_header}</div>
                                  <div className="flex items-start gap-2">
                                    <code className="text-[11px] font-mono text-fg-muted break-all flex-1">{d.signature}</code>
                                    <button onClick={() => copySig(`${d.signature_header}: ${d.signature}`)} className="text-teal hover:text-fg shrink-0"><Copy className="w-3.5 h-3.5" /></button>
                                  </div>
                                </div>
                                <div className="bg-surface-2 border border-border rounded-xl p-3">
                                  <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-1.5">Payload ({d.payload_size} bytes)</div>
                                  <code className="text-[11px] font-mono text-fg-muted break-all">{d.payload_preview}</code>
                                </div>
                              </div>

                              <div className="flex items-center justify-between">
                                <span className="text-[11px] text-fg-subtle">Signed with HMAC-SHA256 — verify against your endpoint&apos;s secret.</span>
                                {d.status !== 'delivered' && (
                                  <Button onClick={() => replay(d.id)} disabled={replayingId === d.id} variant="ghost" size="sm">
                                    {replayingId === d.id ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Replaying…</> : <><RefreshCw className="w-3.5 h-3.5" /> Replay</>}
                                  </Button>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </GlassCard>
                  </motion.div>
                );
              })}
            </div>
          )}

          <GlassCard className="p-5 mt-6 border-teal/20">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-teal/10 border border-teal/30 flex items-center justify-center shrink-0"><ShieldCheck className="w-4 h-4 text-teal" /></div>
              <div>
                <div className="text-sm font-bold text-fg">How delivery works</div>
                <p className="text-[13px] text-fg-muted mt-1 leading-relaxed">
                  Submit a job with <code className="text-teal">callback_url</code> and Zinbit POSTs the signed result to it at completion. A non-2xx response is retried with exponential backoff (0s · 30s · 2m · 10m); after the last attempt the delivery lands in the dead-letter queue, where you can replay it. Verify the <code className="text-teal">X-Zinbit-Signature</code> against your endpoint secret. See <Link href="/console/webhooks" className="text-teal font-semibold hover:text-fg transition-colors">Webhooks <ArrowRight className="w-3 h-3 inline" /></Link>, <Link href="/console/async-jobs" className="text-teal font-semibold hover:text-fg transition-colors">Async Jobs</Link>, and <Link href="/console/logs" className="text-teal font-semibold hover:text-fg transition-colors">Logs</Link>.
                </p>
              </div>
            </div>
          </GlassCard>
        </>
      )}
    </div>
  );
}

export default function WebhookDeliveriesPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer']}>
      <WebhookDeliveriesInner />
    </RoleGuard>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Route, Search, Loader2, CircleAlert, Fingerprint, Building2, MapPin, Mail, ArrowRight,
  Briefcase, TrendingUp, Plane, AtSign, GitCommitVertical, Clock,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/Toast';
import { track } from '@/lib/telemetry';
import { authHeaderValue } from '@/lib/api-config';
import RoleGuard from '@/components/RoleGuard';
import {
  PageHeader, GlassCard, KpiTile, Skeleton, StatusBadge, Button, EmptyState,
} from '@/components/ui';

type TransitionType = 'job_change' | 'promotion' | 'relocation' | 'email_change' | 'company_rebrand';
interface IdentityState {
  id: string; period_start: string; period_end: string | null; is_current: boolean;
  email: string; company: string; domain: string; title: string; seniority: string; location: string; duration_months: number;
}
interface IdentityTransition { at: string; type: TransitionType; from: string; to: string; detail: string }
interface IdentityHistory {
  zinbit_id: string; subject_email: string; current_state_id: string;
  states: IdentityState[]; transitions: IdentityTransition[]; span_years: number; employer_count: number; confidence: number; as_of: string;
}

const TRANSITION_ICON: Record<TransitionType, React.ElementType> = {
  job_change: Briefcase, promotion: TrendingUp, relocation: Plane, email_change: AtSign, company_rebrand: Building2,
};

function fmtPeriod(start: string, end: string | null): string {
  const f = (s: string) => { const [y, m] = s.split('-'); return `${['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m)]} ${y}`; };
  return `${f(start)} — ${end ? f(end) : 'Present'}`;
}
function fmtDuration(months: number): string {
  const y = Math.floor(months / 12); const m = months % 12;
  return [y ? `${y}y` : '', m ? `${m}mo` : ''].filter(Boolean).join(' ') || '<1mo';
}

function IdentityHistoryInner() {
  const activeKeys = useStore((s) => s.activeKeys);
  const environment = useStore((s) => s.environment);
  const toast = useToast();
  const apiKey = activeKeys[0]?.key ?? '';

  const [email, setEmail] = useState('sarah.chen@shopify.com');
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');
  const [data, setData] = useState<IdentityHistory | null>(null);

  const resolve = useCallback(async () => {
    if (!apiKey) { toast.error('No API key', 'Generate a key first.'); return; }
    if (!email.trim()) { toast.error('Enter an email', 'e.g. jane.doe@acme.com'); return; }
    setPhase('loading'); setError(''); setData(null);
    try {
      const res = await fetch(`/api/v1/people/identity-history?email=${encodeURIComponent(email.trim())}`, { headers: { Authorization: authHeaderValue(apiKey) } });
      const body = (await res.json()) as { success?: boolean; data?: IdentityHistory; error?: { message?: string } };
      if (res.status === 404 || (body.data && !body.data.states)) throw new Error('No identity history found for that email (it may be a personal or unresolvable address).');
      if (!res.ok || body.success === false || !body.data) throw new Error(body.error?.message || `Gateway returned ${res.status}`);
      setData(body.data);
      setPhase('ready');
      track('identity_history_resolved', { employers: body.data.employer_count, states: body.data.states.length, span_years: body.data.span_years });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reach the gateway.');
      setPhase('error');
    }
  }, [apiKey, email, toast]);

  useEffect(() => { track('identity_history_viewed', {}); }, []);

  // Transitions that happened at the boundary just above a given (older) state.
  const transitionsInto = (stateId: string) => (data?.transitions ?? []).filter((t) => t.to === stateId);

  return (
    <div className="max-w-[900px] mx-auto">
      <PageHeader
        title="Identity History"
        description="Trace how a contact's identity changed over their career — companies, emails, and titles — all tied together by one persistent Zinbit ID, so the same person stays one record across every move."
        icon={<Route />}
        actions={<StatusBadge tone="neutral">{environment}</StatusBadge>}
      />

      <GlassCard className="p-5 mt-6">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <label className="flex-1">
            <span className="block text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-1.5">Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') resolve(); }}
              className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-sm text-fg font-mono focus:border-teal outline-none" />
          </label>
          <Button onClick={resolve} disabled={phase === 'loading'} className="shrink-0">
            {phase === 'loading' ? <><Loader2 className="w-4 h-4 animate-spin" /> Tracing…</> : <><Search className="w-4 h-4" /> Trace identity</>}
          </Button>
        </div>
      </GlassCard>

      {phase === 'idle' && (
        <GlassCard className="mt-6">
          <EmptyState icon={<Route className="w-7 h-7" />} title="Trace a contact's career" description="Enter a work email to reconstruct the person's identity timeline across every company and address they've held." />
        </GlassCard>
      )}

      {phase === 'loading' && (
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      )}

      {phase === 'error' && (
        <GlassCard className="p-4 mt-6 border-semantic-error/30 bg-semantic-error/5 flex items-center gap-3">
          <CircleAlert className="w-5 h-5 text-semantic-error shrink-0" />
          <div className="text-sm text-fg">{error}</div>
        </GlassCard>
      )}

      {phase === 'ready' && data && (
        <>
          <GlassCard className="p-4 mt-6 border-teal/20 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal/10 border border-teal/30 flex items-center justify-center shrink-0"><Fingerprint className="w-5 h-5 text-teal" /></div>
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Persistent Zinbit ID</div>
              <div className="text-sm font-mono font-bold text-fg truncate">{data.zinbit_id}</div>
            </div>
            <Link href="/console/identity" className="ml-auto shrink-0 text-xs font-bold text-teal hover:text-fg transition-colors inline-flex items-center gap-1">Identity Resolution <ArrowRight className="w-3 h-3" /></Link>
          </GlassCard>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
            <KpiTile label="Employers" value={String(data.employer_count)} icon={<Building2 />} hint="Distinct companies" />
            <KpiTile label="Career span" value={`${data.span_years}y`} icon={<Clock />} hint="Tracked history" />
            <KpiTile label="Identity states" value={String(data.states.length)} icon={<GitCommitVertical />} hint="Across the timeline" />
            <KpiTile label="Transitions" value={String(data.transitions.length)} icon={<Route />} hint="Recorded changes" />
          </div>

          {/* Timeline */}
          <GlassCard className="p-5 mt-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-4">Identity timeline</div>
            <ol className="relative border-l border-border-subtle ml-3">
              {data.states.map((s, i) => (
                <li key={s.id} className="ml-6 pb-6 last:pb-0">
                  <span className={`absolute -left-[9px] w-4 h-4 rounded-full border-2 ${s.is_current ? 'bg-teal border-teal' : 'bg-surface border-border-strong'}`} />
                  <motion.div initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.05, 0.3) }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black text-fg">{s.company}</span>
                      {s.is_current && <StatusBadge tone="teal">Current</StatusBadge>}
                      <span className="text-[11px] text-fg-subtle">{fmtPeriod(s.period_start, s.period_end)} · {fmtDuration(s.duration_months)}</span>
                    </div>
                    <div className="text-[13px] text-fg-muted mt-0.5">{s.title} · {s.seniority}</div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-[12px] text-fg-subtle">
                      <span className="inline-flex items-center gap-1 font-mono"><Mail className="w-3 h-3" /> {s.email}</span>
                      <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {s.location}</span>
                    </div>

                    {/* Transitions that led OUT of this (older) state into the newer one */}
                    {transitionsInto(s.id).length > 0 && (
                      <div className="mt-2 space-y-1">
                        {transitionsInto(s.id).map((t, ti) => {
                          const Icon = TRANSITION_ICON[t.type];
                          return (
                            <div key={ti} className="flex items-center gap-2 text-[11px]">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 border ${t.type === 'promotion' ? 'text-semantic-success border-semantic-success/30 bg-semantic-success/10' : 'text-fg-muted border-border bg-surface-2'}`}>
                                <Icon className="w-3 h-3" /> {t.type.replace('_', ' ')}
                              </span>
                              <span className="text-fg-subtle truncate">{t.detail}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                </li>
              ))}
            </ol>
          </GlassCard>

          <GlassCard className="p-5 mt-4 border-teal/20">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-teal/10 border border-teal/30 flex items-center justify-center shrink-0"><Fingerprint className="w-4 h-4 text-teal" /></div>
              <div>
                <div className="text-sm font-bold text-fg">One identity, every address</div>
                <p className="text-[13px] text-fg-muted mt-1 leading-relaxed">
                  Every state above resolves to the same persistent Zinbit ID, so a contact who moved from an old address to a new one stays a single record — the key to keeping a CRM from decaying as people change jobs. Resolved via <code className="text-teal">GET /v1/people/identity-history</code>; the current state agrees with a direct <Link href="/console/studio?preset=person" className="text-teal font-semibold hover:text-fg transition-colors">person lookup <ArrowRight className="w-3 h-3 inline" /></Link>.
                </p>
              </div>
            </div>
          </GlassCard>
        </>
      )}
    </div>
  );
}

export default function IdentityHistoryPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <IdentityHistoryInner />
    </RoleGuard>
  );
}

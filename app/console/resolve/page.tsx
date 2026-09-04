'use client';

import React, { useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserSearch, Search, ArrowRight, Sparkles, ShieldCheck, Lock, Copy, Check,
  Mail, Phone, MapPin, Building2, Clock, Trash2, RefreshCw, ExternalLink, Info, Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useStore, type ResolutionRecord } from '@/lib/store';
import type { ResolvedPerson } from '@/lib/person-resolver';
import { getEndpointById } from '@/data/endpoints';
import { consoleApiUrl, authHeaderValue } from '@/lib/api-config';
import { track } from '@/lib/telemetry';
import RoleGuard from '@/components/RoleGuard';
import {
  PageHeader, KpiTile, GlassCard, Button, Input, StatusBadge, EmptyState, Skeleton, ConfirmAction,
} from '@/components/ui';
import type { BadgeTone } from '@/components/ui';

const ENDPOINT = getEndpointById('people-search')!;
const CREDIT_COST = ENDPOINT.creditCost;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EXAMPLES = ['jane.doe@acme.com', 'marcus@stripe.com', 'priya.nair@zomato.in', 'sam@gmail.com'];

type Phase = 'idle' | 'resolving' | 'resolved' | 'not_found' | 'error';

function confidenceTone(c: number): BadgeTone {
  if (c >= 0.85) return 'success';
  if (c >= 0.7) return 'teal';
  if (c >= 0.55) return 'warning';
  return 'error';
}
function confidenceLabel(c: number): string {
  if (c >= 0.85) return 'High confidence';
  if (c >= 0.7) return 'Good confidence';
  if (c >= 0.55) return 'Moderate';
  return 'Low confidence';
}
const initials = (p: ResolvedPerson) => `${p.first_name[0] ?? ''}${p.last_name[0] ?? ''}`.toUpperCase();
const domainOf = (email: string) => email.split('@')[1] ?? '';

export default function ResolvePage() {
  const { environment, activeKeys, deductCredits, incrementKeyUsage, resolvedPeople,
    addResolution, removeResolution, clearResolutions, isFirstCallMade, markFirstCallMade } = useStore();

  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [person, setPerson] = useState<ResolvedPerson | null>(null);
  const [meta, setMeta] = useState<{ message?: string; requestId?: string | null; durationMs?: number; status?: number }>({});
  const [copied, setCopied] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const key = activeKeys.find(k => k.environment === environment) ?? activeKeys[0];
  const apiKey = key?.key ?? '';
  const isLive = environment === 'live';

  const scoped = useMemo(
    () => resolvedPeople.filter(r => r.environment === environment),
    [resolvedPeople, environment]
  );

  const stats = useMemo(() => {
    const resolved = scoped.filter(r => r.status === 'resolved');
    const avg = resolved.length ? resolved.reduce((n, r) => n + r.confidence, 0) / resolved.length : 0;
    const domains = new Set(resolved.map(r => domainOf(r.email)).filter(Boolean));
    const credits = scoped.reduce((n, r) => n + (r.status === 'resolved' ? r.creditCost : 0), 0);
    return { total: resolved.length, avg, domains: domains.size, credits };
  }, [scoped]);

  const emailValid = EMAIL_RE.test(email.trim());
  const canResolve = emailValid && phase !== 'resolving' && !!apiKey;

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(c => (c === id ? null : c)), 1600);
  };

  async function resolve(targetEmail?: string) {
    const value = (targetEmail ?? email).trim().toLowerCase();
    if (!EMAIL_RE.test(value)) { setPhase('idle'); inputRef.current?.focus(); return; }
    setEmail(value);
    setPhase('resolving');
    setPerson(null);
    setMeta({});

    const startedAt = performance.now();
    const url = consoleApiUrl(ENDPOINT.path, { email: value });
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: authHeaderValue(apiKey), 'Content-Type': 'application/json' },
      });
      const durationMs = Math.round(performance.now() - startedAt);
      let body: unknown;
      try { body = await res.json(); } catch { body = { error: { message: 'Invalid response from gateway' } }; }
      const requestId = res.headers.get('x-request-id');

      useStore.getState().logApiRequest({
        id: requestId || `req_${Date.now().toString(36)}`,
        environment,
        timestamp: new Date().toISOString(),
        method: 'GET',
        path: ENDPOINT.path,
        status: res.status,
        duration: durationMs,
        ip: '::1',
        request: { headers: { Authorization: authHeaderValue(apiKey) }, parameters: { email: value } },
        response: body,
      });

      const data = body && typeof body === 'object' && 'data' in body ? (body as { data: unknown }).data : body;
      const resolvedPerson = data && typeof data === 'object' && 'person' in data
        ? ((data as { person: ResolvedPerson }).person) : null;

      if (res.ok && resolvedPerson) {
        deductCredits(CREDIT_COST);
        incrementKeyUsage(key?.id ?? '', CREDIT_COST);
        setPerson(resolvedPerson);
        setPhase('resolved');
        setMeta({ requestId, durationMs, status: res.status });
        addResolution({
          id: requestId || `res_${Date.now().toString(36)}`,
          email: value, person: resolvedPerson, status: 'resolved', environment,
          confidence: resolvedPerson.confidence, creditCost: CREDIT_COST, requestId, durationMs, timestamp: Date.now(),
        });
        track('person_resolved', { domain: domainOf(value), confidence: resolvedPerson.confidence, environment, durationMs, personal: resolvedPerson.is_personal_email });
        if (!isFirstCallMade) {
          markFirstCallMade({ endpoint: ENDPOINT.id, method: 'GET', statusCode: res.status, responseTime: durationMs, response: body });
        }
      } else if (res.status === 402) {
        setPhase('error');
        setMeta({ message: 'You are out of credits. Recharge to keep resolving.', requestId, durationMs, status: 402 });
        track('upgrade_prompt_shown', { surface: 'resolve', reason: 'out_of_credits' });
        track('person_resolution_failed', { domain: domainOf(value), environment, reason: 'out_of_credits' });
      } else if (res.status === 429) {
        setPhase('error');
        setMeta({ message: 'Rate limit reached. Please slow down and try again.', requestId, durationMs, status: 429 });
        track('person_resolution_failed', { domain: domainOf(value), environment, reason: 'rate_limited' });
      } else {
        const errMsg = (data && typeof data === 'object' && 'error' in data
          && (data as { error?: { message?: string } }).error?.message) || 'No person could be resolved for that email.';
        setPhase(res.ok ? 'not_found' : 'error');
        setMeta({ message: String(errMsg), requestId, durationMs, status: res.status });
        addResolution({
          id: requestId || `res_${Date.now().toString(36)}`, email: value, person: null,
          status: res.ok ? 'not_found' : 'error', environment, confidence: 0, creditCost: 0,
          requestId, durationMs, timestamp: Date.now(), message: String(errMsg),
        });
        track('person_resolution_failed', { domain: domainOf(value), environment, reason: res.ok ? 'not_found' : `http_${res.status}` });
      }
    } catch (e: unknown) {
      setPhase('error');
      setMeta({ message: e instanceof Error ? e.message : 'Network error reaching the gateway' });
      track('person_resolution_failed', { domain: domainOf(value), environment, reason: 'network' });
    }
  }

  const rerun = (r: ResolutionRecord) => { setEmail(r.email); resolve(r.email); };

  return (
    <RoleGuard allowedRoles={['admin', 'developer']} fallback={<UnauthorizedResolve />}>
      <div className="max-w-[1200px] mx-auto space-y-8">
        <PageHeader
          icon={<UserSearch />}
          title="Email → Person Resolution"
          description="Turn a work email into a full, verified person profile — with a confidence score and the exact signals behind every field. Runs against the live gateway and bills like production."
          actions={<StatusBadge tone={isLive ? 'warning' : 'teal'} dot>{isLive ? 'Live · PII masked' : 'Sandbox · full data'}</StatusBadge>}
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiTile label="Resolved" value={stats.total} icon={<UserSearch />} hint={`in ${environment}`} />
          <KpiTile label="Avg confidence" value={stats.total ? `${Math.round(stats.avg * 100)}%` : '—'} icon={<Sparkles />} hint="across resolved" />
          <KpiTile label="Unique domains" value={stats.domains} icon={<Building2 />} hint="companies seen" />
          <KpiTile label="Credits used" value={stats.credits} icon={<Zap />} hint={`${CREDIT_COST} per resolve`} />
        </div>

        <GlassCard className="p-5 md:p-6">
          <label htmlFor="resolve-email" className="block text-sm font-bold text-fg mb-2">Work email</label>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 min-w-0">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle pointer-events-none z-10" />
              <Input
                id="resolve-email"
                ref={inputRef}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canResolve) resolve(); }}
                placeholder="user@company.com"
                aria-label="Work email to resolve"
                autoComplete="off"
                spellCheck={false}
                className="pl-9"
              />
            </div>
            <Button onClick={() => resolve()} disabled={!canResolve} loading={phase === 'resolving'} className="shrink-0">
              {phase === 'resolving' ? 'Resolving' : <>Resolve <ArrowRight className="w-4 h-4" /></>}
            </Button>
          </div>
          <div className="flex items-center flex-wrap gap-2 mt-3">
            <span className="text-[11px] font-semibold text-fg-subtle">Try:</span>
            {EXAMPLES.map((ex) => (
              <button key={ex} onClick={() => { setEmail(ex); resolve(ex); }}
                className="text-[11px] font-mono px-2 py-1 rounded-md bg-glass hover:bg-glass-2 text-fg-muted hover:text-fg border border-border-subtle transition-colors">
                {ex}
              </button>
            ))}
            {email && !emailValid && <span className="text-[11px] font-semibold text-semantic-error ml-1">Enter a valid email address.</span>}
            {!apiKey && <span className="text-[11px] font-semibold text-semantic-warning ml-1">No {environment} key — create one in <Link href="/console/keys" className="underline">API Keys</Link>.</span>}
          </div>
        </GlassCard>

        <AnimatePresence mode="wait">
          {phase === 'resolving' && <ResolveSkeleton key="loading" />}
          {phase === 'resolved' && person && (
            <PersonProfile key="profile" person={person} isLive={isLive} meta={meta} copied={copied} onCopy={copy} />
          )}
          {phase === 'not_found' && (
            <motion.div key="nf" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <EmptyState icon={<Search className="w-8 h-8" />} title="No match found"
                description={meta.message || 'We could not resolve a person for that email. Double-check the address or try a corporate domain.'}
                action={<Button variant="secondary" onClick={() => inputRef.current?.focus()}>Try another email</Button>} />
            </motion.div>
          )}
          {phase === 'error' && (
            <motion.div key="err" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <GlassCard className="p-6 border-semantic-error/30">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-semantic-error/10 flex items-center justify-center shrink-0">
                    <Info className="w-5 h-5 text-semantic-error" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-fg">Resolution failed{meta.status ? ` · ${meta.status}` : ''}</h3>
                    <p className="text-sm text-fg-muted mt-1">{meta.message || 'Something went wrong reaching the gateway.'}</p>
                    <div className="flex items-center gap-2 mt-3">
                      <Button variant="secondary" onClick={() => resolve()}>Retry</Button>
                      {meta.status === 402 && (
                        <Link href="/console/billing" onClick={() => track('upgrade_prompt_clicked', { surface: 'resolve', reason: 'out_of_credits' })}>
                          <Button variant="primary">Recharge credits</Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          )}
          {phase === 'idle' && (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <EmptyState icon={<UserSearch className="w-8 h-8" />} title="Resolve your first identity"
                description="Enter a work email above, or tap an example. You'll get the person's role, company, verified contact points, and social profiles — with the confidence and sources behind each field." />
            </motion.div>
          )}
        </AnimatePresence>

        {scoped.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black uppercase tracking-widest text-fg-subtle flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" /> Recent resolutions
              </h3>
              <ConfirmAction onConfirm={clearResolutions} variant="ghost" size="sm" confirmLabel="Clear all?">Clear history</ConfirmAction>
            </div>
            <div className="rounded-2xl overflow-hidden border border-border divide-y divide-border">
              {scoped.slice(0, 12).map((r) => (
                <motion.div key={r.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="group flex items-center gap-3 bg-surface-2 hover:bg-glass transition-colors p-3">
                  <div className="w-8 h-8 rounded-lg bg-teal/10 text-teal flex items-center justify-center text-[11px] font-black shrink-0">
                    {r.person ? initials(r.person) : '—'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-fg truncate">{r.person?.full_name ?? r.email}</span>
                      {r.status === 'resolved'
                        ? <StatusBadge tone={confidenceTone(r.confidence)}>{Math.round(r.confidence * 100)}%</StatusBadge>
                        : <StatusBadge tone={r.status === 'not_found' ? 'neutral' : 'error'}>{r.status === 'not_found' ? 'No match' : 'Error'}</StatusBadge>}
                    </div>
                    <div className="text-[11px] text-fg-subtle font-mono truncate">{r.email}</div>
                  </div>
                  <button onClick={() => rerun(r)} aria-label="Re-run resolution"
                    className="p-2 rounded-lg text-fg-subtle hover:text-teal hover:bg-glass-2 transition-colors opacity-0 group-hover:opacity-100">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button onClick={() => removeResolution(r.id)} aria-label="Remove from history"
                    className="p-2 rounded-lg text-fg-subtle hover:text-semantic-error hover:bg-glass-2 transition-colors opacity-0 group-hover:opacity-100">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}

function PersonProfile({ person, isLive, meta, copied, onCopy }: {
  person: ResolvedPerson; isLive: boolean;
  meta: { requestId?: string | null; durationMs?: number };
  copied: string | null; onCopy: (t: string, id: string) => void;
}) {
  const mask = (v: string) => (isLive ? v.replace(/[^@.\s+()-]/g, '•') : v);
  const curl = `curl "${consoleApiUrl(ENDPOINT.path, { email: person.email })}" \\\n  -H "Authorization: Bearer <YOUR_KEY>"`;
  const fields: Array<{ icon: React.ElementType; label: string; value: string; verified?: boolean; masked?: boolean }> = [
    { icon: Mail, label: 'Email', value: mask(person.email), verified: person.email_verified, masked: isLive },
    { icon: Phone, label: 'Phone', value: mask(person.phone), verified: person.phone_verified, masked: isLive },
    { icon: Building2, label: 'Company', value: `${person.company} · ${person.company_domain}` },
    { icon: MapPin, label: 'Location', value: `${person.location} · ${person.timezone}` },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
      <GlassCard className="p-6">
        <div className="flex items-start gap-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal/30 to-teal/5 border border-teal/30 flex items-center justify-center text-xl font-black text-teal shrink-0">
            {initials(person)}
          </motion.div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-black text-fg">{person.full_name}</h2>
              <StatusBadge tone="info">{person.seniority}</StatusBadge>
              {person.is_personal_email && <StatusBadge tone="neutral">Personal email</StatusBadge>}
            </div>
            <p className="text-sm text-fg-muted mt-0.5">{person.title} · {person.department}</p>
            <div className="flex items-center gap-3 mt-3">
              <SocialLink href={person.linkedin_url} label="LinkedIn" />
              {person.github_url && <SocialLink href={person.github_url} label="GitHub" />}
              {person.twitter_url && <SocialLink href={person.twitter_url} label="X" />}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border rounded-xl overflow-hidden border border-border mt-5">
          {fields.map((f, i) => (
            <motion.div key={f.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}
              className="bg-surface-2 p-3.5">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-1">
                <f.icon className="w-3 h-3" /> {f.label}
                {f.verified && <ShieldCheck className="w-3 h-3 text-semantic-success" aria-label="Verified" />}
                {f.masked && <Lock className="w-3 h-3 text-fg-subtle" aria-label="Masked in live" />}
              </div>
              <div className="text-sm font-semibold text-fg font-mono break-all">{f.value}</div>
            </motion.div>
          ))}
        </div>

        <div className="flex items-center flex-wrap gap-2 mt-5">
          <Button variant="secondary" size="sm" onClick={() => onCopy(JSON.stringify(person, null, 2), 'json')}>
            {copied === 'json' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Copy JSON
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onCopy(curl, 'curl')}>
            {copied === 'curl' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Copy cURL
          </Button>
          <Link href={`/console/explorer?endpoint=${ENDPOINT.id}`}>
            <Button variant="ghost" size="sm">Open in Explorer <ExternalLink className="w-3.5 h-3.5" /></Button>
          </Link>
          <Link href="/console/logs">
            <Button variant="ghost" size="sm">View in Logs <ExternalLink className="w-3.5 h-3.5" /></Button>
          </Link>
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Confidence</span>
          <StatusBadge tone={confidenceTone(person.confidence)}>{confidenceLabel(person.confidence)}</StatusBadge>
        </div>
        <div className="flex items-baseline gap-2 mt-2">
          <span className="text-4xl font-black text-fg tabular-nums">{Math.round(person.confidence * 100)}</span>
          <span className="text-lg font-bold text-fg-muted">%</span>
        </div>
        <div className="h-2 rounded-full bg-glass mt-3 overflow-hidden">
          <motion.div initial={{ width: 0 }} animate={{ width: `${person.confidence * 100}%` }} transition={{ duration: 0.6, ease: 'easeOut' }}
            className="h-full rounded-full bg-teal" />
        </div>

        <div className="mt-5">
          <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Provenance — where each field came from</span>
          <ul className="mt-2 space-y-2">
            {person.provenance.map((p, i) => (
              <motion.li key={p.field} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}
                className="flex items-start gap-2.5">
                <div className="mt-1 w-1.5 h-1.5 rounded-full bg-teal shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-fg capitalize">{p.field.replace(/_/g, ' ')}</span>
                    <span className="text-[10px] font-mono tabular-nums text-fg-subtle">{Math.round(p.confidence * 100)}%</span>
                  </div>
                  <div className="text-[11px] text-fg-muted">{p.source} — {p.signal}</div>
                </div>
              </motion.li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between mt-5 pt-4 border-t border-border text-[11px] text-fg-subtle">
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Verified {person.last_verified}</span>
          <span className="font-mono">{meta.durationMs ?? 0}ms</span>
        </div>
      </GlassCard>
    </motion.div>
  );
}

function SocialLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="text-xs font-bold text-teal hover:text-fg transition-colors inline-flex items-center gap-1">
      {label} <ExternalLink className="w-3 h-3" />
    </a>
  );
}

function ResolveSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
      <GlassCard className="p-6">
        <div className="flex items-start gap-4">
          <Skeleton className="w-16 h-16 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2"><Skeleton className="h-3 w-20" /><Skeleton className="h-4 w-full" /></div>
          ))}
        </div>
      </GlassCard>
      <GlassCard className="p-5 space-y-3">
        <Skeleton className="h-3 w-24" /><Skeleton className="h-10 w-20" /><Skeleton className="h-2 w-full" />
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
      </GlassCard>
    </motion.div>
  );
}

function UnauthorizedResolve() {
  return (
    <div className="max-w-[1200px] mx-auto">
      <EmptyState icon={<Lock className="w-8 h-8" />} title="Resolution is for developers and admins"
        description="Your role can view usage and billing, but running enrichment consumes credits and API keys, which is limited to developer and admin roles." />
    </div>
  );
}

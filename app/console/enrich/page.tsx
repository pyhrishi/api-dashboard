'use client';

import React, { useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Search, ArrowRight, Sparkles, Copy, Check, Lock, Users, MapPin, Clock,
  Trash2, RefreshCw, ExternalLink, Info, Zap, Cpu, Banknote, CalendarDays, Factory, Globe,
} from 'lucide-react';
import Link from 'next/link';
import { useStore, type CompanyEnrichmentRecord } from '@/lib/store';
import { normalizeDomain, isValidDomain, type EnrichedCompany } from '@/lib/company-resolver';
import { getEndpointById } from '@/data/endpoints';
import { consoleApiUrl, authHeaderValue } from '@/lib/api-config';
import { track } from '@/lib/telemetry';
import RoleGuard from '@/components/RoleGuard';
import {
  PageHeader, KpiTile, GlassCard, Button, Input, StatusBadge, EmptyState, Skeleton, ConfirmAction,
} from '@/components/ui';
import type { BadgeTone } from '@/components/ui';

const ENDPOINT = getEndpointById('company-enrich')!;
const CREDIT_COST = ENDPOINT.creditCost;
const EXAMPLES = ['stripe.com', 'zomato.com', 'datadoghq.com', 'shopify.com'];

type Phase = 'idle' | 'enriching' | 'enriched' | 'not_found' | 'error';

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
const fmtMoney = (n: number) => (n >= 1_000_000_000 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1_000_000 ? `$${Math.round(n / 1e6)}M` : n > 0 ? `$${n.toLocaleString()}` : '—');

export default function EnrichPage() {
  const { environment, activeKeys, deductCredits, incrementKeyUsage, enrichedCompanies,
    addCompanyEnrichment, removeCompanyEnrichment, clearCompanyEnrichments, isFirstCallMade, markFirstCallMade } = useStore();

  const [domain, setDomain] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [company, setCompany] = useState<EnrichedCompany | null>(null);
  const [meta, setMeta] = useState<{ message?: string; requestId?: string | null; durationMs?: number; status?: number }>({});
  const [copied, setCopied] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const key = activeKeys.find(k => k.environment === environment) ?? activeKeys[0];
  const apiKey = key?.key ?? '';
  const isLive = environment === 'live';

  const scoped = useMemo(() => enrichedCompanies.filter(r => r.environment === environment), [enrichedCompanies, environment]);

  const stats = useMemo(() => {
    const ok = scoped.filter(r => r.status === 'enriched' && r.company);
    const avg = ok.length ? ok.reduce((n, r) => n + r.confidence, 0) / ok.length : 0;
    const industries = new Set(ok.map(r => r.company!.industry));
    const credits = scoped.reduce((n, r) => n + (r.status === 'enriched' ? r.creditCost : 0), 0);
    return { total: ok.length, avg, industries: industries.size, credits };
  }, [scoped]);

  const normalized = normalizeDomain(domain);
  const domainValid = isValidDomain(normalized);
  const canEnrich = domainValid && phase !== 'enriching' && !!apiKey;

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(c => (c === id ? null : c)), 1600);
  };

  async function enrich(target?: string) {
    const value = normalizeDomain(target ?? domain);
    if (!isValidDomain(value)) { setPhase('idle'); inputRef.current?.focus(); return; }
    setDomain(value);
    setPhase('enriching');
    setCompany(null);
    setMeta({});

    const startedAt = performance.now();
    const url = consoleApiUrl(ENDPOINT.path, { domain: value });
    try {
      const res = await fetch(url, { method: 'GET', headers: { Authorization: authHeaderValue(apiKey), 'Content-Type': 'application/json' } });
      const durationMs = Math.round(performance.now() - startedAt);
      let body: unknown;
      try { body = await res.json(); } catch { body = { error: { message: 'Invalid response from gateway' } }; }
      const requestId = res.headers.get('x-request-id');

      useStore.getState().logApiRequest({
        id: requestId || `req_${Date.now().toString(36)}`,
        environment, timestamp: new Date().toISOString(), method: 'GET', path: ENDPOINT.path,
        status: res.status, duration: durationMs, ip: '::1',
        request: { headers: { Authorization: authHeaderValue(apiKey) }, parameters: { domain: value } },
        response: body,
      });

      const data = body && typeof body === 'object' && 'data' in body ? (body as { data: unknown }).data : body;
      const enriched = data && typeof data === 'object' && 'company' in data ? (data as { company: EnrichedCompany }).company : null;

      if (res.ok && enriched) {
        deductCredits(CREDIT_COST);
        incrementKeyUsage(key?.id ?? '', CREDIT_COST);
        setCompany(enriched);
        setPhase('enriched');
        setMeta({ requestId, durationMs, status: res.status });
        addCompanyEnrichment({
          id: requestId || `enr_${Date.now().toString(36)}`, domain: value, company: enriched, status: 'enriched',
          environment, confidence: enriched.confidence, creditCost: CREDIT_COST, requestId, durationMs, timestamp: Date.now(),
        });
        track('company_enriched', { domain: value, industry: enriched.industry, employees: enriched.employee_count, confidence: enriched.confidence, environment, durationMs });
        if (!isFirstCallMade) markFirstCallMade({ endpoint: ENDPOINT.id, method: 'GET', statusCode: res.status, responseTime: durationMs, response: body });
      } else if (res.status === 402) {
        setPhase('error');
        setMeta({ message: 'You are out of credits. Recharge to keep enriching.', requestId, durationMs, status: 402 });
        track('upgrade_prompt_shown', { surface: 'enrich', reason: 'out_of_credits' });
        track('company_enrichment_failed', { domain: value, environment, reason: 'out_of_credits' });
      } else if (res.status === 429) {
        setPhase('error');
        setMeta({ message: 'Rate limit reached. Please slow down and try again.', requestId, durationMs, status: 429 });
        track('company_enrichment_failed', { domain: value, environment, reason: 'rate_limited' });
      } else {
        const errMsg = (data && typeof data === 'object' && 'error' in data && (data as { error?: { message?: string } }).error?.message)
          || 'That domain could not be enriched.';
        setPhase(res.ok ? 'not_found' : 'error');
        setMeta({ message: String(errMsg), requestId, durationMs, status: res.status });
        addCompanyEnrichment({
          id: requestId || `enr_${Date.now().toString(36)}`, domain: value, company: null, status: res.ok ? 'not_found' : 'error',
          environment, confidence: 0, creditCost: 0, requestId, durationMs, timestamp: Date.now(), message: String(errMsg),
        });
        track('company_enrichment_failed', { domain: value, environment, reason: res.ok ? 'not_found' : `http_${res.status}` });
      }
    } catch (e: unknown) {
      setPhase('error');
      setMeta({ message: e instanceof Error ? e.message : 'Network error reaching the gateway' });
      track('company_enrichment_failed', { domain: value, environment, reason: 'network' });
    }
  }

  const rerun = (r: CompanyEnrichmentRecord) => { setDomain(r.domain); enrich(r.domain); };

  return (
    <RoleGuard allowedRoles={['admin', 'developer']} fallback={<UnauthorizedEnrich />}>
      <div className="max-w-[1200px] mx-auto space-y-8">
        <PageHeader
          icon={<Building2 />}
          title="Domain → Company Enrichment"
          description="Turn a bare domain into a full company dossier — firmographics, headcount, tech stack, and funding — each field tagged with its source and confidence. Runs against the live gateway and bills like production."
          actions={<StatusBadge tone={isLive ? 'warning' : 'teal'} dot>{isLive ? 'Live' : 'Sandbox · full data'}</StatusBadge>}
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiTile label="Enriched" value={stats.total} icon={<Building2 />} hint={`in ${environment}`} />
          <KpiTile label="Avg confidence" value={stats.total ? `${Math.round(stats.avg * 100)}%` : '—'} icon={<Sparkles />} hint="across enriched" />
          <KpiTile label="Industries" value={stats.industries} icon={<Factory />} hint="distinct sectors" />
          <KpiTile label="Credits used" value={stats.credits} icon={<Zap />} hint={`${CREDIT_COST} per enrich`} />
        </div>

        <GlassCard className="p-5 md:p-6">
          <label htmlFor="enrich-domain" className="block text-sm font-bold text-fg mb-2">Company domain</label>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 min-w-0">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle pointer-events-none z-10" />
              <Input id="enrich-domain" ref={inputRef} value={domain}
                onChange={(e) => setDomain(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canEnrich) enrich(); }}
                placeholder="company.com" aria-label="Company domain to enrich" autoComplete="off" spellCheck={false} className="pl-9" />
            </div>
            <Button onClick={() => enrich()} disabled={!canEnrich} loading={phase === 'enriching'} className="shrink-0">
              {phase === 'enriching' ? 'Enriching' : <>Enrich <ArrowRight className="w-4 h-4" /></>}
            </Button>
          </div>
          <div className="flex items-center flex-wrap gap-2 mt-3">
            <span className="text-[11px] font-semibold text-fg-subtle">Try:</span>
            {EXAMPLES.map((ex) => (
              <button key={ex} onClick={() => { setDomain(ex); enrich(ex); }}
                className="text-[11px] font-mono px-2 py-1 rounded-md bg-glass hover:bg-glass-2 text-fg-muted hover:text-fg border border-border-subtle transition-colors">
                {ex}
              </button>
            ))}
            {domain && !domainValid && <span className="text-[11px] font-semibold text-semantic-error ml-1">Enter a valid domain (e.g. company.com).</span>}
            {!apiKey && <span className="text-[11px] font-semibold text-semantic-warning ml-1">No {environment} key — create one in <Link href="/console/keys" className="underline">API Keys</Link>.</span>}
          </div>
        </GlassCard>

        <AnimatePresence mode="wait">
          {phase === 'enriching' && <EnrichSkeleton key="loading" />}
          {phase === 'enriched' && company && (
            <CompanyDossier key="dossier" company={company} isLive={isLive} meta={meta} copied={copied} onCopy={copy} />
          )}
          {phase === 'not_found' && (
            <motion.div key="nf" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <EmptyState icon={<Search className="w-8 h-8" />} title="Could not enrich that domain"
                description={meta.message || 'We could not build a company profile for that domain. Try a corporate domain.'}
                action={<Button variant="secondary" onClick={() => inputRef.current?.focus()}>Try another domain</Button>} />
            </motion.div>
          )}
          {phase === 'error' && (
            <motion.div key="err" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <GlassCard className="p-6 border-semantic-error/30">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-semantic-error/10 flex items-center justify-center shrink-0"><Info className="w-5 h-5 text-semantic-error" /></div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-fg">Enrichment failed{meta.status ? ` · ${meta.status}` : ''}</h3>
                    <p className="text-sm text-fg-muted mt-1">{meta.message || 'Something went wrong reaching the gateway.'}</p>
                    <div className="flex items-center gap-2 mt-3">
                      <Button variant="secondary" onClick={() => enrich()}>Retry</Button>
                      {meta.status === 402 && (
                        <Link href="/console/billing" onClick={() => track('upgrade_prompt_clicked', { surface: 'enrich', reason: 'out_of_credits' })}>
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
              <EmptyState icon={<Building2 className="w-8 h-8" />} title="Enrich your first company"
                description="Enter a domain above, or tap an example. You'll get firmographics, headcount, revenue band, tech stack, and funding — each field tagged with its source and confidence." />
            </motion.div>
          )}
        </AnimatePresence>

        {scoped.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black uppercase tracking-widest text-fg-subtle flex items-center gap-2"><Clock className="w-3.5 h-3.5" /> Recent enrichments</h3>
              <ConfirmAction onConfirm={clearCompanyEnrichments} variant="ghost" size="sm" confirmLabel="Clear all?">Clear history</ConfirmAction>
            </div>
            <div className="rounded-2xl overflow-hidden border border-border divide-y divide-border">
              {scoped.slice(0, 12).map((r) => (
                <motion.div key={r.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="group flex items-center gap-3 bg-surface-2 hover:bg-glass transition-colors p-3">
                  <div className="w-8 h-8 rounded-lg bg-teal/10 text-teal flex items-center justify-center text-[10px] font-black shrink-0">{r.company?.logo_initials ?? '—'}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-fg truncate">{r.company?.name ?? r.domain}</span>
                      {r.status === 'enriched'
                        ? <StatusBadge tone={confidenceTone(r.confidence)}>{Math.round(r.confidence * 100)}%</StatusBadge>
                        : <StatusBadge tone={r.status === 'not_found' ? 'neutral' : 'error'}>{r.status === 'not_found' ? 'No match' : 'Error'}</StatusBadge>}
                    </div>
                    <div className="text-[11px] text-fg-subtle font-mono truncate">{r.domain}{r.company ? ` · ${r.company.industry}` : ''}</div>
                  </div>
                  <button onClick={() => rerun(r)} aria-label="Re-run enrichment" className="p-2 rounded-lg text-fg-subtle hover:text-teal hover:bg-glass-2 transition-colors opacity-0 group-hover:opacity-100"><RefreshCw className="w-4 h-4" /></button>
                  <button onClick={() => removeCompanyEnrichment(r.id)} aria-label="Remove from history" className="p-2 rounded-lg text-fg-subtle hover:text-semantic-error hover:bg-glass-2 transition-colors opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}

function CompanyDossier({ company, isLive, meta, copied, onCopy }: {
  company: EnrichedCompany; isLive: boolean;
  meta: { requestId?: string | null; durationMs?: number };
  copied: string | null; onCopy: (t: string, id: string) => void;
}) {
  const curl = `curl "${consoleApiUrl(ENDPOINT.path, { domain: company.domain })}" \\\n  -H "Authorization: Bearer <YOUR_KEY>"`;
  const facts: Array<{ icon: React.ElementType; label: string; value: string }> = [
    { icon: Users, label: 'Headcount', value: `${company.employee_count.toLocaleString()} · ${company.employee_band}` },
    { icon: Banknote, label: 'Revenue band', value: company.revenue_band },
    { icon: CalendarDays, label: 'Founded', value: String(company.founded_year) },
    { icon: MapPin, label: 'Headquarters', value: `${company.hq_city}, ${company.hq_country}` },
    { icon: Factory, label: 'Industry', value: `${company.industry} · ${company.sub_industry}` },
    { icon: Banknote, label: 'Funding', value: `${company.funding_stage}${company.total_raised_usd ? ` · ${fmtMoney(company.total_raised_usd)} raised` : ''}` },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
      <GlassCard className="p-6">
        <div className="flex items-start gap-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal/30 to-teal/5 border border-teal/30 flex items-center justify-center text-lg font-black text-teal shrink-0">
            {company.logo_initials}
          </motion.div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-black text-fg">{company.name}</h2>
              <StatusBadge tone="info">{company.type}</StatusBadge>
              {company.is_personal_domain && <StatusBadge tone="neutral">Personal domain</StatusBadge>}
            </div>
            <p className="text-xs text-fg-subtle font-mono mt-0.5">{company.legal_name} · {company.domain}</p>
            <p className="text-sm text-fg-muted mt-2">{company.description}</p>
            <div className="flex items-center gap-3 mt-3">
              <a href={company.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-teal hover:text-fg transition-colors inline-flex items-center gap-1">LinkedIn <ExternalLink className="w-3 h-3" /></a>
              {company.twitter_url && <a href={company.twitter_url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-teal hover:text-fg transition-colors inline-flex items-center gap-1">X <ExternalLink className="w-3 h-3" /></a>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border rounded-xl overflow-hidden border border-border mt-5">
          {facts.map((f, i) => (
            <motion.div key={f.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }} className="bg-surface-2 p-3.5">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-1"><f.icon className="w-3 h-3" /> {f.label}</div>
              <div className="text-sm font-semibold text-fg">{f.value}</div>
            </motion.div>
          ))}
        </div>

        <div className="mt-5">
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-2"><Cpu className="w-3 h-3" /> Tech stack</div>
          <div className="flex flex-wrap gap-1.5">
            {company.tech_stack.map((t) => (
              <span key={t} className="text-[11px] font-semibold px-2 py-1 rounded-md bg-glass text-fg-muted border border-border-subtle">{t}</span>
            ))}
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2 mt-5">
          <Button variant="secondary" size="sm" onClick={() => onCopy(JSON.stringify(company, null, 2), 'json')}>
            {copied === 'json' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Copy JSON
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onCopy(curl, 'curl')}>
            {copied === 'curl' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Copy cURL
          </Button>
          <Link href={`/console/explorer?endpoint=company-employees`}>
            <Button variant="ghost" size="sm">People at this company <ExternalLink className="w-3.5 h-3.5" /></Button>
          </Link>
          <Link href="/console/logs">
            <Button variant="ghost" size="sm">View in Logs <ExternalLink className="w-3.5 h-3.5" /></Button>
          </Link>
        </div>
        {isLive && <p className="text-[11px] text-fg-subtle mt-3 flex items-center gap-1"><Lock className="w-3 h-3" /> Live keys mask any contact-level PII; firmographics are returned in full.</p>}
      </GlassCard>

      <GlassCard className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Confidence</span>
          <StatusBadge tone={confidenceTone(company.confidence)}>{confidenceLabel(company.confidence)}</StatusBadge>
        </div>
        <div className="flex items-baseline gap-2 mt-2">
          <span className="text-4xl font-black text-fg tabular-nums">{Math.round(company.confidence * 100)}</span>
          <span className="text-lg font-bold text-fg-muted">%</span>
        </div>
        <div className="h-2 rounded-full bg-glass mt-3 overflow-hidden">
          <motion.div initial={{ width: 0 }} animate={{ width: `${company.confidence * 100}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} className="h-full rounded-full bg-teal" />
        </div>
        <div className="mt-5">
          <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Provenance — where each field came from</span>
          <ul className="mt-2 space-y-2">
            {company.provenance.map((p, i) => (
              <motion.li key={p.field} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }} className="flex items-start gap-2.5">
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
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Verified {company.last_verified}</span>
          <span className="font-mono">{meta.durationMs ?? 0}ms</span>
        </div>
      </GlassCard>
    </motion.div>
  );
}

function EnrichSkeleton() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
      <GlassCard className="p-6">
        <div className="flex items-start gap-4">
          <Skeleton className="w-16 h-16 rounded-2xl" />
          <div className="flex-1 space-y-2"><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-64" /><Skeleton className="h-4 w-full" /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
          {Array.from({ length: 6 }).map((_, i) => (<div key={i} className="space-y-2"><Skeleton className="h-3 w-20" /><Skeleton className="h-4 w-full" /></div>))}
        </div>
      </GlassCard>
      <GlassCard className="p-5 space-y-3">
        <Skeleton className="h-3 w-24" /><Skeleton className="h-10 w-20" /><Skeleton className="h-2 w-full" />
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
      </GlassCard>
    </motion.div>
  );
}

function UnauthorizedEnrich() {
  return (
    <div className="max-w-[1200px] mx-auto">
      <EmptyState icon={<Lock className="w-8 h-8" />} title="Enrichment is for developers and admins"
        description="Your role can view usage and billing, but running enrichment consumes credits and API keys, which is limited to developer and admin roles." />
    </div>
  );
}

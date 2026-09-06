'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Waypoints, Search, Play, RefreshCw, AlertTriangle, Copy, Check, ExternalLink,
  BadgeCheck, CircleX, Fingerprint, ArrowRight, ClipboardCopy, Sparkles, Network,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { authHeaderValue } from '@/lib/api-config';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import RoleGuard from '@/components/RoleGuard';
import { PageHeader, KpiTile, GlassCard, Button, Input, EmptyState, Skeleton, StatusBadge, type BadgeTone } from '@/components/ui';
import type { XrefResolution, CrossReference, SystemCategory } from '@/lib/xref-resolver';

const EXAMPLES = ['stripe.com', 'SHOP', 'jane.doe@acme.com', 'notion.so'];

const CATEGORY_LABEL: Record<SystemCategory, string> = {
  internal: 'Zinbit & natural keys', crm: 'CRM systems', 'data-provider': 'Data providers', social: 'Social', registry: 'Registries', financial: 'Financial',
};
const CATEGORY_ORDER: SystemCategory[] = ['internal', 'crm', 'data-provider', 'social', 'registry', 'financial'];

function confTone(c: number): BadgeTone {
  if (c >= 0.85) return 'success'; if (c >= 0.6) return 'teal'; if (c >= 0.4) return 'warning'; return 'error';
}

function ReferenceRow({ r }: { r: CrossReference }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(r.id).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }).catch(() => {});
  };
  return (
    <motion.li
      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-[12px] transition-colors ${r.matched ? 'border-teal/40 bg-teal/10' : 'border-border bg-surface-2 hover:border-border'}`}
    >
      <span className="min-w-0 w-44 shrink-0 flex items-center gap-1.5">
        {r.canonical && <BadgeCheck className="w-4 h-4 text-teal shrink-0" />}
        <span className="truncate text-fg font-semibold">{r.label}</span>
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-fg-muted">{r.id}</span>
      {r.matched && <StatusBadge tone="info">matched</StatusBadge>}
      <StatusBadge tone={confTone(r.confidence)}>{Math.round(r.confidence * 100)}%</StatusBadge>
      <button onClick={copy} aria-label={`Copy ${r.label} identifier`} className="text-fg-subtle hover:text-fg transition-colors shrink-0">
        {copied ? <Check className="w-4 h-4 text-teal" /> : <Copy className="w-4 h-4" />}
      </button>
      {r.url ? (
        <a href={r.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${r.label}`} className="text-fg-subtle hover:text-teal transition-colors shrink-0">
          <ExternalLink className="w-4 h-4" />
        </a>
      ) : (
        <span className="w-4 shrink-0" />
      )}
    </motion.li>
  );
}

function XrefInner() {
  const { activeKeys, environment } = useStore();
  const toast = useToast();
  const apiKey = useMemo(() => activeKeys.find(k => k.environment === environment)?.key ?? activeKeys[0]?.key ?? '', [activeKeys, environment]);

  const [value, setValue] = useState('');
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ok' | 'not_found' | 'error'>('idle');
  const [result, setResult] = useState<XrefResolution | null>(null);

  const run = useCallback(async (raw?: string) => {
    const q = (raw ?? value).trim();
    if (!q) return;
    setValue(q); setPhase('loading');
    try {
      const res = await fetch(`/api/v1/identity/xref?query=${encodeURIComponent(q)}`, { headers: { Authorization: authHeaderValue(apiKey) } });
      const body = await res.json();
      const data = body?.data;
      if (data && Array.isArray(data.references) && typeof data.zinbit_id === 'string') {
        setResult(data as XrefResolution); setPhase('ok');
        track('cross_reference_resolved', { query: q, input_system: data.input_system, entity_type: data.entity_type, reference_count: data.references.length, resolution_path: data.resolution_path, confidence: data.confidence, environment });
      } else {
        setPhase('not_found');
      }
    } catch {
      setPhase('error');
    }
  }, [value, apiKey, environment]);

  useEffect(() => { track('cross_reference_viewed', { environment }); }, [environment]);

  const byCat = useMemo(() => {
    const m = new Map<SystemCategory, CrossReference[]>();
    (result?.references ?? []).forEach((r) => { const list = m.get(r.category) ?? []; list.push(r); m.set(r.category, list); });
    return m;
  }, [result]);

  const withUrl = result ? result.references.filter((r) => r.url).length : 0;

  const exportJson = useCallback(() => {
    if (!result) return;
    navigator.clipboard?.writeText(JSON.stringify(result, null, 2)).then(() => {
      toast.success('ID map copied', 'The full cross-reference map is on your clipboard as JSON.');
      track('cross_reference_exported', { query: result.input, entity_type: result.entity_type, reference_count: result.references.length, environment });
    }).catch(() => {});
  }, [result, toast, environment]);

  return (
    <div className="max-w-[1100px] mx-auto pb-16">
      <PageHeader
        icon={<Waypoints />}
        title="Cross-reference ID map"
        description="Paste any identifier from any system — a domain, a corporate email, a company name or ticker, a LinkedIn or Crunchbase URL, a Salesforce/HubSpot record ID, a DUNS number, or a Zinbit ID — and get the same entity's ID in every other system, each with a public URL where one exists, all unified under one persistent Zinbit ID. The Rosetta Stone for joining records across your stack."
        actions={<Link href="/console/studio?preset=zid"><Button variant="secondary" size="sm"><Fingerprint className="w-4 h-4" /> Zinbit ID</Button></Link>}
      />

      <GlassCard className="p-5 mt-6">
        <label htmlFor="xref-input" className="block text-sm font-bold text-fg mb-2">Resolve an identifier</label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-fg-subtle absolute left-3 top-1/2 -translate-y-1/2" />
            <Input id="xref-input" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') run(); }} placeholder="domain · email · name · ticker · URL · CRM/DUNS id · Zinbit ID" className="pl-9" autoComplete="off" />
          </div>
          <Button onClick={() => run()} disabled={!value.trim() || phase === 'loading'}>{phase === 'loading' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Map IDs</Button>
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-[11px] text-fg-subtle">Try:</span>
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => run(ex)} className="text-[11px] font-mono px-2 py-1 rounded-md bg-glass text-fg-muted border border-border-subtle hover:text-teal hover:border-teal/30 transition-colors">{ex}</button>
          ))}
        </div>
      </GlassCard>

      {phase === 'loading' && (
        <div className="mt-6 space-y-3"><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-40 rounded-2xl" /><Skeleton className="h-40 rounded-2xl" /></div>
      )}

      {phase === 'error' && (
        <GlassCard className="p-0 overflow-hidden mt-6">
          <EmptyState icon={<AlertTriangle className="w-8 h-8" />} title="Couldn’t resolve" description="The gateway didn’t respond. Check your API key and try again." action={<Button variant="secondary" size="sm" onClick={() => run()}><RefreshCw className="w-4 h-4" /> Retry</Button>} />
        </GlassCard>
      )}

      {phase === 'not_found' && (
        <GlassCard className="p-0 overflow-hidden mt-6">
          <EmptyState icon={<Network className="w-8 h-8" />} title="No entity for that identifier" description="Couldn’t map that input to a known entity. Try a company domain, a corporate email, a company name or ticker, a profile URL, or a Zinbit ID." />
        </GlassCard>
      )}

      {phase === 'idle' && (
        <GlassCard className="p-0 overflow-hidden mt-6">
          <EmptyState icon={<Waypoints className="w-8 h-8" />} title="Map an identifier across systems" description="Enter any identifier (or tap an example) to see the same entity’s ID in every system — CRM, data providers, social, registries — each with a public URL, all keyed to one Zinbit ID." />
        </GlassCard>
      )}

      {phase === 'ok' && result && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6">
          {/* Entity header */}
          <GlassCard className="p-5">
            <div className="flex items-start gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-bold text-fg truncate">{result.canonical}</h3>
                  <StatusBadge tone="info">{result.entity_type}</StatusBadge>
                  <StatusBadge tone={result.resolution_path === 'reverse' ? 'warning' : 'success'}>{result.resolution_path}</StatusBadge>
                </div>
                <div className="text-[12px] text-fg-muted mt-1 truncate">{result.display}</div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="font-mono text-[13px] text-teal">{result.zinbit_id}</span>
                  <span className="text-[11px] text-fg-subtle">matched on {result.input_system}</span>
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={exportJson}><ClipboardCopy className="w-4 h-4" /> Copy map as JSON</Button>
            </div>
          </GlassCard>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
            <KpiTile label="References" value={result.references.length} icon={<Waypoints />} />
            <KpiTile label="Public URLs" value={withUrl} icon={<ExternalLink />} hint="openable" />
            <KpiTile label="Systems" value={byCat.size} icon={<Network />} />
            <KpiTile label="Confidence" value={`${Math.round(result.confidence * 100)}%`} icon={<BadgeCheck />} />
          </div>

          {CATEGORY_ORDER.filter((c) => byCat.has(c)).map((cat) => (
            <div key={cat} className="mt-6">
              <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3">{CATEGORY_LABEL[cat]}</div>
              <ul className="space-y-2">
                {byCat.get(cat)!.map((r, i) => <ReferenceRow key={`${r.system}-${i}`} r={r} />)}
              </ul>
            </div>
          ))}

          {result.unresolved.length > 0 && (
            <div className="mt-6">
              <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3">Not found in</div>
              <ul className="space-y-2">
                {result.unresolved.map((u, i) => (
                  <li key={i} className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface px-3.5 py-2.5 text-[12px]">
                    <CircleX className="w-4 h-4 text-fg-subtle shrink-0" />
                    <span className="text-fg font-semibold w-44 shrink-0 truncate">{u.label}</span>
                    <span className="text-fg-subtle truncate">{u.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between mt-6">
            <p className="text-[11px] text-fg-subtle flex items-center gap-1"><Sparkles className="w-3 h-3" /> Key your records on the Zinbit ID — every reference above unifies to it, in both directions.</p>
            <Link href={`/console/studio?preset=xref`} className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Open in Studio <ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
        </motion.div>
      )}
    </div>
  );
}

export default function XrefPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer']}>
      <XrefInner />
    </RoleGuard>
  );
}

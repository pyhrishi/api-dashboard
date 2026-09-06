'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Globe, MapPin, ShieldCheck, Zap, Lock, Copy, Check, Loader2, AlertTriangle,
  ArrowRight, Info, Key, Server, Radio,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import { authHeaderValue } from '@/lib/api-config';
import RoleGuard from '@/components/RoleGuard';
import {
  allRegions, resolveRegionForKey, regionalBaseUrl, regionById, isCrossBorder,
  type RegionId, type RegionMeta,
} from '@/lib/regions';
import {
  PageHeader, GlassCard, EmptyState, Button, StatusBadge, SegmentedControl, Skeleton,
} from '@/components/ui';

interface ProbeResult {
  region: RegionId;
  servedBy: string;
  latencyMs: number;
}

const PIN_OPTIONS: { value: RegionId | 'auto'; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'us-east-1', label: 'US' },
  { value: 'eu-west-1', label: 'EU' },
  { value: 'ap-south-1', label: 'IN' },
];

function ApiRegionsInner() {
  const { activeKeys, environment, dataResidencyRegion, setDataResidencyRegion, user } = useStore();
  const toast = useToast();
  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [probes, setProbes] = useState<Record<RegionId, ProbeResult | 'testing' | 'error' | undefined>>({} as Record<RegionId, ProbeResult | 'testing' | 'error' | undefined>);
  const [copied, setCopied] = useState<string | null>(null);
  const isAdmin = user?.role === 'admin';

  const activeKey = activeKeys.find((k) => k.environment === environment) ?? activeKeys[0];
  const keyRegion = useMemo(() => (activeKey ? resolveRegionForKey(activeKey.key) : null), [activeKey]);

  useEffect(() => {
    track('api_regions_viewed', {});
    const t = setTimeout(() => setPhase('ready'), 400);
    return () => clearTimeout(t);
  }, []);

  const onPin = (value: RegionId | 'auto') => {
    if (!isAdmin) return;
    const region = value === 'auto' ? null : value;
    try {
      setDataResidencyRegion(region);
      track('data_residency_pinned', { region: region ?? 'auto' });
      toast.success(region ? `Residency pinned to ${regionById(region).label}` : 'Residency set to auto', region ? `Keys provisioned under this policy are bound to ${regionById(region).residency} and refuse cross-region calls (451).` : 'Requests route to the nearest edge.');
    } catch (e) {
      toast.error('Could not update residency', e instanceof Error ? e.message : 'Unexpected error');
    }
  };

  const testRegion = async (id: RegionId) => {
    if (!activeKey) return;
    setProbes((p) => ({ ...p, [id]: 'testing' }));
    const started = performance.now();
    try {
      // A free diagnostic ping: any /api/v1 path returns X-Region/X-Served-By
      // before billing, so this measures the real round-trip to the forced edge.
      const res = await fetch('/api/v1/_ping', {
        headers: { Authorization: authHeaderValue(activeKey.key), 'x-force-region': id },
      });
      const latencyMs = Math.round(performance.now() - started);
      const region = (res.headers.get('x-region') as RegionId) || id;
      const servedBy = res.headers.get('x-served-by') || `zinbit-node-${id}`;
      setProbes((p) => ({ ...p, [id]: { region, servedBy, latencyMs } }));
      track('region_latency_tested', { region: id, latencyMs, served: region });
    } catch {
      setProbes((p) => ({ ...p, [id]: 'error' }));
    }
  };

  const copy = (text: string, id: string) => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    }).catch(() => { /* clipboard denied */ });
  };

  if (!activeKey) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <PageHeader title="API Regions" description="Pin your API traffic to a region for latency and data residency." icon={<Globe />} />
        <GlassCard className="p-0 mt-6">
          <EmptyState
            icon={<Key className="w-8 h-8" />}
            title="Create an API key to test regions"
            description="Regional endpoints authenticate with the same keys. Generate one to run a latency test and pin your residency."
            action={<Link href="/console/keys"><Button variant="primary">Create a key <ArrowRight className="w-4 h-4" /></Button></Link>}
          />
        </GlassCard>
      </div>
    );
  }

  if (phase === 'loading') return <RegionsSkeleton />;

  const pinnedRegion: RegionId | null = dataResidencyRegion;
  const snippetRegion = pinnedRegion ?? keyRegion ?? 'us-east-1';
  const curl = `curl ${regionalBaseUrl(snippetRegion, environment)}/v1/companies/enrich?domain=zinbit.com \\\n  -H "Authorization: Bearer ${activeKey.key.slice(0, 14)}…"`;

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title="API Regions"
        description="Call a region-pinned endpoint to keep every request — and the data it touches — in one region, for latency and for data-residency compliance. The global host smart-routes to the nearest edge."
        icon={<Globe />}
        actions={<Link href="/console/regions"><Button variant="secondary"><MapPin className="w-4 h-4" /> Coverage by region</Button></Link>}
      />

      {/* Active key region + residency pin */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <GlassCard className="p-5">
          <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-2 flex items-center gap-1.5"><Server className="w-3.5 h-3.5" /> Your keys resolve to</div>
          {keyRegion && (
            <div className="flex items-center gap-3">
              <span className="text-lg font-bold text-fg">{regionById(keyRegion).label}</span>
              <StatusBadge tone="teal">{keyRegion}</StatusBadge>
            </div>
          )}
          <p className="text-[12px] text-fg-muted mt-1.5">Deterministic per key — the gateway serves <span className="font-mono text-fg-subtle">{activeKey.key.slice(0, 14)}…</span> from this edge.</p>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-2 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Data-residency policy</div>
          <SegmentedControl<RegionId | 'auto'>
            options={PIN_OPTIONS.map((o) => ({ ...o, disabled: !isAdmin }))}
            value={pinnedRegion ?? 'auto'}
            onChange={onPin}
            size="sm"
            layoutId="residency-pin"
          />
          <p className="text-[12px] text-fg-muted mt-2.5">
            {pinnedRegion
              ? <>Pinned to <span className="font-semibold text-fg">{regionById(pinnedRegion).label}</span> — keys provisioned under this policy are bound to the region and refuse cross-region calls (451) at the gateway.</>
              : 'Auto — requests route to the nearest edge with no residency restriction.'}
          </p>
          {!isAdmin && <div className="mt-2 flex items-center gap-1.5 text-[11px] text-fg-subtle"><Info className="w-3.5 h-3.5 text-semantic-warning" /> Only admins can change the residency policy.</div>}
        </GlassCard>
      </div>

      {/* Region cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        {allRegions().map((region, i) => (
          <RegionCard
            key={region.id}
            region={region}
            index={i}
            isKeyRegion={region.id === keyRegion}
            crossBorder={isCrossBorder(pinnedRegion, region.id)}
            isPinned={region.id === pinnedRegion}
            probe={probes[region.id]}
            onTest={() => testRegion(region.id)}
            baseUrl={regionalBaseUrl(region.id, environment)}
            onCopy={(url) => copy(url, region.id)}
            copied={copied === region.id}
          />
        ))}
      </div>

      {/* Snippet */}
      <GlassCard className="p-0 overflow-hidden mt-4">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle bg-surface-2/50">
          <span className="text-[11px] font-mono text-fg-subtle inline-flex items-center gap-1.5"><Radio className="w-3.5 h-3.5" /> Call the {regionById(snippetRegion).label} endpoint</span>
          <button onClick={() => copy(curl, 'curl')} aria-label={copied === 'curl' ? 'curl command copied' : 'Copy curl command'} className="text-[11px] text-fg-subtle hover:text-fg inline-flex items-center gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 rounded px-1">
            {copied === 'curl' ? <><Check className="w-3 h-3 text-semantic-success" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
          </button>
        </div>
        <pre className="text-[12px] font-mono text-fg-muted p-4 overflow-x-auto leading-relaxed">{curl}</pre>
      </GlassCard>

      <div className="mt-6 flex items-center gap-4 text-[12px] text-fg-subtle flex-wrap">
        <Link href="/console/regions" className="inline-flex items-center gap-1.5 hover:text-teal transition-colors">Regional Coverage <ArrowRight className="w-3.5 h-3.5" /></Link>
        <Link href="/console/security" className="inline-flex items-center gap-1.5 hover:text-teal transition-colors">Security Hub <ArrowRight className="w-3.5 h-3.5" /></Link>
        <Link href="/console/keys" className="inline-flex items-center gap-1.5 hover:text-teal transition-colors">API Keys <ArrowRight className="w-3.5 h-3.5" /></Link>
      </div>
    </div>
  );
}

function RegionCard({ region, index, isKeyRegion, crossBorder, isPinned, probe, onTest, baseUrl, onCopy, copied }: {
  region: RegionMeta;
  index: number;
  isKeyRegion: boolean;
  crossBorder: boolean;
  isPinned: boolean;
  probe: ProbeResult | 'testing' | 'error' | undefined;
  onTest: () => void;
  baseUrl: string;
  onCopy: (url: string) => void;
  copied: boolean;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
      <GlassCard className={`p-5 h-full flex flex-col ${isPinned ? 'border-teal/40' : ''}`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-bold text-fg">{region.label}</div>
            <div className="text-[11px] text-fg-subtle inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {region.city}, {region.country}</div>
          </div>
          {isPinned ? <StatusBadge tone="teal"><Lock className="w-3 h-3" /> Pinned</StatusBadge>
            : isKeyRegion ? <StatusBadge tone="neutral">Your keys</StatusBadge> : null}
        </div>

        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          {region.compliance.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 text-[10px] font-semibold text-fg-muted px-1.5 py-0.5 rounded-full bg-surface-2 border border-border-subtle"><ShieldCheck className="w-3 h-3 text-teal" /> {c}</span>
          ))}
        </div>

        {/* Endpoint URL */}
        <button
          onClick={() => onCopy(baseUrl)}
          aria-label={copied ? `${region.host} copied to clipboard` : `Copy endpoint ${region.host}`}
          className="mt-3 w-full text-left group flex items-center justify-between gap-2 rounded-lg bg-surface-2 border border-border-subtle px-2.5 py-1.5 hover:border-teal/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50"
        >
          <span className="text-[11px] font-mono text-fg-muted truncate">{region.host}</span>
          {copied ? <Check className="w-3.5 h-3.5 text-semantic-success shrink-0" /> : <Copy className="w-3.5 h-3.5 text-fg-subtle group-hover:text-fg shrink-0" />}
        </button>

        {crossBorder && (
          <div className="mt-2 flex items-start gap-1.5 text-[11px] text-semantic-warning"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Outside your residency policy — data served here would leave your pinned region.</div>
        )}

        <p className="text-[11px] text-fg-subtle mt-3 leading-snug flex-1">{region.description}</p>

        {/* Latency test */}
        <div className="mt-3 pt-3 border-t border-border-subtle flex items-center justify-between gap-2">
          <div className="text-[11px] text-fg-subtle">
            {probe === 'testing' ? <span className="inline-flex items-center gap-1.5 text-fg-muted"><Loader2 className="w-3 h-3 animate-spin" /> Pinging…</span>
              : probe === 'error' ? <span className="text-semantic-error">Probe failed</span>
              : probe ? <span className="inline-flex items-center gap-1.5"><Zap className="w-3 h-3 text-teal" /> <span className="font-mono tabular-nums text-fg font-semibold">{probe.latencyMs}ms</span> · served {probe.region}</span>
              : <span className="inline-flex items-center gap-1"><Zap className="w-3 h-3" /> ~{region.baselineLatencyMs}ms typical</span>}
          </div>
          <Button variant="ghost" size="sm" onClick={onTest} disabled={probe === 'testing'}>
            {probe === 'testing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Radio className="w-3.5 h-3.5" />} Test
          </Button>
        </div>
      </GlassCard>
    </motion.div>
  );
}

function RegionsSkeleton() {
  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="space-y-2"><Skeleton className="h-7 w-44" /><Skeleton className="h-4 w-[36rem] max-w-full" /></div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
      </div>
    </div>
  );
}

export default function ApiRegionsPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <ApiRegionsInner />
    </RoleGuard>
  );
}

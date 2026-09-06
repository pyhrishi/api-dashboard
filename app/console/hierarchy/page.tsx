'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Network, Building2, Crown, Users, MapPin, Search, Loader2, CircleAlert, ArrowRight,
  Landmark, Sparkles, GitFork,
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

type HierarchyRelation = 'ultimate_parent' | 'parent' | 'subsidiary' | 'branch' | 'division' | 'affiliate';
interface HierarchyNode {
  id: string;
  domain: string;
  name: string;
  legal_name: string;
  entity_type: string;
  relation: HierarchyRelation;
  parent_id: string | null;
  ownership_pct: number | null;
  employee_count: number;
  industry: string;
  hq_city: string;
  hq_country: string;
  registry_id: string;
  is_subject: boolean;
  is_ultimate_parent: boolean;
  depth: number;
}
interface CompanyHierarchy {
  subject_domain: string;
  role: 'standalone' | 'parent' | 'subsidiary';
  ultimate_parent_id: string;
  subject_id: string;
  total_entities: number;
  max_depth: number;
  countries: string[];
  nodes: HierarchyNode[];
  confidence: number;
  as_of: string;
}

const RELATION_TONE: Record<HierarchyRelation, BadgeTone> = {
  ultimate_parent: 'teal', parent: 'teal', subsidiary: 'info', branch: 'warning', division: 'neutral', affiliate: 'neutral',
};
const RELATION_LABEL: Record<HierarchyRelation, string> = {
  ultimate_parent: 'Ultimate parent', parent: 'Parent', subsidiary: 'Subsidiary', branch: 'Branch', division: 'Division', affiliate: 'Affiliate',
};

function HierarchyInner() {
  const activeKeys = useStore((s) => s.activeKeys);
  const toast = useToast();
  const apiKey = activeKeys[0]?.key ?? '';

  const [domain, setDomain] = useState('acme.com');
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');
  const [data, setData] = useState<CompanyHierarchy | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const resolve = useCallback(async () => {
    if (!apiKey) { toast.error('No API key', 'Generate a key first.'); return; }
    if (!domain.trim()) { toast.error('Enter a domain', 'e.g. acme.com'); return; }
    setPhase('loading'); setError(''); setData(null); setSelected(null);
    try {
      const res = await fetch(`/api/v1/companies/hierarchy?domain=${encodeURIComponent(domain.trim())}`, { headers: { Authorization: authHeaderValue(apiKey) } });
      const body = (await res.json()) as { success?: boolean; data?: CompanyHierarchy; error?: { message?: string } };
      if (res.status === 404 || (body.data && !body.data.nodes)) throw new Error('No corporate hierarchy found for that domain (it may be a personal or unrecognized domain).');
      if (!res.ok || body.success === false || !body.data) throw new Error(body.error?.message || `Gateway returned ${res.status}`);
      setData(body.data);
      setSelected(body.data.subject_id);
      setPhase('ready');
      track('hierarchy_resolved', { domain: domain.trim(), role: body.data.role, entities: body.data.total_entities });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reach the gateway.');
      setPhase('error');
    }
  }, [apiKey, domain, toast]);

  useEffect(() => { track('hierarchy_viewed', {}); }, []);

  // Build a children map for recursive rendering.
  const childrenOf = useMemo(() => {
    const map = new Map<string | null, HierarchyNode[]>();
    (data?.nodes ?? []).forEach((n) => {
      const arr = map.get(n.parent_id) ?? [];
      arr.push(n);
      map.set(n.parent_id, arr);
    });
    return map;
  }, [data]);

  const root = useMemo(() => data?.nodes.find((n) => n.is_ultimate_parent) ?? null, [data]);
  const selectedNode = useMemo(() => data?.nodes.find((n) => n.id === selected) ?? null, [data, selected]);

  const renderNode = (node: HierarchyNode) => {
    const kids = childrenOf.get(node.id) ?? [];
    const active = node.id === selected;
    return (
      <div key={node.id} className="relative">
        <motion.button
          initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
          onClick={() => setSelected(node.id)}
          className={`w-full text-left flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${active ? 'border-teal/50 bg-teal/10' : node.is_subject ? 'border-teal/30 bg-surface-2' : 'border-border bg-surface-2 hover:border-border-strong'}`}
        >
          <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${node.is_ultimate_parent ? 'bg-teal/10 border-teal/30 text-teal' : 'bg-surface border-border text-fg-muted'}`}>
            {node.is_ultimate_parent ? <Crown className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-fg truncate">{node.name}</span>
              {node.is_subject && <StatusBadge tone="teal">Queried</StatusBadge>}
            </div>
            <div className="text-[11px] text-fg-subtle flex items-center gap-2 mt-0.5">
              <span>{RELATION_LABEL[node.relation]}</span>
              {node.ownership_pct != null && <span>· {node.ownership_pct}% owned</span>}
              <span>· {node.hq_country}</span>
            </div>
          </div>
          <span className="text-[11px] text-fg-subtle tabular-nums shrink-0">{node.employee_count.toLocaleString()} ppl</span>
        </motion.button>
        {kids.length > 0 && (
          <div className="ml-4 pl-4 mt-2 space-y-2 border-l border-border-subtle">
            {kids.map(renderNode)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-[1100px] mx-auto">
      <PageHeader
        title="Company Hierarchy"
        description="Resolve a company's whole corporate family — ultimate parent, subsidiaries, branches, and divisions — each with its ownership stake and registry id."
        icon={<Network />}
      />

      <GlassCard className="p-5 mt-6">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <label className="flex-1">
            <span className="block text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-1.5">Company domain</span>
            <input value={domain} onChange={(e) => setDomain(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') resolve(); }}
              placeholder="acme.com" className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-sm text-fg font-mono focus:border-teal outline-none" />
          </label>
          <Button onClick={resolve} disabled={phase === 'loading'} className="shrink-0">
            {phase === 'loading' ? <><Loader2 className="w-4 h-4 animate-spin" /> Resolving…</> : <><Search className="w-4 h-4" /> Resolve tree</>}
          </Button>
        </div>
      </GlassCard>

      {phase === 'idle' && (
        <GlassCard className="mt-6">
          <EmptyState icon={<GitFork className="w-7 h-7" />} title="Map a corporate family" description="Enter a company domain to resolve its ultimate parent, subsidiaries, and branches as an org tree." />
        </GlassCard>
      )}

      {phase === 'loading' && (
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      )}

      {phase === 'error' && (
        <GlassCard className="p-4 mt-6 border-semantic-error/30 bg-semantic-error/5 flex items-center gap-3">
          <CircleAlert className="w-5 h-5 text-semantic-error shrink-0" />
          <div className="text-sm text-fg">{error}</div>
        </GlassCard>
      )}

      {phase === 'ready' && data && root && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <KpiTile label="Entities" value={String(data.total_entities)} icon={<Building2 />} hint="In the family" />
            <KpiTile label="Structure" value={data.role} icon={<GitFork />} hint="Subject's role" />
            <KpiTile label="Depth" value={String(data.max_depth + 1)} icon={<Network />} hint="Tiers" />
            <KpiTile label="Countries" value={String(data.countries.length)} icon={<MapPin />} hint={data.countries.join(', ')} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 mt-4">
            {/* Tree */}
            <GlassCard className="p-5">
              <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3">Corporate family tree</div>
              <div className="space-y-2">{renderNode(root)}</div>
            </GlassCard>

            {/* Detail panel */}
            <div>
              <GlassCard className="p-5 sticky top-4">
                {selectedNode ? (
                  <>
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${selectedNode.is_ultimate_parent ? 'bg-teal/10 border-teal/30 text-teal' : 'bg-surface-2 border-border text-fg-muted'}`}>
                        {selectedNode.is_ultimate_parent ? <Crown className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-black text-fg truncate">{selectedNode.name}</div>
                        <StatusBadge tone={RELATION_TONE[selectedNode.relation]}>{RELATION_LABEL[selectedNode.relation]}</StatusBadge>
                      </div>
                    </div>
                    <dl className="space-y-2 text-sm">
                      <Detail k="Legal name" v={selectedNode.legal_name} />
                      <Detail k="Entity type" v={selectedNode.entity_type} />
                      <Detail k="Domain" v={selectedNode.domain} mono />
                      <Detail k="Registry id" v={selectedNode.registry_id} mono icon={<Landmark className="w-3 h-3" />} />
                      {selectedNode.ownership_pct != null && <Detail k="Ownership" v={`${selectedNode.ownership_pct}%`} />}
                      <Detail k="Headcount" v={selectedNode.employee_count.toLocaleString()} icon={<Users className="w-3 h-3" />} />
                      <Detail k="HQ" v={`${selectedNode.hq_city}, ${selectedNode.hq_country}`} icon={<MapPin className="w-3 h-3" />} />
                      <Detail k="Industry" v={selectedNode.industry} />
                    </dl>
                    <Link href={`/console/studio?domain=${encodeURIComponent(selectedNode.domain)}`} className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-teal hover:text-fg transition-colors">
                      <Sparkles className="w-3.5 h-3.5" /> Enrich this entity <ArrowRight className="w-3 h-3" />
                    </Link>
                  </>
                ) : (
                  <div className="text-sm text-fg-muted text-center py-6">Select a company in the tree.</div>
                )}
              </GlassCard>
            </div>
          </div>

          <GlassCard className="p-5 mt-4 border-teal/20">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-teal/10 border border-teal/30 flex items-center justify-center shrink-0"><Landmark className="w-4 h-4 text-teal" /></div>
              <div>
                <div className="text-sm font-bold text-fg">Registry-backed structure</div>
                <p className="text-[13px] text-fg-muted mt-1 leading-relaxed">
                  Each entity carries a registry id (CIN-style for Indian entities) and an ownership stake, so the family tree is anchored to real corporate identity — not just inferred from a website. Resolved via <code className="text-teal">GET /v1/companies/hierarchy</code>; the same company facts agree with a direct <Link href="/console/explorer" className="text-teal font-semibold hover:text-fg transition-colors">company lookup <ArrowRight className="w-3 h-3 inline" /></Link>.
                </p>
              </div>
            </div>
          </GlassCard>
        </>
      )}
    </div>
  );
}

function Detail({ k, v, mono, icon }: { k: string; v: string; mono?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-[11px] font-black uppercase tracking-wider text-fg-subtle flex items-center gap-1 shrink-0">{icon}{k}</dt>
      <dd className={`text-sm text-fg text-right ${mono ? 'font-mono text-[12px]' : ''} break-all`}>{v}</dd>
    </div>
  );
}

export default function HierarchyPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <HierarchyInner />
    </RoleGuard>
  );
}

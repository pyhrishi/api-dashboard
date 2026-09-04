'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '@/lib/store';
import RoleGuard from '@/components/RoleGuard';
import { CodeBlock } from '@/components/CodeBlock';
import { authHeaderValue } from '@/lib/api-config';
import { cn } from '@/lib/utils';
import type { DataShareRecord, DataShareResult, DataShareDataset, SnowflakeShareConfig } from '@/lib/gateway/dataSharing';
import { Database, Cloud, Trash2, CheckCircle2, Zap, AlertTriangle, ShieldCheck, ArrowRight } from 'lucide-react';
import { PageHeader, GlassCard, Button, EmptyState, StatusBadge, Skeleton, Field, Input, SegmentedControl } from '@/components/ui';

type Target = 'snowflake' | 'bigquery';

const DATASETS: { id: DataShareDataset; label: string; rows: number }[] = [
  { id: 'b2b_contacts', label: 'B2B Contacts', rows: 450_000_000 },
  { id: 'companies_enriched', label: 'Enriched Companies', rows: 95_000_000 },
  { id: 'intent_signals', label: 'Intent Signals', rows: 2_800_000_000 },
  { id: 'technographics', label: 'Technographics', rows: 120_000_000 },
];

const fmtRows = (n: number) =>
  n >= 1_000_000_000 ? `${(n / 1_000_000_000).toFixed(1)}B` : n >= 1_000_000 ? `${Math.round(n / 1_000_000)}M` : n.toLocaleString();

const relTime = (ts?: number) => {
  if (!ts) return '—';
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`;
};

const isSnowflake = (c: SnowflakeShareConfig | { mountQuery?: string }): c is SnowflakeShareConfig =>
  (c as SnowflakeShareConfig).secureViewDDL !== undefined;

export default function DataSharingPage() {
  const { activeKeys } = useStore();
  const apiKey = activeKeys[0]?.key || 'sk_live_clean_room';

  const [target, setTarget] = useState<Target>('snowflake');
  const [dataset, setDataset] = useState<DataShareDataset>('b2b_contacts');
  const [account, setAccount] = useState('');
  const [provisioning, setProvisioning] = useState(false);
  const [result, setResult] = useState<DataShareResult | null>(null);
  const [shares, setShares] = useState<DataShareRecord[] | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const authFetch = useCallback(
    (path: string, init?: RequestInit) =>
      fetch(path, { ...init, headers: { Authorization: authHeaderValue(apiKey), ...(init?.headers || {}) } }),
    [apiKey]
  );

  const loadShares = useCallback(async () => {
    try {
      const res = await authFetch(`/api/v1/data-shares/${target}`);
      const json = await res.json();
      if (json.success) setShares(json.data.shares);
    } catch { setShares([]); }
  }, [authFetch, target]);

  useEffect(() => { loadShares(); }, [loadShares]);

  const provision = async () => {
    if (!account.trim()) return;
    setProvisioning(true);
    setResult(null);
    try {
      const res = await authFetch(`/api/v1/data-shares/${target}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_identifier: account, project_id: account, dataset }),
      });
      const json = await res.json();
      setResult(json.data);
      if (json.success) { setAccount(''); await loadShares(); }
    } finally {
      setProvisioning(false);
    }
  };

  const revoke = async (shareId: string) => {
    setRevokingId(shareId);
    try {
      await authFetch(`/api/v1/data-shares/${target}/${shareId}`, { method: 'DELETE' });
      await loadShares();
    } finally {
      setRevokingId(null);
    }
  };

  const visibleShares = shares?.filter(s => s.target === target) ?? null;

  return (
    <RoleGuard allowedRoles={['admin']}>
      <div className="space-y-8 animate-fade-in pb-12">
        <PageHeader
          icon={<ShieldCheck />}
          title="Data Clean Room"
          description="Zero-copy data sharing — grant a partner or your own warehouse live, governed access to Zinbit datasets without moving a single row. Provisions a Snowflake Secure View or a BigQuery Analytics Hub listing."
        />

        <div className="grid lg:grid-cols-[minmax(0,420px)_1fr] gap-6 items-start">
          {/* Provision panel */}
          <GlassCard className="space-y-5">
            <h3 className="text-sm font-black uppercase tracking-widest text-fg-muted">Provision a Share</h3>

            <SegmentedControl<Target>
              layoutId="data-share-target"
              className="w-full [&>button]:flex-1"
              value={target}
              onChange={(t) => { setTarget(t); setResult(null); }}
              options={[
                { value: 'snowflake', label: <span className="inline-flex items-center gap-2"><Database className="w-4 h-4" />Snowflake</span> },
                { value: 'bigquery', label: <span className="inline-flex items-center gap-2"><Cloud className="w-4 h-4" />BigQuery</span> },
              ]}
            />

            <div>
              <p className="block text-[10px] font-black uppercase tracking-widest text-fg-muted mb-2">Dataset</p>
              <div className="space-y-2">
                {DATASETS.map(d => (
                  <button
                    key={d.id}
                    onClick={() => setDataset(d.id)}
                    aria-pressed={dataset === d.id}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-all',
                      dataset === d.id ? 'border-teal/40 bg-teal/5 text-fg' : 'border-border text-fg-muted hover:border-border-strong'
                    )}
                  >
                    <span className="font-semibold">{d.label}</span>
                    <span className="text-xs text-fg-subtle font-mono">{fmtRows(d.rows)} rows</span>
                  </button>
                ))}
              </div>
            </div>

            <Field label={target === 'snowflake' ? 'Consumer Account' : 'GCP Project'} htmlFor="share-account" required>
              <Input
                id="share-account"
                mono
                value={account}
                onChange={e => setAccount(e.target.value)}
                placeholder={target === 'snowflake' ? 'Consumer account (e.g. ACME-EAST-1)' : 'GCP project ID (e.g. acme-analytics-prod)'}
                onKeyDown={(e) => { if (e.key === 'Enter') provision(); }}
              />
            </Field>

            <Button size="lg" className="w-full" icon={<Zap />} loading={provisioning} disabled={!account.trim()} onClick={provision}>
              {provisioning ? 'Provisioning…' : 'Provision Zero-Copy Share'}
            </Button>
          </GlassCard>

          {/* Result + shares */}
          <div className="space-y-6">
            {result && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <GlassCard className={result.success ? 'border-semantic-success/30 bg-semantic-success/5' : 'border-semantic-error/30 bg-semantic-error/5'}>
                  {result.success && result.shareConfig ? (
                    <>
                      <div className="flex items-center gap-2 mb-4">
                        <CheckCircle2 className="w-5 h-5 text-semantic-success" />
                        <div>
                          <h3 className="text-fg font-bold">Share provisioned</h3>
                          <p className="text-xs text-fg-muted font-mono">{result.shareId}</p>
                        </div>
                      </div>
                      {isSnowflake(result.shareConfig) ? (
                        <div className="space-y-4">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-fg-muted mb-2">Provider · Secure View DDL</p>
                            <CodeBlock code={result.shareConfig.secureViewDDL} />
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-fg-muted mb-2">Consumer · Mount SQL</p>
                            <CodeBlock code={result.shareConfig.mountSQL} />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="bg-glass border border-border-subtle rounded-lg p-3">
                              <div className="text-fg-subtle uppercase tracking-widest text-[10px] font-black mb-1">Analytics Hub Listing</div>
                              <div className="text-fg font-mono break-all">{result.shareConfig.analyticsHubListingId}</div>
                            </div>
                            <div className="bg-glass border border-border-subtle rounded-lg p-3">
                              <div className="text-fg-subtle uppercase tracking-widest text-[10px] font-black mb-1">Authorized View</div>
                              <div className="text-fg font-mono break-all">{result.shareConfig.authorizedViewId}</div>
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-fg-muted mb-2">Consumer · Mount Query</p>
                            <CodeBlock code={result.shareConfig.mountQuery} />
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-semantic-error">
                      <AlertTriangle className="w-5 h-5" />
                      <span className="text-sm font-semibold">{result.error || 'Provisioning failed.'}</span>
                    </div>
                  )}
                </GlassCard>
              </motion.div>
            )}

            <GlassCard>
              <h3 className="text-sm font-black uppercase tracking-widest text-fg-muted mb-4">
                Active {target === 'snowflake' ? 'Snowflake' : 'BigQuery'} Shares
              </h3>
              {visibleShares === null ? (
                <div className="space-y-2">{[0, 1].map(i => <Skeleton key={i} variant="block" className="h-16 rounded-xl" />)}</div>
              ) : visibleShares.length === 0 ? (
                <EmptyState
                  className="py-10 bg-transparent border-dashed"
                  title="No active shares on this target yet"
                  description="Provision one to grant zero-copy access."
                />
              ) : (
                <div className="space-y-3">
                  {visibleShares.map(s => (
                    <div key={s.shareId} className="flex items-center justify-between bg-glass border border-border-subtle rounded-xl px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-fg truncate">{s.accountIdentifier}</span>
                          <StatusBadge tone="success" dot>{s.status}</StatusBadge>
                        </div>
                        <div className="text-xs text-fg-subtle mt-1">
                          {DATASETS.find(d => d.id === s.dataset)?.label || s.dataset} · {fmtRows(s.rowsAccessible)} rows · accessed {relTime(s.lastAccessedAt)}
                        </div>
                      </div>
                      <Button variant="danger" size="sm" title="Revoke share" aria-label="Revoke share" icon={<Trash2 />} loading={revokingId === s.shareId} onClick={() => revoke(s.shareId)} />
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>

            {!result && (
              <p className="text-xs text-fg-subtle flex items-center gap-1.5">
                <ArrowRight className="w-3.5 h-3.5" /> Provisioning generates production-ready DDL/SQL you can run directly in your warehouse.
              </p>
            )}
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}

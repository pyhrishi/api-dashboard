'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Download, Play, RefreshCw, AlertTriangle, Database, FileJson, FileSpreadsheet, FileText,
  Filter, ArrowUpDown, Columns3, Coins, Copy, Check, ArrowRight, Sparkles,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { authHeaderValue, apiBaseUrl } from '@/lib/api-config';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import RoleGuard from '@/components/RoleGuard';
import { PageHeader, KpiTile, GlassCard, Button, Input, EmptyState, Skeleton, StatusBadge, SegmentedControl } from '@/components/ui';
import { EXPORT_FIELDS, EXPORT_FORMATS, type ExportEntity, type ExportFormat } from '@/lib/gateway/bulkExport';

interface PreviewResponse {
  entity: ExportEntity;
  format: ExportFormat;
  total: number;
  matched: number;
  exported: number;
  cost: number;
  fields: string[];
  warnings: string[];
  sample: Record<string, unknown>[];
}

const FORMAT_ICON: Record<ExportFormat, React.ElementType> = { ndjson: FileText, csv: FileSpreadsheet, json: FileJson };

function ExportInner() {
  const { activeKeys, environment } = useStore();
  const apiKey = useMemo(() => activeKeys.find(k => k.environment === environment)?.key ?? activeKeys[0]?.key ?? '', [activeKeys, environment]);
  const toast = useToast();

  const [entity, setEntity] = useState<ExportEntity>('companies');
  const [format, setFormat] = useState<ExportFormat>('ndjson');
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState('');
  const [limit, setLimit] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  const available = EXPORT_FIELDS[entity];
  // Reset field selection when the entity changes.
  useEffect(() => { setSelected([]); setPreview(null); setPhase('idle'); }, [entity]);

  const queryString = useCallback((forPreview: boolean) => {
    const p = new URLSearchParams();
    p.set('entity', entity);
    p.set('format', format);
    if (filter.trim()) p.set('filter', filter.trim());
    if (sort.trim()) p.set('sort', sort.trim());
    if (selected.length) p.set('fields', selected.join(','));
    if (limit.trim()) p.set('limit', limit.trim());
    if (forPreview) p.set('preview', '1');
    return p.toString();
  }, [entity, format, filter, sort, selected, limit]);

  const runPreview = useCallback(async () => {
    setPhase('loading');
    try {
      const res = await fetch(`/api/v1/export?${queryString(true)}`, { headers: { Authorization: authHeaderValue(apiKey) } });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'Preview failed');
      const p = body.data as PreviewResponse;
      setPreview(p);
      setPhase('ready');
      track('bulk_export_previewed', { entity, format, matched: p.matched, cost: p.cost, environment });
    } catch {
      setPhase('error');
    }
  }, [apiKey, queryString, entity, format, environment]);

  const download = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/v1/export?${queryString(false)}`, { headers: { Authorization: authHeaderValue(apiKey) } });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error?.message || 'Export failed'); }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const nameMatch = disposition.match(/filename="?([^"]+)"?/);
      const filename = nameMatch?.[1] || `zinbit_${entity}_export.${format}`;
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(objectUrl);
      const rows = res.headers.get('X-Export-Rows') ?? String(preview?.exported ?? '');
      const cost = res.headers.get('X-Credits-Cost') ?? String(preview?.cost ?? '');
      track('bulk_export_downloaded', { entity, format, rows: Number(rows) || 0, cost: Number(cost) || 0, environment });
      toast.success('Export downloaded', `${filename} · ${rows} rows · ${cost} credits.`);
    } catch (e) {
      toast.error('Export failed', e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setDownloading(false);
    }
  };

  const curl = useMemo(() => {
    const base = `${apiBaseUrl(environment)}/v1/export`;
    return `curl -H "Authorization: Bearer ${apiKey || 'sk_test_...'}" "${base}?${queryString(false)}"`;
  }, [apiKey, environment, queryString]);

  const copyCurl = () => { navigator.clipboard?.writeText(curl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }).catch(() => {}); };

  const toggleField = (f: string) => setSelected((s) => s.includes(f) ? s.filter((x) => x !== f) : [...s, f]);

  return (
    <div className="max-w-[1100px] mx-auto pb-16">
      <PageHeader
        icon={<Database />}
        title="Bulk Export"
        description="Stream a filtered slice of your enriched data out in one call — pick an entity, narrow it with the same filter/sort grammar as the Query endpoint, choose your columns, and export as NDJSON (streams row-by-row), CSV, or JSON. Preview the row count and credit cost before you pull the full dataset."
        actions={<Link href="/console/query"><Button variant="secondary" size="sm"><Filter className="w-4 h-4" /> Query Builder</Button></Link>}
      />

      <div className="grid lg:grid-cols-[1fr_360px] gap-5 mt-6">
        {/* Builder */}
        <GlassCard className="p-5 space-y-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-2">Entity</div>
            <SegmentedControl
              options={[{ label: 'Companies', value: 'companies' }, { label: 'People', value: 'people' }]}
              value={entity}
              onChange={(v) => setEntity(v as ExportEntity)}
            />
          </div>

          <div>
            <label htmlFor="exp-filter" className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-1 flex items-center gap-1"><Filter className="w-3 h-3" /> Filter</label>
            <Input id="exp-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="industry:eq:Fintech, employee_band:contains:1001" autoComplete="off" />
            <p className="text-[10.5px] text-fg-subtle mt-1">Clauses <span className="font-mono">field:op:value</span>, comma-separated · ops: eq ne gt gte lt lte contains startsWith endsWith in</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="exp-sort" className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-1 flex items-center gap-1"><ArrowUpDown className="w-3 h-3" /> Sort</label>
              <Input id="exp-sort" value={sort} onChange={(e) => setSort(e.target.value)} placeholder="-founded_year" autoComplete="off" />
            </div>
            <div>
              <label htmlFor="exp-limit" className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-1">Limit</label>
              <Input id="exp-limit" value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^\d]/g, ''))} placeholder="500" inputMode="numeric" autoComplete="off" />
            </div>
          </div>

          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-2 flex items-center gap-1"><Columns3 className="w-3 h-3" /> Columns {selected.length > 0 && <span className="text-fg-muted normal-case tracking-normal font-semibold">· {selected.length} selected</span>}</div>
            <div className="flex flex-wrap gap-1.5">
              {available.map((f) => {
                const on = selected.includes(f);
                return (
                  <button key={f} onClick={() => toggleField(f)}
                    className={`text-[11px] font-mono px-2 py-1 rounded-md border transition-colors ${on ? 'bg-teal/10 border-teal/40 text-teal' : 'bg-glass border-border-subtle text-fg-muted hover:border-border'}`}>
                    {on && <Check className="w-3 h-3 inline mr-0.5 -mt-0.5" />}{f}
                  </button>
                );
              })}
            </div>
            <p className="text-[10.5px] text-fg-subtle mt-1.5">None selected → all columns.</p>
          </div>

          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-2">Format</div>
            <div className="flex gap-2">
              {EXPORT_FORMATS.map((f) => {
                const Icon = FORMAT_ICON[f];
                const on = format === f;
                return (
                  <button key={f} onClick={() => setFormat(f)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${on ? 'bg-teal/10 border-teal/40 text-teal' : 'bg-surface-2 border-border text-fg-muted hover:border-border'}`}>
                    <Icon className="w-3.5 h-3.5" /> {f.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button onClick={runPreview} disabled={phase === 'loading'}>{phase === 'loading' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Preview</Button>
            <Button variant="secondary" onClick={download} disabled={downloading || phase !== 'ready' || (preview?.matched ?? 0) === 0}>{downloading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download</Button>
          </div>
        </GlassCard>

        {/* Preview / result */}
        <div className="space-y-4">
          {phase === 'idle' && (
            <GlassCard className="p-0 overflow-hidden">
              <EmptyState icon={<Database className="w-8 h-8" />} title="Build your export" description="Choose an entity, add filters and columns, then Preview to see the row count and credit cost before downloading." />
            </GlassCard>
          )}
          {phase === 'loading' && <><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-40 rounded-2xl" /></>}
          {phase === 'error' && (
            <GlassCard className="p-0 overflow-hidden">
              <EmptyState icon={<AlertTriangle className="w-8 h-8" />} title="Preview failed" description="The gateway didn’t respond, or a filter clause was invalid. Check your query and retry."
                action={<Button variant="secondary" size="sm" onClick={runPreview}><RefreshCw className="w-4 h-4" /> Retry</Button>} />
            </GlassCard>
          )}
          {phase === 'ready' && preview && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <KpiTile label="Matched" value={preview.matched} icon={<Filter />} hint={`of ${preview.total}`} />
                <KpiTile label="Rows" value={preview.exported} icon={<Database />} />
                <KpiTile label="Cost" value={preview.cost} icon={<Coins />} hint="credits" />
              </div>
              {preview.warnings.length > 0 && (
                <GlassCard className="p-3 border-semantic-warning/30 bg-semantic-warning/5">
                  <ul className="text-[11px] text-fg-muted space-y-1">
                    {preview.warnings.map((w, i) => <li key={i} className="flex items-start gap-1.5"><AlertTriangle className="w-3 h-3 text-semantic-warning mt-0.5 shrink-0" />{w}</li>)}
                  </ul>
                </GlassCard>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* Sample + curl */}
      {phase === 'ready' && preview && preview.matched > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-fg">Sample <span className="text-fg-subtle font-normal">· first {preview.sample.length} of {preview.matched}</span></h3>
            <StatusBadge tone="info">{preview.format.toUpperCase()}</StatusBadge>
          </div>
          <GlassCard className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border">
                    {preview.fields.map((f) => <th key={f} className="text-left font-black uppercase tracking-widest text-[9px] text-fg-subtle px-3 py-2 whitespace-nowrap">{f}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map((row, i) => (
                    <tr key={i} className="border-b border-border-subtle last:border-0">
                      {preview.fields.map((f) => <td key={f} className="px-3 py-2 text-fg-muted whitespace-nowrap max-w-[16rem] truncate">{String(row[f] ?? '')}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">Or pull it from the API</span>
              <button onClick={copyCurl} className="text-[11px] font-semibold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">{copied ? <><Check className="w-3 h-3 text-teal" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}</button>
            </div>
            <pre className="text-[11px] font-mono bg-surface-2 border border-border rounded-xl p-3 overflow-x-auto text-fg-muted">{curl}</pre>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-[11px] text-fg-subtle flex items-center gap-1"><Sparkles className="w-3 h-3" /> NDJSON streams row-by-row, so the response stays memory-flat at any size.</p>
            <Link href="/console/jobs" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Bulk enrichment jobs <ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ExportPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer']}>
      <ExportInner />
    </RoleGuard>
  );
}

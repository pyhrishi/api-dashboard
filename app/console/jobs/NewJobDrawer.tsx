'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { FileUp, ClipboardPaste, Sparkles, CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft, Coins, Clock, Rows3, ShieldAlert, Wallet, Loader2 } from 'lucide-react';
import { useStore, BULK_JOB_ROW_CAP, type BulkJobRow } from '@/lib/store';
import { ENDPOINTS } from '@/data/endpoints';
import { parseCsv, autoMapColumns } from '@/lib/csv';
import { isBulkEligible, sampleRowsFor, SAMPLE_SIZE } from '@/lib/bulk-samples';
import { validateAllParameters, hasValidationErrors, getFirstError } from '@/lib/validation';
import { startBulkJob } from '@/lib/bulk-runner';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import { Drawer, Button, Field, Input, Select, Textarea, SegmentedControl, StatusBadge, GlassCard } from '@/components/ui';
import { cn } from '@/lib/utils';
import { keyHasScope, estimateDurationMs, formatDuration } from './jobs-shared';

interface NewJobDrawerProps {
  open: boolean;
  onClose: () => void;
  initialEndpointId?: string | null;
  /** `'sample'` preloads the sample dataset and skips straight to mapping. */
  initialSource?: 'sample' | null;
}

interface SourceState {
  kind: 'csv' | 'paste' | 'sample';
  fileName?: string;
  columns: string[];
  rows: Record<string, string>[];
  truncated: boolean;
}

type Step = 1 | 2 | 3;
type Concurrency = '2' | '4' | '8';

const ELIGIBLE = ENDPOINTS.filter(isBulkEligible);

export function NewJobDrawer({ open, onClose, initialEndpointId, initialSource }: NewJobDrawerProps) {
  const router = useRouter();
  const toast = useToast();
  const { environment, activeKeys, creditBalance, createBulkJob, user } = useStore();

  const [step, setStep] = useState<Step>(1);
  const [endpointId, setEndpointId] = useState<string>(ELIGIBLE[0]?.id ?? '');
  const [source, setSource] = useState<SourceState | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [keyId, setKeyId] = useState('');
  const [name, setName] = useState('');
  const [concurrency, setConcurrency] = useState<Concurrency>('4');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const endpoint = useMemo(() => ELIGIBLE.find(e => e.id === endpointId) ?? ELIGIBLE[0], [endpointId]);

  // Reset on open; honor a preselected endpoint from the Explorer / palette deep link.
  useEffect(() => {
    if (!open) return;
    const startEndpointId = initialEndpointId && ELIGIBLE.some(e => e.id === initialEndpointId) ? initialEndpointId : (ELIGIBLE[0]?.id ?? '');
    const startEndpoint = ELIGIBLE.find(e => e.id === startEndpointId);
    setEndpointId(startEndpointId);
    setSourceError(null);
    setPasteText('');
    setMapping({});
    setName('');
    setConcurrency('4');
    setIsSubmitting(false);
    if (initialSource === 'sample' && startEndpoint) {
      const s = sampleRowsFor(startEndpoint);
      setSource({ kind: 'sample', columns: s.columns, rows: s.rows, truncated: false });
      setStep(2);
    } else {
      setSource(null);
      setStep(1);
    }
  }, [open, initialEndpointId, initialSource]);

  // Keys usable for this job: same environment as the console, active, and scoped for the endpoint.
  const usableKeys = useMemo(() => activeKeys.filter(k =>
    (k.status === 'active' || k.status === 'expiring_soon') &&
    k.environment === environment &&
    (endpoint ? keyHasScope(k, endpoint.path) : true)
  ), [activeKeys, environment, endpoint]);

  useEffect(() => {
    if (!usableKeys.some(k => k.id === keyId)) setKeyId(usableKeys[0]?.id ?? '');
  }, [usableKeys, keyId]);

  // Auto-map columns whenever the source or endpoint changes.
  useEffect(() => {
    if (!source || !endpoint) return;
    setMapping(autoMapColumns(endpoint.parameters.map(p => p.name), source.columns));
  }, [source, endpoint]);

  useEffect(() => {
    if (!name && source && endpoint) {
      const base = source.fileName ? source.fileName.replace(/\.[a-z0-9]+$/i, '') : source.kind === 'sample' ? 'Sample run' : 'Pasted list';
      setName(`${base} · ${endpoint.name}`);
    }
  }, [source, endpoint, name]);

  // ── derived: mapped rows + validation ────────────────────────────────────────
  const mappedRows = useMemo<Record<string, string>[]>(() => {
    if (!source || !endpoint) return [];
    return source.rows.map(r => {
      const input: Record<string, string> = {};
      endpoint.parameters.forEach(p => { const col = mapping[p.name]; input[p.name] = col ? (r[col] ?? '') : ''; });
      return input;
    });
  }, [source, endpoint, mapping]);

  const validation = useMemo(() => {
    if (!endpoint) return { valid: 0, skipped: 0, reasons: [] as { reason: string; count: number }[] };
    let valid = 0; let skipped = 0;
    const reasons = new Map<string, number>();
    mappedRows.forEach(input => {
      const errors = validateAllParameters(endpoint.parameters, input);
      if (hasValidationErrors(errors)) { skipped++; const r = getFirstError(errors) ?? 'Invalid input'; reasons.set(r, (reasons.get(r) ?? 0) + 1); }
      else valid++;
    });
    const top = Array.from(reasons.entries()).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 3);
    return { valid, skipped, reasons: top };
  }, [mappedRows, endpoint]);

  const requiredUnmapped = endpoint ? endpoint.parameters.filter(p => p.required && !mapping[p.name]) : [];
  const creditCost = endpoint ? validation.valid * endpoint.creditCost : 0;
  const shortfall = Math.max(0, creditCost - creditBalance);
  const estMs = estimateDurationMs(validation.valid, Number(concurrency));
  const isBilling = user?.role === 'billing';

  const canProceedFrom1 = !!endpoint && !!source && source.rows.length > 0;
  const canProceedFrom2 = requiredUnmapped.length === 0 && validation.valid > 0 && !!keyId && name.trim().length > 0;
  const canRun = canProceedFrom2 && shortfall === 0 && !isBilling;

  // ── source loaders ──────────────────────────────────────────────────────────
  const loadFile = async (file: File) => {
    setIsParsing(true);
    setSourceError(null);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Files over 5 MB aren’t supported in the console — split the file or use the batch API.');
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.headers.length === 0 || parsed.rows.length === 0) throw new Error('No rows found. The first line must be a header row.');
      const truncated = parsed.rows.length > BULK_JOB_ROW_CAP;
      setSource({ kind: 'csv', fileName: file.name, columns: parsed.headers, rows: parsed.rows.slice(0, BULK_JOB_ROW_CAP), truncated });
    } catch (err: unknown) {
      setSource(null);
      setSourceError(err instanceof Error ? err.message : 'Could not read that file.');
    } finally {
      setIsParsing(false);
    }
  };

  const loadPaste = () => {
    if (!endpoint) return;
    const lines = pasteText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) { setSourceError('Paste at least one value, one per line.'); return; }
    const col = endpoint.parameters.find(p => p.required)?.name ?? 'value';
    const truncated = lines.length > BULK_JOB_ROW_CAP;
    setSourceError(null);
    setSource({ kind: 'paste', columns: [col], rows: lines.slice(0, BULK_JOB_ROW_CAP).map(v => ({ [col]: v })), truncated });
  };

  const loadSample = () => {
    if (!endpoint) return;
    const s = sampleRowsFor(endpoint);
    setSourceError(null);
    setSource({ kind: 'sample', fileName: undefined, columns: s.columns, rows: s.rows, truncated: false });
  };

  // ── submit ──────────────────────────────────────────────────────────────────
  const submit = async (run: boolean) => {
    if (!endpoint || !source || !canProceedFrom2 || isBilling) return;
    if (run && shortfall > 0) return;
    setIsSubmitting(true);
    try {
      const rows: BulkJobRow[] = mappedRows.map((input, i) => ({ index: i, input, status: 'pending', attempts: 0 }));
      const id = createBulkJob({
        name: name.trim(),
        endpointId: endpoint.id,
        environment,
        keyId,
        status: run ? 'queued' : 'draft',
        source: { kind: source.kind, fileName: source.fileName, rowCount: source.rows.length, columns: source.columns, truncated: source.truncated || undefined },
        mapping,
        concurrency: Number(concurrency),
        creditEstimate: creditCost,
        rows,
      });
      track('bulk_job_created', { job: id, endpoint: endpoint.id, rows: rows.length, valid: validation.valid, skipped: validation.skipped, source: source.kind, credits: creditCost, run });
      if (run) startBulkJob(id).catch((err: unknown) => toast.error('Could not start', err instanceof Error ? err.message : 'Please try again.'));
      toast.success(run ? 'Job started' : 'Draft saved', run ? `${validation.valid} rows are running through ${endpoint.name}.` : 'Run it whenever you’re ready.');
      onClose();
      router.push(`/console/jobs/${id}`);
    } catch (err: unknown) {
      toast.error('Could not create job', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (source && !isSubmitting) track('feature_abandoned', { feature: 'bulk_job_wizard', step, rows: source.rows.length });
    onClose();
  };

  const stepTitle: Record<Step, string> = { 1: 'Endpoint & source', 2: 'Map & validate', 3: 'Review & run' };

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      title={<span className="flex items-center gap-2"><FileUp className="w-5 h-5 text-teal" /> New bulk job</span>}
      description={`Step ${step} of 3 · ${stepTitle[step]}`}
      widthClass="max-w-2xl"
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <Button variant="ghost" onClick={step === 1 ? handleClose : () => setStep((step - 1) as Step)} icon={step > 1 ? <ArrowLeft className="w-4 h-4" /> : undefined}>
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>
          <div className="flex items-center gap-2">
            {step === 3 && (
              <Button variant="secondary" onClick={() => submit(false)} disabled={!canProceedFrom2 || isBilling} loading={isSubmitting}>Save as draft</Button>
            )}
            {step < 3 ? (
              <Button onClick={() => setStep((step + 1) as Step)} disabled={step === 1 ? !canProceedFrom1 : !canProceedFrom2} icon={<ArrowRight className="w-4 h-4" />}>
                Continue
              </Button>
            ) : (
              <Button onClick={() => submit(true)} disabled={!canRun} loading={isSubmitting}>
                Create &amp; run · {creditCost.toLocaleString()} credits
              </Button>
            )}
          </div>
        </div>
      }
    >
      {/* Step indicator */}
      <ol aria-label="Steps" className="flex items-center gap-2 mb-6">
        {([1, 2, 3] as Step[]).map(s => (
          <li key={s} aria-current={s === step ? 'step' : undefined} className="flex items-center gap-2">
            <div className={cn('w-6 h-6 rounded-full text-[11px] font-black flex items-center justify-center border transition-colors', s < step ? 'bg-teal text-ink border-teal' : s === step ? 'border-teal text-teal' : 'border-border text-fg-subtle')} aria-hidden>
              {s < step ? <CheckCircle2 className="w-3.5 h-3.5" /> : s}
            </div>
            <span className={cn('text-xs font-bold', s === step ? 'text-fg' : 'text-fg-muted')}>{stepTitle[s]}</span>
            {s < 3 && <div className="w-6 h-px bg-border mx-1" aria-hidden />}
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="s1" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-6">
            <Field label="Endpoint" hint="One request per row. GET endpoints with a required input are eligible." htmlFor="job-endpoint" required>
              <Select id="job-endpoint" value={endpointId} onChange={e => { setEndpointId(e.target.value); if (source?.kind === 'sample') setSource(null); }}>
                {ELIGIBLE.map(e => <option key={e.id} value={e.id}>{e.name} — {e.creditCost} credit{e.creditCost === 1 ? '' : 's'}/row</option>)}
              </Select>
            </Field>
            {endpoint && (
              <p className="text-xs text-fg-muted -mt-3 font-mono">{endpoint.method} {endpoint.path} · needs {endpoint.parameters.filter(p => p.required).map(p => p.name).join(', ') || 'no'} required field{endpoint.parameters.filter(p => p.required).length === 1 ? '' : 's'}</p>
            )}

            {/* Upload */}
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) void loadFile(f); }}
              className={cn('rounded-2xl border-2 border-dashed p-6 text-center transition-colors', isDragging ? 'border-teal bg-teal/5' : 'border-border hover:border-teal/40 bg-glass')}
            >
              <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void loadFile(f); e.target.value = ''; }} />
              <FileUp className="w-8 h-8 text-teal mx-auto mb-2" />
              <p className="text-sm font-bold text-fg">Drop a CSV here, or <button type="button" onClick={() => fileInputRef.current?.click()} className="text-teal underline underline-offset-2">browse</button></p>
              <p className="text-xs text-fg-muted mt-1">Header row required · comma, semicolon, or tab · up to {BULK_JOB_ROW_CAP.toLocaleString()} rows per job</p>
              <p aria-live="polite" className={cn('text-xs text-teal mt-2 font-bold flex items-center justify-center gap-1.5 transition-opacity', isParsing ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden mt-0')}>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Parsing…
              </p>
            </div>

            {/* Paste */}
            <Field label="…or paste a list" hint={`One ${endpoint?.parameters.find(p => p.required)?.name ?? 'value'} per line.`} htmlFor="job-paste">
              <div className="flex gap-2 items-start">
                <Textarea id="job-paste" value={pasteText} onChange={e => setPasteText(e.target.value)} rows={3} mono placeholder={endpoint?.parameters.find(p => p.required)?.example ?? ''} className="flex-1" />
                <Button variant="secondary" size="sm" onClick={loadPaste} disabled={!pasteText.trim()} icon={<ClipboardPaste className="w-4 h-4" />}>Use list</Button>
              </div>
            </Field>

            {/* Sample */}
            <button type="button" onClick={loadSample} aria-label="Load sample dataset" className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl bg-surface-2 border border-border hover:border-teal/30 transition-colors text-left group">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-teal/10 text-teal"><Sparkles className="w-4 h-4" /></div>
                <div>
                  <div className="text-sm font-bold text-fg group-hover:text-teal transition-colors">Try with sample data</div>
                  <div className="text-xs text-fg-muted">{SAMPLE_SIZE} synthetic rows shaped for {endpoint?.name ?? 'this endpoint'} — three are deliberately invalid so you can see skips.</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-fg-subtle group-hover:text-teal" />
            </button>

            {sourceError && (
              <div role="alert" className="flex items-start gap-2 text-sm text-semantic-error bg-semantic-error/10 border border-semantic-error/20 rounded-xl p-3">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {sourceError}
              </div>
            )}
            {source && (
              <GlassCard padding="sm" className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Rows3 className="w-4 h-4 text-teal flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-fg truncate">{source.fileName ?? (source.kind === 'sample' ? 'Sample dataset' : 'Pasted list')}</div>
                    <div className="text-xs text-fg-muted">{source.rows.length.toLocaleString()} rows · {source.columns.length} column{source.columns.length === 1 ? '' : 's'}{source.truncated ? ` · truncated to ${BULK_JOB_ROW_CAP.toLocaleString()}` : ''}</div>
                  </div>
                </div>
                <StatusBadge tone={source.truncated ? 'warning' : 'success'} dot>{source.truncated ? 'Truncated' : 'Loaded'}</StatusBadge>
              </GlassCard>
            )}
          </motion.div>
        )}

        {step === 2 && endpoint && source && (
          <motion.div key="s2" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-6">
            <Field label="Job name" required htmlFor="job-name">
              <Input id="job-name" value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="Q3 leads · phone append" />
            </Field>

            <div>
              <div className="text-xs font-black text-fg-muted uppercase tracking-widest mb-2">Column mapping</div>
              <div className="space-y-3">
                {endpoint.parameters.map(p => (
                  <div key={p.name} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <div className="text-sm">
                      <span className="font-mono font-bold text-fg">{p.name}</span>
                      {p.required && <span className="ml-1 text-semantic-error">*</span>}
                      <div className="text-[11px] text-fg-muted">{p.type} · {p.description}</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-fg-subtle hidden sm:block" />
                    <Select id={`map-${p.name}`} aria-label={`Column for ${p.name}`} value={mapping[p.name] ?? ''} onChange={e => setMapping(m => ({ ...m, [p.name]: e.target.value }))} invalid={p.required && !mapping[p.name]}>
                      <option value="">{p.required ? 'Choose a column…' : 'Not mapped (optional)'}</option>
                      {source.columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </Select>
                  </div>
                ))}
              </div>
              {requiredUnmapped.length > 0 && (
                <p className="text-xs text-semantic-error mt-2 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Map {requiredUnmapped.map(p => p.name).join(', ')} to continue.</p>
              )}
            </div>

            <Field label="API key" required hint={usableKeys.length === 0 ? `No active ${environment} key has the scope for this endpoint.` : `Only active ${environment} keys with the right scope are listed.`} htmlFor="job-key">
              <Select id="job-key" value={keyId} onChange={e => setKeyId(e.target.value)} invalid={!keyId}>
                {usableKeys.length === 0 && <option value="">No usable key</option>}
                {usableKeys.map(k => <option key={k.id} value={k.id}>{k.name} · {k.prefix ?? k.key.slice(0, 12)}…</option>)}
              </Select>
              {usableKeys.length === 0 && <Link href="/console/keys" className="text-xs text-teal font-bold mt-1 inline-block">Create a key →</Link>}
            </Field>

            {/* Validation preview */}
            <GlassCard padding="sm">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-black text-fg-muted uppercase tracking-widest">Validation preview</div>
                <div className="flex items-center gap-2">
                  <StatusBadge tone="success" dot>{validation.valid.toLocaleString()} valid</StatusBadge>
                  {validation.skipped > 0 && <StatusBadge tone="warning" dot>{validation.skipped.toLocaleString()} will be skipped</StatusBadge>}
                </div>
              </div>
              {validation.reasons.length > 0 ? (
                <ul className="space-y-1">
                  {validation.reasons.map(r => (
                    <li key={r.reason} className="flex items-center justify-between text-xs"><span className="text-fg-muted">{r.reason}</span><span className="font-mono text-fg">{r.count}</span></li>
                  ))}
                  <li className="text-[11px] text-fg-subtle pt-1">Skipped rows never reach the gateway and are never billed.</li>
                </ul>
              ) : (
                <p className="text-xs text-fg-muted flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-teal" /> Every row passes validation for {endpoint.name}.</p>
              )}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-fg-subtle">{endpoint.parameters.map(p => <th key={p.name} className="py-1 pr-3 font-bold">{p.name}</th>)}</tr></thead>
                  <tbody>
                    {mappedRows.slice(0, 4).map((r, i) => (
                      <tr key={i} className="border-t border-border-subtle">{endpoint.parameters.map(p => <td key={p.name} className="py-1 pr-3 font-mono text-fg truncate max-w-[180px]">{r[p.name] || <span className="text-fg-subtle">—</span>}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {step === 3 && endpoint && source && (
          <motion.div key="s3" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-6">
            <div className="grid grid-cols-2 gap-3">
              <GlassCard padding="sm">
                <div className="text-[11px] uppercase tracking-widest text-fg-muted font-bold flex items-center gap-1"><Rows3 className="w-3.5 h-3.5" /> Rows</div>
                <div className="text-2xl font-black text-fg mt-1">{validation.valid.toLocaleString()}</div>
                <div className="text-xs text-fg-muted">{validation.skipped ? `${validation.skipped} skipped · ` : ''}of {source.rows.length.toLocaleString()} uploaded</div>
              </GlassCard>
              <GlassCard padding="sm" className={cn(shortfall > 0 && 'border-semantic-error/40')}>
                <div className="text-[11px] uppercase tracking-widest text-fg-muted font-bold flex items-center gap-1"><Coins className="w-3.5 h-3.5" /> Credit cost</div>
                <div className={cn('text-2xl font-black mt-1', shortfall > 0 ? 'text-semantic-error' : 'text-fg')}>{creditCost.toLocaleString()}</div>
                <div className="text-xs text-fg-muted">{endpoint.creditCost}/row · balance {creditBalance.toLocaleString()} → {Math.max(0, creditBalance - creditCost).toLocaleString()} after</div>
              </GlassCard>
              <GlassCard padding="sm">
                <div className="text-[11px] uppercase tracking-widest text-fg-muted font-bold flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Estimated time</div>
                <div className="text-2xl font-black text-fg mt-1">{formatDuration(estMs)}</div>
                <div className="text-xs text-fg-muted">at {concurrency} parallel requests</div>
              </GlassCard>
              <GlassCard padding="sm">
                <div className="text-[11px] uppercase tracking-widest text-fg-muted font-bold flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5" /> Environment</div>
                <div className="text-2xl font-black text-fg mt-1 capitalize">{environment}</div>
                <div className="text-xs text-fg-muted">{environment === 'live' ? 'PII fields are masked in results' : 'Full synthetic data returned'}</div>
              </GlassCard>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-bold text-fg">Concurrency</div>
                <div className="text-xs text-fg-muted">Higher is faster but more likely to hit your rate limit. The runner backs off automatically on 429.</div>
              </div>
              <SegmentedControl<Concurrency> layoutId="job-concurrency" size="sm" value={concurrency} onChange={setConcurrency} options={[{ value: '2', label: '2×' }, { value: '4', label: '4×' }, { value: '8', label: '8×' }]} />
            </div>

            {shortfall > 0 && (
              <div role="alert" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-semantic-error/30 bg-semantic-error/5 p-4">
                <div className="flex items-start gap-2">
                  <Wallet className="w-4 h-4 text-semantic-error mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-sm font-bold text-fg">You’re {shortfall.toLocaleString()} credits short</div>
                    <div className="text-xs text-fg-muted">Recharge to run all {validation.valid.toLocaleString()} rows, or save as a draft and run later.</div>
                  </div>
                </div>
                <Link href="/console/billing" onClick={() => track('upgrade_prompt_clicked', { surface: 'bulk-wizard', shortfall })} className="text-xs font-bold px-3 py-2 rounded-lg bg-teal/15 text-teal border border-teal/30 hover:bg-teal/25 transition-colors whitespace-nowrap">Recharge credits</Link>
              </div>
            )}
            {isBilling && (
              <div className="text-xs text-fg-muted flex items-center gap-2"><ShieldAlert className="w-4 h-4" /> Your role (billing) can review jobs but not run them. Ask an admin or developer to start it.</div>
            )}

            <div className="text-xs text-fg-muted leading-relaxed">
              Each row is one real request to <span className="font-mono text-fg">{endpoint.method} {endpoint.path}</span> with your key. Every call appears in Logs and Analytics; credits are deducted only for successful responses. Failed rows can be retried without re-running the rest.
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Drawer>
  );
}

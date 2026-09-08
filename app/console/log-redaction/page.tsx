'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileLock2, ShieldCheck, RefreshCw, Send, Copy, Check, X, AlertTriangle, FlaskConical, Sparkles, Lock, KeyRound,
  Plus, ArrowRight, BadgeCheck, Terminal, ListFilter, Users, Hash, Eraser, Info, Fingerprint, ScrollText, ChevronDown,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { authHeaderValue } from '@/lib/api-config';
import { ENDPOINTS } from '@/data/endpoints';
import { orgHandleForKey } from '@/lib/encryption';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import RoleGuard from '@/components/RoleGuard';
import {
  PageHeader, KpiTile, GlassCard, Button, EmptyState, Skeleton, StatusBadge, DataTable, ConfirmAction, Select, Textarea,
  SegmentedControl, type Column, type BadgeTone,
} from '@/components/ui';
import {
  useLogRedactionPolicy, LOG_PII_CATALOG, ALL_STRATEGIES, RETENTION_OPTIONS, MAX_CUSTOM_KEYS, LOG_REDACTION_POSTURE, TAIL_CAPACITY,
  redactLogRecord, selfTest, logPolicyStrength, strengthLabel, isLogStrategyAllowed, canEditLogRedaction, effectiveLogPolicy,
  normalizeKeyList, renderRedaction,
  type LogRedactionPolicy, type LogRedactStrategy, type LogPiiType, type LogRedactionReport, type RedactedLogLine,
  type RedactionFinding, type SelfTestCheck, type LogRetentionDays, type LogPiiSpec,
} from '@/lib/log-redaction';

// ── Constants ────────────────────────────────────────────────────────────────

const SECTION = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };
const MAX_TESTER_BYTES = 16_384;
const SAMPLE_EMAIL = 'jordan.rivera@northwind.io';
/** The sample request hits the catalog's phone-lookup endpoint; its credit cost comes from the catalog, never hardcoded. */
const SAMPLE_ENDPOINT = ENDPOINTS.find((e) => e.path === '/v1/people/phone');
const SAMPLE_CREDITS = SAMPLE_ENDPOINT?.creditCost ?? 0;
type RetentionValue = `${LogRetentionDays}`;

const STRATEGY_META: Record<LogRedactStrategy, { label: string; blurb: string; tone: BadgeTone }> = {
  partial: { label: 'Partial', blurb: 'Some characters kept (c•••o@…)', tone: 'warning' },
  token: { label: 'Token', blurb: 'Deterministic per-org pseudonym — traceable, not readable', tone: 'info' },
  drop: { label: 'Drop', blurb: 'Removed entirely', tone: 'success' },
};

const LEVEL_TONE: Record<RedactedLogLine['level'], BadgeTone> = { INFO: 'neutral', WARN: 'warning', ERROR: 'error' };

/** A realistic gateway log context — the kind of thing the tester exists for. */
const SAMPLE_INPUT = JSON.stringify({
  requestId: 'req_01j7x2k9v4',
  method: 'POST',
  path: '/v1/people/resolve',
  headers: { authorization: 'Bearer sk_live_EXAMPLE-NOT-A-REAL-KEY', 'x-forwarded-for': '203.0.113.42' },
  body: { email: 'priya.nair@meridianlabs.in', phone: '+91 98450 12345', full_name: 'Priya Nair', company: 'Meridian Labs', linkedin_url: 'https://linkedin.com/in/priyanair' },
  note: 'Customer asked us to re-run for priya.nair@meridianlabs.in; PAN ABCPN1234K on file.',
}, null, 2);

type ReportState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; data: LogRedactionReport }
  | { status: 'error'; message: string; httpStatus: number | null };

type DryRunState =
  | { status: 'ok'; matches: boolean; total: number }
  | { status: 'error'; message: string };

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function parseTesterInput(raw: string): { value: unknown; kind: 'json' | 'text' } {
  const t = raw.trim();
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try { return { value: JSON.parse(t), kind: 'json' }; } catch { /* fall through to text */ }
  }
  return { value: raw, kind: 'text' };
}

// ── Page ─────────────────────────────────────────────────────────────────────

function LogRedactionInner() {
  const { user, environment, activeKeys, privacySettings } = useStore();
  const store = useLogRedactionPolicy();
  const toast = useToast();
  const router = useRouter();
  const isAdmin = canEditLogRedaction(user?.role);

  const apiKey = useMemo(
    () => activeKeys.find((k) => k.environment === environment)?.key ?? activeKeys[0]?.key ?? '',
    [activeKeys, environment],
  );
  const noKeys = !apiKey;
  const org = useMemo(() => orgHandleForKey(apiKey || undefined), [apiKey]);
  /** The key may fall back to the other environment's key — bill/copy by the key's own prefix. */
  const keyEnv: 'sandbox' | 'live' = apiKey.startsWith('sk_live_') ? 'live' : 'sandbox';
  const sampleCostCopy = keyEnv === 'live' && SAMPLE_CREDITS > 0 ? `${SAMPLE_CREDITS} credits (live)` : 'free in sandbox';

  // The org's Logs privacy keys are always part of the internal policy — one list of "never log this".
  const privacyKeys = useMemo(() => normalizeKeyList(privacySettings.customKeys), [privacySettings.customKeys]);
  const policy: LogRedactionPolicy = useMemo(
    () => effectiveLogPolicy({ strategies: store.strategies, customKeys: store.customKeys, allowKeys: store.allowKeys, retentionDays: store.retentionDays }, privacyKeys),
    [store.strategies, store.customKeys, store.allowKeys, store.retentionDays, privacyKeys],
  );
  const strength = useMemo(() => logPolicyStrength(policy), [policy]);
  const localSelfTest = useMemo(() => selfTest(policy, org), [policy, org]);

  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [report, setReport] = useState<ReportState>({ status: 'idle' });
  const [synced, setSynced] = useState<'idle' | 'syncing' | 'ok' | 'error'>('idle');
  const [copied, setCopied] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const keyCount = activeKeys.length;
  useEffect(() => {
    track('log_redaction_viewed', { environment, keys: keyCount, strength });
    const t = setTimeout(() => setPhase('ready'), 260);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one view event per environment
  }, [environment]);

  // ── Gateway report (what was actually written) ──
  const loadReport = useCallback(async (): Promise<LogRedactionReport | null> => {
    if (!apiKey) { setReport({ status: 'idle' }); return null; }
    setReport((r) => (r.status === 'ok' ? r : { status: 'loading' }));
    try {
      const res = await fetch('/api/v1/logs/redaction', { headers: { Authorization: authHeaderValue(apiKey) } });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.data) {
        setReport({ status: 'error', httpStatus: res.status, message: body?.error?.message ?? `Gateway returned HTTP ${res.status}.` });
        return null;
      }
      const data = body.data as LogRedactionReport;
      setReport({ status: 'ok', data });
      return data;
    } catch {
      setReport({ status: 'error', httpStatus: null, message: 'Could not reach the gateway. Check your connection and retry.' });
      return null;
    }
  }, [apiKey]);

  // ── Admins sync the policy to the gateway (debounced), then re-read the report.
  //    Non-admins never PATCH — a stale local policy must not overwrite the org's. ──
  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    if (!isAdmin) {
      loadReport().then((data) => {
        if (!cancelled && data) track('log_redaction_attested', { leaks: data.selfTest.leaks, lines: data.metrics.lines, strength: data.strength, matches: data.selfTest.checks.every((c, i) => c.after === localSelfTest.checks[i]?.after) });
      });
      return () => { cancelled = true; };
    }
    setSynced('syncing');
    const t = setTimeout(() => {
      fetch('/api/v1/logs/redaction', {
        method: 'PATCH',
        headers: { Authorization: authHeaderValue(apiKey), 'Content-Type': 'application/json' },
        body: JSON.stringify(policy),
      })
        .then((r) => { if (!cancelled) setSynced(r.ok ? 'ok' : 'error'); })
        .catch(() => { if (!cancelled) setSynced('error'); })
        .then(() => { if (!cancelled) return loadReport(); return null; })
        .then((data) => {
          if (!cancelled && data) {
            const matches = data.selfTest.checks.every((c, i) => c.after === localSelfTest.checks[i]?.after);
            track('log_redaction_attested', { leaks: data.selfTest.leaks, lines: data.metrics.lines, strength: data.strength, matches });
          }
        });
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [apiKey, policy, loadReport, localSelfTest, isAdmin]);

  // ── Redaction Tester (runs the gateway engine in the browser) ──
  const [testerInput, setTesterInput] = useState('');
  const [dryRun, setDryRun] = useState<DryRunState | null>(null);
  const [dryRunning, setDryRunning] = useState(false);
  const testerBytes = testerInput.length;
  const overCap = testerBytes > MAX_TESTER_BYTES;

  const tester = useMemo(() => {
    if (!testerInput.trim() || overCap) return null;
    const parsed = parseTesterInput(testerInput);
    const result = redactLogRecord(parsed.value, policy, org);
    const after = parsed.kind === 'json' ? JSON.stringify(result.redacted, null, 2) : String(result.redacted);
    return { ...result, kind: parsed.kind, after };
  }, [testerInput, overCap, policy, org]);

  // One event per distinct input (debounced) — counts only, never the content.
  useEffect(() => {
    if (!tester) return;
    const t = setTimeout(() => track('log_redaction_tested', { source: 'local', findings: tester.total, kind: tester.kind }), 700);
    return () => clearTimeout(t);
  }, [tester]);

  const runAtGateway = useCallback(async () => {
    if (!apiKey || !tester) return;
    setDryRunning(true);
    setDryRun(null);
    try {
      const res = await fetch('/api/v1/logs/redaction/test', {
        method: 'POST',
        headers: { Authorization: authHeaderValue(apiKey), 'Content-Type': tester.kind === 'json' ? 'application/json' : 'text/plain' },
        body: testerInput,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.data) { setDryRun({ status: 'error', message: body?.error?.message ?? `Gateway returned HTTP ${res.status}.` }); return; }
      const gateway = body.data as { redacted: unknown; total: number };
      const gatewayAfter = tester.kind === 'json' ? JSON.stringify(gateway.redacted, null, 2) : String(gateway.redacted);
      const matches = gatewayAfter === tester.after;
      setDryRun({ status: 'ok', matches, total: gateway.total });
      track('log_redaction_tested', { source: 'gateway', findings: gateway.total, matches });
      toast[matches ? 'success' : 'error'](matches ? 'Gateway output matches your browser byte for byte' : 'Gateway output differs from your browser', `${gateway.total} value${gateway.total === 1 ? '' : 's'} stripped at the gateway. Nothing was logged.`);
    } catch {
      setDryRun({ status: 'error', message: 'Could not reach the gateway.' });
    } finally {
      setDryRunning(false);
    }
  }, [apiKey, tester, testerInput, toast]);

  // ── Send a real request so a line lands in the tail ──
  const sendSample = useCallback(async () => {
    if (!apiKey) return;
    setSending(true);
    const started = Date.now();
    try {
      const path = `${SAMPLE_ENDPOINT?.path ?? '/v1/people/phone'}?email=${encodeURIComponent(SAMPLE_EMAIL)}`;
      const res = await fetch(`/api${path}`, { headers: { Authorization: authHeaderValue(apiKey) } });
      const body = await res.json().catch(() => null);
      const stripped = Number(res.headers.get('X-Log-Redaction') ?? '0');
      const requestId = String(body?.metadata?.requestId ?? res.headers.get('X-Request-Id') ?? `req_${started.toString(36)}`);
      // Mirror it into the console's request log so the request-id link below resolves in Logs.
      useStore.getState().logApiRequest({
        id: requestId,
        environment,
        timestamp: new Date(started).toISOString(),
        method: 'GET',
        path,
        status: res.status,
        duration: Date.now() - started,
        ip: '203.0.113.7',
        // Never mirror the plaintext key into the persisted request log — the same fingerprint the gateway writes.
        request: { headers: { Authorization: renderRedaction(apiKey, 'secret', 'drop', org), 'User-Agent': 'zinbit-console/log-redaction' }, parameters: { email: SAMPLE_EMAIL } },
        response: body,
      });
      track('log_redaction_sample_sent', { status: res.status, stripped, environment: keyEnv });
      toast.success('Sample request sent', `HTTP ${res.status} · X-Log-Redaction: ${stripped} — the internal line was written with its PII stripped. ${keyEnv === 'live' && SAMPLE_CREDITS > 0 ? `${SAMPLE_CREDITS} credits billed (live).` : 'Free in sandbox.'}`);
      await loadReport();
    } catch {
      toast.error('Could not reach the gateway', 'The sample request was not sent.');
    } finally {
      setSending(false);
    }
  }, [apiKey, org, environment, keyEnv, loadReport, toast]);

  // ── Policy mutations (admin) ──
  const [customDraft, setCustomDraft] = useState('');
  const [allowDraft, setAllowDraft] = useState('');
  const setStrategy = (type: LogPiiType, strategy: LogRedactStrategy) => {
    if (!isAdmin || !isLogStrategyAllowed(type, strategy)) return;
    store.setStrategy(user?.role, type, strategy);
    track('log_redaction_policy_updated', { field: 'strategy', type, strategy });
  };
  const addCustom = () => {
    if (!isAdmin) return;
    if (store.addCustomKey(user?.role, customDraft)) { track('log_redaction_policy_updated', { field: 'customKeys', action: 'add' }); setCustomDraft(''); }
    else toast.error('Key not added', `Use letters, digits, _ . : - (max 64 chars), no duplicates, up to ${MAX_CUSTOM_KEYS} keys.`);
  };
  const addAllow = () => {
    if (!isAdmin) return;
    if (store.addAllowKey(user?.role, allowDraft)) { track('log_redaction_policy_updated', { field: 'allowKeys', action: 'add' }); setAllowDraft(''); }
    else toast.error('Key not allowlisted', 'Secret-shaped names (authorization, token, password…) can never be allowlisted.');
  };
  const setRetention = (days: LogRetentionDays) => {
    if (!isAdmin) return;
    store.setRetention(user?.role, days);
    track('log_redaction_policy_updated', { field: 'retentionDays', days });
  };
  const reset = () => {
    if (!isAdmin) return;
    store.resetPolicy(user?.role);
    track('log_redaction_policy_updated', { field: 'reset' });
    toast.info('Policy reset to defaults', 'Synced to the gateway.');
  };

  const copy = (text: string, tag: string) => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(tag); setTimeout(() => setCopied(null), 1400); }).catch(() => {});
  };
  const copyAttestation = () => {
    if (report.status !== 'ok') return;
    const { org: o, generatedAt, strength: s, selfTest: st, metrics, posture, policy: p } = report.data;
    copy(JSON.stringify({ feature: 'PII redaction in internal logs', org: o, generatedAt: new Date(generatedAt).toISOString(), strength: s, selfTest: st, metrics, posture, policy: p }, null, 2), 'attestation');
    track('log_redaction_attestation_copied', { leaks: st.leaks, strength: s });
  };

  const gatewayMatches = report.status === 'ok'
    ? report.data.selfTest.checks.every((c, i) => c.after === localSelfTest.checks[i]?.after)
    : null;

  // ── Columns ──
  const findingColumns: Column<RedactionFinding & { i: number }>[] = [
    { key: 'path', header: 'Field', render: (f) => <span className="font-mono text-[11px] text-fg break-all">{f.path}</span> },
    { key: 'type', header: 'Type', render: (f) => <span className="text-[11px] text-fg">{LOG_PII_CATALOG.find((s) => s.type === f.type)?.label ?? f.type}</span> },
    { key: 'detector', header: 'Found by', className: 'hidden md:table-cell', render: (f) => <StatusBadge tone={f.detector === 'key' ? 'neutral' : 'teal'}>{f.detector === 'key' ? 'field name' : 'value scan'}</StatusBadge> },
    { key: 'after', header: 'Written as', align: 'right', render: (f) => <span className="font-mono text-[11px] text-fg-muted break-all">{f.after}</span> },
  ];

  const checkColumns: Column<SelfTestCheck>[] = [
    { key: 'label', header: 'Detector', render: (c) => <span className="text-[12px] font-bold text-fg">{c.label}</span> },
    { key: 'detector', header: 'Found by', className: 'hidden md:table-cell', render: (c) => <span className="text-[11px] text-fg-muted">{c.detector === 'both' ? 'field name + value scan' : c.detector === 'key' ? 'field name' : 'value scan'}</span> },
    { key: 'redacted', header: 'Canary hits', align: 'right', sortValue: (c) => c.redacted, render: (c) => <span className="font-mono text-[11px] text-fg">{c.redacted}</span> },
    { key: 'after', header: 'Written as', className: 'hidden lg:table-cell', render: (c) => <span className="font-mono text-[11px] text-fg-muted break-all">{c.after}</span> },
    { key: 'status', header: 'Result', align: 'right', render: (c) => <StatusBadge tone={c.survived || c.redacted === 0 ? 'error' : 'success'}>{c.survived ? 'leaked' : c.redacted === 0 ? 'not detected' : 'stripped'}</StatusBadge> },
  ];

  const policyRows: LogPiiSpec[] = LOG_PII_CATALOG;

  return (
    <div className="max-w-[1100px] mx-auto pb-16">
      <PageHeader
        icon={<FileLock2 />}
        title="Log Redaction"
        description="The gateway’s own logs never carry your customers’ PII or your secrets. Every internal line is redacted by your org’s policy before it is written — PII becomes per-org correlation tokens so incidents stay traceable, secrets become their sha256: fingerprint, and request IDs are never touched. Test it on anything, watch the live tail, and pull the attestation."
        actions={
          <Button variant="secondary" size="sm" onClick={() => loadReport()} loading={report.status === 'loading' && phase === 'ready'} disabled={noKeys} icon={<RefreshCw className="w-4 h-4" />} title={noKeys ? 'Create an API key to read the gateway' : 'Re-read GET /v1/logs/redaction'}>
            Refresh
          </Button>
        }
      />

      {noKeys && (
        <motion.div {...SECTION} className="mt-6 rounded-2xl border border-teal/30 bg-teal/5 p-4 flex items-start gap-3 flex-wrap">
          <KeyRound className="w-5 h-5 text-teal shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-fg">Create a key to read what the gateway actually wrote</div>
            <p className="text-[12px] text-fg-muted mt-0.5">The Redaction Tester works without a key — it runs the engine in your browser. With one, you can sync your policy, see the live tail and pull the attestation.</p>
          </div>
          <Button size="sm" icon={<KeyRound className="w-4 h-4" />} onClick={() => router.push('/console/keys')}>Create a key</Button>
        </motion.div>
      )}

      {phase === 'loading' ? (
        <div className="mt-6" aria-busy="true" aria-label="Loading log redaction">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiTile loading label="Lines written" value="" icon={<Terminal />} />
            <KpiTile loading label="Values stripped" value="" icon={<Eraser />} />
            <KpiTile loading label="Plaintext leaks" value="" icon={<ShieldCheck />} />
            <KpiTile loading label="Policy strength" value="" icon={<Lock />} />
          </div>
          <Skeleton variant="block" className="h-[340px] mt-5" />
          <Skeleton variant="block" className="h-[300px] mt-5" />
          <Skeleton variant="block" className="h-[420px] mt-5" />
          <Skeleton variant="block" className="h-[360px] mt-5" />
          <Skeleton variant="block" className="h-[260px] mt-5" />
        </div>
      ) : (
        <>

          <motion.div {...SECTION} className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <KpiTile label="Lines written" value={report.status === 'ok' ? report.data.metrics.lines.toLocaleString() : '—'} icon={<Terminal />} hint={report.status === 'ok' ? 'since the gateway started · your org' : noKeys ? 'needs a key' : report.status === 'error' ? 'gateway unavailable' : 'reading the gateway'} />
            <KpiTile label="Values stripped" value={report.status === 'ok' ? report.data.metrics.findings.toLocaleString() : '—'} icon={<Eraser />} hint={report.status === 'ok' ? `${LOG_PII_CATALOG.filter((s) => (report.data.metrics.byType[s.type] ?? 0) > 0).length} PII types seen` : 'PII + secrets removed from lines'} />
            <KpiTile label="Plaintext leaks" value={report.status === 'ok' ? report.data.selfTest.leaks : localSelfTest.leaks} icon={<ShieldCheck />} hint={report.status === 'ok' ? `canary self-test · ${report.data.selfTest.checks.length} detectors` : `canary self-test in your browser · ${localSelfTest.checks.length} detectors`} lowerIsBetter />
            <KpiTile label="Policy strength" value={`${strength}`} icon={<Lock />} hint={`${strengthLabel(strength)} · ${environment} + ${environment === 'sandbox' ? 'live' : 'sandbox'} alike`} />
          </motion.div>

          {/* Redaction Tester */}
          <motion.div {...SECTION} transition={{ delay: 0.04 }}>
            <GlassCard className="p-5 mt-5">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <FlaskConical className="w-4 h-4 text-teal" />
                <h3 className="text-sm font-bold text-fg">Redaction Tester</h3>
                <StatusBadge tone="success"><Lock className="w-3 h-3" /> runs in your browser</StatusBadge>
                <StatusBadge tone="neutral">same engine as the gateway</StatusBadge>
              </div>
              <p className="text-[12px] text-fg-muted mb-4">Paste a payload, a header block or a raw log line. What you see on the right is exactly what the gateway would write — the same function, the same policy, the same per-org token salt. To prove it, dry-run the identical input at the gateway: nothing is logged, and the two outputs must match byte for byte.</p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="min-w-0">
                  <div className="flex items-center justify-between mb-1.5 gap-2">
                    <label htmlFor="tester-input" className="text-[10px] font-black uppercase tracking-widest text-fg-muted">Before — what you paste</label>
                    <span className={`text-[10px] font-mono ${overCap ? 'text-semantic-error' : 'text-fg-subtle'}`}>{testerBytes.toLocaleString()} / {MAX_TESTER_BYTES.toLocaleString()}</span>
                  </div>
                  <Textarea
                    id="tester-input"
                    value={testerInput}
                    onChange={(e) => { setTesterInput(e.target.value); setDryRun(null); }}
                    aria-invalid={overCap || undefined}
                    spellCheck={false}
                    rows={12}
                    className="font-mono text-[11px] min-h-[280px] resize-y"
                    placeholder={'{ "email": "someone@company.com", "authorization": "Bearer sk_live_…" }\nor a raw line: GET /v1/people/phone?email=… from 203.0.113.42'}
                  />
                  {overCap && <p className="mt-1.5 text-[11px] text-semantic-error inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Over the 16 KB cap — trim the payload to test it.</p>}
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="secondary" onClick={() => { setTesterInput(SAMPLE_INPUT); setDryRun(null); }} icon={<Sparkles className="w-4 h-4" />}>Load a sample</Button>
                    <Button size="sm" variant="secondary" onClick={runAtGateway} loading={dryRunning} disabled={!tester || noKeys} icon={<ShieldCheck className="w-4 h-4" />} title={noKeys ? 'Create an API key first' : 'POST /v1/logs/redaction/test — nothing is logged'}>Dry-run at gateway</Button>
                    {testerInput && (
                      <Button size="sm" variant="ghost" onClick={() => { setTesterInput(''); setDryRun(null); }} icon={<X className="w-4 h-4" />} aria-label="Clear the tester">Clear</Button>
                    )}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
                    <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted">After — as written to the log</div>
                    {tester && (
                      <div className="flex items-center gap-1.5">
                        <span role="status" aria-live="polite"><StatusBadge tone={tester.total > 0 ? 'teal' : 'neutral'}>{tester.total} value{tester.total === 1 ? '' : 's'} stripped</StatusBadge></span>
                        <button type="button" onClick={() => copy(tester.after, 'after')} aria-label={copied === 'after' ? 'Copied redacted output' : 'Copy redacted output'} className="rounded-md p-1 text-fg-muted hover:text-teal hover:bg-surface-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50">
                          {copied === 'after' ? <Check className="w-3.5 h-3.5 text-teal" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    )}
                  </div>
                  <AnimatePresence mode="wait" initial={false}>
                    {!tester ? (
                      <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-xl border border-border bg-surface p-4 min-h-[280px] flex flex-col items-center justify-center text-center">
                        <Eraser className="w-6 h-6 text-fg-muted mb-2" />
                        <div className="text-[12px] font-bold text-fg">Redacted output appears here</div>
                        <div className="text-[11px] text-fg-muted mt-0.5">Paste anything on the left, or load the sample.</div>
                      </motion.div>
                    ) : (
                      <motion.div key="result" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        <pre data-testid="tester-after" className="rounded-xl border border-teal/30 bg-teal/5 p-3 font-mono text-[11px] text-fg whitespace-pre-wrap break-all min-h-[280px] max-h-[420px] overflow-auto">{tester.after}</pre>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {dryRun && (
                    <div role="status" aria-live="polite" className="mt-2">
                      {dryRun.status === 'ok' ? (
                        <div className={`text-[11px] font-bold inline-flex items-center gap-1 ${dryRun.matches ? 'text-teal' : 'text-semantic-error'}`}>
                          {dryRun.matches ? <BadgeCheck className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                          Gateway: {dryRun.matches ? 'identical output' : 'output differs'} · {dryRun.total} stripped · nothing logged
                        </div>
                      ) : (
                        <div className="text-[11px] text-semantic-error inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {dryRun.message}</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {tester && tester.findings.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <ListFilter className="w-3.5 h-3.5 text-fg-muted" />
                    <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted">Findings</div>
                    {LOG_PII_CATALOG.filter((s) => tester.counts[s.type] > 0).map((s) => (
                      <StatusBadge key={s.type} tone="neutral">{s.label} × {tester.counts[s.type]}</StatusBadge>
                    ))}
                  </div>
                  <DataTable columns={findingColumns} rows={tester.findings.map((f, i) => ({ ...f, i }))} rowKey={(f) => `${f.i}`} pageSize={8} />
                </div>
              )}
            </GlassCard>
          </motion.div>

          {/* Live internal log tail */}
          <motion.div {...SECTION} transition={{ delay: 0.08 }}>
            <GlassCard className="p-5 mt-5 border-teal/20">
              <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <Terminal className="w-4 h-4 text-teal" />
                  <h3 className="text-sm font-bold text-fg">Internal log tail</h3>
                  {report.status === 'ok' && <StatusBadge tone="teal" dot pulse>live · {report.data.tail.length} of last {TAIL_CAPACITY}</StatusBadge>}
                </div>
                <Button size="sm" onClick={sendSample} loading={sending} disabled={noKeys} icon={<Send className="w-4 h-4" />} title={noKeys ? 'Create an API key first' : `GET ${SAMPLE_ENDPOINT?.path ?? '/v1/people/phone'}?email=${SAMPLE_EMAIL} with your active key · ${sampleCostCopy}`}>
                  Send a sample request
                </Button>
              </div>
              <p className="text-[12px] text-fg-muted mb-4">The last lines the gateway wrote for your org — exactly as written to stdout, read from <span className="font-mono">GET /v1/logs/redaction</span>. Send the sample twice: the same email becomes the same token both times, so you can trace it without ever reading it. The request ID links straight to Logs.</p>

              {noKeys ? (
                <EmptyState icon={<Terminal className="w-8 h-8" />} title="Create an API key to read the tail" description="Lines are attributed to your org by the key that made the request." action={<Button size="sm" onClick={() => router.push('/console/keys')}>Create a key</Button>} />
              ) : report.status === 'loading' || report.status === 'idle' ? (
                <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-11 rounded-lg" />)}</div>
              ) : report.status === 'error' ? (
                <div className="rounded-xl border border-semantic-error/30 bg-semantic-error/5 p-4 flex items-center gap-3 flex-wrap">
                  <AlertTriangle className="w-4 h-4 text-semantic-error shrink-0" />
                  <div className="text-[12px] text-fg flex-1 min-w-0"><span className="font-bold">Couldn’t read the tail{report.httpStatus ? ` (HTTP ${report.httpStatus})` : ''}.</span> {report.message}</div>
                  <Button variant="secondary" size="sm" onClick={() => loadReport()} icon={<RefreshCw className="w-4 h-4" />}>Retry</Button>
                </div>
              ) : report.data.tail.length === 0 ? (
                <EmptyState icon={<Terminal className="w-8 h-8" />} title="No internal lines for your org yet" description="Every gateway request writes at least one. Send a sample request and it appears here with its PII stripped." action={<Button size="sm" onClick={sendSample} loading={sending} icon={<Send className="w-4 h-4" />}>Send a sample request</Button>} />
              ) : (
                <ul className="space-y-1.5" aria-label="Internal log lines">
                  <AnimatePresence initial={false}>
                    {report.data.tail.map((l) => (
                      <motion.li key={l.id} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="rounded-xl border border-border bg-surface overflow-hidden">
                        <button type="button" onClick={() => setExpanded(expanded === l.id ? null : l.id)} aria-expanded={expanded === l.id} className="w-full text-left px-3 py-2 flex items-center gap-2 flex-wrap hover:bg-surface-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50">
                          <ChevronDown className={`w-3.5 h-3.5 text-fg-muted shrink-0 transition-transform ${expanded === l.id ? 'rotate-180' : ''}`} aria-hidden="true" />
                          <span className="font-mono text-[10px] text-fg-subtle tabular-nums">{formatTime(l.at)}</span>
                          <StatusBadge tone={LEVEL_TONE[l.level]}>{l.level}</StatusBadge>
                          <span className="font-mono text-[11px] text-fg truncate flex-1 min-w-[160px]" title={l.message}>{l.message}</span>
                          {l.findings > 0 ? <StatusBadge tone="teal"><Eraser className="w-3 h-3" /> {l.findings} stripped</StatusBadge> : <StatusBadge tone="neutral">clean</StatusBadge>}
                          {l.preview.map((p) => <span key={p} className="font-mono text-[10px] text-fg-muted rounded-md border border-border bg-glass px-1.5 py-0.5 truncate max-w-[220px]" title={l.types.map((t) => LOG_PII_CATALOG.find((s) => s.type === t)?.label ?? t).join(', ')}>{p}</span>)}
                        </button>
                        <AnimatePresence initial={false}>
                          {expanded === l.id && (
                            <motion.div key="raw" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="border-t border-border">
                              <pre className="px-3 py-2 font-mono text-[10px] text-fg-muted whitespace-pre-wrap break-all max-h-[200px] overflow-auto">{l.line}</pre>
                              <div className="px-3 pb-2 flex items-center gap-3 flex-wrap">
                                {l.requestId && (
                                  <Link href={`/console/logs?search=${encodeURIComponent(l.requestId)}`} className="text-[11px] font-bold text-teal hover:underline inline-flex items-center gap-1"><ScrollText className="w-3 h-3" /> Open {l.requestId} in Logs</Link>
                                )}
                                <button type="button" onClick={() => copy(l.line, l.id)} className="text-[11px] font-bold text-fg-muted hover:text-teal inline-flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 rounded-md">{copied === l.id ? <Check className="w-3 h-3 text-teal" /> : <Copy className="w-3 h-3" />} Copy line</button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </GlassCard>
          </motion.div>

          {/* Policy */}
          <motion.div {...SECTION} transition={{ delay: 0.12 }}>
            <GlassCard className="p-5 mt-5">
              <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <Lock className="w-4 h-4 text-teal" />
                  <h3 className="text-sm font-bold text-fg">Redaction policy</h3>
                  <StatusBadge tone={strength >= 85 ? 'success' : strength >= 60 ? 'info' : 'warning'}>{strengthLabel(strength)} · {strength}</StatusBadge>
                  {!noKeys && (
                    synced === 'ok' ? <StatusBadge tone="success"><Check className="w-3 h-3" /> enforced at the gateway</StatusBadge>
                      : synced === 'syncing' ? <StatusBadge tone="neutral"><RefreshCw className="w-3 h-3 animate-spin" /> syncing</StatusBadge>
                        : synced === 'error' ? <StatusBadge tone="error"><AlertTriangle className="w-3 h-3" /> sync failed — gateway keeps its last policy</StatusBadge>
                          : null
                  )}
                </div>
                {isAdmin ? (
                  <ConfirmAction variant="ghost" size="sm" onConfirm={reset} confirmLabel="Reset to defaults?" icon={<RefreshCw className="w-4 h-4" />}>Reset</ConfirmAction>
                ) : (
                  <span className="text-[11px] text-fg-muted inline-flex items-center gap-1"><Info className="w-3.5 h-3.5" /> Read-only — only org admins change the policy</span>
                )}
              </div>
              <p className="text-[12px] text-fg-muted mb-4">Pick how each kind of PII is written. Every type has a floor you can’t relax below, secrets and IDs are fixed, and there is no off switch — by design. Changes sync to the gateway within a second.</p>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-black uppercase tracking-widest text-fg-muted">
                      <th className="py-2 pr-3 font-black">PII type</th>
                      <th className="py-2 pr-3 font-black hidden md:table-cell">Found by</th>
                      <th className="py-2 pr-3 font-black">Written as</th>
                      <th className="py-2 font-black text-right">Floor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {policyRows.map((spec) => {
                      const current = policy.strategies[spec.type];
                      const allowed = ALL_STRATEGIES.filter((s) => isLogStrategyAllowed(spec.type, s));
                      const editable = isAdmin && spec.configurable;
                      return (
                        <tr key={spec.type} className="border-t border-border-subtle align-top">
                          <td className="py-2.5 pr-3 min-w-[180px]">
                            <div className="text-[12px] font-bold text-fg">{spec.label}</div>
                            <div className="text-[11px] text-fg-muted">{spec.description}</div>
                          </td>
                          <td className="py-2.5 pr-3 hidden md:table-cell">
                            <div className="flex gap-1 flex-wrap">
                              <StatusBadge tone="neutral">field name</StatusBadge>
                              {spec.valueDetection && <StatusBadge tone="teal">value scan</StatusBadge>}
                            </div>
                          </td>
                          <td className="py-2.5 pr-3 min-w-[170px]">
                            {spec.type === 'secret' ? (
                              <div className="text-[11px] text-fg inline-flex items-center gap-1"><Fingerprint className="w-3.5 h-3.5 text-teal" /> sha256: fingerprint <span className="text-fg-muted">(fixed)</span></div>
                            ) : spec.configurable ? (
                              <div>
                                <Select aria-label={`Strategy for ${spec.label}`} value={current} disabled={!editable} onChange={(e) => setStrategy(spec.type, e.target.value as LogRedactStrategy)} className="text-[12px] py-1.5">
                                  {allowed.map((s) => <option key={s} value={s}>{STRATEGY_META[s].label}</option>)}
                                </Select>
                                <div className="text-[10px] text-fg-muted mt-1">{STRATEGY_META[current].blurb}</div>
                              </div>
                            ) : (
                              <div className="text-[11px] text-fg inline-flex items-center gap-1"><StatusBadge tone="success">Drop</StatusBadge> <span className="text-fg-muted">(fixed)</span></div>
                            )}
                          </td>
                          <td className="py-2.5 text-right"><span className="text-[11px] text-fg-muted">{spec.configurable ? STRATEGY_META[spec.minStrategy].label : 'fixed'}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-5">
                <div className="rounded-xl border border-border bg-surface p-4 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1"><Hash className="w-3.5 h-3.5 text-teal" /><div className="text-[12px] font-bold text-fg">Always-redacted fields</div></div>
                  <p className="text-[11px] text-fg-muted mb-2">Field names treated as secrets regardless of value. Your <Link href="/console/logs" className="text-teal hover:underline">Logs privacy keys</Link> are included automatically.</p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {privacyKeys.map((k) => <span key={`p-${k}`} title="From Logs privacy settings" className="inline-flex items-center gap-1 rounded-md border border-border bg-glass px-2 py-0.5 font-mono text-[10px] text-fg-muted">{k}</span>)}
                    {store.customKeys.map((k) => (
                      <span key={k} className="inline-flex items-center gap-1 rounded-md border border-teal/30 bg-teal/5 px-2 py-0.5 font-mono text-[10px] text-fg">
                        {k}
                        {isAdmin && <button type="button" onClick={() => { store.removeCustomKey(user?.role, k); track('log_redaction_policy_updated', { field: 'customKeys', action: 'remove' }); }} aria-label={`Remove ${k}`} className="text-fg-muted hover:text-semantic-error focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 rounded"><X className="w-3 h-3" /></button>}
                      </span>
                    ))}
                    {privacyKeys.length + store.customKeys.length === 0 && <span className="text-[11px] text-fg-subtle">Built-ins only (authorization, api_key, token, password, cookie…)</span>}
                  </div>
                  {isAdmin && (
                    <form onSubmit={(e) => { e.preventDefault(); addCustom(); }} className="flex items-center gap-1.5">
                      <input value={customDraft} onChange={(e) => setCustomDraft(e.target.value)} aria-label="Add an always-redacted field name" placeholder="internal_note" className="flex-1 min-w-0 rounded-lg border border-border bg-surface font-mono text-[11px] text-fg px-2.5 py-1.5 focus:outline-none focus:border-teal focus-visible:ring-2 focus-visible:ring-teal/50 placeholder:text-fg-subtle" />
                      <Button type="submit" size="sm" variant="secondary" disabled={!customDraft.trim()} icon={<Plus className="w-3.5 h-3.5" />} aria-label="Add always-redacted field">Add</Button>
                    </form>
                  )}
                </div>
                <div className="rounded-xl border border-border bg-surface p-4 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1"><ListFilter className="w-3.5 h-3.5 text-teal" /><div className="text-[12px] font-bold text-fg">Allowlisted fields</div></div>
                  <p className="text-[11px] text-fg-muted mb-2">Field names exempt from name-based classification (e.g. <span className="font-mono">name</span> when it holds company names). Values are still scanned; secret-shaped names can’t be allowlisted.</p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {store.allowKeys.map((k) => (
                      <span key={k} className="inline-flex items-center gap-1 rounded-md border border-border bg-glass px-2 py-0.5 font-mono text-[10px] text-fg">
                        {k}
                        {isAdmin && <button type="button" onClick={() => { store.removeAllowKey(user?.role, k); track('log_redaction_policy_updated', { field: 'allowKeys', action: 'remove' }); }} aria-label={`Remove ${k} from the allowlist`} className="text-fg-muted hover:text-semantic-error focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 rounded"><X className="w-3 h-3" /></button>}
                      </span>
                    ))}
                    {store.allowKeys.length === 0 && <span className="text-[11px] text-fg-subtle">None — every PII-shaped field name is redacted</span>}
                  </div>
                  {isAdmin && (
                    <form onSubmit={(e) => { e.preventDefault(); addAllow(); }} className="flex items-center gap-1.5">
                      <input value={allowDraft} onChange={(e) => setAllowDraft(e.target.value)} aria-label="Add an allowlisted field name" placeholder="company_name" className="flex-1 min-w-0 rounded-lg border border-border bg-surface font-mono text-[11px] text-fg px-2.5 py-1.5 focus:outline-none focus:border-teal focus-visible:ring-2 focus-visible:ring-teal/50 placeholder:text-fg-subtle" />
                      <Button type="submit" size="sm" variant="secondary" disabled={!allowDraft.trim()} icon={<Plus className="w-3.5 h-3.5" />} aria-label="Add allowlisted field">Add</Button>
                    </form>
                  )}
                </div>
                <div className="rounded-xl border border-border bg-surface p-4 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1"><ScrollText className="w-3.5 h-3.5 text-teal" /><div className="text-[12px] font-bold text-fg">Retention</div></div>
                  <p className="text-[11px] text-fg-muted mb-3">How long redacted internal lines are kept before they are purged from stdout archives and the SIEM.</p>
                  <SegmentedControl
                    layoutId="log-redaction-retention"
                    size="sm"
                    value={String(policy.retentionDays) as RetentionValue}
                    onChange={(v) => setRetention(Number(v) as LogRetentionDays)}
                    options={RETENTION_OPTIONS.map((d) => ({ value: String(d) as RetentionValue, label: `${d} days`, disabled: !isAdmin }))}
                  />
                  <div className="text-[10px] text-fg-muted mt-2">Applies to {environment} and {environment === 'sandbox' ? 'live' : 'sandbox'} alike — these are our logs, not your responses.</div>
                </div>
              </div>
            </GlassCard>
          </motion.div>

          {/* Attestation */}
          <motion.div {...SECTION} transition={{ delay: 0.16 }}>
            <GlassCard className="p-5 mt-5 border-teal/20">
              <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <ShieldCheck className="w-4 h-4 text-teal" />
                  <h3 className="text-sm font-bold text-fg">Attestation</h3>
                  {report.status === 'ok' ? (
                    <StatusBadge tone={report.data.selfTest.passed ? 'success' : 'error'}>{report.data.selfTest.passed ? '0 plaintext leaks' : `${report.data.selfTest.leaks} leaks`}</StatusBadge>
                  ) : (
                    <StatusBadge tone={localSelfTest.passed ? 'success' : 'error'}>{localSelfTest.passed ? '0 plaintext leaks · browser' : `${localSelfTest.leaks} leaks`}</StatusBadge>
                  )}
                  {!noKeys && report.status === 'loading' && <StatusBadge tone="neutral"><RefreshCw className="w-3 h-3 animate-spin" /> syncing with the gateway</StatusBadge>}
                  {gatewayMatches === true && <StatusBadge tone="success"><BadgeCheck className="w-3 h-3" /> gateway matches your browser</StatusBadge>}
                  {gatewayMatches === false && <StatusBadge tone="error"><AlertTriangle className="w-3 h-3" /> gateway differs from your browser</StatusBadge>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button size="sm" variant="secondary" onClick={copyAttestation} disabled={report.status !== 'ok'} icon={copied === 'attestation' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}>{copied === 'attestation' ? 'Copied' : 'Copy attestation'}</Button>
                  <Link href="/console/settings/team" className="text-[11px] font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Invite your security reviewer</Link>
                </div>
              </div>
              <p className="text-[12px] text-fg-muted mb-4">A canary record built from synthetic values — every PII type, in fields and in free text — is pushed through the gateway’s engine on every report. Each detector must fire and no raw value may survive. Your browser runs the identical test with your policy; the two must agree.</p>
              {noKeys || report.status === 'idle' || report.status === 'loading' ? (
                <DataTable columns={checkColumns} rows={localSelfTest.checks} rowKey={(c) => c.type} />
              ) : report.status === 'error' ? (
                <div className="rounded-xl border border-semantic-error/30 bg-semantic-error/5 p-4 flex items-center gap-3 flex-wrap">
                  <AlertTriangle className="w-4 h-4 text-semantic-error shrink-0" />
                  <div className="text-[12px] text-fg flex-1 min-w-0"><span className="font-bold">Couldn’t read the gateway’s self-test.</span> {report.message} Showing your browser’s run below.</div>
                  <Button variant="secondary" size="sm" onClick={() => loadReport()} icon={<RefreshCw className="w-4 h-4" />}>Retry</Button>
                  <div className="w-full mt-2"><DataTable columns={checkColumns} rows={localSelfTest.checks} rowKey={(c) => c.type} /></div>
                </div>
              ) : (
                <DataTable columns={checkColumns} rows={report.data.selfTest.checks} rowKey={(c) => c.type} />
              )}
            </GlassCard>
          </motion.div>

          {/* Posture */}
          <motion.div {...SECTION} transition={{ delay: 0.2 }}>
            <GlassCard className="p-5 mt-5">
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 text-teal" />
                <h3 className="text-sm font-bold text-fg">How internal logging works</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { label: 'Sinks', value: LOG_REDACTION_POSTURE.sinks.join(' → ') },
                  { label: 'When', value: 'Before serialization — there is never an unredacted copy, in memory or on disk' },
                  { label: 'Correlation tokens', value: `${LOG_REDACTION_POSTURE.correlationTokens}. Same value → same token for your org; a different org gets a different token` },
                  { label: 'Secrets', value: 'API keys, bearer tokens and JWTs are written as the same sha256: fingerprint the key registries use (see Key Hashing)' },
                  { label: 'Never redacted', value: 'Request IDs, trace IDs, status codes, durations and endpoint paths — incidents stay traceable' },
                  { label: 'Off switch', value: 'None. Floors are enforced in the engine, the console store and the gateway; a PATCH can only tighten' },
                  { label: 'Environments', value: `${LOG_REDACTION_POSTURE.environments} — the caller’s response masking (PII Masking) is a separate, live-only control` },
                  { label: 'Detectors', value: `${LOG_REDACTION_POSTURE.detectors} PII types · field-name classification shares the PII Masking catalog · value scan for emails, phones, IPs, IDs, cards, social URLs and credentials` },
                ].map((row) => (
                  <div key={row.label} className="rounded-xl border border-border bg-surface px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted">{row.label}</div>
                    <div className="text-[12px] text-fg mt-0.5">{row.value}</div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </motion.div>

          <p className="text-[11px] text-fg-muted mt-4 flex items-center gap-1 flex-wrap"><Sparkles className="w-3 h-3 shrink-0" /> Names in free text are out of scope (no NER) — name fields are caught by field name. Tell us what your logs need in <Link href="/console/support" className="text-teal hover:underline font-bold">Support</Link>.</p>
          <div className="mt-3 flex items-center gap-4 flex-wrap">
            <Link href="/console/logs" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Request logs <ArrowRight className="w-3.5 h-3.5" /></Link>
            <Link href="/console/pii-masking" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">PII masking (responses) <ArrowRight className="w-3.5 h-3.5" /></Link>
            <Link href="/console/key-hashing" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Key hashing <ArrowRight className="w-3.5 h-3.5" /></Link>
            <Link href="/console/security" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Security hub <ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function LogRedactionPage() {
  // Every role may read the posture; mutations are gated at the action level via canEditLogRedaction.
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <LogRedactionInner />
    </RoleGuard>
  );
}

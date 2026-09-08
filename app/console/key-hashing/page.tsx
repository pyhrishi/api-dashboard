'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Fingerprint, ShieldCheck, KeyRound, RefreshCw, Eye, EyeOff, Check, X, AlertTriangle, Copy, ArrowRight, Sparkles,
  Database, Server, Lock, Search, BadgeCheck,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { authHeaderValue } from '@/lib/api-config';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import RoleGuard from '@/components/RoleGuard';
import {
  PageHeader, KpiTile, GlassCard, Button, EmptyState, Skeleton, StatusBadge, DataTable,
  type Column, type BadgeTone,
} from '@/components/ui';
import {
  hashApiKey, keyFingerprint, redactKey, isWellFormedApiKey, KEY_HASHING_POSTURE, HASH_ALGORITHM,
  type RegistryDescriptor,
} from '@/lib/key-hashing';
import type { MockKey } from '@/lib/store';

/** Shape of `GET /v1/keys/hashing` (mirrors the gateway attestation). */
interface Attestation {
  audit: {
    registries: RegistryDescriptor[]; hashedRegistries: number; totalRegistries: number;
    plaintextCopies: number; totalEntries: number; clean: boolean; generatedAt: number;
  };
  key: { hash: string; fingerprint: string; prefix: string; last4: string; referencedBy: { id: string; label: string }[]; lookups: number };
}
type AttestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; data: Attestation; header: string }
  | { status: 'error'; message: string; httpStatus: number | null };

const SECTION = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };
const STATUS_TONE: Record<string, BadgeTone> = { active: 'success', expiring_soon: 'warning', expired: 'neutral', revoked: 'error', compromised: 'error' };

function KeyHashingInner() {
  const { activeKeys, environment } = useStore();
  const toast = useToast();
  const router = useRouter();

  const apiKey = useMemo(
    () => activeKeys.find((k) => k.environment === environment)?.key ?? activeKeys[0]?.key ?? '',
    [activeKeys, environment],
  );
  const noKeys = !apiKey;

  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [attest, setAttest] = useState<AttestState>({ status: 'idle' });
  const [candidate, setCandidate] = useState('');
  const [showCandidate, setShowCandidate] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const keyCount = activeKeys.length;
  useEffect(() => {
    track('key_hashing_viewed', { environment, keys: keyCount });
    const t = setTimeout(() => setPhase('ready'), 260);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one view event per environment, not per key change
  }, [environment]);

  // Live attestation — what the gateway actually holds for the active key.
  const loadAttestation = useCallback(async () => {
    if (!apiKey) { setAttest({ status: 'idle' }); return; }
    setAttest({ status: 'loading' });
    try {
      const res = await fetch('/api/v1/keys/hashing', { headers: { Authorization: authHeaderValue(apiKey) } });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.data) {
        setAttest({ status: 'error', httpStatus: res.status, message: body?.error?.message ?? `Gateway returned HTTP ${res.status}.` });
        return;
      }
      const data = body.data as Attestation;
      setAttest({ status: 'ok', data, header: res.headers.get('X-Key-Fingerprint') ?? 'not present' });
      track('key_hashing_attested', { clean: data.audit.clean, registries: data.audit.totalRegistries, plaintextCopies: data.audit.plaintextCopies, matches: data.key.fingerprint === keyFingerprint(apiKey) });
    } catch {
      setAttest({ status: 'error', httpStatus: null, message: 'Could not reach the gateway. Check your connection and retry.' });
    }
  }, [apiKey]);

  useEffect(() => { loadAttestation(); }, [loadAttestation]);

  // Local (browser-side) identities — computed from the plaintext this console legitimately holds.
  const rows = useMemo(() => activeKeys.map((k) => ({ ...k, fingerprint: keyFingerprint(k.key), redacted: redactKey(k.key) })), [activeKeys]);
  const localFingerprint = useMemo(() => (apiKey ? keyFingerprint(apiKey) : null), [apiKey]);
  const gatewayMatches = attest.status === 'ok' && localFingerprint ? attest.data.key.fingerprint === localFingerprint : null;

  // Hash inspector — never leaves the browser.
  const trimmed = candidate.trim();
  const inspect = useMemo(() => {
    if (!trimmed) return null;
    const wellFormed = isWellFormedApiKey(trimmed);
    const hash = hashApiKey(trimmed);
    const fp = keyFingerprint(trimmed);
    const match = activeKeys.find((k) => k.key === trimmed) ?? null;
    return { wellFormed, hash, fp, match };
  }, [trimmed, activeKeys]);

  // Debounced: one event per distinct pasted secret, never the secret itself.
  useEffect(() => {
    if (!inspect) return;
    const t = setTimeout(() => track('key_hash_inspected', { wellFormed: inspect.wellFormed, recognised: Boolean(inspect.match), environment }), 600);
    return () => clearTimeout(t);
  }, [inspect, environment]);

  const copy = (text: string, tag: string) => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(tag); setTimeout(() => setCopied(null), 1400); }).catch(() => {});
  };

  const [verify, setVerify] = useState<{ status: 'ok'; match: boolean; fingerprint: string } | { status: 'error'; message: string } | null>(null);
  const [verifying, setVerifying] = useState(false);
  // Sends ONLY the digest to the gateway — the pasted secret stays in the browser.
  const verifyAtGateway = useCallback(async () => {
    if (!apiKey || !inspect) return;
    setVerifying(true);
    setVerify(null);
    try {
      const res = await fetch('/api/v1/keys/hashing/verify', {
        method: 'POST',
        headers: { Authorization: authHeaderValue(apiKey), 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash: inspect.hash }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.data) { setVerify({ status: 'error', message: body?.error?.message ?? `Gateway returned HTTP ${res.status}.` }); return; }
      setVerify({ status: 'ok', match: Boolean(body.data.match), fingerprint: String(body.data.fingerprint ?? '') });
      track('key_hash_verified', { match: Boolean(body.data.match), environment });
      toast.success(body.data.match ? 'Digest matches your active key' : 'Digest does not match your active key', 'Only the SHA-256 digest was sent — never the key.');
    } catch {
      setVerify({ status: 'error', message: 'Could not reach the gateway.' });
    } finally {
      setVerifying(false);
    }
  }, [apiKey, inspect, toast, environment]);

  const keyColumns: Column<MockKey & { fingerprint: string; redacted: string }>[] = [
    {
      key: 'name', header: 'Key', render: (k) => (
        <div className="min-w-0">
          <div className="text-[12px] font-bold text-fg truncate">{k.name}</div>
          <div className="font-mono text-[11px] text-fg-muted">{k.redacted}</div>
        </div>
      ),
    },
    {
      key: 'fingerprint', header: 'Stored identity (SHA-256)', render: (k) => (
        <button type="button" onClick={() => copy(k.fingerprint, k.id)} aria-label={copied === k.id ? 'Copied fingerprint' : `Copy fingerprint for ${k.name}`} className="font-mono text-[11px] text-fg hover:text-teal inline-flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 rounded-md" title="Copy fingerprint">
          {k.fingerprint} {copied === k.id ? <Check className="w-3 h-3 text-teal" /> : <Copy className="w-3 h-3 text-fg-muted" />}
        </button>
      ),
    },
    { key: 'environment', header: 'Env', className: 'hidden md:table-cell', render: (k) => <span className="text-[11px] text-fg-muted capitalize">{k.environment}</span> },
    { key: 'status', header: 'Status', align: 'right', render: (k) => <StatusBadge tone={STATUS_TONE[k.status || 'active'] ?? 'neutral'}>{(k.status || 'active').replace('_', ' ')}</StatusBadge> },
  ];

  const registryColumns: Column<RegistryDescriptor>[] = [
    {
      key: 'label', header: 'Registry', render: (r) => (
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-fg-muted">{r.runtime === 'edge' ? <Server className="w-4 h-4" /> : <Database className="w-4 h-4" />}</span>
          <div className="min-w-0">
            <div className="text-[12px] font-bold text-fg">{r.label}</div>
            <div className="text-[11px] text-fg-muted truncate">{r.holds}</div>
          </div>
        </div>
      ),
    },
    { key: 'runtime', header: 'Runs on', className: 'hidden md:table-cell', render: (r) => <span className="text-[11px] text-fg-muted">{r.runtime === 'edge' ? 'Edge middleware' : 'Node handler'}</span> },
    { key: 'entries', header: 'Entries', align: 'right', sortValue: (r) => r.entries, render: (r) => <span className="font-mono text-[11px] text-fg">{r.entries.toLocaleString()}</span> },
    { key: 'keyedBy', header: 'Keyed by', align: 'right', render: (r) => <StatusBadge tone={r.keyedBy === 'sha256' ? 'success' : 'error'}>{r.keyedBy === 'sha256' ? 'SHA-256 digest' : 'plaintext'}</StatusBadge> },
  ];

  return (
    <div className="max-w-[1100px] mx-auto pb-16">
      <PageHeader
        icon={<Fingerprint />}
        title="Key Hashing"
        description="Your API keys exist in plaintext in exactly one place: with you. The gateway keeps only a SHA-256 digest and keys every registry by it. Inspect the identity it stores, hash a key locally without it ever leaving your browser, and pull a live attestation that no registry holds plaintext."
        actions={
          <Button variant="secondary" size="sm" onClick={loadAttestation} loading={attest.status === 'loading' && phase === 'ready'} disabled={noKeys} icon={<RefreshCw className="w-4 h-4" />} title={noKeys ? 'Create an API key to attest' : 'Re-read GET /v1/keys/hashing'}>
            Refresh attestation
          </Button>
        }
      />

      {phase === 'loading' ? (
        <div className="mt-6" aria-busy="true" aria-label="Loading key hashing">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiTile loading label="Keys" value="" icon={<KeyRound />} />
            <KpiTile loading label="Plaintext copies at rest" value="" icon={<Lock />} />
            <KpiTile loading label="Algorithm" value="" icon={<Fingerprint />} />
            <KpiTile loading label="Registries hashed" value="" icon={<Database />} />
          </div>
          <Skeleton variant="block" className="h-[280px] mt-5" />
          <Skeleton variant="block" className="h-[300px] mt-5" />
          <Skeleton variant="block" className="h-[360px] mt-5" />
          <Skeleton variant="block" className="h-[200px] mt-5" />
        </div>
      ) : (
        <>
          {noKeys && (
            <motion.div {...SECTION} className="mt-6 rounded-2xl border border-teal/30 bg-teal/5 p-4 flex items-start gap-3 flex-wrap">
              <KeyRound className="w-5 h-5 text-teal shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-fg">Create a key to see what the gateway stores for it</div>
                <p className="text-[12px] text-fg-muted mt-0.5">The hash inspector works without a key. With one, you can pull the gateway’s live attestation and compare fingerprints.</p>
              </div>
              <Button size="sm" icon={<KeyRound className="w-4 h-4" />} onClick={() => router.push('/console/keys')}>Create a key</Button>
            </motion.div>
          )}

          <motion.div {...SECTION} className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <KpiTile label="Keys" value={activeKeys.length} icon={<KeyRound />} hint="plaintext held only by you" />
            <KpiTile label="Plaintext copies at rest" value={attest.status === 'ok' ? attest.data.audit.plaintextCopies : '—'} icon={<Lock />} hint={attest.status === 'ok' ? `across ${attest.data.audit.totalEntries.toLocaleString()} entries` : attest.status === 'error' ? 'attestation unavailable' : noKeys ? 'needs a key' : 'reading the gateway'} />
            <KpiTile label="Algorithm" value={HASH_ALGORITHM} icon={<Fingerprint />} hint={`${KEY_HASHING_POSTURE.storedBits}-bit digest · hex`} />
            <KpiTile label="Registries hashed" value={attest.status === 'ok' ? `${attest.data.audit.hashedRegistries}/${attest.data.audit.totalRegistries}` : '—'} icon={<Database />} hint={attest.status === 'ok' ? (attest.data.audit.clean ? 'every registry keyed by digest' : 'plaintext found — investigate') : attest.status === 'error' ? 'attestation unavailable' : 'from the live audit'} />
          </motion.div>

          {/* Keys at rest */}
          <motion.div {...SECTION} transition={{ delay: 0.04 }}>
            <GlassCard className="p-5 mt-5">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <KeyRound className="w-4 h-4 text-teal" />
                <h3 className="text-sm font-bold text-fg">Your keys, as the gateway knows them</h3>
                <StatusBadge tone="info">computed in your browser</StatusBadge>
              </div>
              <p className="text-[12px] text-fg-muted mb-4">Each fingerprint is the first 64 bits of the SHA-256 digest of the key you hold — identical to the identity every gateway registry is keyed by. After a key’s one-time reveal, this <span className="font-mono">sha256:</span> identity is all the console shows beside it too.</p>
              {rows.length === 0 ? (
                <EmptyState icon={<KeyRound className="w-8 h-8" />} title="No keys yet" description="Create a key above and its stored identity appears here." />
              ) : (
                <DataTable columns={keyColumns} rows={rows} rowKey={(k) => k.id} pageSize={8} />
              )}
            </GlassCard>
          </motion.div>

          {/* Hash inspector */}
          <motion.div {...SECTION} transition={{ delay: 0.08 }}>
            <GlassCard className="p-5 mt-5">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Search className="w-4 h-4 text-teal" />
                <h3 className="text-sm font-bold text-fg">Hash inspector</h3>
                <StatusBadge tone="success"><Lock className="w-3 h-3" /> never leaves your browser</StatusBadge>
              </div>
              <p className="text-[12px] text-fg-muted mb-4">Paste a key from an env var or a config file to learn which of your keys it is — hashed locally with the same function the gateway uses. To double-check against the gateway, only the digest is sent.</p>
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                <div className="lg:col-span-3 min-w-0">
                  <div className="relative">
                    <input
                      type={showCandidate ? 'text' : 'password'}
                      value={candidate}
                      onChange={(e) => { setCandidate(e.target.value); setVerify(null); }}
                      autoComplete="off" spellCheck={false}
                      aria-label="API key to inspect"
                      aria-describedby={inspect && !inspect.wellFormed ? 'inspect-hint' : undefined}
                      placeholder="sk_live_…"
                      className="w-full rounded-xl border border-border bg-surface font-mono text-[12px] text-fg py-2.5 pl-3 pr-20 focus:outline-none focus:border-teal focus-visible:ring-2 focus-visible:ring-teal/50 transition-colors placeholder:text-fg-subtle"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <button type="button" onClick={() => setShowCandidate((v) => !v)} aria-pressed={showCandidate} aria-label={showCandidate ? 'Hide key' : 'Show key'} className="rounded-md p-1 text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50">
                        {showCandidate ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      {candidate && (
                        <button type="button" onClick={() => { setCandidate(''); setVerify(null); }} aria-label="Clear" className="rounded-md p-1 text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  {inspect && !inspect.wellFormed && (
                    <p id="inspect-hint" className="mt-1.5 text-[11px] text-semantic-warning inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Not a Zinbit key shape (sk_live_ / sk_test_ + 16+ chars) — hashed anyway.</p>
                  )}
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="secondary" onClick={verifyAtGateway} loading={verifying} disabled={!inspect || noKeys} icon={<ShieldCheck className="w-4 h-4" />} title={noKeys ? 'Create an API key first' : 'POST /v1/keys/hashing/verify with the digest only'}>
                      Verify digest at gateway
                    </Button>
                    <span className="text-[11px] text-fg-muted">Asks whether this digest is your active key. The key itself is not sent.</span>
                  </div>
                </div>
                <div className="lg:col-span-2 min-w-0">
                  <AnimatePresence mode="wait" initial={false}>
                    {!inspect ? (
                      <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-xl border border-border bg-surface p-4 h-full flex flex-col items-center justify-center text-center">
                        <Fingerprint className="w-6 h-6 text-fg-muted mb-2" />
                        <div className="text-[12px] font-bold text-fg">Digest appears here</div>
                        <div className="text-[11px] text-fg-muted mt-0.5">Paste a key to hash it locally.</div>
                      </motion.div>
                    ) : (
                      <motion.div key="result" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`rounded-xl border p-4 space-y-2 ${inspect.match ? 'border-teal/30 bg-teal/5' : 'border-border bg-surface'}`}>
                        <div className="flex items-center gap-2 flex-wrap" role="status" aria-live="polite">
                          {inspect.match ? <StatusBadge tone="success"><BadgeCheck className="w-3 h-3" /> {inspect.match.name}</StatusBadge> : <StatusBadge tone="neutral">Not one of your keys</StatusBadge>}
                          <span className="text-[11px] text-fg-muted">{redactKey(trimmed)}</span>
                        </div>
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted">Fingerprint</div>
                          <button type="button" onClick={() => copy(inspect.fp, 'fp')} aria-label={copied === 'fp' ? 'Copied fingerprint' : 'Copy fingerprint'} className="font-mono text-[12px] text-fg hover:text-teal inline-flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 rounded-md">{inspect.fp} {copied === 'fp' ? <Check className="w-3 h-3 text-teal" /> : <Copy className="w-3 h-3 text-fg-muted" />}</button>
                        </div>
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted">SHA-256</div>
                          <button type="button" onClick={() => copy(inspect.hash, 'hash')} aria-label={copied === 'hash' ? 'Copied SHA-256 digest' : 'Copy SHA-256 digest'} className="font-mono text-[10px] text-fg-muted hover:text-teal break-all text-left inline-flex items-start gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 rounded-md">{inspect.hash} {copied === 'hash' ? <Check className="w-3 h-3 text-teal shrink-0 mt-0.5" /> : <Copy className="w-3 h-3 shrink-0 mt-0.5" />}</button>
                        </div>
                        {verify && (
                          <div role="status" aria-live="polite">{
                          verify.status === 'ok' ? (
                            <div className={`text-[11px] font-bold inline-flex items-center gap-1 ${verify.match ? 'text-teal' : 'text-fg-muted'}`}>{verify.match ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />} Gateway: {verify.match ? 'this digest is your active key' : `not your active key (${verify.fingerprint})`}</div>
                          ) : (
                            <div className="text-[11px] text-semantic-error inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {verify.message}</div>
                          )}</div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </GlassCard>
          </motion.div>

          {/* Gateway attestation */}
          <motion.div {...SECTION} transition={{ delay: 0.12 }}>
            <GlassCard className="p-5 mt-5 border-teal/20">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <ShieldCheck className="w-4 h-4 text-teal" />
                <h3 className="text-sm font-bold text-fg">What the gateway holds</h3>
                {attest.status === 'ok' && (
                  <StatusBadge tone={attest.data.audit.clean ? 'success' : 'error'}>{attest.data.audit.clean ? 'no plaintext at rest' : `${attest.data.audit.plaintextCopies} plaintext copies`}</StatusBadge>
                )}
                {gatewayMatches === true && <StatusBadge tone="success"><BadgeCheck className="w-3 h-3" /> fingerprint matches your console</StatusBadge>}
                {gatewayMatches === false && <StatusBadge tone="error"><AlertTriangle className="w-3 h-3" /> fingerprint differs from your console</StatusBadge>}
              </div>
              <p className="text-[12px] text-fg-muted mb-4">A live audit of every gateway registry that references a key, plus the record kept for your active key. Read from <span className="font-mono">GET /v1/keys/hashing</span>; every response also carries <span className="font-mono">X-Key-Fingerprint</span>.</p>

              {noKeys ? (
                <EmptyState icon={<ShieldCheck className="w-8 h-8" />} title="Create an API key to pull the attestation" description="The audit is read from the live gateway with your key." action={<Button size="sm" onClick={() => router.push('/console/keys')}>Create a key</Button>} />
              ) : attest.status === 'loading' || attest.status === 'idle' ? (
                <div><Skeleton className="h-[92px] rounded-xl mb-4" /><div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)}</div></div>
              ) : attest.status === 'error' ? (
                <div className="rounded-xl border border-semantic-error/30 bg-semantic-error/5 p-4 flex items-center gap-3 flex-wrap">
                  <AlertTriangle className="w-4 h-4 text-semantic-error shrink-0" />
                  <div className="text-[12px] text-fg flex-1 min-w-0"><span className="font-bold">Couldn’t read the attestation{attest.httpStatus ? ` (HTTP ${attest.httpStatus})` : ''}.</span> {attest.message}</div>
                  <Button variant="secondary" size="sm" onClick={loadAttestation} icon={<RefreshCw className="w-4 h-4" />}>Retry</Button>
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-border bg-surface p-4 mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2 min-w-0">
                      <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted">Record for your active key</div>
                      <div className="font-mono text-[12px] text-fg mt-1 break-all">{attest.data.key.fingerprint}</div>
                      <div className="font-mono text-[10px] text-fg-muted break-all">{attest.data.key.hash}</div>
                      <div className="text-[11px] text-fg-muted mt-1">{attest.data.key.prefix}••••{attest.data.key.last4} · looked up {attest.data.key.lookups}× · header <span className="font-mono text-fg">X-Key-Fingerprint: {attest.header}</span></div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted">Referenced by</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {attest.data.key.referencedBy.length === 0 ? <span className="text-[11px] text-fg-muted">no registry yet — make a call</span> : attest.data.key.referencedBy.map((r) => <StatusBadge key={r.id} tone="info">{r.label}</StatusBadge>)}
                      </div>
                    </div>
                  </div>
                  <DataTable columns={registryColumns} rows={attest.data.audit.registries} rowKey={(r) => r.id} />
                </>
              )}
            </GlassCard>
          </motion.div>

          {/* Storage policy */}
          <motion.div {...SECTION} transition={{ delay: 0.16 }}>
            <GlassCard className="p-5 mt-5">
              <div className="flex items-center gap-2 mb-3">
                <Lock className="w-4 h-4 text-teal" />
                <h3 className="text-sm font-bold text-fg">Storage policy</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { label: 'Algorithm', value: `${KEY_HASHING_POSTURE.algorithm} · ${KEY_HASHING_POSTURE.storedBits}-bit digest, ${KEY_HASHING_POSTURE.encoding}` },
                  { label: 'Salt / KDF', value: 'None — issued keys are 20 random base-36 characters (~103 bits of entropy), far beyond brute force; a salt would break O(1) lookup and adds nothing' },
                  { label: 'Comparison', value: 'Constant-time equality on digests' },
                  { label: 'Lookup', value: 'The gateway hashes the presented key and finds its record — it never stores the key' },
                  { label: 'Plaintext exposure', value: 'Shown exactly once, at creation (one-time reveal) — then fingerprint + last 4 only' },
                  { label: 'Where plaintext lives', value: 'With you: your env vars, and this console as your client' },
                ].map((row) => (
                  <div key={row.label} className="rounded-xl border border-border bg-surface px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted">{row.label}</div>
                    <div className="text-[12px] text-fg mt-0.5">{row.value}</div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </motion.div>

          <p className="text-[11px] text-fg-muted mt-4 flex items-center gap-1 flex-wrap"><Sparkles className="w-3 h-3 shrink-0" /> Lost the plaintext? It can’t be recovered from a digest — roll the key from <Link href="/console/keys" className="text-teal hover:underline font-bold">API Keys</Link>.</p>
          <div className="mt-3 flex items-center gap-4 flex-wrap">
            <Link href="/console/keys" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">API keys <ArrowRight className="w-3.5 h-3.5" /></Link>
            <Link href="/console/kill-switch" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Kill switch <ArrowRight className="w-3.5 h-3.5" /></Link>
            <Link href="/console/encryption" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Encryption at rest <ArrowRight className="w-3.5 h-3.5" /></Link>
            <Link href="/console/security" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Security hub <ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function KeyHashingPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer']}>
      <KeyHashingInner />
    </RoleGuard>
  );
}

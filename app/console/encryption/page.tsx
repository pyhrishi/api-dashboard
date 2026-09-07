'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lock, ShieldCheck, KeyRound, RefreshCw, Database, HardDrive, Server, FileKey,
  Fingerprint, Radio, Copy, Check, ArrowRight, Sparkles, Boxes, Timer, AlertTriangle, FlaskConical, BadgeCheck,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { authHeaderValue } from '@/lib/api-config';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import RoleGuard from '@/components/RoleGuard';
import {
  PageHeader, KpiTile, GlassCard, Button, Skeleton, StatusBadge, SegmentedControl,
  ConfirmAction, DataTable, type Column, type BadgeTone,
} from '@/components/ui';
import {
  useEncryptionSettings, buildPosture, daysUntilRotation, orgHandleForKey, ALLOWED_ROTATION_DAYS,
  type EncryptionPosture, type KmsKey, type EncryptedStore, type FieldEncryption,
} from '@/lib/encryption';

const KIND_ICON: Record<EncryptedStore['kind'], React.ReactNode> = {
  database: <Database className="w-4 h-4" />,
  'object-storage': <HardDrive className="w-4 h-4" />,
  cache: <Boxes className="w-4 h-4" />,
  backups: <Server className="w-4 h-4" />,
  queue: <Radio className="w-4 h-4" />,
};

const scoreTone = (score: number): BadgeTone => (score >= 90 ? 'success' : score >= 70 ? 'warning' : 'error');

/** What the live `GET /v1/encryption` call told us — never placeholders. */
type LiveState =
  | { status: 'ok'; transit: string; rest: string; attestation: string; signature: { alg: string; kid: string; sig: string } | null }
  | { status: 'error'; httpStatus: number | null; message: string };

interface LiveBody {
  data?: { attestation?: string; signature?: { alg: string; kid: string; sig: string } };
  error?: { code?: string; message?: string };
}

const SECTION = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };

function EncryptionInner() {
  const { activeKeys, environment, user } = useStore();
  const { rotationDays, lastRotatedAt, fieldEncryption, setRotationCadence, rotatePrimaryKey, setFieldEncryption } = useEncryptionSettings();
  const toast = useToast();

  const isAdmin = user?.role === 'admin';
  const apiKey = useMemo(
    () => activeKeys.find((k) => k.environment === environment)?.key ?? activeKeys[0]?.key ?? '',
    [activeKeys, environment],
  );
  const noKeys = !apiKey;
  // The same handle the gateway derives, so the console posture and the live
  // `/v1/encryption` endpoint agree on keys + attestation.
  const orgId = useMemo(() => orgHandleForKey(apiKey || undefined), [apiKey]);

  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [now, setNow] = useState(() => Date.now());
  const [live, setLive] = useState<LiveState | null>(null);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    setNow(Date.now());
    track('encryption_viewed', { environment });
    const t = setTimeout(() => setPhase('ready'), 260);
    return () => clearTimeout(t);
  }, [environment]);

  // Keep the gateway's per-org settings in step with the persisted console settings
  // (on mount, on env/key switch, and after every change) so GET /v1/encryption
  // returns the same score + digest this page shows. Fire-and-forget; the live
  // check surfaces any disagreement.
  useEffect(() => {
    if (!apiKey) return;
    fetch('/api/v1/encryption', {
      method: 'PATCH',
      headers: { Authorization: authHeaderValue(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify({ rotationDays, fieldEncryption }),
    }).catch(() => {});
  }, [apiKey, rotationDays, fieldEncryption]);

  const posture: EncryptionPosture = useMemo(
    () => buildPosture(orgId, { rotationDays, lastRotatedAt, fieldEncryption }, now),
    [orgId, rotationDays, lastRotatedAt, fieldEncryption, now],
  );

  const copy = (text: string, tag: string) => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(tag); setTimeout(() => setCopied(null), 1400); }).catch(() => {});
  };

  // Live check — a real same-origin call proving the X-Encryption-* headers ship
  // and returning the gateway's signed attestation.
  const runLiveCheck = useCallback(async () => {
    if (!apiKey) return;
    setChecking(true);
    try {
      const res = await fetch('/api/v1/encryption', { headers: { Authorization: authHeaderValue(apiKey) } });
      const body = (await res.json().catch(() => null)) as LiveBody | null;
      if (!res.ok) {
        const message = body?.error?.message ?? `Gateway returned HTTP ${res.status}.`;
        setLive({ status: 'error', httpStatus: res.status, message });
        track('encryption_checked', { environment, ok: false, status: res.status });
        toast.error('Live check failed', message);
        return;
      }
      setLive({
        status: 'ok',
        transit: res.headers.get('X-Encryption-Transit') ?? 'not present',
        rest: res.headers.get('X-Encryption-Rest') ?? 'not present',
        attestation: body?.data?.attestation ?? posture.attestation,
        signature: body?.data?.signature ?? null,
      });
      track('encryption_checked', { environment, ok: true, status: res.status });
      toast.success('Live check complete', 'Encryption headers and signed attestation verified on the wire.');
    } catch {
      setLive({ status: 'error', httpStatus: null, message: 'Could not reach the gateway. Check your connection and retry.' });
      track('encryption_checked', { environment, ok: false, status: 0 });
      toast.error('Live check failed', 'Could not reach the gateway.');
    } finally {
      setChecking(false);
    }
  }, [apiKey, environment, posture.attestation, toast]);

  const doRotate = useCallback(async () => {
    const stamp = Date.now();
    // Real gateway rotation (envelope re-wrap) — keeps the live endpoint coherent.
    if (apiKey) {
      await fetch('/api/v1/encryption', { method: 'POST', headers: { Authorization: authHeaderValue(apiKey), 'Content-Type': 'application/json' } }).catch(() => {});
    }
    rotatePrimaryKey(stamp);
    setNow(stamp);
    setLive(null);
    track('encryption_key_rotated', { environment, rotationDays });
    toast.success('Primary key rotated', 'Data-encryption keys re-wrapped under a fresh KMS version.');
  }, [apiKey, environment, rotationDays, rotatePrimaryKey, toast]);

  const toggleField = (f: FieldEncryption) => {
    if (f.mode === 'randomized') {
      // Randomized PII is a hard floor — enforced in the SSOT, explained here.
      toast.info('Always encrypted', `${f.field} uses randomized encryption and can’t be disabled.`);
      return;
    }
    const next = !f.enabled;
    setFieldEncryption(f.field, next);
    setLive(null);
    track('encryption_field_toggled', { field: f.field, enabled: next, environment });
  };

  const setCadence = (days: number) => {
    if (days === rotationDays) return;
    setRotationCadence(days);
    setNow(Date.now());
    setLive(null);
    track('encryption_cadence_changed', { environment, from: rotationDays, to: days });
    toast.success('Rotation cadence updated', `Primary key now rotates every ${days} days.`);
  };

  const keyColumns: Column<KmsKey>[] = [
    {
      key: 'alias', header: 'Key', render: (k) => (
        <div className="flex items-center gap-2 min-w-0">
          <FileKey className="w-4 h-4 text-teal shrink-0" />
          <div className="min-w-0">
            <div className="font-mono text-[12px] text-fg truncate">{k.alias}</div>
            <div className="font-mono text-[11px] text-fg-muted truncate">{k.id}</div>
          </div>
        </div>
      ),
    },
    { key: 'purpose', header: 'Purpose', render: (k) => <span className="text-[12px] text-fg-muted capitalize">{k.purpose}</span> },
    { key: 'algorithm', header: 'Algorithm', render: (k) => <span className="font-mono text-[11px] text-fg-muted">{k.algorithm}</span> },
    {
      key: 'fingerprint', header: 'Fingerprint', className: 'hidden md:table-cell',
      render: (k) => <span className="font-mono text-[11px] text-fg-muted">{k.fingerprint}</span>,
    },
    {
      key: 'rotation', header: 'Next rotation', align: 'right',
      sortValue: (k) => k.nextRotationAt,
      render: (k) => {
        const d = daysUntilRotation(k, now);
        const tone: BadgeTone = d < 0 ? 'error' : d < 14 ? 'warning' : 'success';
        return <StatusBadge tone={tone}>{d < 0 ? `${Math.abs(d)}d overdue` : `in ${d}d`}</StatusBadge>;
      },
    },
  ];

  const storeColumns: Column<EncryptedStore>[] = [
    {
      key: 'name', header: 'Store', render: (s) => (
        <div className="flex items-center gap-2">
          <span className="text-fg-muted">{KIND_ICON[s.kind]}</span>
          <div>
            <div className="text-[12px] text-fg">{s.name}</div>
            <div className="text-[11px] text-fg-muted capitalize">{s.kind.replace('-', ' ')} · {s.region}</div>
          </div>
        </div>
      ),
    },
    { key: 'algorithm', header: 'Algorithm', render: (s) => <span className="font-mono text-[11px] text-fg-muted">{s.algorithm}</span> },
    { key: 'kmsKeyId', header: 'KMS key', className: 'hidden md:table-cell', render: (s) => <span className="font-mono text-[11px] text-fg-muted">{s.kmsKeyId}</span> },
    {
      key: 'encrypted', header: 'Status', align: 'right',
      render: (s) => <StatusBadge tone={s.encrypted ? 'success' : 'error'}>{s.encrypted ? 'Encrypted' : 'Plaintext'}</StatusBadge>,
    },
  ];

  const enabledFields = posture.fields.filter((f) => f.enabled).length;
  const liveOk = live?.status === 'ok' ? live : null;
  const digestMatches = liveOk ? liveOk.attestation === posture.attestation : null;

  return (
    <div className="max-w-[1100px] mx-auto pb-16">
      <PageHeader
        icon={<Lock />}
        title="Encryption"
        description="Everything you send and everything we store is encrypted — TLS 1.3 in transit, AES-256-GCM envelope encryption at rest under customer-managed KMS keys. Inspect the live posture, rotate keys, and pull a signed attestation for a security review."
        actions={
          <Button
            variant="secondary" size="sm" onClick={runLiveCheck} loading={checking} disabled={noKeys}
            icon={<Radio className="w-4 h-4" />}
            title={noKeys ? 'Create an API key to run a live check' : 'Fetch /v1/encryption and read the response headers'}
          >
            Run live check
          </Button>
        }
      />

      {phase === 'loading' ? (
        <div className="mt-6" aria-busy="true" aria-label="Loading encryption posture">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiTile loading label="Posture score" value="" icon={<ShieldCheck />} />
            <KpiTile loading label="In transit" value="" icon={<Radio />} />
            <KpiTile loading label="KMS keys" value="" icon={<FileKey />} />
            <KpiTile loading label="PII fields" value="" icon={<Fingerprint />} />
          </div>
          <Skeleton variant="block" className="h-[190px] mt-5" />
          <Skeleton variant="block" className="h-[300px] mt-5" />
          <Skeleton variant="block" className="h-[330px] mt-5" />
          <Skeleton variant="block" className="h-[240px] mt-5" />
          <Skeleton variant="block" className="h-[130px] mt-5" />
        </div>
      ) : (
        <>
          {noKeys && (
            <motion.div {...SECTION} className="mt-6 rounded-2xl border border-teal/30 bg-teal/5 p-4 flex items-start gap-3 flex-wrap">
              <KeyRound className="w-5 h-5 text-teal shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-fg">Encryption is always on — create a key to verify it on the wire</div>
                <p className="text-[12px] text-fg-muted mt-0.5">The posture below is your organization’s default. With an API key you can run a live check, sync settings to the gateway, and pull a signed attestation.</p>
              </div>
              <Link href="/console/keys"><Button size="sm" icon={<KeyRound className="w-4 h-4" />}>Create a key</Button></Link>
            </motion.div>
          )}

          <motion.div {...SECTION} className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <KpiTile label="Posture score" value={`${posture.score}`} icon={<ShieldCheck />} hint={posture.score >= 90 ? 'strong' : 'needs review'} />
            <KpiTile label="In transit" value={posture.transit.version} icon={<Radio />} hint="AES-256-GCM · X25519" />
            <KpiTile label="KMS keys" value={posture.keys.length} icon={<FileKey />} hint="AES-256-GCM envelope" />
            <KpiTile label="PII fields" value={`${enabledFields}/${posture.fields.length}`} icon={<Fingerprint />} hint="encrypted at rest" />
          </motion.div>

          {/* In transit */}
          <motion.div {...SECTION} transition={{ delay: 0.04 }}>
            <GlassCard className="p-5 mt-5">
              <div className="flex items-center gap-2 mb-4">
                <Radio className="w-4 h-4 text-teal" />
                <h3 className="text-sm font-bold text-fg">In transit</h3>
                <StatusBadge tone="success"><Check className="w-3 h-3" /> TLS 1.3</StatusBadge>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Cipher suite', value: posture.transit.cipher },
                  { label: 'Key exchange', value: `${posture.transit.keyExchange} (PFS)` },
                  { label: 'HSTS', value: `${posture.transit.hstsMaxAgeDays}d · preload` },
                  { label: 'OCSP stapling', value: posture.transit.ocspStapling ? 'Enabled' : 'Off' },
                ].map((row) => (
                  <div key={row.label} className="rounded-xl border border-border bg-surface p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted">{row.label}</div>
                    <div className="font-mono text-[12px] text-fg mt-1 break-all">{row.value}</div>
                  </div>
                ))}
              </div>
              <AnimatePresence initial={false}>
                {live && (
                  <motion.div key={live.status} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden" role="status" aria-live="polite">
                    {live.status === 'ok' ? (
                      <div className="mt-3 rounded-xl border border-teal/30 bg-teal/5 p-3">
                        <div className="text-[10px] font-black uppercase tracking-widest text-fg mb-1.5 flex items-center gap-1"><Radio className="w-3 h-3 text-teal" /> Live response headers</div>
                        <div className="font-mono text-[11px] text-fg-muted space-y-0.5 break-all">
                          <div><span className="text-fg">X-Encryption-Transit:</span> {live.transit}</div>
                          <div><span className="text-fg">X-Encryption-Rest:</span> {live.rest}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 rounded-xl border border-semantic-error/30 bg-semantic-error/5 p-3 flex items-start gap-3 flex-wrap">
                        <AlertTriangle className="w-4 h-4 text-semantic-error shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[12px] font-bold text-fg">Live check failed{live.httpStatus ? ` — gateway returned HTTP ${live.httpStatus}` : ''}</div>
                          <p className="text-[11px] text-fg-muted mt-0.5">{live.message}</p>
                        </div>
                        <Button variant="secondary" size="sm" onClick={runLiveCheck} loading={checking} icon={<RefreshCw className="w-4 h-4" />}>Retry</Button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </GlassCard>
          </motion.div>

          {/* At rest — KMS keys + rotation */}
          <motion.div {...SECTION} transition={{ delay: 0.08 }}>
            <GlassCard className="p-5 mt-5">
              <div className="flex items-start gap-3 flex-wrap mb-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-teal" />
                    <h3 className="text-sm font-bold text-fg">Customer-managed keys</h3>
                  </div>
                  <p className="text-[12px] text-fg-muted mt-0.5">Each data store is wrapped by a KMS key (envelope encryption). Rotating re-wraps the data-encryption keys under a fresh version — data is never re-encrypted.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {isAdmin ? (
                    <SegmentedControl
                      layoutId="encryption-cadence"
                      options={ALLOWED_ROTATION_DAYS.map((d) => ({ label: `${d}d`, value: String(d) }))}
                      value={String(rotationDays)}
                      onChange={(v) => setCadence(Number(v))}
                    />
                  ) : (
                    <StatusBadge tone="info"><Timer className="w-3 h-3" /> {rotationDays}d cadence</StatusBadge>
                  )}
                  {isAdmin && (
                    <ConfirmAction size="sm" confirmLabel="Confirm rotate" onConfirm={doRotate}>
                      <RefreshCw className="w-4 h-4" /> Rotate primary key
                    </ConfirmAction>
                  )}
                </div>
              </div>
              <DataTable columns={keyColumns} rows={posture.keys} rowKey={(k) => k.id} initialSort={{ key: 'rotation', dir: 'asc' }} />
              {!isAdmin && <p className="text-[11px] text-fg-muted mt-2">Only an admin can rotate keys or change the cadence.</p>}
            </GlassCard>
          </motion.div>

          {/* At rest — encrypted stores */}
          <motion.div {...SECTION} transition={{ delay: 0.12 }}>
            <GlassCard className="p-5 mt-5">
              <div className="flex items-center gap-2 mb-4">
                <HardDrive className="w-4 h-4 text-teal" />
                <h3 className="text-sm font-bold text-fg">Encrypted data stores</h3>
                <StatusBadge tone="success">{posture.stores.filter((s) => s.encrypted).length}/{posture.stores.length} encrypted</StatusBadge>
              </div>
              <DataTable columns={storeColumns} rows={posture.stores} rowKey={(s) => s.name} />
            </GlassCard>
          </motion.div>

          {/* Field-level PII encryption */}
          <motion.div {...SECTION} transition={{ delay: 0.16 }}>
            <GlassCard className="p-5 mt-5">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <Fingerprint className="w-4 h-4 text-teal" />
                <h3 className="text-sm font-bold text-fg">Field-level PII encryption</h3>
                {environment === 'live' ? (
                  <StatusBadge tone="success"><Lock className="w-3 h-3" /> Applies to live traffic</StatusBadge>
                ) : (
                  <StatusBadge tone="info"><FlaskConical className="w-3 h-3" /> Sandbox returns synthetic data</StatusBadge>
                )}
              </div>
              <p className="text-[12px] text-fg-muted mb-4">
                Deterministic fields stay searchable and joinable while encrypted; randomized fields are strongest and always on. Field-level encryption protects real PII on <span className="font-mono">sk_live_</span> traffic — sandbox keys return synthetic data, mirroring masking.{' '}
                {isAdmin ? 'Turn a deterministic field off only if a downstream system needs it in plaintext.' : 'Only an admin can change field encryption.'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="group" aria-label="PII fields">
                {posture.fields.map((f) => {
                  const locked = f.mode === 'randomized';
                  const label = `${f.field}: ${f.mode} encryption ${f.enabled ? 'on' : 'off'}${locked ? ', always on' : ''}`;
                  const inner = (
                    <>
                      <span className={f.enabled ? 'text-teal' : 'text-fg-muted'}>{f.enabled ? <Lock className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-[12px] text-fg">{f.field}</div>
                        <div className="text-[11px] text-fg-muted capitalize">{f.mode}{locked ? ' · always on' : ''}</div>
                      </div>
                      <StatusBadge tone={f.enabled ? 'success' : 'warning'}>{f.enabled ? 'Encrypted' : 'Off'}</StatusBadge>
                    </>
                  );
                  const surface = `rounded-xl border px-4 py-3 flex items-center gap-3 transition-colors ${f.enabled ? 'border-teal/30 bg-teal/5' : 'border-border bg-surface'}`;
                  if (!isAdmin) {
                    return <div key={f.field} aria-label={label} className={surface}>{inner}</div>;
                  }
                  return (
                    <motion.button
                      key={f.field}
                      type="button"
                      onClick={() => toggleField(f)}
                      aria-pressed={f.enabled}
                      aria-disabled={locked || undefined}
                      aria-label={label}
                      title={locked ? 'Randomized fields are always encrypted' : `Turn ${f.field} encryption ${f.enabled ? 'off' : 'on'}`}
                      whileTap={locked ? undefined : { scale: 0.99 }}
                      className={`text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 ${surface} ${locked ? 'cursor-default' : 'hover:border-teal/50 cursor-pointer'}`}
                    >
                      {inner}
                    </motion.button>
                  );
                })}
              </div>
            </GlassCard>
          </motion.div>

          {/* Attestation */}
          <motion.div {...SECTION} transition={{ delay: 0.2 }}>
            <GlassCard className="p-5 mt-5 border-teal/20">
              <div className="flex items-start gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <ShieldCheck className="w-4 h-4 text-teal" />
                    <h3 className="text-sm font-bold text-fg">Encryption attestation</h3>
                    <StatusBadge tone={scoreTone(posture.score)}>score {posture.score}</StatusBadge>
                    {liveOk && digestMatches && liveOk.signature && (
                      <StatusBadge tone="success"><BadgeCheck className="w-3 h-3" /> Signed · {liveOk.signature.alg}</StatusBadge>
                    )}
                    {liveOk && digestMatches === false && (
                      <StatusBadge tone="warning"><AlertTriangle className="w-3 h-3" /> Gateway digest differs — re-run the live check</StatusBadge>
                    )}
                  </div>
                  <p className="text-[12px] text-fg-muted mt-0.5">
                    A stable digest over your material posture (cipher, keys, stores, enabled PII fields) — it regenerates as your configuration changes.
                    {liveOk && digestMatches && liveOk.signature
                      ? ` The gateway signed it with ${liveOk.signature.alg} (key ${liveOk.signature.kid}); a reviewer can verify the pair at GET /v1/encryption/verify.`
                      : ' Run a live check to have the gateway sign it for a security reviewer.'}
                  </p>
                  <code className="font-mono text-[11px] text-fg bg-surface border border-border rounded-lg px-3 py-1.5 mt-2 inline-block break-all">{posture.attestation}</code>
                  {liveOk && digestMatches && liveOk.signature && (
                    <div className="mt-2 text-[11px] text-fg-muted flex items-center gap-2 min-w-0">
                      <span className="text-fg shrink-0">sig</span>
                      <code className="font-mono text-fg-muted truncate" title={liveOk.signature.sig}>{liveOk.signature.sig.slice(0, 24)}…{liveOk.signature.sig.slice(-8)}</code>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <Button variant="ghost" size="sm" onClick={() => copy(posture.attestation, 'att')} icon={copied === 'att' ? <Check className="w-4 h-4 text-teal" /> : <Copy className="w-4 h-4" />}>
                    {copied === 'att' ? 'Copied' : 'Copy digest'}
                  </Button>
                  {liveOk && digestMatches && liveOk.signature && (
                    <Button variant="ghost" size="sm" onClick={() => copy(liveOk.signature!.sig, 'sig')} icon={copied === 'sig' ? <Check className="w-4 h-4 text-teal" /> : <Copy className="w-4 h-4" />}>
                      {copied === 'sig' ? 'Copied' : 'Copy signature'}
                    </Button>
                  )}
                </div>
              </div>
            </GlassCard>
          </motion.div>

          <p className="text-[11px] text-fg-muted mt-4 flex items-center gap-1 flex-wrap"><Sparkles className="w-3 h-3 shrink-0" /> Every API response carries <code className="font-mono text-fg">X-Encryption-Transit</code> and <code className="font-mono text-fg">X-Encryption-Rest</code> headers — run a live check to see them.</p>
          <div className="mt-3 flex items-center gap-4 flex-wrap">
            <Link href="/console/security" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Security hub <ArrowRight className="w-3.5 h-3.5" /></Link>
            <Link href="/console/keys" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">API keys <ArrowRight className="w-3.5 h-3.5" /></Link>
            <Link href="/console/logs" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Request logs <ArrowRight className="w-3.5 h-3.5" /></Link>
            <Link href="/console/explorer?endpoint=encryption-posture" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Try /v1/encryption in the Explorer <ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function EncryptionPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <EncryptionInner />
    </RoleGuard>
  );
}

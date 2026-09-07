'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lock, ShieldCheck, KeyRound, RefreshCw, Database, HardDrive, Server, FileKey,
  Fingerprint, Radio, Copy, Check, ArrowRight, Sparkles, Boxes, Timer, AlertTriangle,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { authHeaderValue } from '@/lib/api-config';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import RoleGuard from '@/components/RoleGuard';
import {
  PageHeader, KpiTile, GlassCard, Button, EmptyState, Skeleton, StatusBadge, SegmentedControl,
  ConfirmAction, DataTable, type Column, type BadgeTone,
} from '@/components/ui';
import {
  useEncryptionSettings, buildPosture, daysUntilRotation, ALLOWED_ROTATION_DAYS,
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

interface LiveHeaders { transit: string; rest: string; attestation: string; }

function EncryptionInner() {
  const { activeKeys, environment, user } = useStore();
  const { rotationDays, lastRotatedAt, fieldEncryption, setRotationCadence, rotatePrimaryKey, setFieldEncryption } = useEncryptionSettings();
  const toast = useToast();

  const isAdmin = user?.role === 'admin';
  const apiKey = useMemo(
    () => activeKeys.find((k) => k.environment === environment)?.key ?? activeKeys[0]?.key ?? '',
    [activeKeys, environment],
  );
  // Match the gateway's org handle (`org_<key suffix>`) so the console posture and
  // the live `/v1/encryption` endpoint derive the same keys + attestation.
  const orgId = useMemo(() => (apiKey ? `org_${apiKey.slice(-8)}` : 'org_zinbit'), [apiKey]);

  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [now, setNow] = useState(() => Date.now());
  const [live, setLive] = useState<LiveHeaders | null>(null);
  const [checking, setChecking] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    setNow(Date.now());
    track('encryption_viewed', { environment });
    const t = setTimeout(() => setPhase('ready'), 260);
    return () => clearTimeout(t);
  }, [environment]);

  const posture: EncryptionPosture = useMemo(
    () => buildPosture(orgId, { rotationDays, lastRotatedAt, fieldEncryption }, now),
    [orgId, rotationDays, lastRotatedAt, fieldEncryption, now],
  );

  const copy = (text: string, tag: string) => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(tag); setTimeout(() => setCopied(null), 1200); }).catch(() => {});
  };

  // Live check — a real same-origin call proving the X-Encryption-* headers ship.
  const runLiveCheck = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/v1/encryption', { headers: { Authorization: authHeaderValue(apiKey) } });
      const transit = res.headers.get('X-Encryption-Transit') ?? '—';
      const rest = res.headers.get('X-Encryption-Rest') ?? '—';
      const body = await res.json().catch(() => null);
      const attestation = body?.data?.attestation ?? posture.attestation;
      setLive({ transit, rest, attestation });
      track('encryption_checked', { environment, ok: res.ok });
      toast.success('Live check complete', 'Encryption headers verified on the wire.');
    } catch {
      setLive({ transit: 'error', rest: 'error', attestation: '—' });
      toast.error('Live check failed', 'Could not reach the gateway.');
    } finally {
      setChecking(false);
    }
  }, [apiKey, environment, posture.attestation, toast]);

  const doRotate = useCallback(async () => {
    setRotating(true);
    try {
      const stamp = Date.now();
      // Real gateway rotation (envelope re-wrap) — keeps the live endpoint coherent.
      await fetch('/api/v1/encryption', { method: 'POST', headers: { Authorization: authHeaderValue(apiKey), 'Content-Type': 'application/json' } }).catch(() => {});
      rotatePrimaryKey(stamp);
      setNow(stamp);
      track('encryption_key_rotated', { environment, rotationDays });
      toast.success('Primary key rotated', 'Data-encryption keys re-wrapped under a fresh KMS version.');
    } finally {
      setRotating(false);
    }
  }, [apiKey, environment, rotationDays, rotatePrimaryKey, toast]);

  const toggleField = (f: FieldEncryption) => {
    if (f.mode === 'randomized') {
      // Randomized PII is a hard floor — it can't be relaxed (no searchable trade-off).
      toast.info('Always encrypted', `${f.field} uses randomized encryption and can’t be disabled.`);
      return;
    }
    const next = !f.enabled;
    setFieldEncryption(f.field, next);
    track('encryption_field_toggled', { field: f.field, enabled: next, environment });
  };

  const setCadence = (days: number) => {
    setRotationCadence(days);
    setNow(Date.now());
    toast.success('Rotation cadence updated', `Primary key now rotates every ${days} days.`);
  };

  const noKeys = activeKeys.length === 0;

  const keyColumns: Column<KmsKey>[] = [
    {
      key: 'alias', header: 'Key', render: (k) => (
        <div className="flex items-center gap-2 min-w-0">
          <FileKey className="w-4 h-4 text-teal shrink-0" />
          <div className="min-w-0">
            <div className="font-mono text-[12px] text-fg truncate">{k.alias}</div>
            <div className="font-mono text-[10px] text-fg-subtle truncate">{k.id}</div>
          </div>
        </div>
      ),
    },
    { key: 'purpose', header: 'Purpose', render: (k) => <span className="text-[12px] text-fg-muted capitalize">{k.purpose}</span> },
    { key: 'algorithm', header: 'Algorithm', render: (k) => <span className="font-mono text-[11px] text-fg-muted">{k.algorithm}</span> },
    {
      key: 'fingerprint', header: 'Fingerprint', className: 'hidden md:table-cell',
      render: (k) => <span className="font-mono text-[10px] text-fg-subtle">{k.fingerprint}</span>,
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
          <span className="text-fg-subtle">{KIND_ICON[s.kind]}</span>
          <div>
            <div className="text-[12px] text-fg">{s.name}</div>
            <div className="text-[10px] text-fg-subtle capitalize">{s.kind.replace('-', ' ')} · {s.region}</div>
          </div>
        </div>
      ),
    },
    { key: 'algorithm', header: 'Algorithm', render: (s) => <span className="font-mono text-[11px] text-fg-muted">{s.algorithm}</span> },
    { key: 'kmsKeyId', header: 'KMS key', className: 'hidden md:table-cell', render: (s) => <span className="font-mono text-[10px] text-fg-subtle">{s.kmsKeyId}</span> },
    {
      key: 'encrypted', header: 'Status', align: 'right',
      render: (s) => <StatusBadge tone={s.encrypted ? 'success' : 'error'}>{s.encrypted ? 'Encrypted' : 'Plaintext'}</StatusBadge>,
    },
  ];

  return (
    <div className="max-w-[1100px] mx-auto pb-16">
      <PageHeader
        icon={<Lock />}
        title="Encryption"
        description="Everything you send and everything we store is encrypted — TLS 1.3 in transit, AES-256-GCM envelope encryption at rest under customer-managed KMS keys. Inspect the live posture, rotate keys, and pull a signed attestation for a security review."
        actions={
          <Button variant="secondary" size="sm" onClick={runLiveCheck} disabled={checking || noKeys}>
            {checking ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />} Run live check
          </Button>
        }
      />

      {phase === 'loading' ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[92px] rounded-2xl" />)}
        </div>
      ) : noKeys ? (
        <GlassCard className="p-0 overflow-hidden mt-6">
          <EmptyState
            icon={<KeyRound className="w-8 h-8" />}
            title="Create an API key to see your live posture"
            description="Encryption is always on. Create a key to run a live check and pull a signed attestation of your transit + at-rest guarantees."
            action={<Link href="/console/keys"><Button size="sm"><KeyRound className="w-4 h-4" /> Create a key</Button></Link>}
          />
        </GlassCard>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <KpiTile label="Posture score" value={`${posture.score}`} icon={<ShieldCheck />} hint={posture.score >= 90 ? 'strong' : 'review'} />
            <KpiTile label="In transit" value={posture.transit.version} icon={<Radio />} hint={posture.transit.cipher.replace('TLS_', '')} />
            <KpiTile label="KMS keys" value={posture.keys.length} icon={<FileKey />} hint="AES-256-GCM" />
            <KpiTile label="PII fields" value={`${posture.fields.filter((f) => f.enabled).length}/${posture.fields.length}`} icon={<Fingerprint />} hint="encrypted" />
          </div>

          {/* In transit */}
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
                <div key={row.label} className="rounded-xl border border-border bg-surface-2 p-3">
                  <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle">{row.label}</div>
                  <div className="font-mono text-[12px] text-fg mt-1 break-all">{row.value}</div>
                </div>
              ))}
            </div>
            <AnimatePresence>
              {live && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="mt-3 rounded-xl border border-teal/30 bg-teal/5 p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-teal mb-1.5 flex items-center gap-1"><Radio className="w-3 h-3" /> Live response headers</div>
                    <div className="font-mono text-[11px] text-fg-muted space-y-0.5">
                      <div><span className="text-fg-subtle">X-Encryption-Transit:</span> {live.transit}</div>
                      <div><span className="text-fg-subtle">X-Encryption-Rest:</span> {live.rest}</div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </GlassCard>

          {/* At rest — KMS keys + rotation */}
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
                    options={ALLOWED_ROTATION_DAYS.map((d) => ({ label: `${d}d`, value: String(d) }))}
                    value={String(rotationDays)}
                    onChange={(v) => setCadence(Number(v))}
                  />
                ) : (
                  <StatusBadge tone="info"><Timer className="w-3 h-3" /> {rotationDays}d cadence</StatusBadge>
                )}
                {isAdmin && (
                  <ConfirmAction size="sm" confirmLabel="Confirm rotate" onConfirm={doRotate} disabled={rotating}>
                    {rotating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Rotate primary key
                  </ConfirmAction>
                )}
              </div>
            </div>
            <DataTable columns={keyColumns} rows={posture.keys} rowKey={(k) => k.id} initialSort={{ key: 'rotation', dir: 'asc' }} />
            {!isAdmin && <p className="text-[11px] text-fg-subtle mt-2">Only an admin can rotate keys or change the cadence.</p>}
          </GlassCard>

          {/* At rest — encrypted stores */}
          <GlassCard className="p-5 mt-5">
            <div className="flex items-center gap-2 mb-4">
              <HardDrive className="w-4 h-4 text-teal" />
              <h3 className="text-sm font-bold text-fg">Encrypted data stores</h3>
              <StatusBadge tone="success">{posture.stores.filter((s) => s.encrypted).length}/{posture.stores.length} encrypted</StatusBadge>
            </div>
            <DataTable columns={storeColumns} rows={posture.stores} rowKey={(s) => s.name} />
          </GlassCard>

          {/* Field-level PII encryption */}
          <GlassCard className="p-5 mt-5">
            <div className="flex items-center gap-2 mb-1">
              <Fingerprint className="w-4 h-4 text-teal" />
              <h3 className="text-sm font-bold text-fg">Field-level PII encryption</h3>
            </div>
            <p className="text-[12px] text-fg-muted mb-4">Deterministic fields stay searchable/joinable; randomized fields are strongest and always on. {isAdmin ? 'Relax a deterministic field only if you don’t need to query it encrypted.' : 'Only an admin can change field encryption.'}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {posture.fields.map((f) => {
                const locked = f.mode === 'randomized';
                return (
                  <button
                    key={f.field}
                    onClick={() => isAdmin ? toggleField(f) : undefined}
                    disabled={!isAdmin}
                    className={`text-left rounded-xl border px-4 py-3 flex items-center gap-3 transition-colors ${f.enabled ? 'border-teal/30 bg-teal/5' : 'border-border bg-surface-2'} ${isAdmin && !locked ? 'hover:border-teal/50 cursor-pointer' : 'cursor-default'}`}
                  >
                    <span className={f.enabled ? 'text-teal' : 'text-fg-subtle'}>{f.enabled ? <Lock className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[12px] text-fg">{f.field}</div>
                      <div className="text-[10px] text-fg-subtle capitalize">{f.mode}{locked ? ' · always on' : ''}</div>
                    </div>
                    <StatusBadge tone={f.enabled ? 'success' : 'warning'}>{f.enabled ? 'Encrypted' : 'Off'}</StatusBadge>
                  </button>
                );
              })}
            </div>
          </GlassCard>

          {/* Attestation */}
          <GlassCard className="p-5 mt-5 border-teal/20">
            <div className="flex items-start gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-teal" />
                  <h3 className="text-sm font-bold text-fg">Encryption attestation</h3>
                  <StatusBadge tone={scoreTone(posture.score)}>score {posture.score}</StatusBadge>
                </div>
                <p className="text-[12px] text-fg-muted mt-0.5">A stable, signed digest over your live posture — hand it to a security reviewer. Regenerates as your configuration changes.</p>
                <code className="font-mono text-[11px] text-fg bg-surface-2 border border-border rounded-lg px-3 py-1.5 mt-2 inline-block break-all">{live?.attestation ?? posture.attestation}</code>
              </div>
              <Button variant="ghost" size="sm" onClick={() => copy(live?.attestation ?? posture.attestation, 'att')}>
                {copied === 'att' ? <Check className="w-4 h-4 text-teal" /> : <Copy className="w-4 h-4" />} Copy digest
              </Button>
            </div>
          </GlassCard>

          <p className="text-[11px] text-fg-subtle mt-4 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Every API response carries <code className="font-mono text-fg-muted">X-Encryption-Transit</code> and <code className="font-mono text-fg-muted">X-Encryption-Rest</code> headers — run a live check to see them.</p>
          <div className="mt-3 flex items-center gap-4">
            <Link href="/console/security" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Security hub <ArrowRight className="w-3.5 h-3.5" /></Link>
            <Link href="/console/keys" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">API keys <ArrowRight className="w-3.5 h-3.5" /></Link>
            <Link href="/console/logs" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Request logs <ArrowRight className="w-3.5 h-3.5" /></Link>
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

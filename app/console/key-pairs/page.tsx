'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  KeyRound, Plus, Copy, Check, Eye, ArrowRight, Info, FlaskConical, Zap,
  ShieldCheck, AlertTriangle,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import RoleGuard from '@/components/RoleGuard';
import { deriveKeyPairs, completenessLabel, type KeyPair } from '@/lib/key-pairs';
import { maskedWithFingerprint, canReveal } from '@/lib/secret-reveal';
import type { MockKey } from '@/lib/store';
import {
  PageHeader, KpiTile, GlassCard, EmptyState, Button, StatusBadge, Skeleton,
  Modal, Field, Input, ConfirmAction, type BadgeTone,
} from '@/components/ui';

const AVAILABLE_SCOPES = ['identity:read', 'corporate:read', 'search:execute', 'phone:read', 'email:verify'] as const;
const DEFAULT_SCOPES = ['identity:read', 'corporate:read', 'search:execute'];

function KeyPairsInner() {
  const { activeKeys, createKeyPair, revokeKeyPair, clearRawToken, user } = useStore();
  const toast = useToast();
  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(DEFAULT_SCOPES);
  const [revealPairId, setRevealPairId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    track('key_pairs_viewed', {});
    const t = setTimeout(() => setPhase('ready'), 400);
    return () => clearTimeout(t);
  }, []);

  const pairs = useMemo(() => deriveKeyPairs(activeKeys), [activeKeys]);
  const complete = pairs.filter((p) => p.completeness === 'complete').length;
  const revealPair = pairs.find((p) => p.pairId === revealPairId) ?? null;

  const create = () => {
    if (!isAdmin) return;
    try {
      const pairId = createKeyPair(name, scopes);
      track('key_pair_created', { scopes: scopes.length });
      toast.success('Key pair created', `Save both secrets now — this is the only time they're shown.`);
      setModalOpen(false); setName(''); setScopes(DEFAULT_SCOPES);
      setRevealPairId(pairId); // one-time reveal of the new secrets (F-115)
    } catch (e) {
      toast.error('Could not create pair', e instanceof Error ? e.message : 'Unexpected error');
    }
  };

  // One-time reveal (F-115): acknowledging clears the raw tokens, so the full
  // secrets can never be shown again — only a fingerprint + last four remain.
  const acknowledgeReveal = () => {
    if (revealPair) {
      if (revealPair.test) clearRawToken(revealPair.test.id);
      if (revealPair.live) clearRawToken(revealPair.live.id);
      track('secret_reveal_acknowledged', { pairId: revealPair.pairId });
    }
    setRevealPairId(null);
  };

  const revoke = (pair: KeyPair) => {
    try {
      revokeKeyPair(pair.pairId);
      track('key_pair_revoked', { pairId: pair.pairId });
      toast.success('Key pair revoked', `Both keys for "${pair.name}" are now revoked.`);
    } catch (e) {
      toast.error('Could not revoke', e instanceof Error ? e.message : 'Unexpected error');
    }
  };

  const copy = (text: string, id: string) => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id); setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    }).catch(() => { /* clipboard denied */ });
  };
  const toggleScope = (s: string) => setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  if (phase === 'loading') return <PairsSkeleton />;

  return (
    <div className="max-w-[1100px] mx-auto">
      <PageHeader
        title="Key Pairs"
        description="One credential, two keys: a test key for building and a live key for production — matched by name and scopes. Generate the pair together, revoke it together. Build against test, flip to live to ship."
        icon={<KeyRound />}
        actions={isAdmin ? <Button variant="primary" onClick={() => setModalOpen(true)}><Plus className="w-4 h-4" /> New pair</Button> : undefined}
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        <KpiTile label="Key pairs" value={String(pairs.length)} icon={<KeyRound />} hint="Matched credentials" />
        <KpiTile label="Complete pairs" value={String(complete)} icon={<Check />} hint="Test + live present" />
        <KpiTile label="Degraded" value={String(pairs.filter((p) => p.degraded).length)} icon={<AlertTriangle />} hint="A side revoked/expired" lowerIsBetter />
      </div>

      {!isAdmin && (
        <div className="mt-4 flex items-center gap-2 text-[13px] text-fg-muted"><Info className="w-4 h-4 text-semantic-warning" /> Only admins can create or revoke key pairs.</div>
      )}

      {pairs.length === 0 ? (
        <GlassCard className="p-0 mt-6">
          <EmptyState
            icon={<KeyRound className="w-8 h-8" />}
            title="No key pairs yet"
            description="A key pair gives you matched test and live keys under one name — the cleanest way to move from building to shipping. Standalone keys live on the Keys page."
            action={isAdmin
              ? <Button variant="primary" onClick={() => setModalOpen(true)}><Plus className="w-4 h-4" /> Generate a pair</Button>
              : <Link href="/console/keys"><Button variant="secondary">Go to Keys <ArrowRight className="w-4 h-4" /></Button></Link>}
          />
        </GlassCard>
      ) : (
        <div className="space-y-4 mt-6">
          <AnimatePresence initial={false}>
            {pairs.map((pair) => (
              <PairCard
                key={pair.pairId}
                pair={pair}
                isAdmin={isAdmin}
                onReveal={() => setRevealPairId(pair.pairId)}
                onRevoke={() => revoke(pair)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-[12px] text-fg-subtle flex-wrap">
        <Link href="/console/keys" className="inline-flex items-center gap-1.5 hover:text-teal transition-colors">Standalone Keys <ArrowRight className="w-3.5 h-3.5" /></Link>
        <Link href="/console/logs" className="inline-flex items-center gap-1.5 hover:text-teal transition-colors">Logs <ArrowRight className="w-3.5 h-3.5" /></Link>
      </div>

      {/* Generate-pair modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New key pair"
        description="Creates a matched test and live key sharing this name and scopes."
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={create} disabled={!name.trim() || scopes.length === 0}><Plus className="w-4 h-4" /> Create pair</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Pair name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Production" autoFocus />
          </Field>
          <div>
            <div className="text-[12px] font-semibold text-fg mb-2">Scopes</div>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_SCOPES.map((s) => {
                const on = scopes.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggleScope(s)}
                    aria-pressed={on}
                    className={`text-[11px] font-mono px-2 py-1 rounded-lg border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 ${on ? 'bg-teal/10 border-teal/30 text-teal' : 'bg-surface-2 border-border-subtle text-fg-muted hover:text-fg'}`}
                  >
                    {on ? '✓ ' : ''}{s}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>

      {/* One-time secret reveal (F-115) — the full secrets are shown exactly once. */}
      <Modal
        open={revealPair !== null}
        onClose={acknowledgeReveal}
        title="Save your API keys"
        description={revealPair ? `The only time the "${revealPair.name}" secrets are shown in full.` : undefined}
        footer={<div className="flex items-center justify-end"><Button variant="primary" onClick={acknowledgeReveal}><Check className="w-4 h-4" /> Done — I&apos;ve saved them</Button></div>}
      >
        <div className="space-y-3">
          <div className="flex items-start gap-2 text-[12px] text-semantic-warning bg-semantic-warning/10 rounded-lg p-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> Copy both keys now and store them safely. For your security they can&apos;t be shown again — only a fingerprint remains after this.
          </div>
          {revealPair?.test && <SecretLine label="Test" secret={revealPair.test.key} copied={copied} onCopy={copy} />}
          {revealPair?.live && <SecretLine label="Live" secret={revealPair.live.key} copied={copied} onCopy={copy} />}
        </div>
      </Modal>
    </div>
  );
}

function SecretLine({ label, secret, copied, onCopy }: { label: string; secret: string; copied: string | null; onCopy: (t: string, id: string) => void }) {
  const id = `reveal-${label}`;
  return (
    <div>
      <div className="text-[11px] font-semibold text-fg-muted mb-1">{label} key</div>
      <div className="flex items-center gap-2 bg-surface-2 border border-border-subtle rounded-lg p-2.5">
        <code className="flex-1 min-w-0 text-[11px] font-mono text-fg break-all">{secret}</code>
        <button onClick={() => onCopy(secret, id)} aria-label={copied === id ? `${label} key copied` : `Copy ${label} key`} className="shrink-0 text-fg-subtle hover:text-fg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 rounded p-0.5">
          {copied === id ? <Check className="w-3.5 h-3.5 text-semantic-success" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

function PairCard({ pair, isAdmin, onReveal, onRevoke }: {
  pair: KeyPair;
  isAdmin: boolean;
  onReveal: () => void;
  onRevoke: () => void;
}) {
  const tone: BadgeTone = pair.completeness === 'complete' ? 'success' : 'warning';
  // A secret is still savable while its one-time raw token survives (F-115).
  const savable = (pair.test && canReveal(pair.test)) || (pair.live && canReveal(pair.live));
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }}>
      <GlassCard className={`p-5 ${pair.degraded ? 'border-semantic-error/30' : ''}`}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-fg">{pair.name}</span>
              <StatusBadge tone={tone}>{completenessLabel(pair.completeness)}</StatusBadge>
              {pair.degraded && <StatusBadge tone="error"><AlertTriangle className="w-3 h-3" /> Degraded</StatusBadge>}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {pair.scopes.map((s) => (
                <span key={s} className="inline-flex items-center gap-1 text-[10px] font-mono text-fg-muted px-1.5 py-0.5 rounded bg-surface-2 border border-border-subtle"><ShieldCheck className="w-2.5 h-2.5 text-teal" /> {s}</span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {savable && <Button variant="secondary" size="sm" onClick={onReveal}><Eye className="w-3.5 h-3.5" /> Reveal secrets</Button>}
            {isAdmin && (
              <ConfirmAction variant="danger" size="sm" onConfirm={onRevoke} confirmLabel="Revoke both — confirm">Revoke pair</ConfirmAction>
            )}
          </div>
        </div>

        {savable && (
          <div className="mt-3 flex items-start gap-1.5 text-[11px] text-semantic-warning"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Secrets not saved yet — reveal them once and store them safely. You won&apos;t be able to see them again.</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <KeyRow side="Test" icon={<FlaskConical className="w-3.5 h-3.5" />} tone="neutral" mockKey={pair.test} />
          <KeyRow side="Live" icon={<Zap className="w-3.5 h-3.5" />} tone="teal" mockKey={pair.live} />
        </div>
      </GlassCard>
    </motion.div>
  );
}

function KeyRow({ side, icon, tone, mockKey }: {
  side: string;
  icon: React.ReactNode;
  tone: BadgeTone;
  mockKey: MockKey | null;
}) {
  if (!mockKey) {
    return (
      <div className="rounded-xl border border-dashed border-border-subtle p-3 flex items-center gap-2 text-[12px] text-fg-subtle">
        {icon} {side} key missing
      </div>
    );
  }
  const isRevoked = mockKey.status === 'revoked';
  return (
    <div className="rounded-xl bg-surface-2 border border-border-subtle p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-fg-muted">{icon} {side}</span>
        <StatusBadge tone={isRevoked ? 'error' : tone}>{isRevoked ? 'revoked' : mockKey.status}</StatusBadge>
      </div>
      {/* One-time reveal (F-115): after acknowledgement only the fingerprint + tail remain. */}
      <code className="block text-[11px] font-mono text-fg-muted truncate" title="Fingerprint — the full secret is shown only once, at creation">{maskedWithFingerprint(mockKey.key)}</code>
    </div>
  );
}

function PairsSkeleton() {
  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="space-y-2"><Skeleton className="h-7 w-40" /><Skeleton className="h-4 w-[34rem] max-w-full" /></div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mt-6">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      <div className="space-y-4 mt-6">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
    </div>
  );
}

export default function KeyPairsPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <KeyPairsInner />
    </RoleGuard>
  );
}

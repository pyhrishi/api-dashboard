'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  EyeOff, ShieldCheck, Fingerprint, Lock, Hash, KeyRound, Eye, RotateCcw, ArrowRight,
  Sparkles, FlaskConical, Info,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import RoleGuard from '@/components/RoleGuard';
import { useToast } from '@/components/Toast';
import {
  PageHeader, KpiTile, GlassCard, StatusBadge, ConfirmAction, Select, SegmentedControl,
  type BadgeTone,
} from '@/components/ui';
import {
  useMaskingPolicy, PII_CATALOG, fieldSpec, isStrategyAllowed, maskPayload,
  policyStrength, SAMPLE_RECORD, classifyKey,
  type MaskStrategy, type PiiFieldType, type MaskingPolicy,
} from '@/lib/pii-masking';

// TODO(F-313 phase 2): emit pii_masking_viewed / _policy_updated / _previewed via
// track() once the telemetry union lands (telemetry.ts is another session's dirty
// file right now — see the phase-2 wiring).

const STRATEGY_META: Record<MaskStrategy, { label: string; icon: React.ReactNode; tone: BadgeTone; blurb: string }> = {
  none: { label: 'Visible', icon: <Eye className="w-3.5 h-3.5" />, tone: 'warning', blurb: 'Returned in the clear' },
  partial: { label: 'Partial', icon: <EyeOff className="w-3.5 h-3.5" />, tone: 'info', blurb: 'Partially obscured (some chars kept)' },
  hash: { label: 'Hashed', icon: <Hash className="w-3.5 h-3.5" />, tone: 'info', blurb: 'Stable SHA-256 digest' },
  tokenize: { label: 'Tokenized', icon: <KeyRound className="w-3.5 h-3.5" />, tone: 'success', blurb: 'Opaque reversible-shaped token' },
  redact: { label: 'Redacted', icon: <Lock className="w-3.5 h-3.5" />, tone: 'success', blurb: 'Fully removed' },
};

const ALL_STRATEGIES: MaskStrategy[] = ['none', 'partial', 'hash', 'tokenize', 'redact'];

function flatten(obj: unknown, prefix = ''): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...flatten(v, prefix ? `${prefix}.${k}` : k));
      else out.push({ key: prefix ? `${prefix}.${k}` : k, value: String(v) });
    }
  }
  return out;
}

function MaskingInner() {
  const { user, environment } = useStore();
  const { enabled, strategies, setEnabled, setStrategy, resetPolicy } = useMaskingPolicy();
  const toast = useToast();
  const isAdmin = user?.role === 'admin';

  const policy: MaskingPolicy = useMemo(() => ({ enabled, strategies }), [enabled, strategies]);
  const strength = useMemo(() => policyStrength(policy), [policy]);
  const preview = useMemo(() => maskPayload(SAMPLE_RECORD, policy), [policy]);

  const beforeRows = useMemo(() => flatten(SAMPLE_RECORD), []);
  const afterRows = useMemo(() => flatten(preview.masked), [preview]);
  const afterByKey = useMemo(() => {
    const m = new Map<string, string>();
    afterRows.forEach((r) => m.set(r.key, r.value));
    return m;
  }, [afterRows]);

  const maskedCount = preview.maskedKeys.length;
  const strengthTone: BadgeTone = strength >= 70 ? 'success' : strength >= 40 ? 'info' : 'warning';

  const onStrategyChange = (type: PiiFieldType, next: MaskStrategy) => {
    if (!isStrategyAllowed(type, next)) {
      toast.info('Below the minimum', `${fieldSpec(type).label} can’t be weaker than ${STRATEGY_META[fieldSpec(type).minStrategy].label}.`);
      return;
    }
    setStrategy(type, next);
    // TODO(F-313 phase 2): track('pii_masking_policy_updated', { field: type, strategy: next, environment })
  };

  return (
    <div className="max-w-[1100px] mx-auto pb-16">
      <PageHeader
        icon={<EyeOff />}
        title="PII Masking"
        description="Control exactly how each kind of personal data is masked in live API responses. Sandbox keys always return full synthetic data; live keys are masked field-by-field at the edge — so sensitive fields never leave the gateway in the clear."
        actions={
          isAdmin ? (
            <ConfirmAction variant="secondary" size="sm" confirmLabel="Reset to defaults" onConfirm={() => { resetPolicy(); toast.success('Policy reset', 'Masking restored to the recommended defaults.'); }}>
              <RotateCcw className="w-4 h-4" /> Reset
            </ConfirmAction>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile label="Masking" value={enabled ? 'On' : 'Off'} icon={<ShieldCheck />} hint="live keys" />
        <KpiTile label="Policy strength" value={`${strength}%`} icon={<Lock />} hint={strengthTone === 'success' ? 'strong' : 'review'} />
        <KpiTile label="Fields governed" value={PII_CATALOG.length} icon={<Fingerprint />} />
        <KpiTile label="Masked in sample" value={`${maskedCount}`} icon={<EyeOff />} hint={`of ${beforeRows.filter((r) => classifyKey(r.key.split('.').pop() ?? '')).length} PII`} />
      </div>

      {/* Master switch */}
      <GlassCard className="p-5 mt-5">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-fg">Field-level masking</h3>
            <p className="text-[12px] text-fg-muted mt-0.5">When on, live-key responses are masked per the policy below. Turning it off returns PII in the clear on live keys — not recommended.</p>
          </div>
          {isAdmin ? (
            <SegmentedControl
              options={[{ label: 'On', value: 'on' }, { label: 'Off', value: 'off' }]}
              value={enabled ? 'on' : 'off'}
              onChange={(v) => { setEnabled(v === 'on'); }}
            />
          ) : (
            <StatusBadge tone={enabled ? 'success' : 'warning'}>{enabled ? 'On' : 'Off'}</StatusBadge>
          )}
        </div>
      </GlassCard>

      {/* Field policy table */}
      <GlassCard className="p-5 mt-5">
        <div className="flex items-center gap-2 mb-4">
          <Fingerprint className="w-4 h-4 text-teal" />
          <h3 className="text-sm font-bold text-fg">Per-field masking policy</h3>
          {!isAdmin && <StatusBadge tone="info">read-only</StatusBadge>}
        </div>
        <div className="space-y-2">
          {PII_CATALOG.map((spec) => {
            const current = strategies[spec.type];
            const meta = STRATEGY_META[current];
            return (
              <div key={spec.type} className={`rounded-xl border px-4 py-3 flex items-center gap-3 flex-wrap ${enabled ? 'border-border bg-surface-2' : 'border-border-subtle bg-surface opacity-60'}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-fg">{spec.label}</span>
                    {spec.minStrategy === 'redact' && <StatusBadge tone="success"><Lock className="w-3 h-3" /> always redacted</StatusBadge>}
                  </div>
                  <div className="text-[11px] text-fg-subtle mt-0.5">{spec.description}</div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge tone={meta.tone}>{meta.icon} {meta.label}</StatusBadge>
                  {isAdmin ? (
                    <Select
                      value={current}
                      disabled={!enabled}
                      onChange={(e) => onStrategyChange(spec.type, e.target.value as MaskStrategy)}
                      className="w-[130px] text-[12px]"
                      aria-label={`Masking strategy for ${spec.label}`}
                    >
                      {ALL_STRATEGIES.map((s) => (
                        <option key={s} value={s} disabled={!isStrategyAllowed(spec.type, s)}>
                          {STRATEGY_META[s].label}{!isStrategyAllowed(spec.type, s) ? ' —' : ''}
                        </option>
                      ))}
                    </Select>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-fg-subtle mt-3 flex items-center gap-1">
          <Info className="w-3 h-3" /> Sensitive types (government IDs, dates of birth) have a minimum strategy that can’t be relaxed.
        </p>
      </GlassCard>

      {/* Live before/after preview */}
      <GlassCard className="p-5 mt-5">
        <div className="flex items-center gap-2 mb-1">
          <FlaskConical className="w-4 h-4 text-teal" />
          <h3 className="text-sm font-bold text-fg">Masking preview</h3>
          <StatusBadge tone="info">same engine the gateway runs</StatusBadge>
        </div>
        <p className="text-[12px] text-fg-muted mb-4">A representative enriched record, masked by your current policy — exactly what a live-key caller would receive.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-2 flex items-center gap-1"><Eye className="w-3 h-3" /> Sandbox (unmasked)</div>
            <div className="rounded-xl border border-border bg-surface-2 p-3 font-mono text-[11px] space-y-1 overflow-x-auto">
              {beforeRows.map((r) => (
                <div key={r.key} className="flex gap-2">
                  <span className="text-fg-subtle shrink-0">{r.key}:</span>
                  <span className="text-fg break-all">{r.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-teal mb-2 flex items-center gap-1"><EyeOff className="w-3 h-3" /> Live (masked)</div>
            <div className="rounded-xl border border-teal/30 bg-teal/5 p-3 font-mono text-[11px] space-y-1 overflow-x-auto">
              {beforeRows.map((r) => {
                const after = afterByKey.get(r.key) ?? r.value;
                const changed = after !== r.value;
                return (
                  <div key={r.key} className="flex gap-2">
                    <span className="text-fg-subtle shrink-0">{r.key}:</span>
                    {changed ? (
                      <motion.span key={after} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} className="text-teal font-semibold break-all">{after}</motion.span>
                    ) : (
                      <span className="text-fg-muted break-all">{after}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </GlassCard>

      <p className="text-[11px] text-fg-subtle mt-4 flex items-center gap-1">
        <Sparkles className="w-3 h-3" /> Masking runs at the edge on <code className="font-mono text-fg-muted">sk_live_</code> keys only — sandbox stays unmasked for testing. Environment: <span className="font-semibold text-fg-muted">{environment}</span>.
      </p>
      <div className="mt-3 flex items-center gap-4">
        <Link href="/console/encryption" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Encryption <ArrowRight className="w-3.5 h-3.5" /></Link>
        <Link href="/console/security" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Security hub <ArrowRight className="w-3.5 h-3.5" /></Link>
        <Link href="/console/logs" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Request logs <ArrowRight className="w-3.5 h-3.5" /></Link>
      </div>
    </div>
  );
}

export default function PiiMaskingPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <MaskingInner />
    </RoleGuard>
  );
}

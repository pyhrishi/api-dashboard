'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FlaskConical, Rocket, Play, Loader2, Lock, Check, CalendarClock, ArrowRight,
  Info, AlertTriangle, CircleCheck, Sparkles, ArrowUpRight,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { track } from '@/lib/telemetry';
import { useToast } from '@/components/Toast';
import { authHeaderValue } from '@/lib/api-config';
import RoleGuard from '@/components/RoleGuard';
import {
  allPreviews, byStability, stageLabel, isEnrolled,
  type PreviewEndpoint, type PreviewStage,
} from '@/lib/preview-program';
import {
  PageHeader, GlassCard, KpiTile, Button, StatusBadge, Skeleton, type BadgeTone,
} from '@/components/ui';

const STAGE_META: Record<PreviewStage, { tone: BadgeTone; blurb: string }> = {
  alpha: { tone: 'warning', blurb: 'Shape may change — no SLA' },
  beta: { tone: 'teal', blurb: 'Stable shape — production-safe' },
  preview: { tone: 'success', blurb: 'Near-GA — final shape' },
};

interface TryResult { status: number; body: unknown; }

function PreviewInner() {
  const { activeKeys, environment, previewOptIns, enrollPreview, leavePreview, user } = useStore();
  const toast = useToast();
  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [results, setResults] = useState<Record<string, TryResult | 'loading' | undefined>>({});
  const canMutate = user?.role !== 'billing';

  const activeKey = activeKeys.find((k) => k.environment === environment) ?? activeKeys[0];

  useEffect(() => {
    track('preview_program_viewed', {});
    const t = setTimeout(() => setPhase('ready'), 400);
    return () => clearTimeout(t);
  }, []);

  const previews = useMemo(() => [...allPreviews()].sort(byStability), []);
  const enrolledCount = previewOptIns.length;

  const toggle = (p: PreviewEndpoint) => {
    if (!canMutate) return;
    const enrolled = isEnrolled(previewOptIns, p.id);
    try {
      if (enrolled) { leavePreview(p.id); toast.success(`Left ${p.name}`); }
      else { enrollPreview(p.id); toast.success(`Enrolled in ${p.name}`, `${stageLabel(p.stage)} preview · free until GA (${p.targetGA}).`); }
      track('preview_endpoint_enrolled', { id: p.id, action: enrolled ? 'leave' : 'enroll' });
    } catch (e) {
      toast.error('Could not update enrollment', e instanceof Error ? e.message : 'Unexpected error');
    }
  };

  const tryIt = async (p: PreviewEndpoint) => {
    if (!activeKey) return;
    setResults((r) => ({ ...r, [p.id]: 'loading' }));
    const enrolled = isEnrolled(previewOptIns, p.id);
    const started = performance.now();
    try {
      const headers: Record<string, string> = { Authorization: authHeaderValue(activeKey.key) };
      // Only send the opt-in when enrolled — so a non-enrolled "Try it" shows the real 403 gate.
      if (enrolled) headers['x-preview-optin'] = p.id;
      const res = await fetch(`/api/preview/${p.id}?${p.param.name}=${encodeURIComponent(p.param.example)}`, { headers });
      const body = await res.json();
      const duration = Math.round(performance.now() - started);
      setResults((r) => ({ ...r, [p.id]: { status: res.status, body } }));
      track('preview_endpoint_tried', { id: p.id, status: res.status });
      useStore.getState().logApiRequest({
        id: res.headers.get('x-request-id') || `pv_${Math.random().toString(36).slice(2, 9)}`,
        environment, timestamp: new Date().toISOString(), method: 'GET', path: p.path, status: res.status, duration, ip: '203.0.113.7',
        request: { headers: { Authorization: `Bearer ${activeKey.key.slice(0, 12)}…`, ...(enrolled ? { 'x-preview-optin': p.id } : {}) } },
        response: body,
      });
    } catch {
      setResults((r) => ({ ...r, [p.id]: { status: 0, body: { error: 'Network error' } } }));
    }
  };

  if (phase === 'loading') return <PreviewSkeleton />;

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title="Preview Program"
        description="Opt into upcoming API capabilities while they're in dark launch — call them before GA, shape them with feedback, and pay nothing until they ship. A teammate who hasn't opted in gets a clear 403, not a surprise."
        icon={<FlaskConical />}
        actions={<Link href="/console/changelog"><Button variant="secondary"><Rocket className="w-4 h-4" /> What shipped</Button></Link>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile label="Preview endpoints" value={String(previews.length)} icon={<FlaskConical />} hint="In dark launch" />
        <KpiTile label="You're enrolled in" value={String(enrolledCount)} icon={<CircleCheck />} hint="Opted-in previews" />
        <KpiTile label="Cost while previewing" value="Free" icon={<Sparkles />} hint="0 credits until GA" />
        <KpiTile label="Beta / alpha" value={`${previews.filter((p) => p.stage !== 'alpha').length} / ${previews.filter((p) => p.stage === 'alpha').length}`} icon={<Rocket />} hint="Stable / experimental" />
      </div>

      {!canMutate && (
        <div className="mt-4 flex items-center gap-2 text-[13px] text-fg-muted"><Info className="w-4 h-4 text-semantic-warning" /> Billing role is read-only — enrollment is disabled.</div>
      )}

      <div className="space-y-4 mt-6">
        {previews.map((p, i) => (
          <PreviewCard
            key={p.id}
            preview={p}
            index={i}
            enrolled={isEnrolled(previewOptIns, p.id)}
            canMutate={canMutate}
            hasKey={!!activeKey}
            result={results[p.id]}
            onToggle={() => toggle(p)}
            onTry={() => tryIt(p)}
          />
        ))}
      </div>

      <div className="mt-6 flex items-center gap-4 text-[12px] text-fg-subtle flex-wrap">
        <Link href="/console/explorer" className="inline-flex items-center gap-1.5 hover:text-teal transition-colors">Endpoint Explorer <ArrowRight className="w-3.5 h-3.5" /></Link>
        <Link href="/console/changelog" className="inline-flex items-center gap-1.5 hover:text-teal transition-colors">Changelog <ArrowRight className="w-3.5 h-3.5" /></Link>
        <Link href="/console/logs" className="inline-flex items-center gap-1.5 hover:text-teal transition-colors">Logs <ArrowRight className="w-3.5 h-3.5" /></Link>
      </div>
    </div>
  );
}

function PreviewCard({ preview, index, enrolled, canMutate, hasKey, result, onToggle, onTry }: {
  preview: PreviewEndpoint;
  index: number;
  enrolled: boolean;
  canMutate: boolean;
  hasKey: boolean;
  result: TryResult | 'loading' | undefined;
  onToggle: () => void;
  onTry: () => void;
}) {
  const stage = STAGE_META[preview.stage];
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
      <GlassCard className={`p-5 ${enrolled ? 'border-teal/40' : ''}`}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-fg">{preview.name}</span>
              <StatusBadge tone={stage.tone}>{stageLabel(preview.stage)}</StatusBadge>
              {enrolled && <StatusBadge tone="teal"><Check className="w-3 h-3" /> Enrolled</StatusBadge>}
            </div>
            <div className="text-[11px] font-mono text-fg-subtle mt-1">GET /api/preview/{preview.id}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canMutate && (
              <Button variant={enrolled ? 'ghost' : 'primary'} size="sm" onClick={onToggle}>
                {enrolled ? <>Leave</> : <><Check className="w-3.5 h-3.5" /> Enroll</>}
              </Button>
            )}
            {hasKey && (
              <Button variant="secondary" size="sm" onClick={onTry} disabled={result === 'loading'}>
                {result === 'loading' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Try it
              </Button>
            )}
          </div>
        </div>

        <p className="text-[13px] text-fg-muted mt-2.5 leading-relaxed">{preview.summary}</p>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 mt-3">
          <ul className="space-y-1">
            {preview.whatsNew.map((w) => (
              <li key={w} className="text-[12px] text-fg-muted flex gap-1.5"><ArrowUpRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-teal" /> {w}</li>
            ))}
          </ul>
          <div className="flex flex-col items-start md:items-end gap-1.5 text-[11px]">
            <span className="inline-flex items-center gap-1.5 text-fg-subtle"><Lock className="w-3 h-3" /> {stage.blurb}</span>
            <span className="inline-flex items-center gap-1.5 text-fg-subtle"><CalendarClock className="w-3 h-3" /> GA: {preview.targetGA}</span>
            {preview.supersedes && <span className="text-fg-subtle font-mono">supersedes {preview.supersedes}</span>}
          </div>
        </div>

        {/* Try-it result */}
        <AnimatePresence>
          {result && result !== 'loading' && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="mt-3 pt-3 border-t border-border-subtle">
                <div className="flex items-center gap-2 mb-2">
                  {result.status === 200
                    ? <StatusBadge tone="success"><CircleCheck className="w-3 h-3" /> 200 · served the preview</StatusBadge>
                    : result.status === 403
                      ? <StatusBadge tone="warning"><Lock className="w-3 h-3" /> 403 · opt-in required</StatusBadge>
                      : <StatusBadge tone="error"><AlertTriangle className="w-3 h-3" /> {result.status || 'error'}</StatusBadge>}
                  {result.status === 403 && !enrolled && <span className="text-[11px] text-fg-subtle">Enroll above, then try again — the gate is real.</span>}
                </div>
                <pre className="text-[11px] font-mono text-fg-muted bg-surface-2 rounded-lg p-3 overflow-x-auto max-h-56 leading-relaxed">{JSON.stringify(result.body, null, 2)}</pre>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>
    </motion.div>
  );
}

function PreviewSkeleton() {
  return (
    <div className="max-w-[1200px] mx-auto">
      <div className="space-y-2"><Skeleton className="h-7 w-48" /><Skeleton className="h-4 w-[38rem] max-w-full" /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <div className="space-y-4 mt-6">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
      </div>
    </div>
  );
}

export default function PreviewPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <PreviewInner />
    </RoleGuard>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck, ShieldAlert, FileWarning, Radio, Copy, Check, ArrowRight, Sparkles,
  Bug, Lock, RefreshCw, AlertTriangle, ScrollText,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { track } from '@/lib/telemetry';
import RoleGuard from '@/components/RoleGuard';
import { useToast } from '@/components/Toast';
import {
  PageHeader, KpiTile, GlassCard, Button, EmptyState, Skeleton, StatusBadge, SegmentedControl,
  type BadgeTone,
} from '@/components/ui';
import {
  CSP_DIRECTIVES, buildCspHeader, cspHeaderName, CSP_MODE_COOKIE, CSP_REPORT_PATH,
  type CspMode, type CspViolation,
} from '@/lib/csp';

interface ReportStats {
  total: number;
  recent: CspViolation[];
  byDirective: { directive: string; count: number }[];
  topBlocked: { uri: string; count: number }[];
  lastAt: number | null;
}

function readModeCookie(): CspMode {
  if (typeof document === 'undefined') return 'report-only';
  const m = document.cookie.split('; ').find((c) => c.startsWith(`${CSP_MODE_COOKIE}=`));
  return m?.split('=')[1] === 'enforce' ? 'enforce' : 'report-only';
}

const ago = (t: number) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
};

function CspInner() {
  const { user } = useStore();
  const toast = useToast();
  const isAdmin = user?.role === 'admin';

  const [mode, setMode] = useState<CspMode>('report-only');
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [copied, setCopied] = useState(false);

  const policy = useMemo(() => buildCspHeader(), []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(CSP_REPORT_PATH, { cache: 'no-store' });
      const body = await res.json();
      setStats(body.data as ReportStats);
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    const m = readModeCookie();
    setMode(m);
    load();
    track('csp_viewed', { mode: m });
  }, [load]);

  const changeMode = (next: CspMode) => {
    // The Edge middleware reads this cookie on the next navigation and serves the
    // matching header — so the toggle genuinely changes what the browser enforces.
    document.cookie = `${CSP_MODE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    setMode(next);
    track('csp_mode_changed', { mode: next });
    toast.success(
      next === 'enforce' ? 'Enforcing CSP' : 'Report-only mode',
      next === 'enforce'
        ? 'Reload any console tab — violations will now be blocked, not just reported.'
        : 'The policy is delivered but never blocks; violations are still reported.',
    );
  };

  // Fire a real violation: inject an image from a disallowed host. img-src is 'self'
  // data: blob:, so this cross-origin load is a genuine CSP violation the browser
  // reports to /api/csp-report — then we refresh the feed.
  const fireTestViolation = useCallback(() => {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.src = `https://csp-violation.zinbit-demo.invalid/pixel.png?t=${Date.now()}`;
    img.onerror = () => {};
    track('csp_test_fired', { mode });
    toast.info('Test resource requested', 'If the CSP is active, the browser will report a violation.');
    setTimeout(load, 1200);
  }, [load, toast, mode]);

  const refreshFeed = useCallback(() => { track('csp_feed_refreshed', {}); load(); }, [load]);

  const modeTone: BadgeTone = mode === 'enforce' ? 'success' : 'info';

  return (
    <div className="max-w-[1100px] mx-auto pb-16">
      <PageHeader
        icon={<ShieldCheck />}
        title="Content Security Policy"
        description="A browser-enforced allowlist for what the console may load and execute — the front line against XSS and clickjacking. Roll it out safely in report-only mode, watch the violation feed, then switch to enforce when it’s clean."
        actions={
          <Button variant="secondary" size="sm" onClick={refreshFeed} disabled={phase === 'loading'}>
            <RefreshCw className={`w-4 h-4 ${phase === 'loading' ? 'animate-spin' : ''}`} /> Refresh feed
          </Button>
        }
      />

      {/* Mode banner */}
      <GlassCard className={`p-5 mt-6 ${mode === 'enforce' ? 'border-semantic-success/30 bg-semantic-success/5' : 'border-teal/20 bg-teal/5'}`}>
        <div className="flex items-start gap-3 flex-wrap">
          <span className={mode === 'enforce' ? 'text-semantic-success' : 'text-teal'}>
            {mode === 'enforce' ? <Lock className="w-6 h-6" /> : <Radio className="w-6 h-6" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-fg">{mode === 'enforce' ? 'Enforcing' : 'Report-only'}</h3>
              <StatusBadge tone={modeTone}>{cspHeaderName(mode)}</StatusBadge>
            </div>
            <p className="text-[12px] text-fg-muted mt-0.5">
              {mode === 'enforce'
                ? 'Disallowed resources are blocked by the browser and reported. Verify the feed is quiet before relying on this.'
                : 'The policy is delivered but nothing is blocked — violations are collected so you can tune the policy before enforcing.'}
            </p>
          </div>
          {isAdmin ? (
            <SegmentedControl
              options={[{ label: 'Report-only', value: 'report-only' }, { label: 'Enforce', value: 'enforce' }]}
              value={mode}
              onChange={(v) => changeMode(v as CspMode)}
            />
          ) : (
            <StatusBadge tone={modeTone}>{mode === 'enforce' ? 'Enforcing' : 'Report-only'}</StatusBadge>
          )}
        </div>
        {mode === 'enforce' && (
          <p className="text-[11px] text-semantic-warning mt-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Enforce blocks disallowed resources across the console. Switch back to report-only if something legitimate breaks.</p>
        )}
      </GlassCard>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
        <KpiTile label="Mode" value={mode === 'enforce' ? 'Enforce' : 'Report'} icon={<ShieldCheck />} />
        <KpiTile label="Directives" value={CSP_DIRECTIVES.length} icon={<ScrollText />} />
        <KpiTile label="Violations" value={stats ? stats.total : '—'} icon={<FileWarning />} hint={stats?.lastAt ? ago(stats.lastAt) : undefined} />
        <KpiTile label="Blocked hosts" value={stats ? stats.topBlocked.length : '—'} icon={<ShieldAlert />} />
      </div>

      {/* Policy string */}
      <GlassCard className="p-5 mt-5">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-teal" />
            <h3 className="text-sm font-bold text-fg">Active policy</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={fireTestViolation}><Bug className="w-4 h-4" /> Trigger test violation</Button>
            <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard?.writeText(`${cspHeaderName(mode)}: ${policy}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }).catch(() => {}); }}>
              {copied ? <Check className="w-4 h-4 text-teal" /> : <Copy className="w-4 h-4" />} Copy header
            </Button>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface-2 p-3 font-mono text-[11px] text-fg-muted overflow-x-auto">
          <span className="text-teal">{cspHeaderName(mode)}:</span> {policy}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
          {CSP_DIRECTIVES.map((d) => (
            <div key={d.name} className="rounded-lg border border-border-subtle bg-surface p-2.5">
              <div className="font-mono text-[11px] text-fg font-semibold">{d.name}</div>
              <div className="font-mono text-[10px] text-teal break-all mt-0.5">{d.values.length ? d.values.join(' ') : '(bare)'}</div>
              <div className="text-[10px] text-fg-subtle mt-1">{d.description}</div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Violation feed */}
      <div className="flex items-center justify-between mt-6 mb-3">
        <h3 className="text-sm font-bold text-fg flex items-center gap-2"><FileWarning className="w-4 h-4" /> Violation feed</h3>
        {stats && stats.byDirective.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {stats.byDirective.slice(0, 4).map((d) => (
              <StatusBadge key={d.directive} tone="warning">{d.directive} · {d.count}</StatusBadge>
            ))}
          </div>
        )}
      </div>

      {phase === 'loading' ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : phase === 'error' ? (
        <GlassCard className="p-0 overflow-hidden">
          <EmptyState icon={<AlertTriangle className="w-8 h-8" />} title="Couldn’t load the feed" description="The report collector didn’t respond. Try refreshing." action={<Button size="sm" onClick={load}><RefreshCw className="w-4 h-4" /> Retry</Button>} />
        </GlassCard>
      ) : !stats || stats.recent.length === 0 ? (
        <GlassCard className="p-0 overflow-hidden">
          <EmptyState icon={<ShieldCheck className="w-8 h-8" />} title="No violations reported" description="Nothing has been blocked or flagged. Trigger a test violation to see a report land here." action={<Button size="sm" variant="secondary" onClick={fireTestViolation}><Bug className="w-4 h-4" /> Trigger test violation</Button>} />
        </GlassCard>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {stats.recent.map((v) => (
              <motion.div key={v.id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-xl border border-border bg-surface-2 px-4 py-2.5 flex items-center gap-3">
                <span className={v.disposition === 'enforce' ? 'text-semantic-error' : 'text-semantic-warning'}>
                  {v.disposition === 'enforce' ? <Lock className="w-4 h-4" /> : <FileWarning className="w-4 h-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] text-fg truncate"><span className="font-mono text-teal">{v.effectiveDirective}</span> blocked <span className="font-mono break-all">{v.blockedUri}</span></div>
                  <div className="text-[10px] text-fg-subtle truncate">on {v.documentUri}{v.sourceFile ? ` · ${v.sourceFile}${v.lineNumber ? `:${v.lineNumber}` : ''}` : ''}</div>
                </div>
                <StatusBadge tone={v.disposition === 'enforce' ? 'error' : 'warning'}>{v.disposition}</StatusBadge>
                <span className="text-[10px] text-fg-subtle shrink-0 w-14 text-right">{ago(v.at)}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <p className="text-[11px] text-fg-subtle mt-4 flex items-center gap-1"><Sparkles className="w-3 h-3" /> The console CSP is delivered by the edge middleware on every page; reports POST to <code className="font-mono text-fg-muted">{CSP_REPORT_PATH}</code>. Switching mode takes effect on the next page load.</p>
      <div className="mt-3 flex items-center gap-4">
        <Link href="/console/encryption" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Encryption <ArrowRight className="w-3.5 h-3.5" /></Link>
        <Link href="/console/waf" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Firewall <ArrowRight className="w-3.5 h-3.5" /></Link>
        <Link href="/console/security" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Security hub <ArrowRight className="w-3.5 h-3.5" /></Link>
      </div>
    </div>
  );
}

export default function CspPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer', 'billing']}>
      <CspInner />
    </RoleGuard>
  );
}

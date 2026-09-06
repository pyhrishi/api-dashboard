'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldAlert, ShieldCheck, ShieldX, Play, Loader2, Zap, Ban, CircleCheck,
  ArrowRight, Info, FlaskConical, Radio,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { authHeaderValue } from '@/lib/api-config';
import { track } from '@/lib/telemetry';
import RoleGuard from '@/components/RoleGuard';
import {
  WAF_RULES, inspectString, ruleCountsBySeverity, SEVERITY_RANK,
  type WafVerdict, type WafSeverity, type WafCategory,
} from '@/lib/waf-rules';
import {
  PageHeader, KpiTile, GlassCard, Button, StatusBadge, Skeleton, type BadgeTone,
} from '@/components/ui';

const SEVERITY_TONE: Record<WafSeverity, BadgeTone> = {
  CRITICAL: 'error',
  HIGH: 'warning',
  MEDIUM: 'info',
  LOW: 'neutral',
};

const CATEGORY_LABEL: Record<WafCategory, string> = {
  sqli: 'Injection',
  'command-injection': 'Injection',
  xss: 'Scripting',
  'path-traversal': 'Traversal',
  'file-inclusion': 'Inclusion',
};

interface LiveProbe {
  status: number;
  code: string | null;
  blocked: boolean;
}

function WafInner() {
  const { activeKeys, environment } = useStore();
  const apiKey = useMemo(
    () => activeKeys.find((k) => k.environment === environment)?.key ?? activeKeys[0]?.key ?? '',
    [activeKeys, environment],
  );

  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [payload, setPayload] = useState('');
  const [probing, setProbing] = useState(false);
  const [live, setLive] = useState<LiveProbe | null>(null);

  useEffect(() => {
    track('waf_viewed', { rules: WAF_RULES.length });
    const t = setTimeout(() => setPhase('ready'), 400);
    return () => clearTimeout(t);
  }, []);

  const counts = useMemo(() => ruleCountsBySeverity(), []);
  const sortedRules = useMemo(
    () => [...WAF_RULES].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]),
    [],
  );

  // Deterministic client verdict — the exact catalog the edge runs.
  const verdict: WafVerdict | null = useMemo(
    () => (payload.trim() ? inspectString(payload) : null),
    [payload],
  );

  const fillExample = (text: string, blocked: boolean) => {
    setPayload(text);
    track('waf_rule_tested', { blocked, source: 'preset' });
  };

  // Fire the payload as a real query param at the gateway and read the real 406.
  const probeGateway = async () => {
    if (probing || !payload.trim() || !apiKey) return;
    setProbing(true);
    setLive(null);
    try {
      const url = `/api/v1/people/phone?email=${encodeURIComponent(payload)}`;
      const res = await fetch(url, { headers: { Authorization: authHeaderValue(apiKey) } });
      let code: string | null = null;
      try {
        const json = await res.json();
        code = (json?.error?.code as string) ?? null;
      } catch {
        // non-JSON body — leave code null
      }
      const probe: LiveProbe = { status: res.status, code, blocked: res.status === 406 };
      setLive(probe);
      track('waf_live_probe', { status: res.status, blocked: probe.blocked });
    } catch {
      setLive({ status: 0, code: null, blocked: false });
    } finally {
      setProbing(false);
    }
  };

  if (phase === 'loading') return <WafSkeleton />;

  return (
    <div className="max-w-[1100px] mx-auto">
      <PageHeader
        title="Web Application Firewall"
        description="Every request to the gateway passes through the edge WAF before it reaches your data. It inspects the URL, headers, and body for known attack signatures — SQL injection, cross-site scripting, command injection, path traversal, file inclusion — and returns a 406 Not Acceptable when a payload trips a rule. The catalog below is the exact set the edge enforces; test any payload against it, then fire it at the real gateway."
        icon={<ShieldAlert />}
        actions={<Link href="/console/security"><Button variant="secondary"><ShieldCheck className="w-4 h-4" /> Security</Button></Link>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KpiTile label="Active rules" value={String(WAF_RULES.length)} icon={<ShieldAlert />} hint="Enforced at the edge" />
        <KpiTile label="Critical" value={String(counts.CRITICAL)} icon={<ShieldX />} hint="Auto-block, no exceptions" />
        <KpiTile label="Categories" value={String(new Set(WAF_RULES.map((r) => r.category)).size)} icon={<Zap />} hint="Attack classes covered" />
        <KpiTile label="Block code" value="406" icon={<Ban />} hint="Not Acceptable" />
      </div>

      {/* Live payload tester */}
      <GlassCard className="p-5 mt-6">
        <div className="flex items-center gap-2 mb-1">
          <FlaskConical className="w-4 h-4 text-teal" />
          <span className="text-sm font-semibold text-fg">Payload tester</span>
        </div>
        <p className="text-[12px] text-fg-subtle mb-3">Type or paste a payload. The verdict below runs the exact edge catalog client-side — then fire it at the real gateway to confirm the 406.</p>

        <textarea
          value={payload}
          onChange={(e) => { setPayload(e.target.value); setLive(null); }}
          rows={2}
          spellCheck={false}
          placeholder="e.g.  '; DROP TABLE users; --"
          aria-label="Payload to inspect"
          className="w-full rounded-lg bg-surface-2 border border-border-subtle px-3 py-2 text-[13px] font-mono text-fg placeholder:text-fg-subtle focus:outline-none focus:border-teal/40 focus:ring-2 focus:ring-teal/20 resize-none"
        />

        <div className="flex items-center gap-2 flex-wrap mt-2">
          <span className="text-[11px] text-fg-subtle">Try:</span>
          {sortedRules.map((r) => (
            <button
              key={`atk-${r.id}`}
              onClick={() => fillExample(r.attackExample, true)}
              className="text-[11px] font-mono px-2 py-1 rounded-md bg-semantic-error/10 text-semantic-error border border-semantic-error/20 hover:bg-semantic-error/15 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-semantic-error/40"
            >
              {r.name}
            </button>
          ))}
          <button
            onClick={() => fillExample(sortedRules[0]?.safeExample ?? '', false)}
            className="text-[11px] font-mono px-2 py-1 rounded-md bg-semantic-success/10 text-semantic-success border border-semantic-success/20 hover:bg-semantic-success/15 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-semantic-success/40"
          >
            Benign
          </button>
        </div>

        {/* Client verdict */}
        <AnimatePresence mode="wait">
          {verdict && (
            <motion.div
              key={verdict.blocked ? verdict.reason : 'clean'}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={`mt-3 rounded-lg border p-3 ${verdict.blocked ? 'border-semantic-error/30 bg-semantic-error/5' : 'border-semantic-success/30 bg-semantic-success/5'}`}
            >
              {verdict.blocked ? (
                <div className="flex items-start gap-3">
                  <StatusBadge tone={SEVERITY_TONE[verdict.severity!]}><ShieldX className="w-3 h-3" /> Blocked</StatusBadge>
                  <div className="text-[13px] text-fg-muted">
                    Trips <span className="font-semibold text-fg">{verdict.ruleName}</span> (<span className="font-mono text-fg">{verdict.reason}</span>, {verdict.severity}). The edge would return <span className="font-mono text-fg">406 Not Acceptable</span>.
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[13px] text-fg-muted"><CircleCheck className="w-4 h-4 text-semantic-success" /> Clean — no rule matches. The edge would let this through to the pipeline.</div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Live gateway probe */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border-subtle flex-wrap gap-2">
          <span className="text-[11px] text-fg-subtle inline-flex items-center gap-1.5"><Radio className="w-3.5 h-3.5" /> Fire it at the real gateway as an email param</span>
          <Button variant="primary" size="sm" onClick={probeGateway} disabled={probing || !payload.trim() || !apiKey}>
            {probing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Probe gateway
          </Button>
        </div>
        {!apiKey && <p className="text-[11px] text-semantic-warning mt-2">Generate an API key first to probe the live gateway.</p>}
        <AnimatePresence>
          {(probing || live) && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-2 overflow-hidden">
              {probing ? (
                <Skeleton className="h-10 rounded-lg" />
              ) : live ? (
                live.blocked ? (
                  <div className="flex items-start gap-3 text-[13px] text-fg-muted"><StatusBadge tone="error"><Ban className="w-3 h-3" /> 406</StatusBadge><div>The gateway blocked the request{live.code ? <> with <span className="font-mono text-fg">{live.code}</span></> : null}. The payload never reached your data.</div></div>
                ) : (
                  <div className="flex items-center gap-2 text-[13px] text-fg-muted"><CircleCheck className="w-4 h-4 text-semantic-success" /> The gateway accepted it (status {live.status || '—'}) — this payload didn&apos;t trip a rule.</div>
                )
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      {/* Rule catalog */}
      <div className="mt-6">
        <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3">Rule catalog — enforced at the edge</div>
        <div className="space-y-3">
          {sortedRules.map((rule, i) => (
            <motion.div
              key={rule.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: i * 0.04 }}
            >
              <GlassCard className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-lg bg-teal/10 flex items-center justify-center shrink-0"><ShieldAlert className="w-4 h-4 text-teal" /></span>
                    <div>
                      <div className="text-sm font-semibold text-fg">{rule.name}</div>
                      <div className="text-[11px] text-fg-subtle font-mono">{rule.id} · {CATEGORY_LABEL[rule.category]}</div>
                    </div>
                  </div>
                  <StatusBadge tone={SEVERITY_TONE[rule.severity]}>{rule.severity}</StatusBadge>
                </div>
                <p className="text-[12px] text-fg-muted mt-2">{rule.description}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                  <div className="rounded-lg bg-semantic-error/5 border border-semantic-error/15 px-2.5 py-1.5">
                    <div className="text-[10px] uppercase tracking-wide text-semantic-error/80 font-bold mb-0.5">Blocks</div>
                    <code className="text-[11px] font-mono text-fg-muted break-all">{rule.attackExample}</code>
                  </div>
                  <div className="rounded-lg bg-semantic-success/5 border border-semantic-success/15 px-2.5 py-1.5">
                    <div className="text-[10px] uppercase tracking-wide text-semantic-success/80 font-bold mb-0.5">Allows</div>
                    <code className="text-[11px] font-mono text-fg-muted break-all">{rule.safeExample}</code>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2 text-[12px] text-fg-muted"><Info className="w-3.5 h-3.5 text-teal" /> Registered security researchers bypass the WAF with a Safe-Harbor bug-bounty token to test deep application logic without an edge ban.</div>

      <div className="mt-6 flex items-center gap-4 text-[12px] text-fg-subtle flex-wrap">
        <Link href="/console/security" className="inline-flex items-center gap-1.5 hover:text-teal transition-colors">Security Center <ArrowRight className="w-3.5 h-3.5" /></Link>
        <Link href="/console/logs" className="inline-flex items-center gap-1.5 hover:text-teal transition-colors">Logs <ArrowRight className="w-3.5 h-3.5" /></Link>
        <Link href="/console/rate-limits" className="inline-flex items-center gap-1.5 hover:text-teal transition-colors">Rate Limits <ArrowRight className="w-3.5 h-3.5" /></Link>
      </div>
    </div>
  );
}

function WafSkeleton() {
  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="space-y-2"><Skeleton className="h-7 w-56" /><Skeleton className="h-4 w-[40rem] max-w-full" /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      <Skeleton className="h-40 rounded-2xl mt-6" />
      <div className="space-y-3 mt-6">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
    </div>
  );
}

export default function WafPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer']}>
      <WafInner />
    </RoleGuard>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Braces, Play, Loader2, Zap, AlertTriangle, Key, ArrowRight, ChevronRight,
  BookOpen, Code, CircleCheck, Copy, Check, FileCode,
} from 'lucide-react';
import { useStore } from '@/lib/store';
import { track } from '@/lib/telemetry';
import { authHeaderValue } from '@/lib/api-config';
import RoleGuard from '@/components/RoleGuard';
import { QUERIES, TYPES, buildSDL, EXAMPLE_QUERY, type GqlQuery } from '@/lib/graphql/schema';
import {
  PageHeader, GlassCard, EmptyState, Button, StatusBadge, Skeleton,
} from '@/components/ui';

interface GqlResponse {
  data: unknown;
  errors?: { message: string; path?: (string | number)[] }[];
  extensions?: { cost?: number; remaining?: number; masked?: boolean; environment?: string; requestId?: string; code?: string };
}

/** Build a runnable query template for a schema query (first few fields). */
function templateFor(q: GqlQuery): string {
  const arg = q.args[0];
  const type = TYPES[q.returnType];
  const scalarFields = type.fields.filter((f) => !TYPES[f.type]).slice(0, 3).map((f) => f.name);
  const nested = type.fields.find((f) => TYPES[f.type]);
  const body = [...scalarFields];
  if (nested) body.push(`${nested.name} { ${TYPES[nested.type].fields.slice(0, 2).map((f) => f.name).join(' ')} }`);
  return `query {\n  ${q.name}(${arg.name}: "${arg.example}") {\n    ${body.join('\n    ')}\n  }\n}`;
}

function GraphQLInner() {
  const { activeKeys, environment } = useStore();
  const [query, setQuery] = useState(EXAMPLE_QUERY);
  const [running, setRunning] = useState(false);
  const [response, setResponse] = useState<GqlResponse | null>(null);
  const [netError, setNetError] = useState<string | null>(null);
  const [showSDL, setShowSDL] = useState(false);
  const [copied, setCopied] = useState(false);

  const activeKey = activeKeys.find((k) => k.environment === environment) ?? activeKeys[0];

  useEffect(() => { track('graphql_explorer_viewed', {}); }, []);

  const sdl = useMemo(() => buildSDL(), []);

  const run = async () => {
    if (!activeKey || running || !query.trim()) return;
    setRunning(true);
    setNetError(null);
    const started = performance.now();
    try {
      const res = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeaderValue(activeKey.key) },
        body: JSON.stringify({ query }),
      });
      const body: GqlResponse = await res.json();
      const duration = Math.round(performance.now() - started);
      setResponse(body);

      // Flow into Logs / Analytics like the REST Explorer's Run.
      useStore.getState().logApiRequest({
        id: res.headers.get('x-request-id') || `gql_${Math.random().toString(36).slice(2, 9)}`,
        environment,
        timestamp: new Date().toISOString(),
        method: 'POST',
        path: '/graphql',
        status: res.status,
        duration,
        ip: '203.0.113.7',
        request: { headers: { Authorization: `Bearer ${activeKey.key.slice(0, 12)}…` }, body: { query } },
        response: body,
      });

      const hasErrors = Array.isArray(body.errors) && body.errors.length > 0;
      if (hasErrors) track('graphql_query_failed', { status: res.status, errors: body.errors!.length });
      else track('graphql_query_run', { cost: body.extensions?.cost ?? 0, status: res.status });
    } catch (e) {
      setNetError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setRunning(false);
    }
  };

  const copyResponse = () => {
    if (!response || !navigator.clipboard) return;
    navigator.clipboard.writeText(JSON.stringify(response, null, 2))
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })
      .catch(() => { /* clipboard denied — leave the label unchanged */ });
  };

  const insert = (q: GqlQuery) => { setQuery(templateFor(q)); setResponse(null); setNetError(null); };

  if (!activeKey) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <PageHeader title="GraphQL" description="Query the enrichment graph in a single call." icon={<Braces />} />
        <GlassCard className="p-0 mt-6">
          <EmptyState
            icon={<Key className="w-8 h-8" />}
            title="Create an API key to run queries"
            description="The GraphQL gateway authenticates with the same keys as REST. Generate one to start querying."
            action={<Link href="/console/keys"><Button variant="primary">Create a key <ArrowRight className="w-4 h-4" /></Button></Link>}
          />
        </GlassCard>
      </div>
    );
  }

  const errors = response?.errors ?? [];

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        title="GraphQL"
        description="Query exactly the enrichment graph you need in one call — walk person → employer, select only the fields you want, and pay for exactly that. Same keys, billing, and live-key masking as REST."
        icon={<Braces />}
        actions={
          <Button variant="secondary" onClick={() => setShowSDL((v) => !v)}>
            <FileCode className="w-4 h-4" /> {showSDL ? 'Hide schema' : 'View schema'}
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 mt-6 items-start">
        {/* Schema browser */}
        <div className="space-y-4">
          <GlassCard className="p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3 flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5" /> Queries</div>
            <div className="space-y-1.5">
              {Object.values(QUERIES).map((q) => (
                <button
                  key={q.name}
                  onClick={() => insert(q)}
                  className="w-full text-left rounded-lg px-2.5 py-2 hover:bg-surface-2 transition-colors group focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-mono font-semibold text-teal group-hover:underline">{q.name}</span>
                    <span className="text-[10px] font-mono text-fg-subtle inline-flex items-center gap-1"><Zap className="w-3 h-3" />{q.creditCost}</span>
                  </div>
                  <div className="text-[11px] text-fg-subtle mt-0.5 font-mono">({q.args.map((a) => `${a.name}: ${a.type}`).join(', ')}): {q.returnType}</div>
                </button>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3 flex items-center gap-1.5"><Code className="w-3.5 h-3.5" /> Types</div>
            <div className="space-y-2">
              {Object.values(TYPES).map((t) => (
                <details key={t.name} className="group">
                  <summary className="cursor-pointer list-none flex items-center gap-1.5 text-[13px] font-mono font-semibold text-fg hover:text-teal transition-colors">
                    <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" /> {t.name}
                    <span className="text-[10px] text-fg-subtle font-sans">· {t.fields.length} fields</span>
                  </summary>
                  <div className="pl-5 pt-1.5 space-y-0.5">
                    {t.fields.map((f) => (
                      <div key={f.name} className="text-[11px] font-mono text-fg-muted">
                        {f.name}: <span className="text-fg-subtle">{f.list ? `[${f.type}]` : f.type}</span>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </GlassCard>
        </div>

        {/* Editor + response */}
        <div className="space-y-4">
          <AnimatePresence>
            {showSDL && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <GlassCard className="p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-2">Schema (SDL)</div>
                  <pre className="text-[11px] font-mono text-fg-muted overflow-x-auto leading-relaxed max-h-64">{sdl}</pre>
                </GlassCard>
              </motion.div>
            )}
          </AnimatePresence>

          <GlassCard className="p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle bg-surface-2/50">
              <span className="text-[11px] font-mono text-fg-subtle inline-flex items-center gap-1.5"><Braces className="w-3.5 h-3.5" /> Query · {environment}</span>
              <Button variant="primary" size="sm" onClick={run} disabled={running || !query.trim()} aria-busy={running}>
                {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} {running ? 'Running…' : 'Run'}
              </Button>
            </div>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run(); } }}
              spellCheck={false}
              rows={12}
              aria-label="GraphQL query editor. Press Command or Control plus Enter to run."
              className="w-full bg-transparent text-fg font-mono text-[13px] leading-relaxed p-4 resize-y focus:outline-none placeholder:text-fg-subtle"
              placeholder="{ person(email: &quot;jane@stripe.com&quot;) { full_name } }"
            />
          </GlassCard>

          {/* Response — announced to assistive tech when it changes. */}
          <div aria-live="polite" aria-busy={running}>
          {netError ? (
            <GlassCard className="p-4 border-semantic-error/30">
              <div className="flex items-center gap-2 text-sm text-semantic-error"><AlertTriangle className="w-4 h-4" /> {netError}</div>
            </GlassCard>
          ) : running ? (
            <GlassCard className="p-4"><Skeleton className="h-40 rounded-lg" /></GlassCard>
          ) : response ? (
            <GlassCard className="p-0 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle bg-surface-2/50 flex-wrap gap-2">
                <span className="text-[11px] font-mono text-fg-subtle inline-flex items-center gap-2">
                  Response
                  {errors.length === 0
                    ? <StatusBadge tone="success"><CircleCheck className="w-3 h-3" /> ok</StatusBadge>
                    : <StatusBadge tone="error"><AlertTriangle className="w-3 h-3" /> {errors.length} error{errors.length === 1 ? '' : 's'}</StatusBadge>}
                  {response.extensions?.cost !== undefined && <span className="inline-flex items-center gap-1 text-fg-muted"><Zap className="w-3 h-3" />{response.extensions.cost} credit{response.extensions.cost === 1 ? '' : 's'}</span>}
                  {response.extensions?.masked && <StatusBadge tone="teal">masked (live)</StatusBadge>}
                </span>
                <button onClick={copyResponse} className="text-[11px] text-fg-subtle hover:text-fg inline-flex items-center gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 rounded px-1">
                  {copied ? <><Check className="w-3 h-3 text-semantic-success" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                </button>
              </div>
              {errors.length > 0 && (
                <ul className="px-4 py-2 border-b border-border-subtle space-y-1 bg-semantic-error/5">
                  {errors.map((e, i) => (
                    <li key={i} className="text-[12px] text-semantic-error font-mono flex gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>{e.message}{e.path ? <span className="text-fg-subtle"> · at {e.path.join('.')}</span> : null}</span>
                    </li>
                  ))}
                </ul>
              )}
              <pre className="text-[12px] font-mono text-fg-muted p-4 overflow-x-auto leading-relaxed max-h-[420px]">{JSON.stringify(response.data, null, 2)}</pre>
            </GlassCard>
          ) : (
            <GlassCard className="p-6 text-center">
              <p className="text-[13px] text-fg-muted">Run a query to see the response. Pick one from the schema browser, or edit the example above.</p>
            </GlassCard>
          )}
          </div>

          <div className="flex items-center gap-4 text-[12px] text-fg-subtle flex-wrap">
            <Link href="/console/logs" className="inline-flex items-center gap-1.5 hover:text-teal transition-colors">Runs log to Logs <ArrowRight className="w-3.5 h-3.5" /></Link>
            <Link href="/console/explorer" className="inline-flex items-center gap-1.5 hover:text-teal transition-colors">REST Explorer <ArrowRight className="w-3.5 h-3.5" /></Link>
            <Link href="/console/keys" className="inline-flex items-center gap-1.5 hover:text-teal transition-colors">API Keys <ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GraphQLPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'developer']}>
      <GraphQLInner />
    </RoleGuard>
  );
}

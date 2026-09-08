'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, X, FileText, Hash, LifeBuoy, CornerDownLeft } from 'lucide-react';
import { ENDPOINTS } from '@/data/endpoints';
import { track } from '@/lib/telemetry';
import { cn } from '@/lib/utils';

/**
 * Documentation search. Indexes the endpoint catalog (single source of truth) plus
 * the reference's guide sections, and emits `docs_search_performed` with the result
 * count — the source of the Growth KPI alert "docs search no-results rate >20% →
 * Docs owner". A search that finds nothing is a question the docs failed to answer,
 * so the empty state hands the reader to Support rather than a dead end.
 */

interface GuideSection { id: string; title: string; keywords: string; group: string }

const GUIDES: GuideSection[] = [
  { id: 'architecture', title: 'Architecture & data flow', keywords: 'gateway edge middleware pipeline regions cache', group: 'Getting started' },
  { id: 'authentication', title: 'Authentication', keywords: 'api key bearer authorization header sk_live sk_test', group: 'Getting started' },
  { id: 'sdks', title: 'Official SDKs', keywords: 'node python typescript go client library install npm pip', group: 'Getting started' },
  { id: 'errors', title: 'Errors', keywords: 'error codes 401 402 403 404 406 429 451 envelope', group: 'Getting started' },
  { id: 'mock-data', title: 'Testing & mock data', keywords: 'sandbox synthetic test key masking live', group: 'Getting started' },
  { id: 'rate-limits', title: 'Rate limits', keywords: 'throttle 429 retry-after token bucket ratelimit headers burst', group: 'Getting started' },
  { id: 'pagination', title: 'Pagination', keywords: 'cursor next_cursor has_more page list', group: 'Getting started' },
  { id: 'idempotency', title: 'Idempotency', keywords: 'idempotency-key retry duplicate safe replay', group: 'Getting started' },
  { id: 'tutorial-crm', title: 'CRM integration (HubSpot)', keywords: 'hubspot salesforce crm sync contacts tutorial', group: 'Tutorials' },
  { id: 'tutorial-webhooks', title: 'Real-time webhooks', keywords: 'webhook events signature secret delivery retry tutorial', group: 'Tutorials' },
  { id: 'migration-apollo', title: 'Migrate from Apollo / Clearbit', keywords: 'apollo clearbit migration mapping fields', group: 'Migration guides' },
  { id: 'migration-zoominfo', title: 'Migrate from ZoomInfo', keywords: 'zoominfo migration intent export', group: 'Migration guides' },
  { id: 'boilerplates', title: 'Boilerplates', keywords: 'starter template example repo next express fastapi', group: 'Resources' },
  { id: 'changelog', title: 'Changelog', keywords: 'release notes versions deprecations sunset', group: 'Resources' },
];

interface Hit { id: string; title: string; subtitle: string; kind: 'endpoint' | 'guide'; anchor: string }

function tokens(q: string): string[] {
  return q.toLowerCase().split(/[^a-z0-9_/.-]+/).filter((t) => t.length >= 2);
}

export function searchDocs(query: string, limit = 8): Hit[] {
  const terms = tokens(query);
  if (terms.length === 0) return [];
  const score = (hay: string) => terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
  const hits: (Hit & { score: number })[] = [];
  ENDPOINTS.forEach((e) => {
    const hay = `${e.name} ${e.path} ${e.method} ${e.description ?? ''} ${e.id}`.toLowerCase();
    const s = score(hay);
    if (s === terms.length) hits.push({ id: `ep:${e.id}`, title: e.name, subtitle: `${e.method} ${e.path}`, kind: 'endpoint', anchor: e.id, score: s + 0.5 });
  });
  GUIDES.forEach((g) => {
    const hay = `${g.title} ${g.keywords} ${g.group}`.toLowerCase();
    const s = score(hay);
    if (s === terms.length) hits.push({ id: `g:${g.id}`, title: g.title, subtitle: g.group, kind: 'guide', anchor: g.id, score: s });
  });
  return hits
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit)
    .map((h) => ({ id: h.id, title: h.title, subtitle: h.subtitle, kind: h.kind, anchor: h.anchor }));
}

export function DocsSearch({ onNavigate }: { onNavigate?: (anchor: string) => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = query.trim();
  const hits = useMemo(() => searchDocs(trimmed), [trimmed]);

  // One event per settled query (debounced), never per keystroke.
  useEffect(() => {
    if (trimmed.length < 2) return;
    const t = setTimeout(() => {
      track('docs_search_performed', { query: trimmed.slice(0, 40), queryLength: trimmed.length, results: hits.length, noResults: hits.length === 0 });
    }, 600);
    return () => clearTimeout(t);
  }, [trimmed, hits.length]);

  useEffect(() => { setCursor(0); }, [trimmed]);

  // ⌘K / Ctrl+K focuses the search, like every good reference.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inputRef.current?.focus(); setOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (hit: Hit) => {
    document.getElementById(hit.anchor)?.scrollIntoView({ behavior: 'smooth' });
    onNavigate?.(hit.anchor);
    setOpen(false);
  };

  const showPanel = open && trimmed.length >= 2;

  return (
    <div className="relative w-full max-w-md" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false); }}>
      <div className="relative">
        <Search className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label="Search the documentation"
          aria-expanded={showPanel}
          aria-controls={showPanel && hits.length > 0 ? 'docs-search-results' : undefined}
          aria-activedescendant={showPanel && hits[cursor] ? `docs-hit-${hits[cursor].id}` : undefined}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(hits.length - 1, c + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
            else if (e.key === 'Enter' && hits[cursor]) { e.preventDefault(); go(hits[cursor]); }
            else if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
          }}
          placeholder="Search endpoints, guides… (⌘K)"
          autoComplete="off"
          spellCheck={false}
          className="w-full h-10 rounded-xl bg-white/5 border border-white/10 pl-9 pr-9 text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-teal/60 focus-visible:ring-2 focus-visible:ring-teal/40 transition-colors"
        />
        {query && (
          <button type="button" onClick={() => { setQuery(''); inputRef.current?.focus(); }} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/40">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {showPanel && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-12 z-50 rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden"
          >
            {hits.length === 0 ? (
              <div className="p-5 text-center" role="status" aria-live="polite">
                <FileText className="w-6 h-6 text-fg-muted mx-auto mb-2" />
                <div className="text-sm font-bold text-fg">No results for “{trimmed.length > 32 ? `${trimmed.slice(0, 32)}…` : trimmed}”</div>
                <p className="text-[12px] text-fg-muted mt-1">Try an endpoint path like <span className="font-mono">/v1/people</span>, or a topic like “webhooks”. The docs team sees every search that finds nothing.</p>
                <Link href="/console/support" className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-bold text-teal hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 rounded">
                  <LifeBuoy className="w-3.5 h-3.5" /> Ask support instead
                </Link>
              </div>
            ) : (
              <ul id="docs-search-results" role="listbox" aria-label="Documentation search results" className="max-h-[360px] overflow-y-auto py-1">
                {hits.map((hit, i) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      id={`docs-hit-${hit.id}`}
                      role="option"
                      aria-selected={i === cursor}
                      tabIndex={-1}
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => go(hit)}
                      className={cn('w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors focus:outline-none', i === cursor ? 'bg-teal/10' : 'hover:bg-glass')}
                    >
                      <span className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', hit.kind === 'endpoint' ? 'bg-teal/15 text-teal' : 'bg-glass text-fg-muted')}>
                        {hit.kind === 'endpoint' ? <Hash className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-fg truncate">{hit.title}</span>
                        <span className={cn('block text-[11px] truncate', hit.kind === 'endpoint' ? 'font-mono text-fg-muted' : 'text-fg-muted')}>{hit.subtitle}</span>
                      </span>
                      {i === cursor && <CornerDownLeft className="w-3.5 h-3.5 text-fg-muted shrink-0" aria-hidden />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

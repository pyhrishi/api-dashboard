'use client';

import { useState, useEffect, useRef, useMemo, useCallback, type ReactNode } from 'react';
import { Search, Command, ArrowRight, FileText, Play, CreditCard, Key, Users, Building2, ArrowLeftRight, BookOpen, Clock, CornerDownLeft, Zap, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Portal } from './Portal';
import { useStore } from '@/lib/store';
import { ENDPOINTS } from '@/data/endpoints';
import { track } from '@/lib/telemetry';
import { cn, relativeTime } from '@/lib/utils';

/** Window event any surface can dispatch to open the palette (see `openOmnibar`). */
export const OMNIBAR_OPEN_EVENT = 'zinbit:omnibar-open';

export function openOmnibar() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OMNIBAR_OPEN_EVENT));
}

export interface OmnibarNavItem {
  name: string;
  href: string;
  icon?: ReactNode;
}

type Group = 'Actions' | 'Recent requests' | 'Endpoints' | 'Pages' | 'Docs';
const GROUP_ORDER: Group[] = ['Actions', 'Recent requests', 'Endpoints', 'Pages', 'Docs'];

interface PaletteItem {
  id: string;
  group: Group;
  icon: ReactNode;
  title: string;
  subtitle: string;
  keywords?: string;
  /** Items shown before the user types anything. */
  featured?: boolean;
  run: () => void;
}

const DOC_SECTIONS: { id: string; title: string; subtitle: string }[] = [
  { id: 'authentication', title: 'Authentication', subtitle: 'Bearer keys, sandbox vs live, scopes' },
  { id: 'architecture', title: 'Architecture', subtitle: 'Gateway pipeline, regions, caching' },
  { id: 'sdks', title: 'SDKs & code samples', subtitle: 'Node, Python, CLI, Postman, OpenAPI' },
  { id: 'errors', title: 'Error codes', subtitle: 'Status codes, retry guidance, idempotency' },
  { id: 'mock-data', title: 'Sandbox mock data', subtitle: 'What the sandbox returns' },
];

/** Every token of the query must appear somewhere in the item's searchable text. */
function matches(item: PaletteItem, query: string): boolean {
  const hay = `${item.title} ${item.subtitle} ${item.keywords ?? ''}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every(tok => hay.includes(tok));
}

// ─── Triggers ──────────────────────────────────────────────────────────────────

/** Large search bar for the command-center home page. Opens the global palette. */
export function OmnibarTrigger() {
  return (
    <div className="relative w-full group max-w-3xl mx-auto mb-8">
      <div className="absolute -inset-1 bg-gradient-to-r from-teal/20 to-teal/0 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200" />
      <button
        type="button"
        onClick={openOmnibar}
        className="relative w-full flex items-center justify-between bg-surface-2 border border-border hover:border-teal/30 rounded-2xl px-6 py-4 transition-all shadow-xl"
      >
        <div className="flex items-center gap-4">
          <Search className="w-5 h-5 text-teal" />
          <span className="text-fg-muted font-medium text-lg text-left">Search endpoints, pages, requests, or run an action…</span>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-glass border border-border text-fg-muted text-sm font-medium">
          <Command className="w-3.5 h-3.5" /> K
        </div>
      </button>
    </div>
  );
}

/** Compact header button — lives in the console top bar on every route. */
export function OmnibarHeaderButton() {
  return (
    <button
      type="button"
      onClick={openOmnibar}
      aria-label="Open command palette"
      className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-glass border border-border text-fg-muted hover:text-fg hover:border-teal/30 transition-colors text-xs font-bold"
    >
      <Search className="w-3.5 h-3.5" />
      <span className="hidden md:inline">Search</span>
      <span className="flex items-center gap-0.5 text-[10px] text-fg-subtle"><Command className="w-3 h-3" />K</span>
    </button>
  );
}

// ─── Palette ───────────────────────────────────────────────────────────────────

export function Omnibar({ navItems }: { navItems: OmnibarNavItem[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const { apiLogs, environment, toggleEnvironment, organizations, activeOrganizationId, switchOrganization } = useStore();

  const close = useCallback(() => setIsOpen(false), []);

  // ⌘K / Ctrl+K anywhere in the console, plus the programmatic open event.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        // Don't fight another modal (Drawer/Modal) for focus.
        const otherDialog = document.querySelector('[role="dialog"][aria-modal="true"]:not([data-omnibar])');
        if (otherDialog) return;
        e.preventDefault();
        setIsOpen(open => !open);
      } else if (e.key === 'Escape') {
        setIsOpen(open => (open ? false : open));
      }
    };
    const onOpen = () => setIsOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OMNIBAR_OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OMNIBAR_OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
    setQuery('');
    setActiveIndex(0);
    // Restore focus to wherever the user was before opening the palette.
    previousFocus.current?.focus();
    previousFocus.current = null;
  }, [isOpen]);

  const go = useCallback((href: string) => { close(); router.push(href); }, [close, router]);

  const items = useMemo<PaletteItem[]>(() => {
    const list: PaletteItem[] = [];

    // Actions
    list.push({ id: 'act-key', group: 'Actions', featured: true, icon: <Key className="w-4 h-4 text-teal" />, title: 'Create an API key', subtitle: 'Keys · scoped, sandbox or live', keywords: 'new token secret', run: () => go('/console/keys') });
    list.push({ id: 'act-env', group: 'Actions', featured: true, icon: <ArrowLeftRight className="w-4 h-4 text-teal" />, title: `Switch to ${environment === 'sandbox' ? 'Live' : 'Sandbox'}`, subtitle: `Currently in ${environment} · live responses are PII-masked`, keywords: 'environment toggle mode', run: () => { toggleEnvironment(); close(); } });
    list.push({ id: 'act-bulk', group: 'Actions', featured: true, icon: <Layers className="w-4 h-4 text-teal" />, title: 'New bulk enrichment job', subtitle: 'Bulk Jobs · upload a CSV, see the cost, run it through the gateway', keywords: 'csv upload batch import enrich file', run: () => go('/console/jobs?new=1') });
    list.push({ id: 'act-invite', group: 'Actions', featured: true, icon: <Users className="w-4 h-4 text-teal" />, title: 'Invite a teammate', subtitle: 'Team · the fastest way to grow usage', keywords: 'member user add', run: () => go('/console/settings/team') });
    list.push({ id: 'act-credits', group: 'Actions', featured: true, icon: <CreditCard className="w-4 h-4 text-teal" />, title: 'Recharge credits', subtitle: 'Billing · packs, auto-recharge, invoices', keywords: 'top up pay plan upgrade', run: () => go('/console/billing') });
    organizations.filter(o => o.id !== activeOrganizationId).forEach(o => {
      list.push({ id: `act-org-${o.id}`, group: 'Actions', icon: <Building2 className="w-4 h-4 text-fg-muted" />, title: `Switch to ${o.name}`, subtitle: `Organization · you are ${o.role}`, keywords: 'workspace tenant org', run: () => { switchOrganization(o.id); close(); } });
    });

    // Recent requests (current environment)
    apiLogs.filter(l => l.environment === environment).slice(0, 3).forEach(l => {
      list.push({
        id: `log-${l.id}`, group: 'Recent requests', featured: true,
        icon: <Clock className="w-4 h-4 text-fg-muted" />,
        title: `${l.method} ${l.path}`,
        subtitle: `${l.status} · ${l.duration}ms · ${relativeTime(l.timestamp)}`,
        keywords: `log request ${l.status} ${l.ip}`,
        run: () => go(`/console/logs?endpoint=${encodeURIComponent(l.path)}&status=${l.status}`),
      });
    });

    // Endpoints → Explorer deep link
    ENDPOINTS.forEach((e, i) => {
      list.push({
        id: `ep-${e.id}`, group: 'Endpoints', featured: i < 4 && !e.isDeprecated,
        icon: <Play className={cn('w-4 h-4', e.isDeprecated ? 'text-fg-subtle' : 'text-teal')} />,
        title: `Run ${e.name}`,
        subtitle: `${e.method} ${e.path} · ${e.creditCost} credit${e.creditCost === 1 ? '' : 's'}${e.isDeprecated ? ' · deprecated' : ''}`,
        keywords: `${e.id} ${e.description} explorer api`,
        run: () => go(`/console/explorer?endpoint=${encodeURIComponent(e.id)}`),
      });
    });

    // Pages (role-filtered by the layout)
    navItems.forEach(n => {
      list.push({ id: `nav-${n.href}`, group: 'Pages', icon: n.icon ?? <FileText className="w-4 h-4 text-fg-muted" />, title: n.name, subtitle: n.href, keywords: 'page go open navigate', run: () => go(n.href) });
    });

    // Docs sections
    DOC_SECTIONS.forEach(d => {
      list.push({ id: `doc-${d.id}`, group: 'Docs', icon: <BookOpen className="w-4 h-4 text-fg-muted" />, title: d.title, subtitle: `Docs · ${d.subtitle}`, keywords: 'documentation guide reference', run: () => go(`/docs#${d.id}`) });
    });

    return list;
  }, [apiLogs, environment, organizations, activeOrganizationId, navItems, go, close, toggleEnvironment, switchOrganization]);

  const results = useMemo(() => {
    const q = query.trim();
    const filtered = q ? items.filter(i => matches(i, q)) : items.filter(i => i.featured || i.group === 'Pages');
    return filtered.slice(0, 40);
  }, [items, query]);

  const grouped = useMemo(() => {
    const byGroup = new Map<Group, PaletteItem[]>();
    results.forEach(r => { byGroup.set(r.group, [...(byGroup.get(r.group) ?? []), r]); });
    return GROUP_ORDER.filter(g => byGroup.has(g)).map(g => ({ group: g, items: byGroup.get(g) as PaletteItem[] }));
  }, [results]);

  // Flat order matching the rendered order, for keyboard navigation.
  const flat = useMemo(() => grouped.reduce<PaletteItem[]>((acc, g) => acc.concat(g.items), []), [grouped]);

  useEffect(() => { setActiveIndex(0); }, [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const select = (item: PaletteItem) => {
    track('command_palette_used', { group: item.group, item: item.id, query: query.trim().slice(0, 40), viaKeyboard: false });
    item.run();
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => (flat.length ? (i + 1) % flat.length : 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => (flat.length ? (i - 1 + flat.length) % flat.length : 0)); }
    else if (e.key === 'Enter') {
      const item = flat[activeIndex];
      if (item) {
        track('command_palette_used', { group: item.group, item: item.id, query: query.trim().slice(0, 40), viaKeyboard: true });
        item.run();
      }
    }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };

  return (
    <Portal>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[110] flex items-start justify-center pt-24 sm:pt-32 px-4" role="dialog" aria-modal="true" aria-label="Command palette" data-omnibar>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-overlay backdrop-blur-sm"
              onClick={close}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: -16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -16 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="relative w-full max-w-2xl bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col"
            >
              {/* Input */}
              <div className="flex items-center px-5 py-4 border-b border-border bg-surface-2">
                <Search className="w-5 h-5 text-teal mr-3 flex-shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onInputKeyDown}
                  placeholder="Search endpoints, pages, requests — or type an action"
                  role="combobox"
                  aria-expanded={true}
                  aria-controls="omnibar-list"
                  aria-autocomplete="list"
                  aria-activedescendant={flat[activeIndex] ? `omnibar-${flat[activeIndex].id}` : undefined}
                  className="flex-1 bg-transparent border-none text-lg text-fg focus:outline-none focus:ring-0 placeholder:text-fg-subtle"
                />
                <button onClick={close} className="text-[10px] font-bold text-fg-muted hover:text-fg px-2 py-1 rounded-md bg-glass border border-border transition-colors ml-3">
                  ESC
                </button>
              </div>

              {/* Results */}
              <div ref={listRef} id="omnibar-list" className="max-h-[60vh] overflow-y-auto p-3 bg-surface" role="listbox">
                {flat.length === 0 ? (
                  <div className="py-12 text-center text-fg-muted">
                    <Search className="w-8 h-8 mx-auto mb-3 opacity-20" />
                    <p className="font-medium">No matches for &quot;{query}&quot;</p>
                    <p className="text-xs mt-1 text-fg-subtle">Try an endpoint name, a page, or an action like &quot;invite&quot;.</p>
                  </div>
                ) : (
                  grouped.map(({ group, items: groupItems }) => (
                    <div key={group} className="mb-2 last:mb-0">
                      <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest text-fg-subtle font-black">{group}</div>
                      {groupItems.map((item) => {
                        const index = flat.indexOf(item);
                        const active = index === activeIndex;
                        return (
                          <button
                            key={item.id}
                            id={`omnibar-${item.id}`}
                            data-index={index}
                            role="option"
                            aria-selected={active}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => select(item)}
                            className={cn(
                              'w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-left transition-colors',
                              active ? 'bg-glass border-border' : 'border-transparent hover:bg-glass'
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="p-2 rounded-lg bg-glass border border-border flex-shrink-0">{item.icon}</div>
                              <div className="min-w-0">
                                <div className={cn('text-sm font-bold truncate transition-colors', active ? 'text-teal' : 'text-fg')}>{item.title}</div>
                                <div className="text-fg-muted text-xs mt-0.5 font-medium truncate">{item.subtitle}</div>
                              </div>
                            </div>
                            {active ? <CornerDownLeft className="w-4 h-4 text-teal flex-shrink-0" /> : <ArrowRight className="w-4 h-4 text-fg-subtle flex-shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              {/* Footer hint */}
              <div className="px-5 py-2.5 border-t border-border-subtle bg-surface-2 flex items-center justify-between text-[10px] font-bold text-fg-subtle">
                <span className="flex items-center gap-3">
                  <span>↑↓ navigate</span>
                  <span>↵ open</span>
                  <span>esc close</span>
                </span>
                <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-teal" /> {flat.length} result{flat.length === 1 ? '' : 's'}</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
}

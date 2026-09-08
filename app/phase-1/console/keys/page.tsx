'use client';

/**
 * Phase-1 · API Keys hub.
 *
 * Consolidates the four key-management surfaces — Keys, Scopes, Usage, Kill Switch —
 * into one tabbed destination (the "club into one module" ask). Each tab renders the
 * REAL production page component (@/app/console/{keys,scopes,key-usage,kill-switch}),
 * so no capability is dropped and no route is orphaned; only the navigation is clubbed.
 * The individual /phase-1/console/{scopes,key-usage,kill-switch} re-export routes still
 * resolve for anyone who deep-links them.
 */

import { useState } from 'react';
import { Key, KeyRound, LineChart, Siren, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import ApiKeysPage from '@/app/console/keys/page';
import ScopesPage from '@/app/console/scopes/page';
import KeyUsagePage from '@/app/console/key-usage/page';
import KillSwitchPage from '@/app/console/kill-switch/page';

type TabId = 'keys' | 'scopes' | 'usage' | 'kill';

interface Tab { id: TabId; label: string; hint: string; icon: LucideIcon; Component: () => JSX.Element }

const TABS: Tab[] = [
  { id: 'keys', label: 'Keys', hint: 'Create, reveal & revoke', icon: Key, Component: ApiKeysPage as () => JSX.Element },
  { id: 'scopes', label: 'Scopes', hint: 'Least-privilege grants', icon: KeyRound, Component: ScopesPage as () => JSX.Element },
  { id: 'usage', label: 'Usage', hint: 'Per-key consumption', icon: LineChart, Component: KeyUsagePage as () => JSX.Element },
  { id: 'kill', label: 'Kill Switch', hint: 'Freeze all key traffic', icon: Siren, Component: KillSwitchPage as () => JSX.Element },
];

export default function Phase1ApiKeysHub() {
  const [active, setActive] = useState<TabId>('keys');
  const current = TABS.find((t) => t.id === active) ?? TABS[0];
  const Active = current.Component;

  return (
    <div>
      {/* Tab bar — the four clubbed key surfaces as one module */}
      <div role="tablist" aria-label="API Keys" className="flex items-center gap-1 mb-7 border-b border-border overflow-x-auto">
        {TABS.map((t) => {
          const on = t.id === active;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActive(t.id)}
              title={t.hint}
              className={cn(
                'group inline-flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-bold border-b-2 -mb-px transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 rounded-t-lg',
                on ? 'border-teal text-teal' : 'border-transparent text-fg-muted hover:text-fg hover:bg-glass',
              )}
            >
              <Icon className={cn('w-4 h-4 transition-colors', on ? 'text-teal' : 'text-fg-subtle group-hover:text-fg')} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Active surface — the real production page for the selected tab */}
      <div role="tabpanel" aria-label={current.label} key={active}>
        <Active />
      </div>
    </div>
  );
}

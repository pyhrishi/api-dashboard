'use client';

/**
 * Phase-1 scoped admin shell — industrial-grade.
 *
 * Faithfully mirrors the production AdminShell chrome (operator identity, role-filtered
 * nav with the animated active pill, mobile Drawer nav, session guard, skeleton loading,
 * theme toggle in its real compact position, audit-log discipline) but scoped to the 5
 * Phase-1 operator areas. The pages it wraps are the REAL admin pages, re-exported under
 * app/phase-1/admin/* — nothing here forks page logic; only the navigation is scoped.
 */

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, Building2, Wallet, ScrollText, CheckCheck, HeartPulse,
  LogOut, ShieldCheck, ExternalLink, Menu, Rocket, ArrowLeft,
} from 'lucide-react';
import { useStore, ROLE_LABEL } from '@/lib/admin/store';
import { track } from '@/lib/admin/telemetry';
import { ThemeToggle } from '@/components/admin/ThemeToggle';
import { Phase1LinkInterceptor } from '../_components/Phase1LinkInterceptor';
import { StatusBadge, Skeleton, Drawer } from '@/components/admin/ui';
import type { AdminRole } from '@/lib/admin/types';

interface NavItem { name: string; href: string; icon: ReactNode; roles: AdminRole[]; group: string }
const cls = 'w-4 h-4';

/** The 5 Phase-1 operator areas (Wallets + Ledger share the "Money" group). */
const NAV: NavItem[] = [
  { name: 'Overview', href: '/phase-1/admin/overview', icon: <LayoutDashboard className={cls} />, roles: ['superadmin', 'ops', 'sales', 'finance'], group: 'Operate' },
  { name: 'Customers', href: '/phase-1/admin/customers', icon: <Building2 className={cls} />, roles: ['superadmin', 'ops', 'sales', 'finance'], group: 'Operate' },
  { name: 'Wallets', href: '/phase-1/admin/wallets', icon: <Wallet className={cls} />, roles: ['superadmin', 'ops', 'sales', 'finance'], group: 'Wallets & Ledger' },
  { name: 'API Ledger', href: '/phase-1/admin/ledger', icon: <ScrollText className={cls} />, roles: ['superadmin', 'ops', 'finance'], group: 'Wallets & Ledger' },
  { name: 'Approvals', href: '/phase-1/admin/approvals', icon: <CheckCheck className={cls} />, roles: ['superadmin', 'ops', 'finance'], group: 'Govern' },
  { name: 'Account Health', href: '/phase-1/admin/health', icon: <HeartPulse className={cls} />, roles: ['superadmin', 'ops', 'sales', 'finance'], group: 'Govern' },
];

const GROUP_ORDER = ['Operate', 'Wallets & Ledger', 'Govern'];

export default function Phase1AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const operator = useStore((s) => s.operator);
  const signOut = useStore((s) => s.signOut);
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (mounted && !operator) router.replace('/admin/login'); }, [mounted, operator, router]);
  useEffect(() => { if (operator) track('admin_page_viewed', { path: pathname, role: operator.role }); }, [pathname, operator]);

  if (!mounted || !operator) {
    return (
      <div className="min-h-screen flex" aria-busy="true" aria-label="Loading Phase 1 admin">
        <div className="w-60 border-r border-border p-4 space-y-2 hidden md:block">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-9 rounded-lg" />)}</div>
        <div className="flex-1 p-8 space-y-4"><Skeleton className="h-8 w-64" /><Skeleton variant="block" className="h-40" /></div>
      </div>
    );
  }

  const items = NAV.filter((n) => n.roles.includes(operator.role));
  const allowed = pathname === '/phase-1/admin' || items.some((n) => pathname.startsWith(n.href));
  const groups = GROUP_ORDER
    .map((g) => ({ label: g, items: items.filter((n) => n.group === g) }))
    .filter((g) => g.items.length > 0);

  const navPill = (
    <motion.span layoutId="phase1-admin-nav-pill" className="absolute inset-0 rounded-lg bg-teal/10 border border-teal/20" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />
  );

  const desktopLink = (n: NavItem) => {
    const active = pathname.startsWith(n.href);
    return (
      <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined} className={`relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 ${active ? 'text-teal' : 'text-fg-muted hover:text-fg hover:bg-glass'}`}>
        {active && navPill}
        <span className="relative z-10 inline-flex items-center gap-2.5">{n.icon}{n.name}</span>
      </Link>
    );
  };

  return (
    <div className="min-h-screen flex bg-surface">
      <Phase1LinkInterceptor />
      {/* Desktop sidebar */}
      <aside className="w-60 shrink-0 border-r border-border bg-surface-2 hidden md:flex flex-col">
        <div className="h-14 px-4 flex items-center gap-2 border-b border-border">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-teal to-teal/70 grid place-items-center text-white font-black text-[13px] shadow-lg shadow-teal/20">Z</div>
          <div className="leading-tight">
            <div className="text-sm font-black text-fg">Zinbit Admin</div>
            <div className="text-[10px] font-mono text-teal uppercase tracking-widest">Phase 1 · Operator scope</div>
          </div>
        </div>
        <nav className="p-3 flex-1 overflow-y-auto" aria-label="Phase 1 admin navigation">
          {groups.map((g) => (
            <div key={g.label} className="pb-2">
              <div className="px-3 pt-3 pb-1 text-[10px] font-mono font-semibold uppercase tracking-[0.14em] text-fg-subtle">{g.label}</div>
              <div className="space-y-0.5">{g.items.map(desktopLink)}</div>
            </div>
          ))}
          <div className="mt-2 pt-3 border-t border-border">
            <div className="px-3 pb-1 text-[10px] font-mono font-semibold uppercase tracking-[0.14em] text-fg-subtle">Deferred to Phase 2+</div>
            <Link href="/admin/overview" data-phase1-exit className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-bold text-fg-subtle hover:text-fg hover:bg-glass transition-colors">
              <ExternalLink className="w-4 h-4" /> Full admin · 17 pages
            </Link>
          </div>
        </nav>
        <div className="p-3 border-t border-border space-y-2">
          <ThemeToggle variant="compact" className="w-full" />
          <Link href="/phase-1" className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-bold text-fg-muted hover:text-teal hover:bg-glass transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Launch Center
          </Link>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 border-b border-border bg-surface-2/60 backdrop-blur px-4 md:px-8 flex items-center justify-between gap-3">
          <div className="md:hidden flex items-center gap-2 text-sm font-black text-fg">
            <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open navigation" className="rounded-lg p-2 -ml-2 text-fg-muted hover:text-fg hover:bg-glass focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50"><Menu className="w-5 h-5" /></button>
            <ShieldCheck className="w-4 h-4 text-teal" /> Phase 1 Admin
          </div>
          <div className="hidden md:flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal/10 border border-teal/30">
              <Rocket className="w-3.5 h-3.5 text-teal" />
              <span className="text-[10px] font-mono font-semibold uppercase tracking-wide text-teal">Phase 1 Admin</span>
            </span>
            <span className="text-[11px] text-fg-muted">Every mutation needs a reason and is written to the <Link href="/admin/audit" className="text-teal hover:underline">audit log</Link>.</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block"><div className="text-[12px] font-bold text-fg leading-tight">{operator.name}</div><div className="text-[10px] text-fg-muted">{operator.email}</div></div>
            <StatusBadge tone={operator.role === 'superadmin' ? 'teal' : 'neutral'}>{ROLE_LABEL[operator.role]}</StatusBadge>
            <button type="button" onClick={() => { track('admin_signed_out', { role: operator.role }); signOut(); router.replace('/admin/login'); }} aria-label="Sign out" className="rounded-lg p-2 text-fg-muted hover:text-fg hover:bg-glass transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50"><LogOut className="w-4 h-4" /></button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          {allowed ? children : (
            <div className="max-w-[1100px] mx-auto py-20 text-center">
              <ShieldCheck className="w-10 h-10 text-semantic-error/60 mx-auto mb-3" />
              <h1 className="text-xl font-black text-fg">Not available to your role</h1>
              <p className="text-sm text-fg-muted mt-1">{ROLE_LABEL[operator.role]} can&rsquo;t open this area in the Phase 1 scope. Ask a super admin if you need access.</p>
              <Link href="/phase-1/admin/overview" className="inline-flex items-center gap-1 mt-4 text-sm font-bold text-teal hover:underline">Back to the operator home</Link>
            </div>
          )}
        </main>
      </div>

      {/* Mobile nav drawer */}
      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title="Navigate" description={`Phase 1 · ${operator.name} · ${ROLE_LABEL[operator.role]}`} widthClass="max-w-xs">
        <nav className="space-y-0.5" aria-label="Phase 1 admin navigation (mobile)">
          {groups.map((g) => (
            <div key={g.label} className="pb-1.5">
              <div className="px-3 pt-2 pb-1 text-[10px] font-mono font-semibold uppercase tracking-[0.14em] text-fg-subtle">{g.label}</div>
              {g.items.map((n) => (
                <Link key={n.href} href={n.href} aria-current={pathname.startsWith(n.href) ? 'page' : undefined} className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[14px] font-bold transition-colors ${pathname.startsWith(n.href) ? 'bg-teal/10 text-teal' : 'text-fg-muted hover:text-fg hover:bg-glass'}`}>{n.icon}{n.name}</Link>
              ))}
            </div>
          ))}
          <Link href="/admin/overview" data-phase1-exit className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[14px] font-bold text-fg-subtle hover:text-fg hover:bg-glass"><ExternalLink className="w-4 h-4" /> Full admin · 17 pages</Link>
          <Link href="/phase-1" className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[14px] font-bold text-fg-muted hover:text-teal hover:bg-glass"><ArrowLeft className="w-4 h-4" /> Launch Center</Link>
          <div className="pt-3"><ThemeToggle variant="compact" className="w-full" /></div>
        </nav>
      </Drawer>
    </div>
  );
}

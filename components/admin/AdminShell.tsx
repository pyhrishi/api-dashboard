'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, Filter, Building2, KeyRound, ScrollText, Wallet, Inbox, History, LogOut, ShieldCheck, ExternalLink, Menu, Siren, ShieldAlert, HeartPulse, CheckCheck, MessageSquare,
} from 'lucide-react';
import { useStore, ROLE_LABEL } from '@/lib/admin/store';
import { CONSOLE_BASE_URL } from '@/lib/admin/config';
import { track } from '@/lib/admin/telemetry';
import { ThemeToggle } from '@/components/admin/ThemeToggle';
import { StatusBadge, Skeleton, Drawer } from '@/components/admin/ui';
import type { AdminRole } from '@/lib/admin/types';

interface NavItem { name: string; href: string; icon: ReactNode; roles: AdminRole[] }
const cls = 'w-4 h-4';
export const NAV: NavItem[] = [
  { name: 'Overview', href: '/admin/overview', icon: <LayoutDashboard className={cls} />, roles: ['superadmin', 'ops', 'sales', 'finance'] },
  { name: 'Alerts', href: '/admin/alerts', icon: <Siren className={cls} />, roles: ['superadmin', 'ops', 'sales', 'finance'] },
  { name: 'Abuse & Anomaly', href: '/admin/abuse', icon: <ShieldAlert className={cls} />, roles: ['superadmin', 'ops'] },
  { name: 'Account Health', href: '/admin/health', icon: <HeartPulse className={cls} />, roles: ['superadmin', 'ops', 'sales', 'finance'] },
  { name: 'Funnel & Triggers', href: '/admin/funnel', icon: <Filter className={cls} />, roles: ['superadmin', 'ops', 'sales', 'finance'] },
  { name: 'Customers', href: '/admin/customers', icon: <Building2 className={cls} />, roles: ['superadmin', 'ops', 'sales', 'finance'] },
  { name: 'Tokens', href: '/admin/tokens', icon: <KeyRound className={cls} />, roles: ['superadmin', 'ops'] },
  { name: 'Approvals', href: '/admin/approvals', icon: <CheckCheck className={cls} />, roles: ['superadmin', 'ops', 'finance'] },
  { name: 'API Ledger', href: '/admin/ledger', icon: <ScrollText className={cls} />, roles: ['superadmin', 'ops', 'finance'] },
  { name: 'Wallets', href: '/admin/wallets', icon: <Wallet className={cls} />, roles: ['superadmin', 'ops', 'sales', 'finance'] },
  { name: 'Access Requests', href: '/admin/access-requests', icon: <Inbox className={cls} />, roles: ['superadmin', 'ops'] },
  { name: 'Customer Messages', href: '/admin/messages', icon: <MessageSquare className={cls} />, roles: ['superadmin', 'ops', 'finance'] },
  { name: 'Audit', href: '/admin/audit', icon: <History className={cls} />, roles: ['superadmin', 'ops', 'sales', 'finance'] },
];

/** Signed-in shell: left nav (role-filtered), header with operator + theme, session guard. */
export function AdminShell({ children }: { children: ReactNode }) {
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
      <div className="min-h-screen flex" aria-busy="true" aria-label="Loading admin console">
        <div className="w-60 border-r border-border p-4 space-y-2 hidden md:block">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-9 rounded-lg" />)}</div>
        <div className="flex-1 p-8 space-y-4"><Skeleton className="h-8 w-64" /><Skeleton variant="block" className="h-40" /></div>
      </div>
    );
  }

  const items = NAV.filter((n) => n.roles.includes(operator.role));
  const allowed = pathname === '/admin' || items.some((n) => pathname.startsWith(n.href));

  return (
    <div className="min-h-screen flex bg-surface">
      <aside className="w-60 shrink-0 border-r border-border bg-surface-2 hidden md:flex flex-col">
        <div className="h-14 px-4 flex items-center gap-2 border-b border-border">
          <ShieldCheck className="w-5 h-5 text-teal" />
          <div><div className="text-sm font-black text-fg leading-tight">Zinbit Admin</div><div className="text-[10px] text-fg-muted uppercase tracking-widest">Zintlr internal</div></div>
        </div>
        <nav className="p-3 space-y-0.5 flex-1" aria-label="Admin navigation">
          {items.map((n) => {
            const active = pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined} className={`relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 ${active ? 'text-teal' : 'text-fg-muted hover:text-fg hover:bg-glass'}`}>
                {active && <motion.span layoutId="admin-nav-pill" className="absolute inset-0 rounded-lg bg-teal/10 border border-teal/20" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
                <span className="relative z-10 inline-flex items-center gap-2.5">{n.icon}{n.name}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border space-y-2">
          <ThemeToggle variant="compact" className="w-full" />
          <a href={CONSOLE_BASE_URL} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-bold text-fg-muted hover:text-teal hover:bg-glass transition-colors"><ExternalLink className="w-3.5 h-3.5" /> Customer console</a>
        </div>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 border-b border-border bg-surface-2/60 backdrop-blur px-4 md:px-8 flex items-center justify-between gap-3">
          <div className="md:hidden flex items-center gap-2 text-sm font-black text-fg"><button type="button" onClick={() => setMenuOpen(true)} aria-label="Open navigation" className="rounded-lg p-2 -ml-2 text-fg-muted hover:text-fg hover:bg-glass focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50"><Menu className="w-5 h-5" /></button><ShieldCheck className="w-4 h-4 text-teal" /> Zinbit Admin</div>
          <div className="hidden md:block text-[11px] text-fg-muted">Every mutation here needs a reason and is written to the <Link href="/admin/audit" className="text-teal hover:underline">audit log</Link>.</div>
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
              <p className="text-sm text-fg-muted mt-1">{ROLE_LABEL[operator.role]} can’t open this area. Ask a super admin if you need access.</p>
              <Link href="/admin/overview" className="inline-flex items-center gap-1 mt-4 text-sm font-bold text-teal hover:underline">Back to the operator home</Link>
            </div>
          )}
        </main>
      </div>
      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title="Navigate" description={`${operator.name} · ${ROLE_LABEL[operator.role]}`} widthClass="max-w-xs">
        <nav className="space-y-0.5" aria-label="Admin navigation (mobile)">
          {items.map((n) => <Link key={n.href} href={n.href} aria-current={pathname.startsWith(n.href) ? 'page' : undefined} className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[14px] font-bold transition-colors ${pathname.startsWith(n.href) ? 'bg-teal/10 text-teal' : 'text-fg-muted hover:text-fg hover:bg-glass'}`}>{n.icon}{n.name}</Link>)}
          <a href={CONSOLE_BASE_URL} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[14px] font-bold text-fg-muted hover:text-teal hover:bg-glass"><ExternalLink className="w-4 h-4" /> Customer console</a>
          <div className="pt-3"><ThemeToggle variant="compact" className="w-full" /></div>
        </nav>
      </Drawer>
    </div>
  );
}

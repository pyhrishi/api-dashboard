'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CreditHealthBar } from '@/components/CreditHealthBar';
import { Omnibar, OmnibarHeaderButton } from '@/components/Omnibar';
import { Logo } from '@/components/Logo';
import { useStore } from '@/lib/store';
import { UserSearch, LayoutDashboard, Key, CreditCard, Webhook, LogOut, FileText, MessageSquare, Compass, Activity, BookOpen, Menu, X, LifeBuoy, Users, ChevronDown, Check, Plus, Building2, Server, Scale, ShieldAlert, ShieldCheck, Handshake, Database, GitBranch, TrendingUp, Layers, Map } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Portal } from '@/components/Portal';
import { ThemeToggle } from '@/components/ThemeToggle';
import { track } from '@/lib/telemetry';

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { environment, toggleEnvironment, user, isAuthenticated, logout, organizations, activeOrganizationId, switchOrganization, createOrganization } = useStore();
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  // Tenant Switcher State
  const [isTenantDropdownOpen, setIsTenantDropdownOpen] = useState(false);
  const [isCreateOrgModalOpen, setIsCreateOrgModalOpen] = useState(false);
  const [isSwitchingTenant, setIsSwitchingTenant] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close mobile menu on path change + record feature adoption centrally
  // (one place covers every console route, current and future).
  useEffect(() => {
    setIsMobileMenuOpen(false);
    track('feature_viewed', { feature: pathname.replace(/^\/console\/?/, '') || 'command-center' });
  }, [pathname]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle click outside for dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsTenantDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/signup');
    }
  }, [isAuthenticated, router]);

  const allNavItems = [
    { name: 'Overview', href: '/console/overview', icon: <LayoutDashboard className="w-5 h-5" />, roles: ['admin', 'developer', 'billing'] },
    { name: 'API Keys', href: '/console/keys', icon: <Key className="w-5 h-5" />, roles: ['admin', 'developer'] },
    { name: 'Endpoint Explorer', href: '/console/explorer', icon: <Compass className="w-5 h-5" />, roles: ['admin', 'developer'] },
    { name: 'Resolve', href: '/console/resolve', icon: <UserSearch className="w-5 h-5" />, roles: ['admin', 'developer'] },
    { name: 'Enrich', href: '/console/enrich', icon: <Building2 className="w-5 h-5" />, roles: ['admin', 'developer'] },
    { name: 'Bulk Jobs', href: '/console/jobs', icon: <Layers className="w-5 h-5" />, roles: ['admin', 'developer', 'billing'] },
    { name: 'Usage & Analytics', href: '/console/analytics', icon: <Activity className="w-5 h-5" />, roles: ['admin', 'developer', 'billing'] },
    { name: 'Growth', href: '/console/growth', icon: <TrendingUp className="w-5 h-5" />, roles: ['admin', 'billing'] },
    { name: 'Infrastructure', href: '/console/infrastructure', icon: <Server className="w-5 h-5" />, roles: ['admin', 'developer'] },
    { name: 'Logs', href: '/console/logs', icon: <FileText className="w-5 h-5" />, roles: ['admin', 'developer'] },
    { name: 'Security Hub', href: '/console/security', icon: <ShieldCheck className="w-5 h-5" />, roles: ['admin', 'developer'] },
    { name: 'Billing', href: '/console/billing', icon: <CreditCard className="w-5 h-5" />, roles: ['admin', 'billing'] },
    { name: 'Partners', href: '/console/partners', icon: <Handshake className="w-5 h-5" />, roles: ['admin'] },
    { name: 'Data Sharing', href: '/console/data-sharing', icon: <Database className="w-5 h-5" />, roles: ['admin'] },
    { name: 'Webhooks', href: '/console/webhooks', icon: <Webhook className="w-5 h-5" />, roles: ['admin', 'developer'] },
    { name: 'Features', href: '/console/features', icon: <MessageSquare className="w-5 h-5" />, roles: ['admin', 'developer', 'billing'] },
    { name: 'Signals', href: '/console/signals', icon: <MessageSquare className="w-5 h-5" />, roles: ['admin'] },
    { name: 'Docs', href: '/docs', icon: <BookOpen className="w-5 h-5" />, roles: ['admin', 'developer', 'billing'] },
    { name: 'Changelog', href: '/console/changelog', icon: <GitBranch className="w-5 h-5" />, roles: ['admin', 'developer', 'billing'] },
    { name: 'Roadmap', href: '/console/roadmap', icon: <Map className="w-5 h-5" />, roles: ['admin', 'developer', 'billing'] },
    { name: 'Support', href: '/console/support', icon: <LifeBuoy className="w-5 h-5" />, roles: ['admin', 'developer', 'billing'] },
    { name: 'Legal', href: '/console/legal', icon: <Scale className="w-5 h-5" />, roles: ['admin', 'developer', 'billing'] },
    { name: 'Settings', href: '/console/settings', icon: <Users className="w-5 h-5" />, roles: ['admin', 'developer', 'billing'] },
  ];

  const navItems = allNavItems.filter(item => item.roles.includes(user?.role || 'admin'));

  if (!isAuthenticated) {
    return null; // Don't render anything while redirecting
  }

  const handleLogout = () => {
    logout();
    router.push('/api');
  };

  const handleCreateOrg = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setIsCreateOrgModalOpen(false);
    setIsSwitchingTenant(true);
    setTimeout(() => {
      createOrganization(newOrgName.trim());
      track('org_created', { orgCount: (organizations?.length ?? 0) + 1 });
      setNewOrgName('');
      setTimeout(() => setIsSwitchingTenant(false), 400);
    }, 600);
  };

  const activeOrg = organizations?.find(o => o.id === activeOrganizationId) || organizations?.[0];

  const currentNavItem = allNavItems.find(item => pathname === item.href || (pathname.startsWith(item.href + '/') && item.href !== '/console' && item.href !== '/console/overview'));
  const isAuthorized = currentNavItem ? currentNavItem.roles.includes(user?.role || 'admin') : true;

  if (!mounted) {
    return (
      <div className="fixed inset-0 z-50 flex bg-surface overflow-hidden items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-teal border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-surface overflow-hidden font-sans selection:bg-teal selection:text-surface">
      {activeOrg?.brandColor && (
        <style suppressHydrationWarning dangerouslySetInnerHTML={{ __html: `:root { --color-brand: ${activeOrg.brandColor}; --color-brand-ice: color-mix(in srgb, ${activeOrg.brandColor} 40%, white); --color-brand-deep: color-mix(in srgb, ${activeOrg.brandColor} 60%, black); }` }} />
      )}
      
      {/* Global command palette (⌘K) — one instance for every console route */}
      <Omnibar navItems={navItems.map(i => ({ name: i.name, href: i.href, icon: i.icon }))} />

      {/* Create Org Modal */}
      <Portal>
        <AnimatePresence>
          {isCreateOrgModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 bg-overlay backdrop-blur-sm"
                onClick={() => setIsCreateOrgModalOpen(false)}
              />
              
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden z-10"
              >
                <div className="p-6 border-b border-border flex items-center justify-between">
                  <h3 className="text-xl font-bold text-fg flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-teal" />
                    New Organization
                  </h3>
                  <button onClick={() => setIsCreateOrgModalOpen(false)} className="text-fg-muted hover:text-fg transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <form onSubmit={handleCreateOrg} className="p-6 space-y-6">
                  <div>
                    <label className="block text-xs font-black text-fg-muted uppercase tracking-widest mb-2">
                      Organization Name
                    </label>
                    <input 
                      type="text"
                      required
                      autoFocus
                      value={newOrgName}
                      onChange={e => setNewOrgName(e.target.value)}
                      placeholder="e.g. Acme Corp"
                      className="w-full bg-glass border border-border rounded-xl py-3 px-4 text-fg focus:outline-none focus:border-teal/50 focus:ring-1 focus:ring-teal/50 transition-all"
                    />
                  </div>
                  
                  <div className="flex gap-3 pt-2">
                    <button 
                      type="button"
                      onClick={() => setIsCreateOrgModalOpen(false)}
                      className="flex-1 py-3 rounded-xl font-bold bg-glass text-fg-muted hover:text-fg hover:bg-glass-2 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      disabled={!newOrgName.trim()}
                      className="flex-1 py-3 rounded-xl font-bold bg-white text-ink hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Create
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </Portal>

      {/* Context Switch Overlay */}
      <AnimatePresence>
        {isSwitchingTenant && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-[200] bg-surface flex flex-col items-center justify-center pointer-events-auto"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-teal/20 blur-xl rounded-full" />
              <div className="w-16 h-16 border-4 border-border border-t-teal rounded-full animate-spin relative z-10" />
            </div>
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-6 text-xl font-bold text-fg tracking-tight"
            >
              Loading Workspace...
            </motion.h2>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Overlay Background */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="md:hidden fixed inset-0 bg-overlay backdrop-blur-sm z-40"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar - Deep Ink (Hover Expand / Mobile Drawer) */}
      <motion.div 
        onMouseEnter={() => setIsSidebarHovered(true)}
        onMouseLeave={() => setIsSidebarHovered(false)}
        initial={false}
        animate={{ 
          width: isSidebarHovered ? 256 : 80,
          x: 0 // Desktop always visible
        }}
        className={cn(
          "bg-surface text-fg-muted flex flex-col flex-shrink-0 border-r border-border shadow-2xl z-50 relative overflow-hidden group transition-transform duration-300 md:translate-x-0",
          isMobileMenuOpen ? "fixed inset-y-0 left-0 translate-x-0 w-64 shadow-[20px_0_40px_rgba(0,0,0,0.5)]" : "fixed md:relative -translate-x-full md:translate-x-0"
        )}
      >
        <div className={cn("flex flex-col h-full", isMobileMenuOpen ? "w-64" : "w-64")}>
          <div className="theme-grid absolute inset-0 opacity-40 pointer-events-none" />
          <div className="h-16 flex items-center px-6 border-b border-border flex-shrink-0 relative z-10">
            <div className="flex items-center relative w-full h-8">
              {/* Collapsed Icon — show just the sparkle mark from zinbit logo */}
              <div className={cn(
                "absolute left-0 top-0 transition-all duration-300 flex items-center",
                (isSidebarHovered || isMobileMenuOpen) ? "opacity-0 scale-90 pointer-events-none" : "opacity-100 scale-100"
              )}>
                <Logo collapsed={true} variant="dark" />
              </div>
              
              {/* Expanded Logo */}
              <div className={cn(
                "absolute left-0 top-0 h-8 flex items-center transition-all duration-300",
                (isSidebarHovered || isMobileMenuOpen) ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
              )}>
                <Logo collapsed={false} variant="dark" />
              </div>
            </div>
          </div>
          
          {/* Tenant Switcher / Client Logo */}
          <div className="px-4 py-4 border-b border-border bg-surface/5 relative z-50" ref={dropdownRef}>
            <button 
              onClick={() => setIsTenantDropdownOpen(!isTenantDropdownOpen)}
              className="w-full flex items-center rounded-xl transition-all duration-300 hover:bg-glass-2 p-2"
            >
              {/* Dummy Client Logo */}
              <div className="w-8 h-8 rounded-lg bg-white/10 border border-border flex items-center justify-center flex-shrink-0 shadow-inner">
                <Building2 className="w-4 h-4 text-fg-muted" />
              </div>

              {/* Tenant Details (Hidden when collapsed) */}
              <div className={cn(
                "flex items-center justify-between flex-1 overflow-hidden transition-all duration-300",
                (isSidebarHovered || isMobileMenuOpen) ? "opacity-100 ml-3" : "opacity-0 w-0 ml-0 pointer-events-none"
              )}>
                <div className="flex flex-col items-start overflow-hidden text-left flex-1">
                  <div className="text-sm font-bold text-fg truncate w-full flex items-center gap-2">
                    {activeOrg?.name || user?.company || 'Organization'}
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-fg-muted mt-0.5 whitespace-nowrap">
                    {activeOrg?.role || user?.role || 'Admin'}
                  </div>
                </div>
                <ChevronDown className="w-4 h-4 text-fg-muted flex-shrink-0 ml-2" />
              </div>
            </button>

            {/* Tenant Dropdown */}
            <AnimatePresence>
              {isTenantDropdownOpen && (isSidebarHovered || isMobileMenuOpen) && (
                <motion.div 
                  initial={{ opacity: 0, y: -5, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -5, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-4 right-4 top-full mt-2 bg-surface-2 border border-border rounded-xl shadow-2xl overflow-hidden z-[60]"
                >
                  <div className="max-h-60 overflow-y-auto py-1">
                    {organizations?.map((org) => (
                      <button
                        key={org.id}
                        onClick={() => {
                          setIsTenantDropdownOpen(false);
                          if (org.id !== activeOrganizationId) {
                            setIsSwitchingTenant(true);
                            setTimeout(() => {
                              switchOrganization(org.id);
                              setTimeout(() => setIsSwitchingTenant(false), 300);
                            }, 500);
                          }
                        }}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-glass transition-colors text-left group"
                      >
                        <div className="flex flex-col overflow-hidden">
                          <span className={cn("text-sm font-bold truncate transition-colors", activeOrganizationId === org.id ? "text-fg" : "text-fg-muted group-hover:text-fg")}>
                            {org.name}
                          </span>
                          <span className="text-[10px] uppercase tracking-widest text-fg-muted font-bold mt-0.5 whitespace-nowrap">
                            {org.role}
                          </span>
                        </div>
                        {activeOrganizationId === org.id && (
                          <Check className="w-4 h-4 text-teal flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="p-2 border-t border-border-subtle">
                    <button
                      onClick={() => {
                        setIsTenantDropdownOpen(false);
                        setIsCreateOrgModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm font-bold text-fg-muted hover:text-fg hover:bg-glass rounded-lg transition-colors whitespace-nowrap"
                    >
                      <Plus className="w-4 h-4 flex-shrink-0" />
                      Create Organization
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <nav className="flex-1 overflow-y-auto py-4 relative z-10">
            <ul className="space-y-1.5 px-4">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <li key={item.name}>
                    <Link 
                      href={item.href}
                      className={cn(
                        "flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-300",
                        (isSidebarHovered || isMobileMenuOpen) ? "w-full" : "w-[48px] overflow-hidden",
                        isActive 
                          ? "bg-teal/10 text-teal shadow-[0_0_15px_rgba(70,189,198,0.15)] border border-teal/20" 
                          : "hover:bg-glass hover:text-fg border border-transparent"
                      )}
                    >
                      <span className={cn("flex-shrink-0 transition-colors ml-1", isActive ? "text-teal" : "text-fg-muted")}>{item.icon}</span>
                      <span className={cn("ml-4 transition-opacity duration-300 whitespace-nowrap", (isSidebarHovered || isMobileMenuOpen) ? "opacity-100" : "opacity-0 pointer-events-none")}>{item.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="p-4 border-t border-border flex-shrink-0 relative z-10 flex flex-col gap-2">
            {/* Theme Toggle */}
            <div className={cn(
              'overflow-hidden transition-all duration-300',
              (isSidebarHovered || isMobileMenuOpen) ? 'opacity-100 max-h-12' : 'opacity-0 max-h-0'
            )}>
              <div className="mb-1">
                <ThemeToggle variant="compact" className="w-full" />
              </div>
            </div>
            <a 
              href="https://discord.gg/zinbit" 
              target="_blank" 
              rel="noopener noreferrer"
              className={cn(
                "flex items-center px-3 py-2.5 text-sm font-bold text-[#5865F2] hover:bg-[#5865F2]/10 rounded-lg transition-all duration-300 group border border-transparent",
                (isSidebarHovered || isMobileMenuOpen) ? "w-full" : "w-[48px] overflow-hidden"
              )}
            >
              <MessageSquare className="w-5 h-5 ml-1 flex-shrink-0 transition-colors" />
              <span className={cn("ml-4 transition-opacity duration-300 whitespace-nowrap", (isSidebarHovered || isMobileMenuOpen) ? "opacity-100" : "opacity-0 pointer-events-none")}>Discord</span>
            </a>
            <button 
              onClick={handleLogout}
              className={cn(
                "flex items-center px-3 py-2.5 text-sm font-medium text-fg-muted hover:text-fg hover:bg-glass rounded-lg transition-all duration-300 group border border-transparent",
                (isSidebarHovered || isMobileMenuOpen) ? "w-full" : "w-[48px] overflow-hidden"
              )}
            >
              <LogOut className="w-5 h-5 ml-1 flex-shrink-0 group-hover:text-semantic-error transition-colors" />
              <span className={cn("ml-4 transition-opacity duration-300 whitespace-nowrap", (isSidebarHovered || isMobileMenuOpen) ? "opacity-100" : "opacity-0 pointer-events-none")}>Sign Out</span>
            </button>
          </div>
        </div>
      </motion.div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-surface relative w-full">
        <div className="theme-grid absolute inset-0 opacity-40 pointer-events-none" />
        
        {/* Top Header */}
        <header className="h-16 bg-surface/60 backdrop-blur-xl border-b border-border flex items-center justify-between px-4 md:px-8 flex-shrink-0 z-20">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-2 text-fg-muted hover:text-fg rounded-lg hover:bg-glass transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="text-lg md:text-xl font-extrabold text-fg tracking-tight truncate hidden sm:block">zinbit <span className="text-fg-subtle font-medium text-base">by Zintlr</span></h2>
          </div>
          
          <div className="flex items-center space-x-3 md:space-x-6">
            
            <OmnibarHeaderButton />

            {/* Toggle Switch */}
            <div className="flex items-center space-x-1 bg-glass rounded-full p-1 border border-border shadow-inner">
              <button 
                onClick={() => environment === 'live' && toggleEnvironment()}
                className={cn(
                  "px-4 py-1.5 text-xs font-bold rounded-full transition-all duration-300",
                  environment === 'sandbox' ? "bg-white/10 text-fg shadow ring-1 ring-white/20" : "text-fg-muted hover:text-fg"
                )}
              >
                Sandbox
              </button>
              <button 
                onClick={() => environment === 'sandbox' && toggleEnvironment()}
                className={cn(
                  "px-4 py-1.5 text-xs font-bold rounded-full transition-all duration-300",
                  environment === 'live' ? "bg-teal/20 text-teal shadow-[0_0_15px_rgba(70,189,198,0.3)] ring-1 ring-teal/50" : "text-fg-muted hover:text-fg"
                )}
              >
                Live
              </button>
            </div>

            {/* Gamified Fuel Gauge */}
            <CreditHealthBar />
            
          </div>
        </header>

        {/* Scrollable Page Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 relative z-10 w-full overflow-x-hidden">
          {!isAuthorized ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="w-20 h-20 bg-semantic-error/10 rounded-full flex items-center justify-center mb-6">
                <ShieldAlert className="w-10 h-10 text-semantic-error" />
              </div>
              <h1 className="text-3xl font-black text-fg tracking-tight mb-3">Unauthorized Scope</h1>
              <p className="text-fg-muted max-w-md">Your current role (<strong className="text-fg">{user?.role}</strong>) does not have permission to access this area within this workspace.</p>
            </div>
          ) : (
            <ProtectedRoute allowedRoles={allNavItems.find(item => pathname.startsWith(item.href) && item.href !== '/console')?.roles as ('admin' | 'developer' | 'billing')[] | undefined || ['admin', 'developer', 'billing']}>
              {children}
            </ProtectedRoute>
          )}
        </main>
      </div>
    </div>
  );
}

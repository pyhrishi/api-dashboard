'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CreditHealthBar } from '@/components/CreditHealthBar';
import { Logo } from '@/components/Logo';
import { useStore } from '@/lib/store';
import { LayoutDashboard, Key, CreditCard, Webhook, LogOut, FileText, ChevronRight, MessageSquare, Compass, Activity, BookOpen, Menu, X, LifeBuoy, Users, ChevronDown, Check, Plus, Building2, Server, Scale } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Portal } from '@/components/Portal';

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { environment, creditBalance, toggleEnvironment, user, isAuthenticated, logout, switchRole, organizations, activeOrganizationId, switchOrganization, createOrganization } = useStore();
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Tenant Switcher State
  const [isTenantDropdownOpen, setIsTenantDropdownOpen] = useState(false);
  const [isCreateOrgModalOpen, setIsCreateOrgModalOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close mobile menu on path change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

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
    { name: 'Overview', href: '/console', icon: <LayoutDashboard className="w-5 h-5" />, roles: ['admin', 'developer', 'billing'] },
    { name: 'API Keys', href: '/console/keys', icon: <Key className="w-5 h-5" />, roles: ['admin', 'developer'] },
    { name: 'Endpoint Explorer', href: '/console/explorer', icon: <Compass className="w-5 h-5" />, roles: ['admin', 'developer'] },
    { name: 'Usage & Analytics', href: '/console/analytics', icon: <Activity className="w-5 h-5" />, roles: ['admin', 'developer', 'billing'] },
    { name: 'Infrastructure', href: '/console/infrastructure', icon: <Server className="w-5 h-5" />, roles: ['admin', 'developer'] },
    { name: 'Logs', href: '/console/logs', icon: <FileText className="w-5 h-5" />, roles: ['admin', 'developer'] },
    { name: 'Billing', href: '/console/billing', icon: <CreditCard className="w-5 h-5" />, roles: ['admin', 'billing'] },
    { name: 'Webhooks', href: '/console/webhooks', icon: <Webhook className="w-5 h-5" />, roles: ['admin', 'developer'] },
    { name: 'Features', href: '/console/features', icon: <MessageSquare className="w-5 h-5" />, roles: ['admin', 'developer', 'billing'] },
    { name: 'Signals', href: '/console/signals', icon: <MessageSquare className="w-5 h-5" />, roles: ['admin'] },
    { name: 'Docs', href: '/docs', icon: <BookOpen className="w-5 h-5" />, roles: ['admin', 'developer', 'billing'] },
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
    createOrganization(newOrgName.trim());
    setNewOrgName('');
    setIsCreateOrgModalOpen(false);
  };

  const activeOrg = organizations?.find(o => o.id === activeOrganizationId) || organizations?.[0];

  return (
    <div className="fixed inset-0 z-50 flex bg-ink overflow-hidden font-sans selection:bg-teal selection:text-ink">
      
      {/* Create Org Modal */}
      <Portal>
        <AnimatePresence>
          {isCreateOrgModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                onClick={() => setIsCreateOrgModalOpen(false)}
              />
              
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-md bg-[#09090b] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-10"
              >
                <div className="p-6 border-b border-white/10 flex items-center justify-between">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-teal" />
                    New Organization
                  </h3>
                  <button onClick={() => setIsCreateOrgModalOpen(false)} className="text-white/40 hover:text-white transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <form onSubmit={handleCreateOrg} className="p-6 space-y-6">
                  <div>
                    <label className="block text-xs font-black text-white/40 uppercase tracking-widest mb-2">
                      Organization Name
                    </label>
                    <input 
                      type="text"
                      required
                      autoFocus
                      value={newOrgName}
                      onChange={e => setNewOrgName(e.target.value)}
                      placeholder="e.g. Acme Corp"
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-teal/50 focus:ring-1 focus:ring-teal/50 transition-all"
                    />
                  </div>
                  
                  <div className="flex gap-3 pt-2">
                    <button 
                      type="button"
                      onClick={() => setIsCreateOrgModalOpen(false)}
                      className="flex-1 py-3 rounded-xl font-bold bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
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

      {/* Mobile Overlay Background */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
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
          "bg-ink text-white/60 flex flex-col flex-shrink-0 border-r border-white/10 shadow-2xl z-50 relative overflow-hidden group transition-transform duration-300 md:translate-x-0",
          isMobileMenuOpen ? "fixed inset-y-0 left-0 translate-x-0 w-64 shadow-[20px_0_40px_rgba(0,0,0,0.5)]" : "fixed md:relative -translate-x-full md:translate-x-0"
        )}
      >
        <div className={cn("flex flex-col h-full", isMobileMenuOpen ? "w-64" : "w-64")}>
          <div className="grid-dark absolute inset-0 opacity-40 pointer-events-none" />
          <div className="h-16 flex items-center px-6 border-b border-white/10 flex-shrink-0 relative z-10">
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
          <div className="px-4 py-4 border-b border-white/10 bg-[#09090b]/5 relative z-50" ref={dropdownRef}>
            <button 
              onClick={() => setIsTenantDropdownOpen(!isTenantDropdownOpen)}
              className="w-full flex items-center rounded-xl transition-all duration-300 hover:bg-white/10 p-2"
            >
              {/* Dummy Client Logo */}
              <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center flex-shrink-0 shadow-inner">
                <Building2 className="w-4 h-4 text-white/60" />
              </div>

              {/* Tenant Details (Hidden when collapsed) */}
              <div className={cn(
                "flex items-center justify-between flex-1 overflow-hidden transition-all duration-300",
                (isSidebarHovered || isMobileMenuOpen) ? "opacity-100 ml-3" : "opacity-0 w-0 ml-0 pointer-events-none"
              )}>
                <div className="flex flex-col items-start overflow-hidden text-left flex-1">
                  <div className="text-sm font-bold text-white truncate w-full flex items-center gap-2">
                    {activeOrg?.name || user?.company || 'Organization'}
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mt-0.5 whitespace-nowrap">
                    {activeOrg?.role || user?.role || 'Admin'}
                  </div>
                </div>
                <ChevronDown className="w-4 h-4 text-white/40 flex-shrink-0 ml-2" />
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
                  className="absolute left-4 right-4 top-full mt-2 bg-[#1a1a1f] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-[60]"
                >
                  <div className="max-h-60 overflow-y-auto py-1">
                    {organizations?.map((org) => (
                      <button
                        key={org.id}
                        onClick={() => {
                          switchOrganization(org.id);
                          setIsTenantDropdownOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left group"
                      >
                        <div className="flex flex-col overflow-hidden">
                          <span className={cn("text-sm font-bold truncate transition-colors", activeOrganizationId === org.id ? "text-white" : "text-white/70 group-hover:text-white")}>
                            {org.name}
                          </span>
                          <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold mt-0.5 whitespace-nowrap">
                            {org.role}
                          </span>
                        </div>
                        {activeOrganizationId === org.id && (
                          <Check className="w-4 h-4 text-teal flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="p-2 border-t border-white/5">
                    <button
                      onClick={() => {
                        setIsTenantDropdownOpen(false);
                        setIsCreateOrgModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm font-bold text-white/60 hover:text-white hover:bg-white/5 rounded-lg transition-colors whitespace-nowrap"
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
                          : "hover:bg-white/5 hover:text-white border border-transparent"
                      )}
                    >
                      <span className={cn("flex-shrink-0 transition-colors ml-1", isActive ? "text-teal" : "text-white/40")}>{item.icon}</span>
                      <span className={cn("ml-4 transition-opacity duration-300 whitespace-nowrap", (isSidebarHovered || isMobileMenuOpen) ? "opacity-100" : "opacity-0 pointer-events-none")}>{item.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="p-4 border-t border-white/10 flex-shrink-0 relative z-10 flex flex-col gap-2">
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
                "flex items-center px-3 py-2.5 text-sm font-medium text-white/40 hover:text-white hover:bg-white/5 rounded-lg transition-all duration-300 group border border-transparent",
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
      <div className="flex-1 flex flex-col overflow-hidden bg-ink relative w-full">
        <div className="grid-dark absolute inset-0 opacity-40 pointer-events-none" />
        
        {/* Top Header */}
        <header className="h-16 bg-ink/60 backdrop-blur-xl border-b border-white/10 flex items-center justify-between px-4 md:px-8 flex-shrink-0 z-20">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-2 text-white/60 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="text-lg md:text-xl font-extrabold text-white tracking-tight truncate hidden sm:block">zinbit <span className="text-white/30 font-medium text-base">by Zintlr</span></h2>
          </div>
          
          <div className="flex items-center space-x-3 md:space-x-6">
            
            {/* Toggle Switch */}
            <div className="flex items-center space-x-1 bg-white/5 rounded-full p-1 border border-white/10 shadow-inner">
              <button 
                onClick={() => environment === 'live' && toggleEnvironment()}
                className={cn(
                  "px-4 py-1.5 text-xs font-bold rounded-full transition-all duration-300",
                  environment === 'sandbox' ? "bg-white/10 text-white shadow ring-1 ring-white/20" : "text-white/40 hover:text-white"
                )}
              >
                Sandbox
              </button>
              <button 
                onClick={() => environment === 'sandbox' && toggleEnvironment()}
                className={cn(
                  "px-4 py-1.5 text-xs font-bold rounded-full transition-all duration-300",
                  environment === 'live' ? "bg-teal/20 text-teal shadow-[0_0_15px_rgba(70,189,198,0.3)] ring-1 ring-teal/50" : "text-white/40 hover:text-white"
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
          <ProtectedRoute allowedRoles={allNavItems.find(item => pathname.startsWith(item.href) && item.href !== '/console')?.roles as any || ['admin', 'developer', 'billing']}>
            {children}
          </ProtectedRoute>
        </main>
      </div>
    </div>
  );
}

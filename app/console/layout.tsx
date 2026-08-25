'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { LayoutDashboard, Key, CreditCard, Webhook, LogOut, FileText, ChevronRight, MessageSquare, Compass, Activity, BookOpen, Menu, X, LifeBuoy, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import ProtectedRoute from '@/components/ProtectedRoute';

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { environment, creditBalance, toggleEnvironment, user, isAuthenticated, logout, switchRole } = useStore();
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile menu on path change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

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
    { name: 'Logs', href: '/console/logs', icon: <FileText className="w-5 h-5" />, roles: ['admin', 'developer'] },
    { name: 'Billing', href: '/console/billing', icon: <CreditCard className="w-5 h-5" />, roles: ['admin', 'billing'] },
    { name: 'Webhooks', href: '/console/webhooks', icon: <Webhook className="w-5 h-5" />, roles: ['admin', 'developer'] },
    { name: 'Docs', href: '/docs', icon: <BookOpen className="w-5 h-5" />, roles: ['admin', 'developer', 'billing'] },
    { name: 'Support', href: '/console/support', icon: <LifeBuoy className="w-5 h-5" />, roles: ['admin', 'developer', 'billing'] },
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

  return (
    <div className="fixed inset-0 z-50 flex bg-ink overflow-hidden font-sans selection:bg-teal selection:text-ink">
      
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
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-teal/20 flex items-center justify-center flex-shrink-0">
              <div className="w-4 h-4 bg-teal rounded-sm shadow-[0_0_10px_rgba(70,189,198,0.5)]" />
            </div>
            <img src="/logo.png" alt="Zintlr" className={cn("h-6 w-auto transition-opacity duration-300", (isSidebarHovered || isMobileMenuOpen) ? "opacity-100" : "opacity-0")} />
          </div>
        </div>
        
        {/* User Info & Environment */}
        <div className="px-6 py-4 border-b border-white/10 bg-white/5 relative z-10 flex flex-col justify-between">
          <div className={cn("transition-opacity duration-300", (isSidebarHovered || isMobileMenuOpen) ? "opacity-100" : "opacity-0")}>
            <div className="text-sm font-bold text-white truncate">{user?.company || 'Acme Corp'}</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mt-1">
              {user?.role || 'Admin'}
            </div>
          </div>
          
          <div className={cn("flex items-center justify-between transition-opacity duration-300 mt-3", (isSidebarHovered || isMobileMenuOpen) ? "opacity-100" : "opacity-0")}>
            <span className="text-[10px] font-bold text-white/70 uppercase tracking-widest flex items-center gap-1.5">
              <div className={cn("w-2 h-2 rounded-full", environment === 'live' ? "bg-semantic-success" : "bg-semantic-warning")} />
              {environment === 'live' ? 'Live' : 'Sandbox'}
            </span>
            <button 
              onClick={toggleEnvironment}
              className={cn("w-8 h-4 rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-none", environment === 'live' ? 'bg-teal' : 'bg-white/20')}
            >
              <div className={cn("w-3 h-3 bg-white rounded-full shadow-md transform transition-transform duration-200 ease-in-out", environment === 'live' ? 'translate-x-4' : 'translate-x-0')} />
            </button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 relative z-10">
          <ul className="space-y-1.5 px-4">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <li key={item.name}>
                  <Link 
                    href={item.href}
                    className={cn(
                      "flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-300",
                      isActive 
                        ? "bg-teal/10 text-teal shadow-[0_0_15px_rgba(70,189,198,0.15)] border border-teal/20" 
                        : "hover:bg-white/5 hover:text-white border border-transparent"
                    )}
                  >
                    <span className={cn("flex-shrink-0 transition-colors ml-1", isActive ? "text-teal" : "text-white/40")}>{item.icon}</span>
                    <span className={cn("ml-4 transition-opacity duration-300", (isSidebarHovered || isMobileMenuOpen) ? "opacity-100" : "opacity-0")}>{item.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="p-4 border-t border-white/10 flex-shrink-0 relative z-10 flex flex-col gap-2">
          <a 
            href="https://discord.gg/zintlr" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center w-full px-3 py-2.5 text-sm font-bold text-[#5865F2] hover:bg-[#5865F2]/10 rounded-lg transition-colors group border border-transparent"
          >
            <MessageSquare className="w-5 h-5 ml-1 flex-shrink-0 transition-colors" />
            <span className={cn("ml-4 transition-opacity duration-300", (isSidebarHovered || isMobileMenuOpen) ? "opacity-100" : "opacity-0")}>Discord</span>
          </a>
          <button 
            onClick={handleLogout}
            className="flex items-center w-full px-3 py-2.5 text-sm font-medium text-white/40 hover:text-white hover:bg-white/5 rounded-lg transition-colors group border border-transparent"
          >
            <LogOut className="w-5 h-5 ml-1 flex-shrink-0 group-hover:text-semantic-error transition-colors" />
            <span className={cn("ml-4 transition-opacity duration-300", (isSidebarHovered || isMobileMenuOpen) ? "opacity-100" : "opacity-0")}>Sign Out</span>
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
            <h2 className="text-lg md:text-xl font-extrabold text-white tracking-tight truncate hidden sm:block">Partner Console</h2>
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

            {/* Credits Badge with Visual Quota */}
            <Link href="/console/billing" className="flex items-center space-x-3 md:space-x-4 bg-white/5 hover:bg-white/10 transition-colors border border-white/10 px-3 md:px-4 py-1.5 rounded-full shadow-sm">
              <div className="flex items-center space-x-2 md:space-x-3">
                <div className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-teal shadow-[0_0_10px_rgba(70,189,198,0.6)] animate-pulse-node" />
                <div className="flex items-baseline space-x-1.5">
                  <span className="text-sm font-extrabold text-white">{creditBalance.toLocaleString()}</span>
                  <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest hidden sm:inline-block">Credits</span>
                </div>
              </div>
              
              {/* Mini Quota Bar */}
              <div className="h-6 border-l border-white/10 pl-3 md:pl-4 items-center hidden sm:flex">
                <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(creditBalance / 10000) * 100}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className={cn("h-full rounded-full", (creditBalance / 10000) < 0.2 ? "bg-semantic-warning shadow-[0_0_10px_rgba(255,176,32,0.6)]" : "bg-teal shadow-[0_0_10px_rgba(70,189,198,0.6)]")}
                  />
                </div>
              </div>
            </Link>
            
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

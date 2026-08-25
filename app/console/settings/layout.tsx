'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { User, Users, Shield, ArrowRight, FileSignature } from 'lucide-react';
import { useStore } from '@/lib/store';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useStore();

  const navItems = [
    { name: 'Profile', href: '/console/settings/profile', icon: <User className="w-4 h-4" /> },
    { name: 'Team', href: '/console/settings/team', icon: <Users className="w-4 h-4" />, adminOnly: true },
    { name: 'Security', href: '/console/settings/security', icon: <Shield className="w-4 h-4" /> },
    { name: 'Audit Logs', href: '/console/settings/audit', icon: <FileSignature className="w-4 h-4" />, adminOnly: true },
  ];

  return (
    <div className="max-w-6xl mx-auto pb-12 font-sans text-white">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Settings</h1>
        <p className="text-white/60 font-medium text-sm">Manage your profile, team members, and workspace security.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Settings Sidebar */}
        <div className="lg:w-64 flex-shrink-0 overflow-x-auto no-scrollbar">
          <nav className="flex lg:flex-col gap-2 lg:gap-0 lg:space-y-1 pb-2 lg:pb-0 min-w-max lg:min-w-0 px-1 lg:px-0">
            {navItems.map((item) => {
              if (item.adminOnly && user?.role !== 'admin') return null;
              
              const isActive = pathname === item.href || (item.href === '/console/settings/profile' && pathname === '/console/settings');
              
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all whitespace-nowrap flex-shrink-0 lg:flex-shrink ${
                    isActive 
                      ? 'bg-teal/10 text-teal font-bold shadow-sm border border-teal/20' 
                      : 'text-white/60 hover:bg-white/5 hover:text-white font-medium border border-transparent'
                  }`}
                >
                  {item.icon}
                  {item.name}
                  {isActive && <ArrowRight className="w-4 h-4 ml-auto opacity-50 hidden lg:block" />}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Settings Content Area */}
        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useStore } from '@/lib/store';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: ('admin' | 'developer' | 'billing')[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, isAuthenticated } = useStore();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null; // Avoid hydration mismatch

  if (!isAuthenticated) return null; // Handled by layout

  const userRole = user?.role || 'admin';

  if (!allowedRoles.includes(userRole)) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-8 text-center animate-fade-in">
        <div className="w-24 h-24 bg-semantic-error/10 rounded-full flex items-center justify-center mb-6 relative">
          <div className="absolute inset-0 border-2 border-semantic-error/20 rounded-full animate-ping-slow" />
          <ShieldAlert className="w-12 h-12 text-semantic-error" />
        </div>
        <h1 className="text-3xl font-extrabold text-white mb-4 tracking-tight">Access Denied</h1>
        <p className="text-white/50 max-w-md mb-8">
          You do not have the necessary permissions to view this page. Please contact your workspace administrator to request <strong className="text-white">{allowedRoles.join(' or ')}</strong> access.
        </p>
        <Link 
          href="/console"
          className="bg-white text-ink font-bold px-6 py-3 rounded-full flex items-center gap-2 hover:bg-white/90 transition-all hover:scale-105 active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
          Return to Overview
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}

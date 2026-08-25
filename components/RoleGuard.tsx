'use client';

import { useStore } from '@/lib/store';
import { useEffect, useState } from 'react';

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: ('admin' | 'developer' | 'billing')[];
  fallback?: React.ReactNode;
}

export default function RoleGuard({ children, allowedRoles, fallback = null }: RoleGuardProps) {
  const { user } = useStore();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return <>{fallback}</>; // Prevent hydration mismatch on initial render

  const userRole = user?.role || 'admin';

  if (!allowedRoles.includes(userRole)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

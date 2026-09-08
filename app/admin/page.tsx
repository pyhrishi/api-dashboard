'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/admin/ui';

/** Bare /admin lands here and forwards to the operator home. */
export default function AdminHome() {
  const router = useRouter();
  useEffect(() => { router.replace('/admin/overview'); }, [router]);
  return (
    <div className="max-w-[1100px] mx-auto space-y-4" aria-busy="true" aria-label="Opening the admin console">
      <Skeleton className="h-8 w-64" />
      <Skeleton variant="block" className="h-40" />
    </div>
  );
}

'use client';

import { motion } from 'framer-motion';
import { ScrollText } from 'lucide-react';
import { useLoad } from '@/lib/admin/useLoad';
import { PageHeader, GlassCard, Skeleton } from '@/components/admin/ui';
import { ErrorCard } from '@/components/admin/shared';
import { LedgerPanel } from '@/components/admin/LedgerPanel';
import type { Customer, ManagedKey } from '@/lib/admin/types';

export default function LedgerPage() {
  const customers = useLoad<Customer[]>('customers');
  const keys = useLoad<ManagedKey[]>('keys');
  return (
    <div className="max-w-[1200px] mx-auto pb-16">
      <PageHeader icon={<ScrollText />} title="API ledger" description="Every call across customers by time frame, with the status-code breakdown and the consumption and cost view. Metadata only — timestamps, endpoints, status, latency, credits, key fingerprints, regions and request ids. No request or response body exists in this app." />
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <GlassCard className="p-5 mt-6">
          {customers.state.status === 'loading' || keys.state.status === 'loading' ? <div className="space-y-3" aria-busy="true"><Skeleton className="h-9 w-2/3" /><Skeleton variant="block" className="h-[420px]" /></div>
            : customers.state.status === 'error' ? <ErrorCard message={customers.state.message} onRetry={customers.reload} />
              : keys.state.status === 'error' ? <ErrorCard message={keys.state.message} onRetry={keys.reload} />
                : <LedgerPanel customers={customers.state.data} keys={keys.state.data} showCustomerPicker />}
        </GlassCard>
      </motion.div>
    </div>
  );
}

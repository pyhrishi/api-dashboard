'use client';

import { useStore, extractTenantState } from '@/lib/store';
import { motion } from 'framer-motion';
import { Building2, Activity, Key, CreditCard, ArrowRight, ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function GlobalCommandCenter() {
  const { tenants, organizations, activeOrganizationId, switchOrganization } = useStore();
  const router = useRouter();

  const handleSwitch = (orgId: string) => {
    if (orgId !== activeOrganizationId) {
      switchOrganization(orgId);
    }
    router.push('/console');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12 pt-4 px-4">
      <div className="mb-8">
        <h1 className="text-4xl md:text-5xl font-display font-black text-fg mb-4 tracking-tight">
          Global Command Center
        </h1>
        <p className="text-fg-muted font-medium text-lg max-w-2xl">
          High-level overview across all your workspaces. Monitor traffic, billing, and anomalies from a single vantage point.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {organizations.map((org, i) => {
          // If the org is the active one, its current data is in the root state.
          // Otherwise, it's stored in the tenants map.
          const isCurrent = org.id === activeOrganizationId;
          const tenantData = isCurrent ? extractTenantState(useStore.getState()) : tenants[org.id];
          
          if (!tenantData) return null;

          const totalVolume = tenantData.dailyMetrics?.reduce((acc: number, cur) => acc + Object.values(cur.endpoints).reduce((s, em) => s + em.volume, 0), 0) || 0;
          const activeAnomalies = tenantData.anomalyAlerts?.filter((a) => a.isActive).length || 0;

          return (
            <motion.div
              key={org.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              onClick={() => handleSwitch(org.id)}
              className="bg-overlay backdrop-blur-md border border-border rounded-3xl p-6 hover:border-teal/50 hover:shadow-[0_0_40px_rgba(70,189,198,0.15)] transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-start justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-teal/10 rounded-xl flex items-center justify-center border border-teal/20 group-hover:scale-110 transition-transform">
                    <Building2 className="w-6 h-6 text-teal" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-fg group-hover:text-teal transition-colors">{org.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="px-2 py-0.5 rounded-full bg-glass text-fg-muted text-[10px] font-bold uppercase tracking-wider">
                        {org.role}
                      </span>
                      {isCurrent && (
                        <span className="px-2 py-0.5 rounded-full bg-teal/20 text-teal text-[10px] font-bold uppercase tracking-wider">
                          Active
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-fg-subtle group-hover:text-teal group-hover:translate-x-1 transition-all" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-glass rounded-xl p-4 border border-border-subtle">
                  <div className="flex items-center gap-2 text-fg-muted mb-2">
                    <CreditCard className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase">Balance</span>
                  </div>
                  <div className="text-xl font-black text-fg">${tenantData.creditBalance?.toLocaleString() || 0}</div>
                </div>
                
                <div className="bg-glass rounded-xl p-4 border border-border-subtle">
                  <div className="flex items-center gap-2 text-fg-muted mb-2">
                    <Activity className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase">Volume</span>
                  </div>
                  <div className="text-xl font-black text-fg">{totalVolume > 0 ? `${(totalVolume / 1000).toFixed(1)}k` : '0'}</div>
                </div>

                <div className="bg-glass rounded-xl p-4 border border-border-subtle">
                  <div className="flex items-center gap-2 text-fg-muted mb-2">
                    <Key className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase">Active Keys</span>
                  </div>
                  <div className="text-xl font-black text-fg">{tenantData.activeKeys?.filter((k) => k.status === 'active').length || 0}</div>
                </div>

                <div className={`rounded-xl p-4 border ${activeAnomalies > 0 ? 'bg-semantic-error/10 border-semantic-error/20' : 'bg-glass border-border-subtle'}`}>
                  <div className={`flex items-center gap-2 mb-2 ${activeAnomalies > 0 ? 'text-semantic-error' : 'text-fg-muted'}`}>
                    <ShieldAlert className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase">Anomalies</span>
                  </div>
                  <div className={`text-xl font-black ${activeAnomalies > 0 ? 'text-semantic-error' : 'text-fg'}`}>{activeAnomalies}</div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

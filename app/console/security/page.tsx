'use client';

import { useStore, MockKey } from '@/lib/store';
import { ShieldAlert, ShieldCheck, AlertTriangle, Key, Activity, Settings2, Trash2, Shield, Lock, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/Toast';

export default function SecurityHubPage() {
  const { activeKeys, apiLogs, environment, updateKey, revokeKey } = useStore();
  const { success } = useToast();

  const activeEnvKeys = activeKeys.filter(k => 
    environment === 'live' ? k.key.startsWith('sk_live_') : k.key.startsWith('sk_test_')
  );

  // 1. Calculate Over-Permissioned Keys
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentLogs = apiLogs.filter(log => log.environment === environment && new Date(log.timestamp) > thirtyDaysAgo);

  const overPermissionedKeys = activeEnvKeys.filter(key => {
    if (!key.scopes.includes('*') && !key.scopes.includes('all')) return false;
    
    // We should ideally filter logs by key, but for this mock we just check overall recent logs
    if (recentLogs.length === 0) return false;
    
    const hitEndpoints = Array.from(new Set(recentLogs.map(log => log.path)));
    return hitEndpoints.every(path => path.includes('/search') || path.includes('/autocomplete'));
  });

  // 2. Identify Compromised Keys
  const compromisedKeys = activeEnvKeys.filter(key => key.status === 'compromised');

  // 3. Identify Gateway Rejections
  const gatewayRejections = recentLogs.filter(log => log.status === 403).slice(0, 10);

  // 4. Calculate Security Score (0-100)
  let score = 100;
  if (compromisedKeys.length > 0) score -= 50;
  score -= (overPermissionedKeys.length * 10);
  score -= (gatewayRejections.length * 2);
  if (score < 0) score = 0;

  const handleRevokeCompromised = (id: string) => {
    revokeKey(id);
    success('Compromised key revoked permanently', 'Key Revoked');
  };

  const handleAutoRestrict = (key: MockKey) => {
    updateKey(key.id, { scopes: ['api.search.read'] });
    success('Key restricted to Principle of Least Privilege', 'Security Optimized');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-12 font-sans">
      
      {/* Header & Score */}
      <div className="flex flex-col md:flex-row gap-8 items-start justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-fg tracking-tight flex items-center gap-3">
            <ShieldAlert className="w-8 h-8 text-[#00F0FF]" />
            Security Hub
          </h1>
          <p className="text-fg-muted mt-2 max-w-xl text-sm leading-relaxed">
            Centralized visibility into your API security posture. Monitor leaked keys, optimize over-permissioned tokens, and review automated gateway interventions.
          </p>
        </div>

        {/* Dynamic Score Widget */}
        <div className={cn(
          "px-8 py-6 rounded-2xl border flex items-center gap-6 shadow-2xl relative overflow-hidden",
          score >= 90 ? "bg-semantic-success/10 border-semantic-success/20" :
          score >= 60 ? "bg-[#F5A623]/10 border-[#F5A623]/20" :
          "bg-semantic-error/10 border-semantic-error/20"
        )}>
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/5 pointer-events-none" />
          <div className="relative z-10">
            <div className="text-sm font-black uppercase tracking-widest text-fg-muted mb-1">Posture Score</div>
            <div className={cn(
              "text-5xl font-display font-extrabold tracking-tighter",
              score >= 90 ? "text-semantic-success" :
              score >= 60 ? "text-[#F5A623]" :
              "text-semantic-error"
            )}>
              {score}
            </div>
          </div>
          <div className="relative z-10">
            {score >= 90 ? <ShieldCheck className="w-12 h-12 text-semantic-success/50" /> :
             score >= 60 ? <AlertTriangle className="w-12 h-12 text-[#F5A623]/50" /> :
             <ShieldAlert className="w-12 h-12 text-semantic-error/50" />}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Threats & Warnings (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Active Threats (Compromised Keys) */}
          <div className="glass-inner rounded-2xl border border-border shadow-xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-border flex items-center justify-between bg-surface/50">
              <h2 className="text-lg font-bold text-fg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-semantic-error" />
                Active Threats
              </h2>
              {compromisedKeys.length > 0 && (
                <span className="bg-semantic-error text-fg text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full animate-pulse">
                  {compromisedKeys.length} Critical
                </span>
              )}
            </div>
            
            <div className="flex-1 p-6">
              {compromisedKeys.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-8">
                  <ShieldCheck className="w-12 h-12 text-semantic-success/20 mb-3" />
                  <div className="text-fg font-bold">No Active Threats</div>
                  <div className="text-fg-muted text-xs mt-1">No leaked keys detected on public repositories.</div>
                </div>
              ) : (
                <div className="space-y-4">
                  {compromisedKeys.map(key => (
                    <div key={key.id} className="bg-semantic-error/10 border border-semantic-error/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-semantic-error">{key.name}</span>
                          <span className="text-[10px] font-mono text-semantic-error/60 bg-semantic-error/10 px-1.5 py-0.5 rounded">
                            {key.key.substring(0, 12)}...
                          </span>
                        </div>
                        <div className="text-xs text-semantic-error/80 mt-1 flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5" /> Automatically disabled by Zinbit Security
                        </div>
                      </div>
                      <button 
                        onClick={() => handleRevokeCompromised(key.id)}
                        className="px-4 py-2 bg-semantic-error text-fg text-xs font-bold rounded-lg shadow-[0_0_15px_rgba(255,71,87,0.3)] hover:bg-red-600 transition-colors flex flex-shrink-0 items-center justify-center gap-2"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Revoke Permanently
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Configuration Optimization (Over-permissioned) */}
          <div className="glass-inner rounded-2xl border border-border shadow-xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-border flex items-center justify-between bg-surface/50">
              <h2 className="text-lg font-bold text-fg flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-[#F5A623]" />
                Configuration Optimization
              </h2>
              {overPermissionedKeys.length > 0 && (
                <span className="bg-[#F5A623]/20 text-[#F5A623] border border-[#F5A623]/20 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full">
                  {overPermissionedKeys.length} Warnings
                </span>
              )}
            </div>
            
            <div className="flex-1 p-6">
              {overPermissionedKeys.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-8">
                  <Key className="w-12 h-12 text-white/10 mb-3" />
                  <div className="text-fg font-bold">Optimal Configuration</div>
                  <div className="text-fg-muted text-xs mt-1">All active keys adhere to the Principle of Least Privilege.</div>
                </div>
              ) : (
                <div className="space-y-4">
                  {overPermissionedKeys.map(key => (
                    <div key={key.id} className="bg-[#F5A623]/5 border border-[#F5A623]/20 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-fg">{key.name}</span>
                          <span className="text-[10px] bg-glass border border-border px-1.5 py-0.5 rounded text-fg-muted">Full Access</span>
                        </div>
                        <div className="text-xs text-[#F5A623]/80 mt-1 flex items-start gap-1.5 max-w-sm">
                          <Activity className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                          <span>Key has Full Access but logs show it only queries <strong className="text-[#F5A623]">Search</strong> endpoints.</span>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleAutoRestrict(key)}
                        className="px-4 py-2 bg-[#F5A623]/20 text-[#F5A623] hover:bg-[#F5A623]/30 border border-[#F5A623]/30 text-xs font-bold rounded-lg transition-colors flex flex-shrink-0 items-center justify-center gap-2"
                      >
                        <Shield className="w-3.5 h-3.5" /> Auto-Restrict
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Right Column: Gateway Log (1/3 width) */}
        <div className="glass-inner rounded-2xl border border-border shadow-xl overflow-hidden flex flex-col h-[600px] lg:h-auto">
          <div className="p-6 border-b border-border flex items-center justify-between bg-surface/50 shrink-0">
            <h2 className="text-lg font-bold text-fg flex items-center gap-2">
              <Lock className="w-5 h-5 text-teal" />
              Gateway Blocks
            </h2>
          </div>
          
          <div className="flex-1 p-4 overflow-y-auto space-y-3 relative">
            {gatewayRejections.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
                <ShieldCheck className="w-10 h-10 text-teal/20 mb-3" />
                <div className="text-fg-muted font-bold text-sm">No recent blocks</div>
                <div className="text-fg-muted text-xs mt-1">The API gateway hasn&apos;t blocked any requests recently.</div>
              </div>
            ) : (
              gatewayRejections.map((log, i) => {
                const isIpReject = (log.response as { error_code?: string } | null | undefined)?.error_code === 'IP_REJECTED';
                return (
                  <motion.div 
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    key={log.id} 
                    className="bg-surface/50 border border-semantic-error/20 rounded-xl p-3 shadow-inner relative overflow-hidden"
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-semantic-error/50" />
                    <div className="flex justify-between items-start mb-2 pl-2">
                      <div className="text-[10px] font-mono text-semantic-error font-bold tracking-wider">
                        403 {isIpReject ? 'IP_REJECTED' : 'INSUFFICIENT_SCOPES'}
                      </div>
                      <div className="text-[10px] text-fg-subtle font-mono">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                    <div className="pl-2">
                      <div className="text-xs font-mono text-fg truncate mb-1">
                        <span className="text-teal font-bold">{log.method}</span> {log.path}
                      </div>
                      <div className="text-[10px] text-fg-muted font-mono">
                        IP: <span className={isIpReject ? "text-semantic-error" : "text-fg-muted"}>{log.ip}</span>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

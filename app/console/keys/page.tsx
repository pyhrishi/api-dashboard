'use client';

import React, { useState, useEffect } from 'react';
import { useStore, MockKey } from '@/lib/store';
import { motion, AnimatePresence } from 'framer-motion';
import { Key, Plus, Copy, Trash2, Check, ShieldAlert, Loader2, RotateCw, Activity, CalendarClock, Globe, ArrowRight, BarChart2, Siren } from 'lucide-react';
import { cn } from '@/lib/utils';
import RoleGuard from '@/components/RoleGuard';
import Link from 'next/link';
import { Portal } from '@/components/Portal';
import { track } from '@/lib/telemetry';

const AVAILABLE_SCOPES = [
  { id: 'identity:read', label: 'Identity', desc: 'Email-to-Phone, Phone-to-Email, DIN-to-Phone, Contact-to-LN' },
  { id: 'corporate:read', label: 'Corporate', desc: 'Domain-to-CIN, CIN-to-Company Data, Domain-to-LN, LN-to-Profile' },
  { id: 'search:execute', label: 'Search', desc: 'People Search, People AI Search, Reverse Enrichment' },
];

function KeyCountdown({ expiresAt }: { expiresAt: string }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('Expired');
        return;
      }
      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft(`${h}h ${m}m ${s}s`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return (
    <div className="text-[10px] text-semantic-warning font-mono mt-1 flex items-center gap-1">
      <CalendarClock className="w-3 h-3" /> {timeLeft || 'Calculating...'}
    </div>
  );
}

/** Display-only masking. The stored key is a real, header-safe ASCII token; never render it whole. */
function maskKey(key: string): string {
  if (!key) return '';
  const dash = key.lastIndexOf('_');
  const prefix = dash >= 0 ? key.slice(0, dash + 1) : key.slice(0, 8);
  return `${prefix}••••••••${key.slice(-4)}`;
}

export default function ApiKeysPage() {
  const { environment, activeKeys, addKey, revokeKey, rollKey, generateFirstKey, clearRawToken, simulateKeyLeak, expireKeys, apiLogs, updateKey } = useStore();
  const filteredKeys = activeKeys.filter(k => k.environment === environment);
  
  useEffect(() => {
    const interval = setInterval(() => {
      expireKeys();
    }, 5000);
    return () => clearInterval(interval);
  }, [expireKeys]);
  
  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isRollModalOpen, setIsRollModalOpen] = useState(false);
  const [revokeConfirmId, setRevokeConfirmId] = useState<string | null>(null);
  const [revokeInput, setRevokeInput] = useState('');
  
  // Create Key Form State
  const [newKeyName, setNewKeyName] = useState('');
  const [isRestricted, setIsRestricted] = useState(false);
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['identity:read', 'corporate:read']);
  const [expiration, setExpiration] = useState<string>('never');
  const [creditLimit, setCreditLimit] = useState<string>('');
  const [allowedIps, setAllowedIps] = useState<string[]>([]);
  const [ipInput, setIpInput] = useState('');
  
  // Insights State
  const [expandedInsightsId, setExpandedInsightsId] = useState<string | null>(null);
  
  // Roll Key State
  const [keyToRoll, setKeyToRoll] = useState<MockKey | null>(null);

  // Success State
  const [generatedKey, setGeneratedKey] = useState<MockKey | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hasSavedKey, setHasSavedKey] = useState(false);
  
  // Loading states
  const [isCreating, setIsCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const handleIpKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const ip = ipInput.trim();
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
      if (ip && !allowedIps.includes(ip) && ipRegex.test(ip)) {
        setAllowedIps([...allowedIps, ip]);
        setIpInput('');
      }
    }
  };

  const removeIp = (ip: string) => {
    setAllowedIps(allowedIps.filter(i => i !== ip));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim() || (isRestricted && selectedScopes.length === 0)) return;
    
    setIsCreating(true);
    await new Promise(r => setTimeout(r, 800));
    
    const prefix = environment === 'live' ? 'sk_live_' : 'sk_test_';
    const raw = `${prefix}${Math.random().toString(36).substring(2, 16)}${Math.random().toString(36).substring(2, 8)}`;
    
    let expiresAt = null;
    if (expiration !== 'never') {
      const date = new Date();
      if (expiration === '1h') {
        date.setHours(date.getHours() + 1);
      } else if (expiration === '24h') {
        date.setHours(date.getHours() + 24);
      } else {
        const days = parseInt(expiration);
        date.setDate(date.getDate() + days);
      }
      expiresAt = date.toISOString();
    }

    const finalScopes = isRestricted ? selectedScopes : ['*'];

    const newKey: MockKey = {
      id: `key_${Date.now()}`,
      name: newKeyName || 'Untitled Key',
      key: raw, // real token; masked at display via maskKey()
      rawToken: raw, // Temporary plain text token, will be cleared by UI on close
      createdAt: new Date().toISOString(),
      scopes: finalScopes,
      status: 'active',
      allowedIps: allowedIps.length > 0 ? allowedIps : undefined,
      expiresAt,
      lastUsed: null,
      environment: environment,
      creditLimit: creditLimit ? parseInt(creditLimit) : undefined,
      creditsUsed: 0
    };
    
    addKey(newKey);
    track('api_key_created', { environment, scopes: newKey.scopes.length, hasIpAllowlist: (newKey.allowedIps?.length ?? 0) > 0, hasExpiry: Boolean(newKey.expiresAt) });
    setIsCreating(false);
    setGeneratedKey(newKey);
    setHasSavedKey(false);
    
    // Reset form
    setNewKeyName('');
    setIsRestricted(false);
    setSelectedScopes(['identity:read', 'corporate:read']);
    setExpiration('never');
    setCreditLimit('');
    setAllowedIps([]);
    setIpInput('');
  };

  const handleRollKey = async () => {
    if (!keyToRoll) return;
    setIsCreating(true);
    await new Promise(r => setTimeout(r, 800));

    const prefix = environment === 'live' ? 'sk_live_' : 'sk_test_';
    const raw = `${prefix}${Math.random().toString(36).substring(2, 16)}${Math.random().toString(36).substring(2, 8)}`;
    
    const replacementKey: MockKey = {
      id: `key_${Date.now()}`,
      name: keyToRoll.name, // Inherit name
      key: raw, // real token; masked at display via maskKey()
      rawToken: raw,
      createdAt: new Date().toISOString(),
      scopes: keyToRoll.scopes, // Inherit scopes
      status: 'active',
      allowedIps: keyToRoll.allowedIps,
      expiresAt: keyToRoll.expiresAt,
      lastUsed: null,
      environment: environment,
      creditLimit: keyToRoll.creditLimit,
      creditsUsed: 0
    };

    rollKey(keyToRoll.id, replacementKey);
    setIsCreating(false);
    setIsRollModalOpen(false);
    setKeyToRoll(null);
    setGeneratedKey(replacementKey); // Show the success screen for the new key
    setHasSavedKey(false);
    // Important: we also need to open the Create Modal to show the generatedKey success screen
    setIsCreateModalOpen(true);
  };

  const handleGenerateFirstKey = () => {
    const key = generateFirstKey();
    track('api_key_created', { environment, source: 'first-key-cta' });
    setGeneratedKey(key);
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    if (generatedKey && !hasSavedKey) return;
    if (generatedKey) {
      clearRawToken(generatedKey.id);
    }
    setIsCreateModalOpen(false);
    setGeneratedKey(null);
    setHasSavedKey(false);
  };

  const handleRevoke = async () => {
    if (!revokeConfirmId) return;
    const key = activeKeys.find(k => k.id === revokeConfirmId);
    if (revokeInput !== key?.name) return;

    setRevokingId(revokeConfirmId);
    await new Promise(r => setTimeout(r, 600));
    revokeKey(revokeConfirmId);
    setRevokingId(null);
    setRevokeConfirmId(null);
    setRevokeInput('');
  };

  const copyToClipboard = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const timeAgo = (dateStr: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const isOverPermissioned = (key: MockKey) => {
    if (!key.scopes.includes('*')) return false;
    const keyLogs = apiLogs.filter(l => l.request?.headers?.Authorization?.includes(key.key));
    if (keyLogs.length === 0) return false;
    
    const usedPaths = new Set(keyLogs.map(l => l.path));
    if (usedPaths.size > 0 && Array.from(usedPaths).every(p => p.includes('/people/search'))) {
      return true;
    }
    return false;
  };

  const handleAutoRestrict = (key: MockKey) => {
    updateKey(key.id, { scopes: ['search:execute'] });
  };

  return (
    <div className="max-w-[1200px] mx-auto">
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8"
      >
        <div>
          <h1 className="text-2xl font-display font-bold text-fg">API Keys</h1>
          <p className="text-fg-muted mt-1">Manage your {environment === 'sandbox' ? 'test' : 'production'} API keys. Keep them secure.</p>
        </div>
        <RoleGuard allowedRoles={['admin']}>
          <button 
            onClick={() => {
              setGeneratedKey(null);
              setIsCreateModalOpen(true);
            }}
            className={cn(
              "flex items-center gap-2 text-fg px-5 py-2.5 rounded-lg font-bold transition-all",
              environment === 'sandbox' ? "bg-orange-500 hover:bg-orange-600 shadow-[0_0_15px_rgba(249,115,22,0.3)] text-fg" : "bg-surface hover:bg-neutral-200 shadow-[0_0_15px_rgba(255,255,255,0.1)] text-fg hover:text-ink"
            )}
          >
            <Plus className="w-4 h-4" />
            Create Secret Key
          </button>
        </RoleGuard>
      </motion.div>

      {environment === 'live' && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mb-8 p-4 rounded-xl border border-semantic-warning/20 bg-semantic-warning/5 flex items-start gap-4"
        >
          <ShieldAlert className="w-5 h-5 text-semantic-warning flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-semantic-warning">Protect your live keys</h4>
            <p className="text-sm text-semantic-warning/80 mt-1">
              These keys grant full access to your production data and will incur actual credit deductions. Do not share them in public repositories or client-side code.
            </p>
          </div>
        </motion.div>
      )}

      <div className="glass-inner rounded-2xl overflow-hidden hover:border-border-strong transition-all shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface/5 text-fg-muted font-mono text-xs uppercase tracking-wider">
                <th className="px-6 py-4 font-semibold">Name & Key</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Scopes</th>
                <th className="px-6 py-4 font-semibold">Last Used</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {filteredKeys.length === 0 ? (
                  <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <td colSpan={5} className="px-6 py-16 text-center text-fg-muted">
                      <div className="flex flex-col items-center justify-center space-y-4">
                        <div className="w-16 h-16 rounded-full bg-glass flex items-center justify-center border border-border">
                          <Key className="w-8 h-8 text-fg-subtle" />
                        </div>
                        <div>
                          <h4 className="text-fg font-bold text-lg">No {environment} keys found</h4>
                          <p className="text-fg-muted text-sm mt-1 max-w-sm mx-auto">Generate your first key to instantly authenticate requests against the zinbit API.</p>
                        </div>
                        <button 
                          onClick={handleGenerateFirstKey}
                          className={cn(
                            "mt-4 font-bold px-8 py-3.5 rounded-xl transition-all shadow-lg text-sm flex items-center gap-2",
                            environment === 'sandbox' ? "bg-orange-500 text-fg hover:bg-orange-600 shadow-[0_0_20px_rgba(249,115,22,0.3)]" : "bg-teal text-ink hover:bg-teal-ice shadow-[0_0_20px_rgba(70,189,198,0.3)]"
                          )}
                        >
                          <Plus className="w-4 h-4" /> Generate First {environment === 'sandbox' ? 'Test' : 'Live'} Key
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ) : (
                  filteredKeys.map((k, idx) => (
                    <React.Fragment key={k.id}>
                    <motion.tr 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ delay: idx * 0.05 }}
                      className="border-b border-border last:border-0 hover:bg-surface/5 transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", ['revoked', 'compromised', 'expired'].includes(k.status || 'active') ? 'bg-surface/5 text-fg-muted' : (environment === 'sandbox' ? 'bg-orange-500/10 text-orange-500' : 'bg-teal/10 text-teal'))}>
                            <Key className="w-4 h-4" />
                          </span>
                          <div>
                            <div className={cn("font-bold flex items-center gap-2", ['revoked', 'compromised', 'expired'].includes(k.status || 'active') ? 'text-fg-muted' : 'text-fg')}>
                              {k.name}
                              {k.expiresAt && new Date(k.expiresAt).getTime() - Date.now() < 86400000 && !['revoked', 'compromised', 'expired'].includes(k.status || 'active') && (
                                <span className="ml-1 text-[10px] bg-purple-500/20 text-purple-400 border border-purple-500/30 px-1.5 py-0.5 rounded font-mono font-bold uppercase tracking-wider">Ephemeral</span>
                              )}
                            </div>
                            <div className={cn("font-mono text-xs mt-1 bg-surface/5 px-2 py-0.5 rounded-md inline-block border border-border tracking-wider", ['revoked', 'compromised', 'expired'].includes(k.status || 'active') ? 'text-fg-subtle' : 'text-fg-muted')}>
                              {maskKey(k.key)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {(k.status || 'active') === 'active' && <><div className="w-2 h-2 rounded-full bg-semantic-success animate-pulse" /><span className="text-semantic-success text-xs font-bold uppercase">Active</span></>}
                          {(k.status || 'active') === 'expiring_soon' && <><div className="w-2 h-2 rounded-full bg-semantic-warning" /><span className="text-semantic-warning text-xs font-bold uppercase">Rolling (24h)</span></>}
                          {(k.status || 'active') === 'revoked' && <><div className="w-2 h-2 rounded-full bg-white/40" /><span className="text-fg-muted text-xs font-bold uppercase">Revoked</span></>}
                          {(k.status || 'active') === 'compromised' && <><div className="w-2 h-2 rounded-full bg-semantic-error animate-pulse" /><span className="text-semantic-error text-xs font-bold uppercase">Compromised</span></>}
                          {(k.status || 'active') === 'expired' && <><div className="w-2 h-2 rounded-full bg-white/40" /><span className="text-fg-muted text-xs font-bold uppercase">Expired</span></>}
                        </div>
                        {k.expiresAt && !['revoked', 'compromised', 'expired'].includes(k.status || 'active') && (
                          (k.status === 'expiring_soon' || new Date(k.expiresAt).getTime() - Date.now() < 86400000 * 2) ? (
                            <KeyCountdown expiresAt={k.expiresAt} />
                          ) : (
                            <div className="text-[10px] text-fg-muted mt-1 flex items-center gap-1">
                              <CalendarClock className="w-3 h-3" /> Expires {new Date(k.expiresAt).toLocaleDateString()}
                            </div>
                          )
                        )}
                        {k.creditLimit && (
                          <div className="mt-2 w-32">
                            <div className="flex items-center justify-between text-[10px] mb-1 font-mono">
                              <span className={((k.creditsUsed || 0) >= k.creditLimit) ? "text-semantic-error font-bold" : "text-fg-muted"}>
                                {(k.creditsUsed || 0).toLocaleString()}
                              </span>
                              <span className="text-fg-muted">{k.creditLimit.toLocaleString()} limit</span>
                            </div>
                            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                              <div className={cn("h-full transition-all rounded-full", ((k.creditsUsed || 0) >= k.creditLimit) ? 'bg-semantic-error' : ((k.creditsUsed || 0) / k.creditLimit) > 0.9 ? 'bg-semantic-warning' : 'bg-teal')} style={{ width: `${Math.min(100, ((k.creditsUsed || 0) / k.creditLimit) * 100)}%` }} />
                            </div>
                            {((k.creditsUsed || 0) >= k.creditLimit) && (
                              <div className="text-[10px] text-semantic-error font-bold mt-1 uppercase tracking-wider bg-semantic-error/10 border border-semantic-error/20 inline-block px-1.5 py-0.5 rounded">Quota Exceeded</div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1.5 max-w-[200px]">
                          {k.scopes.includes('*') ? (
                            <span className={cn("text-[10px] px-2 py-0.5 rounded border font-mono font-bold", ['revoked', 'compromised', 'expired'].includes(k.status || 'active') ? "bg-surface/5 border-border text-fg-subtle" : "bg-teal/10 border-teal/20 text-teal")}>
                              Full Access
                            </span>
                          ) : (
                            (k.scopes || []).map(scope => (
                              <span key={scope} className={cn("text-[10px] px-2 py-0.5 rounded border font-mono", ['revoked', 'compromised', 'expired'].includes(k.status || 'active') ? "bg-surface/5 border-border text-fg-subtle" : "bg-glass border-border text-fg-muted")}>
                                {scope}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {k.lastUsed ? (
                          <div className={cn("flex items-center gap-1.5 text-xs", ['revoked', 'compromised', 'expired'].includes(k.status || 'active') ? 'text-fg-subtle' : 'text-fg-muted')}>
                            <Activity className="w-3.5 h-3.5" />
                            {timeAgo(k.lastUsed)}
                          </div>
                        ) : (
                          <span className="text-xs text-fg-subtle italic">Never used</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => setExpandedInsightsId(expandedInsightsId === k.id ? null : k.id)}
                              className="text-fg-muted hover:text-fg p-2 hover:bg-surface/10 rounded-lg transition-all text-xs font-bold flex items-center gap-1.5"
                              title="Key Insights"
                            >
                              <BarChart2 className="w-3.5 h-3.5" />
                            </button>
                            {!['revoked', 'compromised', 'expired'].includes(k.status || 'active') && (
                              <>
                                <RoleGuard allowedRoles={['admin']}>
                                  <button 
                                    onClick={() => simulateKeyLeak(k.id)}
                                    className="text-fg-muted hover:text-semantic-error p-2 hover:bg-semantic-error/10 rounded-lg transition-all text-xs font-bold flex items-center gap-1.5"
                                    title="Simulate Key Leak"
                                  >
                                    <Siren className="w-3.5 h-3.5" />
                                  </button>
                                </RoleGuard>
                                <button 
                                  onClick={() => { setKeyToRoll(k); setIsRollModalOpen(true); }}
                                  className="text-fg-muted hover:text-fg p-2 hover:bg-surface/10 rounded-lg transition-all text-xs font-bold flex items-center gap-1.5"
                                  title="Roll Key (Zero Downtime Rotation)"
                                >
                                  <RotateCw className="w-3.5 h-3.5" />
                                </button>
                                <div className="w-px h-4 bg-surface/10 mx-1" />
                                <RoleGuard allowedRoles={['admin']}>
                                  <button 
                                    onClick={() => { setRevokeConfirmId(k.id); setRevokeInput(''); }}
                                    className="text-semantic-error/60 hover:text-semantic-error p-2 hover:bg-semantic-error/10 rounded-lg transition-all text-xs font-bold flex items-center gap-1.5"
                                    title="Revoke Key"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </RoleGuard>
                              </>
                            )}
                          </div>
                      </td>
                    </motion.tr>
                    {isOverPermissioned(k) && !['revoked', 'compromised', 'expired'].includes(k.status || 'active') && (
                      <motion.tr 
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="bg-semantic-warning/5 border-b border-border"
                      >
                        <td colSpan={5} className="px-6 py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <ShieldAlert className="w-4 h-4 text-semantic-warning" />
                              <span className="text-sm text-semantic-warning font-medium">Over-permissioned Key: This key has Full Access but only uses Search endpoints.</span>
                            </div>
                            <button 
                              onClick={() => handleAutoRestrict(k)}
                              className="text-xs font-bold bg-semantic-warning text-ink px-3 py-1.5 rounded hover:bg-semantic-warning/90 transition-colors"
                            >
                              Auto-Restrict to Search
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    )}
                    <AnimatePresence>
                      {expandedInsightsId === k.id && (
                        <motion.tr
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="bg-surface/20"
                        >
                          <td colSpan={5} className="p-0 border-b border-border-subtle">
                            <div className="px-8 py-6 flex flex-col md:flex-row gap-8 items-start">
                              <div className="flex-1">
                                <h4 className="text-xs font-bold text-fg-muted uppercase tracking-widest mb-4 flex items-center gap-2">
                                  <BarChart2 className="w-4 h-4" /> 24h Traffic Volatility
                                </h4>
                                <div className="h-16 flex items-end gap-1">
                                  {Array.from({ length: 24 }).map((_, i) => (
                                    <motion.div 
                                      key={i}
                                      initial={{ height: 0 }}
                                      animate={{ height: `${20 + Math.random() * 80}%` }}
                                      transition={{ duration: 0.5, delay: i * 0.02 }}
                                      className={cn("w-full rounded-t-sm", environment === 'sandbox' ? "bg-orange-500/40" : "bg-teal/40")}
                                    />
                                  ))}
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-8 w-full md:w-auto md:min-w-[300px]">
                                <div>
                                  <div className="text-xs font-bold text-fg-muted uppercase tracking-widest mb-1">Success Rate</div>
                                  <div className="text-2xl font-display font-bold text-fg flex items-baseline gap-1">
                                    99.9<span className="text-sm text-fg-muted">%</span>
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs font-bold text-fg-muted uppercase tracking-widest mb-1">P95 Latency</div>
                                  <div className="text-2xl font-display font-bold text-fg flex items-baseline gap-1">
                                    142<span className="text-sm text-fg-muted">ms</span>
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs font-bold text-fg-muted uppercase tracking-widest mb-1">Credits Used</div>
                                  <div className="text-xl font-mono font-bold text-fg">
                                    {(k.creditsUsed || 0).toLocaleString()}
                                  </div>
                                </div>
                                {k.creditLimit && (
                                  <div>
                                    <div className="text-xs font-bold text-fg-muted uppercase tracking-widest mb-1">Quota limit</div>
                                    <div className="text-xl font-mono font-bold text-fg">
                                      {k.creditLimit.toLocaleString()}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </motion.tr>
                      )}
                    </AnimatePresence>
                    </React.Fragment>
                  ))
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>

      {/* Advanced Create Modal */}
      <Portal>
        <AnimatePresence>
          {isCreateModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-surface/80 backdrop-blur-sm"
                onClick={() => !isCreating && closeCreateModal()}
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-2xl glass bg-surface rounded-2xl shadow-2xl overflow-hidden border-border"
              >
                {generatedKey ? (
                  <div className="p-8">
                    <div className="text-center mb-6">
                      <div className={cn("w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 border", environment === 'sandbox' ? "bg-orange-500/10 border-orange-500/20" : "bg-teal/10 border-teal/20")}>
                        <Key className={cn("w-6 h-6", environment === 'sandbox' ? "text-orange-500" : "text-teal")} />
                      </div>
                      <h3 className="font-display font-bold text-fg text-2xl">Key Generated Successfully</h3>
                    </div>

                    <div className="mb-6 p-4 rounded-xl border border-semantic-warning/20 bg-semantic-warning/5">
                      <div className="flex items-start gap-3">
                        <ShieldAlert className="w-5 h-5 text-semantic-warning flex-shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-bold text-semantic-warning text-sm">Save your secret key</h4>
                          <p className="text-xs text-semantic-warning/80 mt-1 leading-relaxed">
                            Please copy this secret key and store it securely. For your protection, you will not be able to view it again.
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mb-8">
                      <label className="block text-xs font-bold text-fg-muted uppercase tracking-widest mb-2">Secret Key</label>
                      <div className="relative">
                        <pre className="w-full bg-surface border border-border rounded-xl p-4 font-mono text-sm text-fg overflow-x-auto shadow-inner">
                          {generatedKey.rawToken || generatedKey.key}
                        </pre>
                        <button
                          onClick={() => copyToClipboard('generated_key', generatedKey.rawToken || generatedKey.key)}
                          className={cn("absolute right-2 top-2 p-2 rounded-lg transition-colors shadow-[0_0_15px_rgba(255,255,255,0.02)] border backdrop-blur-sm", environment === 'sandbox' ? "bg-surface/5 hover:bg-surface/10 text-fg hover:text-orange-500 border-border" : "bg-surface/5 hover:bg-surface/10 text-fg hover:text-teal border-border")}
                          title="Copy to clipboard"
                        >
                          {copiedId === 'generated_key' ? <Check className={cn("w-4 h-4", environment === 'sandbox' ? "text-orange-500" : "text-teal")} /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="mb-6">
                      <label className="flex items-center gap-3 cursor-pointer p-4 rounded-xl border border-border bg-surface/5 hover:bg-surface/10 transition-colors">
                        <input 
                          type="checkbox"
                          checked={hasSavedKey}
                          onChange={(e) => setHasSavedKey(e.target.checked)}
                          className={cn("w-5 h-5 rounded bg-overlay border-border-strong focus:ring-offset-ink", environment === 'sandbox' ? "text-orange-500 focus:ring-orange-500" : "text-teal focus:ring-teal")}
                        />
                        <span className="text-sm font-bold text-fg">I have securely copied this secret key. I understand it will never be shown again.</span>
                      </label>
                    </div>

                    <div className="flex items-center gap-4">
                      <button 
                        onClick={closeCreateModal}
                        disabled={!hasSavedKey}
                        className="flex-1 py-3.5 rounded-xl bg-glass text-fg font-bold hover:bg-glass-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-border"
                      >
                        Done
                      </button>
                      <Link
                        href={hasSavedKey ? "/console/explorer" : "#"}
                        onClick={(e) => {
                          if (!hasSavedKey) e.preventDefault();
                        }}
                        className={cn(
                          "flex-1 py-3.5 flex items-center justify-center gap-2 rounded-xl font-bold transition-colors",
                          environment === 'sandbox' 
                            ? "bg-orange-500 text-fg hover:bg-orange-600 shadow-[0_0_20px_rgba(249,115,22,0.3)] hover:shadow-[0_0_30px_rgba(249,115,22,0.5)]" 
                            : "bg-teal text-ink hover:bg-teal-ice shadow-[0_0_20px_rgba(70,189,198,0.3)] hover:shadow-[0_0_30px_rgba(70,189,198,0.5)]",
                          !hasSavedKey && 'opacity-50 cursor-not-allowed shadow-none hover:shadow-none'
                        )}
                      >
                        Make First Call <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="px-6 py-5 border-b border-border flex items-center justify-between bg-surface/5">
                      <h3 className="font-bold text-fg text-lg">Create New Key</h3>
                    </div>
                    <form onSubmit={handleCreate} className="p-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
                        
                        {/* Left Column: Basic Info */}
                        <div className="space-y-6">
                          <div>
                            <label className="block text-sm font-bold text-fg mb-2">Key Name</label>
                            <input 
                              type="text"
                              required
                              autoFocus
                              disabled={isCreating}
                              placeholder="e.g. Prod Internal Microservice"
                              className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition-shadow text-fg font-medium bg-surface/5 disabled:opacity-50"
                              value={newKeyName}
                              onChange={(e) => setNewKeyName(e.target.value)}
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-bold text-fg mb-2">Expiration</label>
                            <select
                              disabled={isCreating}
                              value={expiration}
                              onChange={(e) => setExpiration(e.target.value)}
                              className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition-shadow text-fg font-medium bg-[#0f111a] disabled:opacity-50 appearance-none"
                            >
                              <option value="never">Never expire</option>
                              <option value="1h">1 Hour (JIT Access)</option>
                              <option value="24h">24 Hours (JIT Access)</option>
                              <option value="30">30 days</option>
                              <option value="60">60 days</option>
                              <option value="90">90 days</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-bold text-fg mb-2">Credit Limit (Optional)</label>
                            <input 
                              type="number"
                              min="0"
                              disabled={isCreating}
                              placeholder="e.g. 500"
                              className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition-shadow text-fg font-medium bg-surface/5 disabled:opacity-50"
                              value={creditLimit}
                              onChange={(e) => setCreditLimit(e.target.value)}
                            />
                          </div>

                          <div>
                            <label className="flex items-center gap-2 text-sm font-bold text-fg mb-2">
                              <Globe className="w-4 h-4 text-fg-muted" />
                              IP Allowlist (Optional)
                            </label>
                            
                            <div className={cn("w-full px-3 py-2 rounded-xl border border-border transition-shadow bg-surface/5 min-h-[48px] flex flex-wrap gap-2 items-center", isCreating && "opacity-50")}>
                              {allowedIps.map(ip => (
                                <span key={ip} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-teal/10 border border-teal/20 text-teal text-xs font-mono font-bold">
                                  {ip}
                                  <button type="button" onClick={() => removeIp(ip)} className="hover:text-fg transition-colors" disabled={isCreating}><Trash2 className="w-3 h-3" /></button>
                                </span>
                              ))}
                              <input 
                                disabled={isCreating}
                                placeholder={allowedIps.length === 0 ? "e.g. 192.168.1.1, 10.0.0.0/24" : "Add another IP..."}
                                className="flex-1 min-w-[150px] bg-transparent border-none focus:outline-none focus:ring-0 text-fg font-mono text-xs placeholder:text-fg-subtle"
                                value={ipInput}
                                onChange={(e) => setIpInput(e.target.value)}
                                onKeyDown={handleIpKeyDown}
                              />
                            </div>
                            <p className="mt-2 text-[10px] text-fg-muted uppercase tracking-widest font-semibold">Press enter or comma to add IP/CIDR</p>
                          </div>
                        </div>

                        {/* Right Column: Scopes */}
                        <div>
                          <div className="mb-6 border-b border-border pb-6">
                            <label className="block text-sm font-bold text-fg mb-3">Quick Templates</label>
                            <div className="grid grid-cols-2 gap-2">
                              <button 
                                type="button" 
                                onClick={() => { setIsRestricted(true); setSelectedScopes(['identity:read', 'corporate:read']); }}
                                className="px-3 py-2 text-xs font-bold bg-surface/5 border border-border rounded-lg hover:border-white/30 text-fg-muted text-left transition-colors"
                              >
                                🔌 CRM Integration
                              </button>
                              <button 
                                type="button" 
                                onClick={() => { setIsRestricted(true); setSelectedScopes(['search:execute']); }}
                                className="px-3 py-2 text-xs font-bold bg-surface/5 border border-border rounded-lg hover:border-white/30 text-fg-muted text-left transition-colors"
                              >
                                🔍 Search Widget
                              </button>
                              <button 
                                type="button" 
                                onClick={() => { setIsRestricted(false); }}
                                className="col-span-2 px-3 py-2 text-xs font-bold bg-surface/5 border border-border rounded-lg hover:border-white/30 text-fg-muted text-center transition-colors"
                              >
                                ⚡ Full Admin Automation
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-bold text-fg">Permissions Strategy</label>
                          </div>
                          <div className="flex bg-surface/5 rounded-xl border border-border p-1 mb-4 relative z-0">
                            <div className={cn("absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg transition-transform duration-300 z-0", isRestricted ? "translate-x-[calc(100%+4px)] bg-[#222]" : "translate-x-0 bg-teal")} />
                            <button 
                              type="button"
                              onClick={() => setIsRestricted(false)}
                              className={cn("flex-1 py-2 text-xs font-bold rounded-lg transition-colors z-10", !isRestricted ? "text-ink" : "text-fg-muted hover:text-fg")}
                            >
                              Full Access
                            </button>
                            <button 
                              type="button"
                              onClick={() => setIsRestricted(true)}
                              className={cn("flex-1 py-2 text-xs font-bold rounded-lg transition-colors z-10", isRestricted ? "text-fg" : "text-fg-muted hover:text-fg")}
                            >
                              Restricted
                            </button>
                          </div>

                          <AnimatePresence>
                            {isRestricted && (
                              <motion.div 
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="space-y-2 overflow-hidden"
                              >
                                {AVAILABLE_SCOPES.map(scope => (
                                  <label key={scope.id} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-surface/5 hover:bg-surface/10 cursor-pointer transition-colors group">
                                    <div className="mt-0.5 relative flex items-center justify-center">
                                      <input 
                                        type="checkbox" 
                                        checked={selectedScopes.includes(scope.id)}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            setSelectedScopes([...selectedScopes, scope.id]);
                                          } else {
                                            setSelectedScopes(selectedScopes.filter(s => s !== scope.id));
                                          }
                                        }}
                                        className="peer sr-only"
                                      />
                                      <div className="w-5 h-5 rounded border border-border-strong bg-surface peer-checked:bg-[#5D5FEF] peer-checked:border-[#5D5FEF] transition-colors" />
                                      <Check className="w-3.5 h-3.5 text-fg absolute inset-0 m-auto opacity-0 peer-checked:opacity-100 scale-50 peer-checked:scale-100 transition-all" />
                                    </div>
                                    <div>
                                      <div className="text-sm font-bold text-fg group-hover:text-teal transition-colors">{scope.label}</div>
                                      <div className="text-xs text-fg-muted mt-0.5">{scope.desc}</div>
                                    </div>
                                  </label>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                          {isRestricted && selectedScopes.length === 0 && (
                            <p className="text-xs text-semantic-error mt-3 font-semibold">Please select at least one scope.</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                        <button 
                          type="button"
                          onClick={closeCreateModal}
                          disabled={isCreating}
                          className="px-5 py-2.5 rounded-lg text-fg font-bold hover:bg-surface/10 transition-colors disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button 
                          type="submit"
                          disabled={isCreating || (isRestricted && selectedScopes.length === 0) || !newKeyName.trim()}
                          className={cn(
                            "flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-wait",
                            environment === 'sandbox' ? "bg-orange-500 text-fg hover:bg-orange-600 shadow-lg shadow-orange-500/20" : "bg-teal text-ink hover:bg-teal-ice shadow-lg shadow-teal/20"
                          )}
                        >
                          {isCreating ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" /> Creating...
                            </>
                          ) : (
                            'Generate Key'
                          )}
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </Portal>

      {/* Roll Key Modal */}
      <Portal>
        <AnimatePresence>
          {isRollModalOpen && keyToRoll && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-surface/80 backdrop-blur-sm"
                onClick={() => !isCreating && setIsRollModalOpen(false)}
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-md glass bg-surface rounded-2xl shadow-2xl overflow-hidden border-border"
              >
                <div className="px-6 py-5 border-b border-border flex items-center justify-between bg-surface/5">
                  <h3 className="font-bold text-fg text-lg flex items-center gap-2">
                    <RotateCw className="w-5 h-5 text-semantic-warning" /> 
                    Roll Key: {keyToRoll.name}
                  </h3>
                </div>
                <div className="p-6">
                  <p className="text-sm text-fg-muted leading-relaxed mb-6">
                    Rolling a key allows you to rotate secrets with <strong>zero downtime</strong>. 
                    A new key will be generated immediately with the same permissions, and the old key will continue to work for a <strong>24-hour grace period</strong> before expiring.
                  </p>
                  <div className="bg-surface border border-border rounded-xl p-4 mb-6 shadow-inner">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-fg-muted font-bold uppercase tracking-widest">New Key</span>
                      <span className="text-xs font-bold text-semantic-success">Active immediately</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-fg-muted font-bold uppercase tracking-widest">Old Key</span>
                      <span className="text-xs font-bold text-semantic-warning">Expires in 24h</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-3">
                    <button 
                      type="button"
                      onClick={() => setIsRollModalOpen(false)}
                      disabled={isCreating}
                      className="px-5 py-2.5 rounded-lg text-fg font-bold hover:bg-surface/10 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button 
                      type="button"
                      onClick={handleRollKey}
                      disabled={isCreating}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-semantic-warning text-fg font-bold hover:bg-semantic-warning/80 transition-colors shadow-lg shadow-semantic-warning/20 disabled:opacity-70 disabled:cursor-wait"
                    >
                      {isCreating ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Rolling...</>
                      ) : (
                        'Confirm Rotation'
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </Portal>

      {/* Revoke Confirmation Modal */}
      <Portal>
        <AnimatePresence>
          {revokeConfirmId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-surface/80 backdrop-blur-sm"
                onClick={() => !revokingId && setRevokeConfirmId(null)}
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-md glass bg-surface rounded-2xl shadow-2xl overflow-hidden border border-semantic-error/20"
              >
                <div className="px-6 py-5 border-b border-border flex items-center justify-between bg-semantic-error/10">
                  <h3 className="font-bold text-semantic-error text-lg flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5" /> 
                    Revoke Key
                  </h3>
                </div>
                <div className="p-6">
                  <p className="text-sm text-fg-muted leading-relaxed mb-6">
                    This action is permanent and cannot be undone. Any applications using this key will immediately stop working. 
                    To confirm, type the name of the key (<strong>{activeKeys.find(k => k.id === revokeConfirmId)?.name}</strong>) below.
                  </p>
                  <input
                    type="text"
                    autoFocus
                    placeholder={activeKeys.find(k => k.id === revokeConfirmId)?.name}
                    value={revokeInput}
                    onChange={(e) => setRevokeInput(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-semantic-error/50 focus:outline-none focus:ring-2 focus:ring-semantic-error focus:border-transparent transition-shadow text-fg font-medium bg-surface/5 disabled:opacity-50 mb-6"
                  />
                  <div className="flex items-center justify-end gap-3">
                    <button 
                      type="button"
                      onClick={() => setRevokeConfirmId(null)}
                      disabled={!!revokingId}
                      className="px-5 py-2.5 rounded-lg text-fg font-bold hover:bg-surface/10 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button 
                      type="button"
                      onClick={handleRevoke}
                      disabled={!!revokingId || revokeInput !== activeKeys.find(k => k.id === revokeConfirmId)?.name}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-semantic-error text-fg font-bold hover:bg-semantic-error/80 transition-colors shadow-lg shadow-semantic-error/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {revokingId ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Revoking...</>
                      ) : (
                        'Revoke Key'
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </Portal>
    </div>
  );
}

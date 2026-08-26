'use client';

import { useState } from 'react';
import { useStore, MockKey } from '@/lib/store';
import { motion, AnimatePresence } from 'framer-motion';
import { Key, Plus, Copy, Trash2, Check, ShieldAlert, Loader2, RotateCw, Activity, CalendarClock, Globe, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CodeBlock } from '@/components/CodeBlock';
import RoleGuard from '@/components/RoleGuard';
import Link from 'next/link';

const AVAILABLE_SCOPES = [
  { id: 'people:read', label: 'People Search', desc: 'Read-only access to B2B profiles' },
  { id: 'company:read', label: 'Company Enrichment', desc: 'Read-only access to firmographics' },
  { id: 'webhooks:write', label: 'Webhooks', desc: 'Manage webhook endpoints' },
  { id: 'billing:read', label: 'Billing', desc: 'View credit usage and invoices' },
];

export default function ApiKeysPage() {
  const { environment, activeKeys, addKey, revokeKey, rollKey } = useStore();
  
  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isRollModalOpen, setIsRollModalOpen] = useState(false);
  
  // Create Form State
  const [newKeyName, setNewKeyName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['people:read', 'company:read']);
  const [expiration, setExpiration] = useState<string>('never');
  const [allowedIps, setAllowedIps] = useState('');
  
  // Roll Key State
  const [keyToRoll, setKeyToRoll] = useState<MockKey | null>(null);

  // Success State
  const [generatedKey, setGeneratedKey] = useState<MockKey | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hasSavedKey, setHasSavedKey] = useState(false);
  
  // Loading states
  const [isCreating, setIsCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const filteredKeys = activeKeys.filter(k => 
    environment === 'live' ? k.key.startsWith('sk_live_') : k.key.startsWith('sk_test_')
  );

  const toggleScope = (scopeId: string) => {
    setSelectedScopes(prev => 
      prev.includes(scopeId) ? prev.filter(s => s !== scopeId) : [...prev, scopeId]
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim() || selectedScopes.length === 0) return;
    
    setIsCreating(true);
    await new Promise(r => setTimeout(r, 800));
    
    const prefix = environment === 'live' ? 'sk_live_' : 'sk_test_';
    const randomHash = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    let expiresAt = null;
    if (expiration !== 'never') {
      const days = parseInt(expiration);
      const date = new Date();
      date.setDate(date.getDate() + days);
      expiresAt = date.toISOString();
    }

    const newKey: MockKey = {
      id: `key_${Date.now()}`,
      name: newKeyName.trim(),
      key: `${prefix}${randomHash}`,
      createdAt: new Date().toISOString(),
      scopes: selectedScopes,
      status: 'active',
      allowedIps: allowedIps.trim() ? allowedIps.split(',').map(ip => ip.trim()) : undefined,
      expiresAt,
      lastUsed: null
    };
    
    addKey(newKey);
    setIsCreating(false);
    setGeneratedKey(newKey);
    setHasSavedKey(false);
    
    // Reset form
    setNewKeyName('');
    setSelectedScopes(['people:read', 'company:read']);
    setExpiration('never');
    setAllowedIps('');
  };

  const handleRollKey = async () => {
    if (!keyToRoll) return;
    setIsCreating(true);
    await new Promise(r => setTimeout(r, 800));

    const prefix = environment === 'live' ? 'sk_live_' : 'sk_test_';
    const randomHash = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    const replacementKey: MockKey = {
      id: `key_${Date.now()}`,
      name: keyToRoll.name, // Inherit name
      key: `${prefix}${randomHash}`,
      createdAt: new Date().toISOString(),
      scopes: keyToRoll.scopes, // Inherit scopes
      status: 'active',
      allowedIps: keyToRoll.allowedIps,
      expiresAt: keyToRoll.expiresAt,
      lastUsed: null
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

  const closeCreateModal = () => {
    if (generatedKey && !hasSavedKey) return;
    setIsCreateModalOpen(false);
    setGeneratedKey(null);
    setHasSavedKey(false);
  };

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    await new Promise(r => setTimeout(r, 600));
    revokeKey(id);
    setRevokingId(null);
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

  return (
    <div className="max-w-[1200px] mx-auto">
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8"
      >
        <div>
          <h1 className="text-2xl font-display font-bold text-white">API Keys</h1>
          <p className="text-white/60 mt-1">Manage granular access to your {environment} environment.</p>
        </div>
        <RoleGuard allowedRoles={['admin']}>
          <button 
            onClick={() => {
              setGeneratedKey(null);
              setIsCreateModalOpen(true);
            }}
            className="flex items-center gap-2 bg-[#09090b] text-white px-5 py-2.5 rounded-lg font-bold hover:bg-neutral-200 transition-all shadow-[0_0_15px_rgba(255,255,255,0.1)]"
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

      <div className="glass-inner rounded-2xl overflow-hidden hover:border-white/20 transition-all shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-[#09090b]/5 text-white/50 font-mono text-xs uppercase tracking-wider">
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
                    <td colSpan={5} className="px-6 py-16 text-center text-white/40">
                      <div className="flex flex-col items-center justify-center space-y-4">
                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                          <Key className="w-8 h-8 text-white/20" />
                        </div>
                        <div>
                          <h4 className="text-white font-bold text-lg">No {environment} keys found</h4>
                          <p className="text-white/40 text-sm mt-1 max-w-sm mx-auto">Generate a key to authenticate requests against the zinbit API.</p>
                        </div>
                        <button 
                          onClick={() => setIsCreateModalOpen(true)}
                          className="mt-2 bg-white/5 hover:bg-white/10 text-white font-bold px-6 py-2.5 rounded-full text-sm border border-white/10 transition-colors shadow-sm flex items-center gap-2"
                        >
                          <Plus className="w-4 h-4" /> Create Key
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ) : (
                  filteredKeys.map((k, idx) => (
                    <motion.tr 
                      key={k.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ delay: idx * 0.05 }}
                      className="border-b border-white/10 last:border-0 hover:bg-[#09090b]/5 transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", (k.status || 'active') === 'revoked' ? 'bg-[#09090b]/5 text-white/40' : 'bg-teal/10 text-teal')}>
                            <Key className="w-4 h-4" />
                          </span>
                          <div>
                            <div className={cn("font-bold", (k.status || 'active') === 'revoked' ? 'text-white/40' : 'text-white')}>{k.name}</div>
                            <div className={cn("font-mono text-xs mt-1 bg-[#09090b]/5 px-2 py-0.5 rounded-md inline-block border border-white/10", (k.status || 'active') === 'revoked' ? 'text-white/30' : 'text-white/60')}>
                              {k.key.substring(0, 12)}...{k.key.substring(k.key.length - 4)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {(k.status || 'active') === 'active' && <><div className="w-2 h-2 rounded-full bg-semantic-success animate-pulse" /><span className="text-semantic-success text-xs font-bold uppercase">Active</span></>}
                          {(k.status || 'active') === 'expiring_soon' && <><div className="w-2 h-2 rounded-full bg-semantic-warning" /><span className="text-semantic-warning text-xs font-bold uppercase">Rolling (24h)</span></>}
                          {(k.status || 'active') === 'revoked' && <><div className="w-2 h-2 rounded-full bg-semantic-error" /><span className="text-semantic-error text-xs font-bold uppercase">Revoked</span></>}
                        </div>
                        {k.expiresAt && (k.status || 'active') !== 'revoked' && (
                          <div className="text-[10px] text-white/40 mt-1 flex items-center gap-1">
                            <CalendarClock className="w-3 h-3" /> Expires {new Date(k.expiresAt).toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1.5 max-w-[200px]">
                          {(k.scopes || []).map(scope => (
                            <span key={scope} className={cn("text-[10px] px-2 py-0.5 rounded border font-mono", (k.status || 'active') === 'revoked' ? "bg-[#09090b]/5 border-white/10 text-white/30" : "bg-teal/5 border-teal/20 text-teal")}>
                              {scope.split(':')[0]}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {k.lastUsed ? (
                          <div className={cn("flex items-center gap-1.5 text-xs", (k.status || 'active') === 'revoked' ? 'text-white/30' : 'text-white/70')}>
                            <Activity className="w-3.5 h-3.5" />
                            {timeAgo(k.lastUsed)}
                          </div>
                        ) : (
                          <span className="text-xs text-white/30 italic">Never used</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <RoleGuard allowedRoles={['admin']}>
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {(k.status || 'active') !== 'revoked' && (
                              <>
                                <button 
                                  onClick={() => { setKeyToRoll(k); setIsRollModalOpen(true); }}
                                  className="text-white/60 hover:text-white p-2 hover:bg-[#09090b]/10 rounded-lg transition-all text-xs font-bold flex items-center gap-1.5"
                                  title="Roll Key (Zero Downtime Rotation)"
                                >
                                  <RotateCw className="w-3.5 h-3.5" /> Roll
                                </button>
                                <div className="w-px h-4 bg-[#09090b]/10 mx-1" />
                                <button 
                                  onClick={() => handleRevoke(k.id)}
                                  disabled={revokingId === k.id}
                                  className="text-semantic-error/60 hover:text-semantic-error p-2 hover:bg-semantic-error/10 rounded-lg transition-all text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                                  title="Revoke Key"
                                >
                                  {revokingId === k.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Revoke
                                </button>
                              </>
                            )}
                          </div>
                        </RoleGuard>
                      </td>
                    </motion.tr>
                  ))
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>

      {/* Advanced Create Modal */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-ink/80 backdrop-blur-sm"
              onClick={() => !isCreating && closeCreateModal()}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl glass bg-ink rounded-2xl shadow-2xl overflow-hidden border-white/10"
            >
              {generatedKey ? (
                <div className="p-8">
                  <div className="text-center mb-6">
                    <div className="w-12 h-12 bg-teal/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-teal/20">
                      <Key className="w-6 h-6 text-teal" />
                    </div>
                    <h3 className="font-display font-bold text-white text-2xl">Key Generated Successfully</h3>
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
                    <label className="block text-xs font-bold text-white/40 uppercase tracking-widest mb-2">Secret Key</label>
                    <div className="relative">
                      <pre className="w-full bg-[#09090b] border border-white/10 rounded-xl p-4 font-mono text-sm text-white/90 overflow-x-auto shadow-inner">
                        {generatedKey.key}
                      </pre>
                      <button
                        onClick={() => copyToClipboard('generated_key', generatedKey.key)}
                        className="absolute right-2 top-2 p-2 rounded-lg bg-[#09090b]/5 hover:bg-[#09090b]/10 transition-colors text-white hover:text-teal shadow-[0_0_15px_rgba(255,255,255,0.02)] border border-white/10 backdrop-blur-sm"
                        title="Copy to clipboard"
                      >
                        {copiedId === 'generated_key' ? <Check className="w-4 h-4 text-teal" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="mb-6">
                    <label className="flex items-center gap-3 cursor-pointer p-4 rounded-xl border border-white/10 bg-[#09090b]/5 hover:bg-[#09090b]/10 transition-colors">
                      <input 
                        type="checkbox"
                        checked={hasSavedKey}
                        onChange={(e) => setHasSavedKey(e.target.checked)}
                        className="w-5 h-5 rounded bg-black/50 border-white/20 text-teal focus:ring-teal focus:ring-offset-ink"
                      />
                      <span className="text-sm font-bold text-white">I have securely copied this secret key. I understand it will never be shown again.</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-4">
                    <button 
                      onClick={closeCreateModal}
                      disabled={!hasSavedKey}
                      className="flex-1 py-3.5 rounded-xl bg-white/5 text-white font-bold hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-white/10"
                    >
                      Done
                    </button>
                    <Link
                      href={hasSavedKey ? "/console/explorer" : "#"}
                      onClick={(e) => {
                        if (!hasSavedKey) e.preventDefault();
                      }}
                      className={`flex-1 py-3.5 flex items-center justify-center gap-2 rounded-xl bg-teal text-ink font-bold hover:bg-teal-ice transition-colors shadow-[0_0_20px_rgba(70,189,198,0.3)] hover:shadow-[0_0_30px_rgba(70,189,198,0.5)] ${!hasSavedKey ? 'opacity-50 cursor-not-allowed shadow-none hover:shadow-none' : ''}`}
                    >
                      Make First Call <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between bg-[#09090b]/5">
                    <h3 className="font-bold text-white text-lg">Create New Key</h3>
                  </div>
                  <form onSubmit={handleCreate} className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
                      
                      {/* Left Column: Basic Info */}
                      <div className="space-y-6">
                        <div>
                          <label className="block text-sm font-bold text-white mb-2">Key Name</label>
                          <input 
                            type="text"
                            required
                            autoFocus
                            disabled={isCreating}
                            placeholder="e.g. Prod Internal Microservice"
                            className="w-full px-4 py-2.5 rounded-xl border border-white/10 focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition-shadow text-white font-medium bg-[#09090b]/5 disabled:opacity-50"
                            value={newKeyName}
                            onChange={(e) => setNewKeyName(e.target.value)}
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-bold text-white mb-2">Expiration</label>
                          <select
                            disabled={isCreating}
                            value={expiration}
                            onChange={(e) => setExpiration(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl border border-white/10 focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition-shadow text-white font-medium bg-[#0f111a] disabled:opacity-50 appearance-none"
                          >
                            <option value="never">Never expire</option>
                            <option value="30">30 days</option>
                            <option value="60">60 days</option>
                            <option value="90">90 days</option>
                          </select>
                        </div>

                        <div>
                          <label className="flex items-center gap-2 text-sm font-bold text-white mb-2">
                            <Globe className="w-4 h-4 text-white/40" />
                            IP Allowlist (Optional)
                          </label>
                          <textarea 
                            disabled={isCreating}
                            placeholder="e.g. 192.168.1.1, 10.0.0.0/24"
                            className="w-full px-4 py-2.5 rounded-xl border border-white/10 focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent transition-shadow text-white font-medium bg-[#09090b]/5 disabled:opacity-50 h-24 resize-none font-mono text-xs"
                            value={allowedIps}
                            onChange={(e) => setAllowedIps(e.target.value)}
                          />
                          <p className="mt-2 text-[10px] text-white/40 uppercase tracking-widest font-semibold">Comma separated IP addresses</p>
                        </div>
                      </div>

                      {/* Right Column: Scopes */}
                      <div>
                        <label className="block text-sm font-bold text-white mb-3">Permissions (Scopes)</label>
                        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                          {AVAILABLE_SCOPES.map(scope => (
                            <div 
                              key={scope.id}
                              onClick={() => !isCreating && toggleScope(scope.id)}
                              className={cn(
                                "p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3",
                                selectedScopes.includes(scope.id) 
                                  ? "bg-teal/10 border-teal/30" 
                                  : "bg-[#09090b]/5 border-white/10 hover:border-white/20 opacity-60 hover:opacity-100"
                              )}
                            >
                              <div className={cn("w-4 h-4 mt-0.5 rounded flex items-center justify-center flex-shrink-0 border", selectedScopes.includes(scope.id) ? "bg-teal border-teal text-white" : "bg-transparent border-white/20")}>
                                {selectedScopes.includes(scope.id) && <Check className="w-3 h-3" />}
                              </div>
                              <div>
                                <div className={cn("text-sm font-bold", selectedScopes.includes(scope.id) ? "text-teal" : "text-white")}>{scope.label}</div>
                                <div className="text-xs text-white/50 mt-0.5">{scope.desc}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {selectedScopes.length === 0 && (
                          <p className="text-xs text-semantic-error mt-3 font-semibold">Please select at least one scope.</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                      <button 
                        type="button"
                        onClick={closeCreateModal}
                        disabled={isCreating}
                        className="px-5 py-2.5 rounded-lg text-white font-bold hover:bg-[#09090b]/10 transition-colors disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button 
                        type="submit"
                        disabled={isCreating || selectedScopes.length === 0 || !newKeyName.trim()}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-teal text-ink font-bold hover:bg-teal-ice transition-colors shadow-lg shadow-teal/20 disabled:opacity-50 disabled:cursor-wait"
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

      {/* Roll Key Modal */}
      <AnimatePresence>
        {isRollModalOpen && keyToRoll && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-ink/80 backdrop-blur-sm"
              onClick={() => !isCreating && setIsRollModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md glass bg-ink rounded-2xl shadow-2xl overflow-hidden border-white/10"
            >
              <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between bg-[#09090b]/5">
                <h3 className="font-bold text-white text-lg flex items-center gap-2">
                  <RotateCw className="w-5 h-5 text-semantic-warning" /> 
                  Roll Key: {keyToRoll.name}
                </h3>
              </div>
              <div className="p-6">
                <p className="text-sm text-white/70 leading-relaxed mb-6">
                  Rolling a key allows you to rotate secrets with <strong>zero downtime</strong>. 
                  A new key will be generated immediately with the same permissions, and the old key will continue to work for a <strong>24-hour grace period</strong> before expiring.
                </p>
                <div className="bg-[#09090b] border border-white/10 rounded-xl p-4 mb-6 shadow-inner">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-white/40 font-bold uppercase tracking-widest">New Key</span>
                    <span className="text-xs font-bold text-semantic-success">Active immediately</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/40 font-bold uppercase tracking-widest">Old Key</span>
                    <span className="text-xs font-bold text-semantic-warning">Expires in 24h</span>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsRollModalOpen(false)}
                    disabled={isCreating}
                    className="px-5 py-2.5 rounded-lg text-white font-bold hover:bg-[#09090b]/10 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button 
                    type="button"
                    onClick={handleRollKey}
                    disabled={isCreating}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-semantic-warning text-white font-bold hover:bg-semantic-warning/80 transition-colors shadow-lg shadow-semantic-warning/20 disabled:opacity-70 disabled:cursor-wait"
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
    </div>
  );
}

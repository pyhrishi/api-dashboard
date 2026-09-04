'use client';

import { useStore, ExportOptions } from '@/lib/store';
import { Shield, Key, Smartphone, Laptop, LogOut, CheckCircle2, Copy, Eye, EyeOff, Loader2, Globe, Plus, Trash2, Database, AlertTriangle, Download, X, Check, RefreshCw, Sparkles, Map, ChevronDown, ShieldAlert, Activity, FileText, ArrowRight, Frown, DollarSign, Zap, Clock, FileJson, FileSpreadsheet, Calendar, Mail } from 'lucide-react';
import { useState, useMemo } from 'react';
import { track } from '@/lib/telemetry';
import { motion, AnimatePresence } from 'framer-motion';
import RoleGuard from '@/components/RoleGuard';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { cn, COUNTRIES } from '@/lib/utils';

export default function SecuritySettingsPage() {
  const { 
    is2faEnabled, enable2fa, disable2fa, activeSessions, revokeSession, user,
    ipRules, addIpRule, removeIpRule, toggleIpRule,
    geoRules, toggleGeoRule, removeGeoRule,
    apiLogs, activeKeys, webhooks, exportState, requestDataExport,
    scheduleAccountDeletion, dataRetentionDays, updateDataRetention, scheduledExport, updateScheduledExport,
    sunsetSimulatorEnabled, toggleSunsetSimulator, deprecationAlertConfig, updateDeprecationAlertConfig
  } = useStore();
  const router = useRouter();
  const { success, error, info } = useToast();
  
  // Password state
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });

  // 2FA modal state
  const [is2faModalOpen, setIs2faModalOpen] = useState(false);
  const [twoFaStep, setTwoFaStep] = useState<'scan' | 'recovery'>('scan');
  const [otp, setOtp] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  
  // IP Whitelist state
  const [newIp, setNewIp] = useState('');
  const [newIpDescription, setNewIpDescription] = useState('');
  const [newIpType, setNewIpType] = useState<'allow' | 'deny'>('allow');
  const [newIpTargetKey, setNewIpTargetKey] = useState<string>('global');
  
  const [testIp, setTestIp] = useState('');
  const [testKeyId, setTestKeyId] = useState<string>('global');
  const [testResult, setTestResult] = useState<'allowed' | 'blocked' | null>(null);
  const [testReason, setTestReason] = useState<string | null>(null);
  const [isTestLoading, setIsTestLoading] = useState(false);
  
  // Smart Suggestions
  const recommendedIps = useMemo(() => {
    // Find successful IPs not in our rules
    const recentSuccesses = apiLogs.filter(log => log.status === 200).map(log => log.ip);
    const uniqueSuccesses = Array.from(new Set(recentSuccesses));
    // Filter out ones already in rules
    return uniqueSuccesses.filter(ip => !ipRules.some(r => r.ip === ip)).slice(0, 5);
  }, [apiLogs, ipRules]);

  // Data Export & Deletion State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<1 | 2 | 3>(1);
  const [churnReason, setChurnReason] = useState<string>('');
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGlitching, setIsGlitching] = useState(false);
  
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('json');
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    keys: true, logs: true, webhooks: true, billing: true
  });
  
  const recoveryCodes = [
    'a8b9-4kd2-9m1c', '7d2e-1k8f-3p5x', '9j4m-2c6b-1z8t',
    '3n7x-8k2m-5p9d', '6f1q-4c8z-2b7m', '5t9k-3m2x-1p8d'
  ];

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      error('New passwords do not match', 'Error');
      return;
    }
    setIsChangingPassword(true);
    await new Promise(r => setTimeout(r, 1000));
    setIsChangingPassword(false);
    setPasswords({ current: '', new: '', confirm: '' });
    success('Password updated successfully', 'Success');
  };

  const handleVerify2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) return;
    setIsVerifying(true);
    await new Promise(r => setTimeout(r, 800));
    setIsVerifying(false);
    setTwoFaStep('recovery');
  };

  const complete2faSetup = () => {
    enable2fa();
    setIs2faModalOpen(false);
    setTwoFaStep('scan');
    setOtp('');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    info('Code copied to clipboard', 'Copied');
  };

  const handleAddIp = (e: React.FormEvent) => {
    e.preventDefault();
    if (newIp) {
      addIpRule({ 
        ip: newIp, 
        description: newIpDescription, 
        status: 'active',
        type: newIpType,
        targetKeyId: newIpTargetKey === 'global' ? undefined : newIpTargetKey
      });
      setNewIp('');
      setNewIpDescription('');
      setNewIpType('allow');
      setNewIpTargetKey('global');
      success(`${newIp} has been added to the firewall.`, 'Rule Added');
    }
  };

  const handleExportData = () => {
    track('export_downloaded', { source: 'account_data' });
    requestDataExport(exportFormat, exportOptions);
    info(`Export generation started in the background. (${exportFormat.toUpperCase()})`, 'Processing');
  };

  const handleDownloadArchive = () => {
    let mockDataStr = '';
    let mimeType = '';
    const ext = exportState.format || 'json';

    if (ext === 'csv') {
      mockDataStr = "id,timestamp,type\n1,2023-10-01,login\n2,2023-10-02,logout\n"; // Mock CSV
      mimeType = 'text/csv';
    } else {
      const mockData = {
        account: user,
        settings: { mfaEnabled: is2faEnabled, activeSessions: activeSessions.length },
        exportDate: new Date().toISOString(),
        options: exportState.options
      };
      mockDataStr = JSON.stringify(mockData, null, 2);
      mimeType = 'application/json';
    }

    const blob = new Blob([mockDataStr], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zintlr-export-${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    success('Your data archive has been downloaded.', 'Export complete');
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deleteConfirmationText !== user?.email) return;
    
    setIsDeleting(true);
    setIsGlitching(true);
    await new Promise(r => setTimeout(r, 2000));
    setIsDeleteModalOpen(false);
    scheduleAccountDeletion(churnReason);
    router.push('/');
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12 font-sans">
      
      {/* 1. Change Password Panel */}
      <div className="glass-inner rounded-2xl border border-border shadow-xl overflow-hidden p-8">
        <h2 className="text-xl font-bold text-fg mb-6 flex items-center gap-2">
          <Key className="w-5 h-5 text-teal" />
          Password Management
        </h2>
        
        <form onSubmit={handlePasswordChange} className="space-y-5 max-w-md">
          <div>
            <label className="block text-[10px] font-black text-fg-muted uppercase tracking-widest mb-2">Current Password</label>
            <div className="relative">
              <input 
                type={showPassword ? 'text' : 'password'}
                required
                value={passwords.current}
                onChange={e => setPasswords({...passwords, current: e.target.value})}
                className="w-full bg-surface border border-border rounded-xl py-3 pl-4 pr-10 text-sm text-fg focus:outline-none focus:border-teal/50 focus:ring-1 focus:ring-teal/50 transition-all"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          
          <div>
            <label className="block text-[10px] font-black text-fg-muted uppercase tracking-widest mb-2">New Password</label>
            <input 
              type="password" 
              required
              minLength={8}
              value={passwords.new}
              onChange={e => setPasswords({...passwords, new: e.target.value})}
              className="w-full bg-surface border border-border rounded-xl py-3 px-4 text-sm text-fg focus:outline-none focus:border-teal/50 focus:ring-1 focus:ring-teal/50 transition-all"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-fg-muted uppercase tracking-widest mb-2">Confirm New Password</label>
            <input 
              type="password" 
              required
              minLength={8}
              value={passwords.confirm}
              onChange={e => setPasswords({...passwords, confirm: e.target.value})}
              className="w-full bg-surface border border-border rounded-xl py-3 px-4 text-sm text-fg focus:outline-none focus:border-teal/50 focus:ring-1 focus:ring-teal/50 transition-all"
            />
          </div>
          
          <button 
            type="submit"
            disabled={isChangingPassword || !passwords.current || !passwords.new}
            className="mt-2 bg-surface text-fg font-bold px-6 py-3 rounded-xl flex items-center gap-2 hover:bg-neutral-200 transition-all disabled:opacity-50"
          >
            {isChangingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
            {isChangingPassword ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* 2. Two-Factor Authentication (2FA) */}
      <div className="glass-inner rounded-2xl border border-border shadow-xl overflow-hidden p-8">
        <h2 className="text-xl font-bold text-fg mb-2 flex items-center gap-2">
          <Shield className="w-5 h-5 text-teal" />
          Two-Factor Authentication
        </h2>
        <p className="text-fg-muted text-sm mb-6 max-w-2xl">
          Add an extra layer of security to your account. Once enabled, you will be required to enter a code from your authenticator app during login.
        </p>

        <div className="flex items-center gap-6">
          <div className="flex-1 max-w-sm p-4 rounded-xl border border-border bg-surface/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${is2faEnabled ? 'bg-semantic-success shadow-[0_0_10px_rgba(29,209,161,0.5)] animate-pulse-node' : 'bg-surface/20'}`} />
              <span className="font-bold text-fg text-sm">{is2faEnabled ? '2FA is Enabled' : '2FA is Disabled'}</span>
            </div>
            {is2faEnabled && <CheckCircle2 className="w-5 h-5 text-semantic-success" />}
          </div>
          
          {is2faEnabled ? (
            <button 
              onClick={disable2fa}
              className="px-6 py-3 rounded-xl font-bold text-semantic-error bg-semantic-error/10 hover:bg-semantic-error/20 transition-all text-sm"
            >
              Disable 2FA
            </button>
          ) : (
            <button 
              onClick={() => setIs2faModalOpen(true)}
              className="px-6 py-3 rounded-xl font-bold text-fg bg-surface hover:bg-neutral-200 transition-all text-sm shadow-[0_0_15px_rgba(255,255,255,0.1)]"
            >
              Enable 2FA
            </button>
          )}
        </div>
      </div>

      {/* 3. Active Sessions */}
      <div className="glass-inner rounded-2xl border border-border shadow-xl overflow-hidden">
        <div className="p-8 border-b border-border">
          <h2 className="text-xl font-bold text-fg mb-2 flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-teal" />
            Active Sessions
          </h2>
          <p className="text-fg-muted text-sm">
            View and manage devices currently logged into your account.
          </p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-surface/80 border-b border-border text-fg-muted font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-8 py-4">Device & Browser</th>
                <th className="px-6 py-4">Location & IP</th>
                <th className="px-6 py-4">Last Active</th>
                <th className="px-8 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-fg">
              {activeSessions.length === 0 ? (
                <tr><td colSpan={4} className="px-8 py-6 text-fg-muted text-center">No active sessions.</td></tr>
              ) : activeSessions.map(session => (
                <tr key={session.id} className="hover:bg-surface/5 transition-colors group">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      {session.device.includes('iPhone') || session.device.includes('Android') ? (
                        <Smartphone className="w-5 h-5 text-fg-muted" />
                      ) : (
                        <Laptop className="w-5 h-5 text-fg-muted" />
                      )}
                      <div>
                        <div className="font-bold text-fg flex items-center gap-2">
                          {session.device} 
                          {session.isCurrent && <span className="bg-teal/20 text-teal text-[9px] px-2 py-0.5 rounded uppercase tracking-widest">Current</span>}
                        </div>
                        <div className="text-xs text-fg-muted">{session.browser}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="text-fg">{session.location}</div>
                    <div className="text-xs text-fg-muted font-mono">{session.ip}</div>
                  </td>
                  <td className="px-6 py-5 text-fg-muted text-xs">
                    {new Date(session.lastActive).toLocaleString()}
                  </td>
                  <td className="px-8 py-5 text-right">
                    {!session.isCurrent && (
                      <button 
                        onClick={() => revokeSession(session.id)}
                        className="flex items-center justify-end gap-2 text-semantic-error/60 hover:text-semantic-error ml-auto p-2 hover:bg-semantic-error/10 rounded-lg transition-all text-xs font-bold opacity-0 group-hover:opacity-100"
                        title="Revoke Session"
                      >
                        <LogOut className="w-4 h-4" /> Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. IP Whitelisting */}
      <RoleGuard allowedRoles={['admin']}>
        <div className="glass-inner rounded-2xl border border-border shadow-xl overflow-hidden">
          <div className="p-8 border-b border-border">
            <h2 className="text-xl font-bold text-fg mb-2 flex items-center gap-2">
              <Globe className="w-5 h-5 text-teal" />
              IP Whitelisting
            </h2>
            <p className="text-fg-muted text-sm">
              Restrict API access to specific IP addresses or CIDR blocks. When empty, all IPs are allowed.
            </p>
          </div>
          
          <div className="p-8 space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-fg">Add New Rule</h3>
                <form onSubmit={handleAddIp} className="flex flex-col gap-4 bg-surface/20 p-5 rounded-2xl border border-border-subtle">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-[10px] font-black text-fg-muted uppercase tracking-widest mb-2">Rule Type</label>
                      <select 
                        value={newIpType}
                        onChange={e => setNewIpType(e.target.value as 'allow' | 'deny')}
                        className="w-full bg-[#121212] border border-border rounded-xl py-3 px-4 text-sm text-fg focus:outline-none focus:border-teal/50"
                      >
                        <option value="allow">Allow</option>
                        <option value="deny">Deny</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-[10px] font-black text-fg-muted uppercase tracking-widest mb-2">Target Scope</label>
                      <select 
                        value={newIpTargetKey}
                        onChange={e => setNewIpTargetKey(e.target.value)}
                        className="w-full bg-[#121212] border border-border rounded-xl py-3 px-4 text-sm text-fg focus:outline-none focus:border-teal/50"
                      >
                        <option value="global">All Keys (Global)</option>
                        {activeKeys.map(k => (
                           <option key={k.id} value={k.id}>{k.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-fg-muted uppercase tracking-widest mb-2">IP Address or CIDR Block</label>
                    <input 
                      type="text" 
                      placeholder="e.g., 192.168.1.1 or 10.0.0.0/24" 
                      value={newIp}
                      onChange={e => setNewIp(e.target.value)}
                      className="w-full bg-[#121212] border border-border rounded-xl py-3 px-4 text-sm text-fg focus:outline-none focus:border-teal/50"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-fg-muted uppercase tracking-widest mb-2">Description (Optional)</label>
                    <input 
                      type="text" 
                      placeholder="e.g., Office VPN" 
                      value={newIpDescription}
                      onChange={e => setNewIpDescription(e.target.value)}
                      className="w-full bg-[#121212] border border-border rounded-xl py-3 px-4 text-sm text-fg focus:outline-none focus:border-teal/50"
                    />
                  </div>
                  <button 
                    type="submit"
                    disabled={!newIp}
                    className="w-full py-3 bg-teal text-[#09090b] font-bold rounded-xl hover:bg-teal/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
                  >
                    <Plus className="w-4 h-4" /> Add Rule
                  </button>
                </form>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-bold text-fg">Test Connection</h3>
                <div className="flex flex-col gap-4 bg-surface/20 p-5 rounded-2xl border border-border-subtle h-full">
                  <p className="text-xs text-fg-muted">Simulate a request to see if it would be allowed or blocked by your current rules (Geo, Deny, Allow).</p>
                  <div className="flex gap-2">
                    <select
                      value={testKeyId}
                      onChange={e => setTestKeyId(e.target.value)}
                      className="w-1/3 bg-[#121212] border border-border rounded-xl py-3 px-4 text-sm text-fg focus:outline-none focus:border-teal/50"
                    >
                      <option value="global">No Specific Key</option>
                      {activeKeys.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                    </select>
                    <input 
                      type="text" 
                      placeholder="IP Address..." 
                      value={testIp}
                      onChange={e => { setTestIp(e.target.value); setTestResult(null); }}
                      className="flex-1 bg-[#121212] border border-border rounded-xl py-3 px-4 text-sm text-fg focus:outline-none focus:border-teal/50"
                    />
                    <button 
                      onClick={() => {
                        setIsTestLoading(true);
                        setTimeout(() => {
                           // Quick test logic simulation based on store rules
                           const country = COUNTRIES.map(c=>c.code)[Math.abs(testIp.split('').reduce((a,c)=>(a<<5)-a+c.charCodeAt(0),0)) % COUNTRIES.length] || 'US';
                           const gRule = geoRules.find(r => r.countryCode === country);
                           let blocked = false;
                           let reason = '';
                           
                           if (gRule && gRule.action === 'block') { blocked = true; reason = `Geo-blocked (${country})`; }
                           else if (geoRules.some(r=>r.action === 'allow') && !geoRules.find(r=>r.countryCode === country && r.action === 'allow')) { blocked = true; reason = `Country not in allowlist (${country})`; }
                           
                           const IPV4_REGEX = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
                           function ipToLong(ip: string): number { return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0; }
                           const checkMatch = (r: { ip: string }) => {
                             if (r.ip === testIp) return true;
                             if (r.ip.includes('/') && IPV4_REGEX.test(testIp) && IPV4_REGEX.test(r.ip.split('/')[0])) {
                               const mask = parseInt(r.ip.split('/')[1]);
                               return ((ipToLong(testIp) & (~((1 << (32 - mask)) - 1) >>> 0)) === (ipToLong(r.ip.split('/')[0]) & (~((1 << (32 - mask)) - 1) >>> 0)));
                             }
                             return false;
                           };
                           
                           const actives = ipRules.filter(r => r.status === 'active');
                           if (!blocked && actives.find(r => r.type === 'deny' && checkMatch(r))) {
                              blocked = true; reason = 'IP blocked by Deny Rule';
                           }
                           
                           if (!blocked && actives.some(r => r.type === 'allow')) {
                              const scopes = actives.filter(r => r.type === 'allow' && r.targetKeyId === testKeyId);
                              const globals = actives.filter(r => r.type === 'allow' && !r.targetKeyId);
                              if (scopes.length > 0) {
                                if (!scopes.find(r => checkMatch(r))) { blocked = true; reason = 'Key scoped rules do not allow this IP'; }
                              } else {
                                if (!globals.find(r => checkMatch(r))) { blocked = true; reason = 'Global rules do not allow this IP'; }
                              }
                           }
                           
                           setTestResult(blocked ? 'blocked' : 'allowed');
                           setTestReason(blocked ? reason : 'IP passes all active security checks');
                           setIsTestLoading(false);
                        }, 600);
                      }}
                      disabled={!testIp || isTestLoading}
                      className="px-4 bg-surface border border-border text-fg font-bold rounded-xl hover:bg-glass-2 transition-colors disabled:opacity-50"
                    >
                      {isTestLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Test'}
                    </button>
                  </div>
                  <AnimatePresence mode="wait">
                    {testResult && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className={cn("mt-4 p-4 rounded-xl border flex items-center gap-3", testResult === 'allowed' ? "bg-teal/10 border-teal/20 text-teal" : "bg-semantic-error/10 border-semantic-error/20 text-semantic-error")}
                      >
                        {testResult === 'allowed' ? <Check className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
                        <div>
                          <div className="font-bold">{testResult === 'allowed' ? 'Access Allowed' : 'Access Blocked'}</div>
                          <div className="text-xs opacity-70">
                            {testReason}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            <div className="mt-8 space-y-8">
              
              {/* Smart Suggestions */}
              {recommendedIps.length > 0 && (
                <div className="bg-teal/5 border border-teal/20 rounded-2xl p-5 mb-8">
                  <h3 className="text-sm font-bold text-teal flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4" /> Smart Suggestions
                  </h3>
                  <p className="text-xs text-fg-muted mb-4">We noticed successful traffic from these IPs recently. Would you like to whitelist them?</p>
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {recommendedIps.map(ip => (
                       <div key={ip} className="flex items-center gap-3 bg-surface border border-teal/20 px-4 py-2 rounded-xl shrink-0">
                         <span className="font-mono text-sm text-fg">{ip}</span>
                         <button 
                           onClick={() => {
                             addIpRule({ ip, description: 'Smart Suggestion', status: 'active', type: 'allow' });
                             success(`${ip} whitelisted.`, 'Added');
                           }}
                           className="text-teal hover:text-teal/80 font-bold text-xs bg-teal/10 px-2 py-1 rounded-lg"
                         >
                           Add
                         </button>
                       </div>
                    ))}
                  </div>
                </div>
              )}

              <h3 className="text-sm font-bold text-fg mb-4">Active Rules ({ipRules.length})</h3>
              <div className="space-y-3">
                {ipRules.length === 0 ? (
                  <div className="text-sm text-fg-muted italic text-center p-8 border border-dashed border-border rounded-2xl">No IP restrictions configured. All IPs are currently allowed.</div>
                ) : (
                  ipRules.map(rule => (
                    <div key={rule.id} className={cn("flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl border transition-colors group", rule.status === 'active' ? "border-border bg-surface/5 hover:bg-surface/10" : "border-border-subtle bg-transparent opacity-60")}>
                      <div className="flex items-start gap-4">
                        <div className={cn("w-10 h-10 rounded-full flex items-center justify-center border shrink-0", rule.status === 'active' ? "bg-teal/10 border-teal/20 text-teal" : "bg-glass border-border text-fg-muted")}>
                          <Globe className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <div className="font-mono font-bold text-fg">{rule.ip}</div>
                            {rule.type === 'allow' ? (
                              <span className="text-[10px] uppercase font-bold bg-teal/10 text-teal px-2 py-0.5 rounded border border-teal/20">Allow</span>
                            ) : (
                              <span className="text-[10px] uppercase font-bold bg-semantic-error/10 text-semantic-error px-2 py-0.5 rounded border border-semantic-error/20">Deny</span>
                            )}
                            {rule.targetKeyId && (
                              <span className="text-[10px] uppercase font-bold bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded border border-purple-500/20">
                                {activeKeys.find(k => k.id === rule.targetKeyId)?.name || 'Key'}
                              </span>
                            )}
                            {rule.isAutoGenerated && (
                              <span className="text-[10px] uppercase font-bold bg-orange-500/10 text-orange-400 flex items-center gap-1 px-2 py-0.5 rounded border border-orange-500/20">
                                <Activity className="w-3 h-3" /> Auto-Block
                              </span>
                            )}
                            {rule.status === 'inactive' && <span className="text-[10px] uppercase font-bold bg-white/10 px-2 py-0.5 rounded text-fg-muted">Inactive</span>}
                          </div>
                          <div className="text-xs text-fg-muted mt-1">{rule.description || 'No description provided'}</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-6 mt-4 sm:mt-0 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-0 border-border pt-4 sm:pt-0">
                        <div className="flex items-center gap-6 text-xs text-fg-muted">
                          <div className="flex flex-col">
                            <span className="uppercase text-[9px] font-black tracking-widest opacity-50">Hits</span>
                            <span className="font-mono text-fg">{rule.hits.toLocaleString()}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="uppercase text-[9px] font-black tracking-widest opacity-50">Last Used</span>
                            <span className="text-fg">{rule.lastUsedAt ? new Date(rule.lastUsedAt).toLocaleDateString() : 'Never'}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => toggleIpRule(rule.id)}
                            className={`w-10 h-5 rounded-full p-0.5 transition-colors ${rule.status === 'active' ? 'bg-teal' : 'bg-surface/20 border border-border'}`}
                          >
                            <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform ${rule.status === 'active' ? 'translate-x-5' : 'translate-x-0'}`} />
                          </button>
                          <button 
                            onClick={() => removeIpRule(rule.id)}
                            className="text-fg-muted hover:text-semantic-error p-2 transition-colors rounded-lg hover:bg-semantic-error/10 opacity-0 group-hover:opacity-100 focus:opacity-100"
                            title="Delete Rule"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </RoleGuard>

      {/* Geo-Firewall */}
      <RoleGuard allowedRoles={['admin']}>
        <div className="glass-inner rounded-2xl border border-border shadow-xl overflow-hidden mt-12">
          <div className="p-8 border-b border-border">
            <h2 className="text-xl font-bold text-fg mb-2 flex items-center gap-2">
              <Map className="w-5 h-5 text-teal" />
              Geo-Firewall
            </h2>
            <p className="text-fg-muted text-sm">
              Block or restrict access by geographic location (Country Level).
            </p>
          </div>
          <div className="p-8">
             <div className="flex flex-col sm:flex-row gap-4 mb-8 items-end">
               <div className="flex-1">
                 <label className="block text-[10px] font-black text-fg-muted uppercase tracking-widest mb-2">Select Country</label>
                 <select id="geo-select" className="w-full bg-[#121212] border border-border rounded-xl py-3 px-4 text-sm text-fg focus:outline-none focus:border-teal/50">
                   {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                 </select>
               </div>
               <button 
                 onClick={() => {
                   const val = (document.getElementById('geo-select') as HTMLSelectElement).value;
                   toggleGeoRule(val, 'block');
                   success(`Traffic from ${val} will now be blocked.`, 'Geo-Block Added');
                 }}
                 className="px-6 py-3 bg-semantic-error/10 text-semantic-error border border-semantic-error/20 font-bold rounded-xl hover:bg-semantic-error/20 transition-colors"
               >
                 Block Country
               </button>
               <button 
                 onClick={() => {
                   const val = (document.getElementById('geo-select') as HTMLSelectElement).value;
                   toggleGeoRule(val, 'allow');
                   success(`Traffic from ${val} is explicitly allowed.`, 'Geo-Allow Added');
                 }}
                 className="px-6 py-3 bg-teal/10 text-teal border border-teal/20 font-bold rounded-xl hover:bg-teal/20 transition-colors"
               >
                 Allow Country
               </button>
             </div>
             
             <div className="space-y-3">
                {geoRules.length === 0 ? (
                  <div className="text-sm text-fg-muted italic p-6 border border-dashed border-border rounded-xl text-center">No Geo-Rules configured.</div>
                ) : (
                  geoRules.map(r => {
                    const country = COUNTRIES.find(c => c.code === r.countryCode);
                    return (
                      <div key={r.countryCode} className="flex items-center justify-between p-4 bg-surface/40 border border-border rounded-xl">
                        <div className="flex items-center gap-3">
                           <span className="text-2xl">{country?.flag}</span>
                           <span className="font-bold">{country?.name} ({r.countryCode})</span>
                           <span className={cn("text-[10px] uppercase font-black px-2 py-0.5 rounded border", r.action === 'allow' ? "bg-teal/10 text-teal border-teal/20" : "bg-semantic-error/10 text-semantic-error border-semantic-error/20")}>
                             {r.action}
                           </span>
                        </div>
                        <button onClick={() => removeGeoRule(r.countryCode)} className="text-fg-muted hover:text-fg p-2">
                           <X className="w-4 h-4" />
                        </button>
                      </div>
                    )
                  })
                )}
             </div>
          </div>
        </div>
      </RoleGuard>

      {/* 5. Deprecation & Lifecycle Management */}
      <RoleGuard allowedRoles={['admin', 'developer']}>
        <div className="glass-inner rounded-2xl border border-border shadow-xl overflow-hidden mt-12">
          <div className="p-8 border-b border-border bg-surface/50">
            <h2 className="text-xl font-bold text-fg mb-2 flex items-center gap-2">
              <Zap className="w-5 h-5 text-teal" />
              Deprecation & Lifecycle
            </h2>
            <p className="text-fg-muted text-sm">
              Manage how your integration handles deprecated endpoints, including chaos engineering and proactive alerts.
            </p>
          </div>
          
          <div className="p-8 space-y-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Sunset Simulator */}
              <div>
                <h3 className="text-fg font-bold mb-1 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-fg-muted" /> Sunset Simulator (Chaos Mode)
                </h3>
                <p className="text-fg-muted text-sm mb-4 leading-relaxed">
                  When enabled, requests to deprecated endpoints in the Sandbox environment will instantly fail with a <code className="bg-white/10 px-1 py-0.5 rounded text-fg">410 Gone</code> error. Use this to battle-test your fallback logic before the actual sunset date.
                </p>
                <div className="flex items-center gap-4 p-4 rounded-xl border border-border bg-surface/40 shadow-inner">
                  <button
                    onClick={toggleSunsetSimulator}
                    className={cn(
                      "relative w-12 h-6 rounded-full transition-colors flex-shrink-0",
                      sunsetSimulatorEnabled ? "bg-semantic-error" : "bg-white/20"
                    )}
                  >
                    <motion.div 
                      layout
                      className={cn(
                        "absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform shadow-md",
                        sunsetSimulatorEnabled ? "translate-x-6" : "translate-x-0"
                      )}
                    />
                  </button>
                  <div>
                    <span className="text-sm font-bold block text-fg">{sunsetSimulatorEnabled ? 'Simulator Active' : 'Simulator Disabled'}</span>
                    <span className="text-xs text-fg-muted">{sunsetSimulatorEnabled ? 'Sandbox legacy endpoints will fail' : 'Sandbox legacy endpoints behave normally'}</span>
                  </div>
                </div>
              </div>
              
              {/* Proactive Alerts */}
              <div>
                <h3 className="text-fg font-bold mb-1 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-fg-muted" /> Proactive Deprecation Alerts
                </h3>
                <p className="text-fg-muted text-sm mb-4 leading-relaxed">
                  Get notified if your production traffic continues to hit an endpoint that is scheduled for sunset within the next 30 days.
                </p>
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-4 rounded-xl border border-border bg-surface/40 shadow-inner">
                    <button
                      onClick={() => updateDeprecationAlertConfig({ enabled: !deprecationAlertConfig.enabled })}
                      className={cn(
                        "relative w-12 h-6 rounded-full transition-colors flex-shrink-0",
                        deprecationAlertConfig.enabled ? "bg-teal" : "bg-white/20"
                      )}
                    >
                      <motion.div 
                        layout
                        className={cn(
                          "absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform shadow-md",
                          deprecationAlertConfig.enabled ? "translate-x-6" : "translate-x-0"
                        )}
                      />
                    </button>
                    <div>
                      <span className="text-sm font-bold block text-fg">{deprecationAlertConfig.enabled ? 'Alerts Enabled' : 'Alerts Disabled'}</span>
                    </div>
                  </div>
                  
                  {deprecationAlertConfig.enabled && (
                    <div className="flex gap-4 p-4 rounded-xl border border-teal/20 bg-teal/5">
                      <label className="flex items-center gap-2 text-sm text-fg cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={deprecationAlertConfig.channels.includes('email')}
                          onChange={(e) => {
                            const newChannels = e.target.checked 
                              ? [...deprecationAlertConfig.channels, 'email']
                              : deprecationAlertConfig.channels.filter(c => c !== 'email');
                            updateDeprecationAlertConfig({ channels: newChannels as ('email' | 'webhook')[] });
                          }}
                          className="w-4 h-4 accent-teal"
                        />
                        Email Alerts
                      </label>
                      <label className="flex items-center gap-2 text-sm text-fg cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={deprecationAlertConfig.channels.includes('webhook')}
                          onChange={(e) => {
                            const newChannels = e.target.checked 
                              ? [...deprecationAlertConfig.channels, 'webhook']
                              : deprecationAlertConfig.channels.filter(c => c !== 'webhook');
                            updateDeprecationAlertConfig({ channels: newChannels as ('email' | 'webhook')[] });
                          }}
                          className="w-4 h-4 accent-teal"
                        />
                        Webhook Alerts
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </RoleGuard>

      {/* 6. Data & Privacy (Danger Zone) */}
      <RoleGuard allowedRoles={['admin']}>
        <div className="rounded-2xl border border-semantic-error/20 bg-semantic-error/5 shadow-xl overflow-hidden mt-12">
          <div className="p-8 border-b border-semantic-error/10 bg-surface/50">
            <h2 className="text-xl font-bold text-semantic-error mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Data & Privacy
            </h2>
            <p className="text-fg-muted text-sm">
              Manage your personal data retention, request granular exports, or schedule your organization for deletion.
            </p>
          </div>
          
          <div className="p-8 space-y-10">
            {/* Retention & Automation */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-fg font-bold mb-1 flex items-center gap-2">
                  <Database className="w-4 h-4 text-fg-muted" /> Data Retention Policy
                </h3>
                <p className="text-fg-muted text-sm mb-4">Automatically purge activity and audit logs older than the selected timeframe.</p>
                
                <div className="relative">
                  <select
                    value={dataRetentionDays}
                    onChange={(e) => updateDataRetention(e.target.value === 'forever' ? 'forever' : (Number(e.target.value) as 30 | 90 | 365))}
                    className="w-full bg-surface/40 border border-border rounded-xl py-3 px-4 text-fg appearance-none focus:outline-none focus:border-teal transition-colors font-bold"
                  >
                    <option value="30">30 Days (Strict Compliance)</option>
                    <option value="90">90 Days (Recommended)</option>
                    <option value="365">1 Year</option>
                    <option value="forever">Forever</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-fg-muted absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
              
              <div>
                <h3 className="text-fg font-bold mb-1 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-fg-muted" /> Automated Exports
                </h3>
                <p className="text-fg-muted text-sm mb-4">Schedule a recurring export to be automatically emailed to organization admins.</p>
                
                <div className="flex items-center gap-4 bg-surface/40 border border-border rounded-xl p-2 pl-4">
                  <div className="flex-1 flex items-center justify-between mr-2">
                    <span className="text-sm font-bold text-fg">Enable Schedule</span>
                    <button 
                      onClick={() => updateScheduledExport({ enabled: !scheduledExport.enabled })}
                      className={cn("w-10 h-6 rounded-full transition-colors relative", scheduledExport.enabled ? "bg-teal" : "bg-white/10")}
                    >
                      <div className={cn("absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform", scheduledExport.enabled ? "translate-x-4" : "translate-x-0")} />
                    </button>
                  </div>
                  {scheduledExport.enabled && (
                    <select
                      value={scheduledExport.frequency}
                      onChange={(e) => updateScheduledExport({ frequency: e.target.value as 'weekly' | 'monthly' })}
                      className="bg-black border border-border rounded-lg py-1.5 px-3 text-fg text-sm appearance-none font-bold outline-none focus:border-teal"
                    >
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  )}
                </div>
              </div>
            </div>

            <div className="w-full h-px bg-glass" />

            {/* Export Data */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
              <div className="flex-1 max-w-xl">
                <h3 className="text-fg font-bold mb-1 flex items-center gap-2">
                  <Download className="w-4 h-4 text-fg-muted" /> Granular Data Export
                </h3>
                <p className="text-fg-muted text-sm mb-6">Request a compilation of your account data. You can select specific datasets to minimize the archive size.</p>
                
                {exportState.status === 'processing' && (
                   <div className="bg-surface/40 border border-border rounded-xl p-4 w-full mb-6">
                     <div className="flex items-center justify-between mb-2">
                       <span className="text-sm font-bold text-fg flex items-center gap-2">
                         <Loader2 className="w-4 h-4 animate-spin text-teal" /> Compiling Archive...
                       </span>
                       <span className="text-xs text-fg-muted">45%</span>
                     </div>
                     <div className="w-full bg-glass h-1.5 rounded-full overflow-hidden">
                       <div className="bg-gradient-to-r from-teal-500 to-emerald-400 h-full rounded-full animate-pulse-node w-[45%]" />
                     </div>
                     <p className="text-xs text-fg-muted mt-2">We will notify you when the {exportState.format?.toUpperCase()} export is ready.</p>
                   </div>
                )}
                
                {exportState.status === 'ready' && (
                   <div className="bg-teal/10 border border-teal/20 rounded-xl p-4 w-full mb-6">
                     <div className="flex items-center justify-between mb-3">
                       <span className="text-sm font-bold text-teal flex items-center gap-2">
                         <CheckCircle2 className="w-4 h-4" /> Archive Ready
                       </span>
                     </div>
                     <div className="text-xs text-fg-muted mb-4 flex items-center gap-2">
                       <Clock className="w-3 h-3" /> Expires on {new Date(exportState.expiresAt!).toLocaleDateString()}
                     </div>
                     <button 
                       onClick={handleDownloadArchive}
                       className="w-full py-2 bg-teal text-[#09090b] font-bold rounded-lg hover:bg-teal/90 transition-colors flex items-center justify-center gap-2 text-sm"
                     >
                       <Download className="w-4 h-4" /> Download Archive ({exportState.format?.toUpperCase()})
                     </button>
                   </div>
                )}

                {exportState.status === 'none' && (
                  <div className="bg-surface/40 border border-border rounded-xl p-1 mb-6 inline-flex">
                     <button onClick={() => setExportFormat('json')} className={cn("px-4 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2", exportFormat === 'json' ? "bg-white/10 text-fg" : "text-fg-muted hover:text-fg")}>
                       <FileJson className="w-4 h-4" /> JSON
                     </button>
                     <button onClick={() => setExportFormat('csv')} className={cn("px-4 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2", exportFormat === 'csv' ? "bg-white/10 text-fg" : "text-fg-muted hover:text-fg")}>
                       <FileSpreadsheet className="w-4 h-4" /> CSV
                     </button>
                  </div>
                )}

                {exportState.status === 'none' && (
                  <div className="grid grid-cols-2 gap-3 mb-6">
                    {[
                      { key: 'keys', label: 'API Keys & Secrets' },
                      { key: 'webhooks', label: 'Webhook Endpoints' },
                      { key: 'logs', label: 'Activity & Audit Logs' },
                      { key: 'billing', label: 'Billing History' },
                    ].map(opt => (
                      <label key={opt.key} className={cn("flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer", exportOptions[opt.key as keyof ExportOptions] ? "bg-glass border-border-strong text-fg" : "bg-surface/40 border-border-subtle text-fg-muted")}>
                         <div className={cn("w-4 h-4 rounded border flex items-center justify-center", exportOptions[opt.key as keyof ExportOptions] ? "bg-teal border-teal text-[#09090b]" : "border-border-strong bg-black")}>
                           {exportOptions[opt.key as keyof ExportOptions] && <Check className="w-3 h-3" />}
                         </div>
                         <input type="checkbox" className="hidden" checked={exportOptions[opt.key as keyof ExportOptions]} onChange={() => setExportOptions(prev => ({ ...prev, [opt.key]: !prev[opt.key as keyof ExportOptions] }))} />
                         <span className="text-sm font-bold">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              
              {exportState.status === 'none' && (
                <button 
                  onClick={handleExportData}
                  disabled={!Object.values(exportOptions).some(Boolean)}
                  className="px-6 py-3 rounded-xl font-bold bg-surface/5 border border-border text-fg hover:bg-surface/10 transition-colors flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50"
                >
                  <Download className="w-4 h-4" /> Generate Archive
                </button>
              )}
            </div>

            <div className="w-full h-px bg-semantic-error/10" />

            {/* Delete Account */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h3 className="text-fg font-bold mb-1">Delete Account</h3>
                <p className="text-fg-muted text-sm">Schedule your account for permanent deletion. Data is retained for 30 days before being destroyed.</p>
              </div>
              <button 
                onClick={() => { setIsDeleteModalOpen(true); setDeleteStep(1); setChurnReason(''); setDeleteConfirmationText(''); }}
                className="px-6 py-3 rounded-xl font-bold bg-semantic-error/10 text-semantic-error hover:bg-semantic-error hover:text-fg transition-colors flex items-center justify-center gap-2 whitespace-nowrap border border-semantic-error/20"
              >
                <Trash2 className="w-4 h-4" /> Delete Account
              </button>
            </div>
          </div>
        </div>
      </RoleGuard>

      {/* Multi-Step Delete Wizard */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-overlay backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={cn(
                "relative w-full max-w-2xl bg-surface border border-semantic-error/30 rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col",
                isGlitching && "animate-glitch border-semantic-error"
              )}
            >
              <div className="p-6 border-b border-semantic-error/10 flex items-center justify-between bg-semantic-error/5">
                <h3 className="text-xl font-bold text-semantic-error flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" /> Account Deletion Wizard
                </h3>
                <button onClick={() => !isDeleting && setIsDeleteModalOpen(false)} disabled={isDeleting} className="text-fg-muted hover:text-fg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-8">
                {/* Stepper */}
                <div className="flex items-center justify-between mb-8 relative">
                   <div className="absolute top-1/2 left-0 right-0 h-px bg-white/10 -z-10" />
                   {[1, 2, 3].map(step => (
                     <div key={step} className={cn("w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors", deleteStep === step ? "bg-semantic-error text-fg border-semantic-error shadow-[0_0_10px_rgba(255,71,87,0.5)]" : deleteStep > step ? "bg-white/10 text-fg-muted border-border" : "bg-surface text-fg-subtle border-border")}>
                       {deleteStep > step ? <Check className="w-4 h-4" /> : step}
                     </div>
                   ))}
                </div>

                <AnimatePresence mode="wait">
                  {/* STEP 1: IMPACT ANALYSIS */}
                  {deleteStep === 1 && (
                    <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                      <h4 className="text-lg font-bold text-fg mb-2">Impact Analysis</h4>
                      <p className="text-fg-muted text-sm mb-6">Review the resources that will be permanently destroyed. This action will initiate a 30-day grace period.</p>
                      
                      <div className="grid grid-cols-2 gap-4 mb-8">
                        <div className="bg-surface/40 border border-border p-4 rounded-xl flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-teal/10 text-teal flex items-center justify-center shrink-0"><Key className="w-5 h-5" /></div>
                          <div><div className="text-2xl font-black text-fg">{activeKeys.length}</div><div className="text-xs text-fg-muted uppercase tracking-widest font-bold">Active API Keys</div></div>
                        </div>
                        <div className="bg-surface/40 border border-border p-4 rounded-xl flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0"><Globe className="w-5 h-5" /></div>
                          <div><div className="text-2xl font-black text-fg">{webhooks.length}</div><div className="text-xs text-fg-muted uppercase tracking-widest font-bold">Webhooks</div></div>
                        </div>
                        <div className="bg-surface/40 border border-border p-4 rounded-xl flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0"><Activity className="w-5 h-5" /></div>
                          <div><div className="text-2xl font-black text-fg">{apiLogs.length.toLocaleString()}</div><div className="text-xs text-fg-muted uppercase tracking-widest font-bold">Activity Logs</div></div>
                        </div>
                        <div className="bg-surface/40 border border-border p-4 rounded-xl flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0"><DollarSign className="w-5 h-5" /></div>
                          <div><div className="text-2xl font-black text-fg">1</div><div className="text-xs text-fg-muted uppercase tracking-widest font-bold">Active Subscription</div></div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-3">
                         <button onClick={() => setIsDeleteModalOpen(false)} className="px-6 py-2 rounded-xl text-fg-muted hover:text-fg hover:bg-glass font-bold transition-colors">Cancel</button>
                         <button onClick={() => setDeleteStep(2)} className="px-6 py-2 bg-semantic-error text-fg font-bold rounded-xl hover:bg-red-600 transition-colors flex items-center gap-2">Continue <ArrowRight className="w-4 h-4" /></button>
                      </div>
                    </motion.div>
                  )}

                  {/* STEP 2: OFFBOARDING SURVEY */}
                  {deleteStep === 2 && (
                    <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                      <h4 className="text-lg font-bold text-fg mb-2">We&apos;re sorry to see you go</h4>
                      <p className="text-fg-muted text-sm mb-6">Could you let us know why you are leaving? This helps us improve our product.</p>
                      
                      <div className="grid grid-cols-2 gap-3 mb-8">
                        {[
                          { id: 'missing_features', label: 'Missing Features', icon: Zap },
                          { id: 'too_expensive', label: 'Too Expensive', icon: DollarSign },
                          { id: 'hard_to_use', label: 'Hard to Use', icon: Frown },
                          { id: 'switching', label: 'Switching Providers', icon: ArrowRight },
                          { id: 'project_ended', label: 'Project Ended', icon: CheckCircle2 },
                          { id: 'other', label: 'Other', icon: FileText }
                        ].map(reason => {
                          const Icon = reason.icon;
                          return (
                            <button 
                              key={reason.id}
                              onClick={() => setChurnReason(reason.id)}
                              className={cn("p-4 rounded-xl border flex items-center gap-3 transition-all text-left", churnReason === reason.id ? "bg-purple-500/10 border-purple-500/50 text-fg shadow-[0_0_15px_rgba(168,85,247,0.1)]" : "bg-surface/40 border-border text-fg-muted hover:border-white/30")}
                            >
                              <Icon className={cn("w-4 h-4", churnReason === reason.id ? "text-purple-400" : "text-fg-muted")} />
                              <span className="font-bold text-sm">{reason.label}</span>
                            </button>
                          )
                        })}
                      </div>

                      <div className="flex justify-between gap-3">
                         <button onClick={() => setDeleteStep(1)} className="px-6 py-2 rounded-xl text-fg-muted hover:text-fg hover:bg-glass font-bold transition-colors">Back</button>
                         <button onClick={() => setDeleteStep(3)} disabled={!churnReason} className="px-6 py-2 bg-semantic-error text-fg font-bold rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center gap-2">Continue <ArrowRight className="w-4 h-4" /></button>
                      </div>
                    </motion.div>
                  )}

                  {/* STEP 3: VERIFICATION */}
                  {deleteStep === 3 && (
                    <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                      <h4 className="text-lg font-bold text-fg mb-2">Final Verification</h4>
                      <p className="text-fg-muted text-sm mb-6">Type your email address to schedule deletion. You will have 30 days to restore your account.</p>
                      
                      <form onSubmit={handleDeleteAccount} className="space-y-6">
                        <div className="bg-semantic-error/10 border border-semantic-error/20 rounded-xl p-4 text-sm text-semantic-error/90 leading-relaxed mb-6">
                          <strong className="block mb-1 text-semantic-error">Account Deactivation Imminent</strong>
                          The Zinbit organization <strong className="text-fg">{user?.company}</strong> will be locked and scheduled for deletion.
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-fg mb-2">
                            Please type <span className="font-mono bg-surface/40 px-2 py-1 rounded border border-border text-fg font-bold select-none">{user?.email}</span> to confirm.
                          </label>
                          <input 
                            type="text"
                            required
                            value={deleteConfirmationText}
                            onChange={e => setDeleteConfirmationText(e.target.value)}
                            placeholder={user?.email}
                            disabled={isDeleting}
                            className="w-full bg-overlay border border-border rounded-xl py-3 px-4 text-fg focus:outline-none focus:border-semantic-error focus:ring-1 focus:ring-semantic-error transition-all font-mono"
                          />
                        </div>
                        
                        <div className="flex justify-between gap-3 pt-2">
                           <button type="button" onClick={() => setDeleteStep(2)} disabled={isDeleting} className="px-6 py-2 rounded-xl text-fg-muted hover:text-fg hover:bg-glass font-bold transition-colors">Back</button>
                           <button 
                             type="submit" 
                             disabled={deleteConfirmationText !== user?.email || isDeleting} 
                             className="px-8 py-3 bg-semantic-error text-fg font-bold rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center gap-2 shadow-[0_0_20px_rgba(255,71,87,0.3)]"
                           >
                             {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldAlert className="w-5 h-5" />}
                             {isDeleting ? 'Scheduling Deletion...' : 'Schedule Deletion'}
                           </button>
                        </div>
                      </form>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2FA Setup Modal (existing) */}
      <AnimatePresence>
        {is2faModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-overlay backdrop-blur-sm"
              onClick={() => setIs2faModalOpen(false)}
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-surface border border-border rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col"
            >
              {twoFaStep === 'scan' ? (
                <>
                  <div className="p-8 border-b border-border text-center">
                    <h3 className="text-2xl font-bold text-fg mb-2">Set up 2FA</h3>
                    <p className="text-sm text-fg-muted">Scan the QR code with your authenticator app.</p>
                  </div>
                  <div className="p-8 flex flex-col items-center">
                    {/* Fake QR Code */}
                    <div className="w-48 h-48 bg-surface rounded-xl p-3 mb-6 relative overflow-hidden group">
                      <div className="absolute inset-0 bg-[url('https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=mock2fa')] bg-center bg-no-repeat bg-contain m-3 opacity-90 group-hover:scale-105 transition-transform" />
                    </div>
                    <form onSubmit={handleVerify2fa} className="w-full space-y-4">
                      <div>
                        <input 
                          type="text" 
                          required
                          maxLength={6}
                          placeholder="000000"
                          value={otp}
                          onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                          className="w-full bg-[#111116] border border-border rounded-xl py-3 px-4 text-center text-2xl tracking-[0.5em] font-mono text-fg placeholder-white/10 focus:outline-none focus:border-teal/50 focus:ring-1 focus:ring-teal/50 transition-all"
                        />
                      </div>
                      <button 
                        type="submit"
                        disabled={otp.length < 6 || isVerifying}
                        className="w-full py-3 px-4 rounded-xl font-bold bg-surface text-fg hover:bg-neutral-200 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.1)] flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isVerifying ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify & Continue'}
                      </button>
                    </form>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-8 border-b border-border text-center">
                    <div className="w-16 h-16 bg-semantic-success/10 text-semantic-success rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <h3 className="text-2xl font-bold text-fg mb-2">2FA Enabled Successfully</h3>
                    <p className="text-sm text-fg-muted">Save these recovery codes in a secure place. They are the only way to access your account if you lose your device.</p>
                  </div>
                  <div className="p-8">
                    <div className="grid grid-cols-2 gap-3 mb-6">
                      {recoveryCodes.map(code => (
                        <div key={code} className="bg-surface/5 border border-border rounded-lg py-2 px-3 flex items-center justify-between group">
                          <span className="font-mono text-sm tracking-wider text-fg">{code}</span>
                          <button onClick={() => copyToClipboard(code)} className="text-fg-subtle hover:text-fg opacity-0 group-hover:opacity-100 transition-all">
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button 
                      onClick={complete2faSetup}
                      className="w-full py-3 px-4 rounded-xl font-bold bg-surface text-fg hover:bg-neutral-200 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                    >
                      I have saved my codes
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

'use client';

import { useStore } from '@/lib/store';
import { User, Building2, Mail, Save, Fingerprint, FlaskConical, RefreshCw } from 'lucide-react';
import { useState } from 'react';

export default function ProfileSettingsPage() {
  const { user, switchRole, v2DarkLaunchEnabled, toggleV2DarkLaunch } = useStore();
  const [isSaving, setIsSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const handleResetDemo = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 3000);
      return;
    }
    // Clear persisted state and reload — the store re-initializes from its seeded
    // demo data (fresh keys, metrics, logs, billing) for a clean repeat run.
    try { useStore.persist.clearStorage(); } catch { /* storage unavailable */ }
    window.location.href = '/console';
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    await new Promise(r => setTimeout(r, 600));
    setIsSaving(false);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="glass-inner rounded-2xl border border-border shadow-xl overflow-hidden p-8">
        <h2 className="text-xl font-bold text-fg mb-6 flex items-center gap-2">
          <User className="w-5 h-5 text-teal" />
          Personal Information
        </h2>
        
        <form onSubmit={handleSave} className="space-y-6 max-w-2xl">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-black text-fg-muted uppercase tracking-widest mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" />
                <input 
                  type="email" 
                  disabled
                  defaultValue={user?.email}
                  className="w-full bg-surface/5 border border-border rounded-xl py-3 pl-10 pr-4 text-sm text-fg-muted cursor-not-allowed"
                />
              </div>
              <p className="text-[10px] text-fg-muted mt-2">Email address cannot be changed.</p>
            </div>
            
            <div>
              <label className="block text-[10px] font-black text-fg-muted uppercase tracking-widest mb-2">Company Name</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" />
                <input 
                  type="text" 
                  defaultValue={user?.company}
                  className="w-full bg-surface border border-border rounded-xl py-3 pl-10 pr-4 text-sm text-fg focus:outline-none focus:border-teal/50 focus:ring-1 focus:ring-teal/50 transition-all"
                />
              </div>
            </div>
          </div>
          
          <button 
            type="submit"
            disabled={isSaving}
            className="bg-surface text-fg font-bold px-6 py-3 rounded-xl flex items-center gap-2 hover:bg-neutral-200 transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>

      {/* Developer Tools / Impersonation */}
      <div className="glass-inner rounded-2xl border border-semantic-warning/30 bg-semantic-warning/5 shadow-xl overflow-hidden p-8">
        <h2 className="text-xl font-bold text-fg mb-2 flex items-center gap-2">
          <Fingerprint className="w-5 h-5 text-semantic-warning" />
          Developer Impersonation Mode
        </h2>
        <p className="text-fg-muted text-sm mb-6 max-w-2xl">
          Use this panel to simulate how the dashboard looks and behaves for users with different Role-Based Access Control (RBAC) permissions. 
          When active, route protection and backend mock restrictions will apply instantly.
        </p>

        <div className="grid md:grid-cols-3 gap-4 max-w-2xl">
          {(['admin', 'developer', 'billing'] as const).map((r) => (
            <button
              key={r}
              onClick={() => switchRole(r)}
              className={`p-4 rounded-xl border text-left transition-all ${
                user?.role === r 
                  ? 'bg-semantic-warning/20 border-semantic-warning/50 text-fg shadow-[0_0_15px_rgba(255,176,32,0.1)]' 
                  : 'bg-black/20 border-border text-fg-muted hover:bg-surface/5 hover:text-fg'
              }`}
            >
              <div className="text-xs font-black uppercase tracking-widest mb-1">{r}</div>
              <div className="text-xs opacity-70">
                {r === 'admin' && 'Full access to all dashboard features.'}
                {r === 'developer' && 'API Keys, Webhooks, and Logs.'}
                {r === 'billing' && 'Billing, Analytics, and Quotas.'}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Dark Launch / Experimental Features */}
      <div className="glass-inner rounded-2xl border border-teal/30 bg-teal/5 shadow-xl overflow-hidden p-8">
        <h2 className="text-xl font-bold text-fg mb-2 flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-teal" />
          API Versioning & Experimental Features
        </h2>
        <p className="text-fg-muted text-sm mb-6 max-w-2xl">
          Opt-in to test upcoming API versions and experimental endpoints before they are officially released. Note: Experimental endpoints are only available in the Sandbox environment.
        </p>

        <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-black/20 max-w-2xl">
          <div>
            <h3 className="text-sm font-bold text-fg">v2 Endpoints (Beta)</h3>
            <p className="text-xs text-fg-muted mt-1">Enable access to the v2 API sandbox endpoints.</p>
          </div>
          <button
            onClick={() => toggleV2DarkLaunch(!v2DarkLaunchEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              v2DarkLaunchEnabled ? 'bg-teal' : 'bg-white/20'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                v2DarkLaunchEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Demo Controls */}
      <div className="glass-inner rounded-2xl border border-amber-500/30 bg-amber-500/5 shadow-xl overflow-hidden p-8">
        <h2 className="text-xl font-bold text-fg mb-2 flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-amber-400" />
          Demo Controls
        </h2>
        <p className="text-fg-muted text-sm mb-6 max-w-2xl">
          Reset this workspace to its original seeded state — fresh API keys, usage metrics, request logs, and billing. Useful for running the demo again from a clean slate.
        </p>
        <button
          onClick={handleResetDemo}
          className={`px-5 py-3 rounded-xl font-bold text-sm transition-colors flex items-center gap-2 ${
            confirmReset
              ? 'bg-amber-500 text-black hover:bg-amber-400'
              : 'border border-amber-500/40 text-amber-300 hover:bg-amber-500/10'
          }`}
        >
          <RefreshCw className="w-4 h-4" />
          {confirmReset ? 'Click again to confirm reset' : 'Reset Demo Data'}
        </button>
      </div>
    </div>
  );
}

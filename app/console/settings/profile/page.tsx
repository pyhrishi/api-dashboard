'use client';

import { useStore } from '@/lib/store';
import { User, Building2, HardDrive, Mail, Save, Fingerprint } from 'lucide-react';
import { useState } from 'react';

export default function ProfileSettingsPage() {
  const { user, switchRole } = useStore();
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    await new Promise(r => setTimeout(r, 600));
    setIsSaving(false);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="glass-inner rounded-2xl border border-white/10 shadow-xl overflow-hidden p-8">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <User className="w-5 h-5 text-teal" />
          Personal Information
        </h2>
        
        <form onSubmit={handleSave} className="space-y-6 max-w-2xl">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input 
                  type="email" 
                  disabled
                  defaultValue={user?.email}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white/50 cursor-not-allowed"
                />
              </div>
              <p className="text-[10px] text-white/40 mt-2">Email address cannot be changed.</p>
            </div>
            
            <div>
              <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Company Name</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input 
                  type="text" 
                  defaultValue={user?.company}
                  className="w-full bg-[#09090b] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-teal/50 focus:ring-1 focus:ring-teal/50 transition-all"
                />
              </div>
            </div>
          </div>
          
          <button 
            type="submit"
            disabled={isSaving}
            className="bg-white text-ink font-bold px-6 py-3 rounded-xl flex items-center gap-2 hover:bg-neutral-200 transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>

      {/* Developer Tools / Impersonation */}
      <div className="glass-inner rounded-2xl border border-semantic-warning/30 bg-semantic-warning/5 shadow-xl overflow-hidden p-8">
        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
          <Fingerprint className="w-5 h-5 text-semantic-warning" />
          Developer Impersonation Mode
        </h2>
        <p className="text-white/60 text-sm mb-6 max-w-2xl">
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
                  ? 'bg-semantic-warning/20 border-semantic-warning/50 text-white shadow-[0_0_15px_rgba(255,176,32,0.1)]' 
                  : 'bg-black/20 border-white/10 text-white/50 hover:bg-white/5 hover:text-white'
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
    </div>
  );
}

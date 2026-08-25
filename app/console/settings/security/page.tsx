'use client';

import { useStore } from '@/lib/store';
import { Shield, Key, Smartphone, Laptop, LogOut, CheckCircle2, Copy, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function SecuritySettingsPage() {
  const { is2faEnabled, enable2fa, disable2fa, activeSessions, revokeSession } = useStore();
  
  // Password state
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });

  // 2FA modal state
  const [is2faModalOpen, setIs2faModalOpen] = useState(false);
  const [twoFaStep, setTwoFaStep] = useState<'scan' | 'recovery'>('scan');
  const [otp, setOtp] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  
  const recoveryCodes = [
    'a8b9-4kd2-9m1c', '7d2e-1k8f-3p5x', '9j4m-2c6b-1z8t',
    '3n7x-8k2m-5p9d', '6f1q-4c8z-2b7m', '5t9k-3m2x-1p8d'
  ];

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      alert('New passwords do not match');
      return;
    }
    setIsChangingPassword(true);
    await new Promise(r => setTimeout(r, 1000));
    setIsChangingPassword(false);
    setPasswords({ current: '', new: '', confirm: '' });
    alert('Password updated successfully');
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
    // In a real app, show a toast here
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      
      {/* 1. Change Password Panel */}
      <div className="glass-inner rounded-2xl border border-white/10 shadow-xl overflow-hidden p-8">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Key className="w-5 h-5 text-teal" />
          Password Management
        </h2>
        
        <form onSubmit={handlePasswordChange} className="space-y-5 max-w-md">
          <div>
            <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Current Password</label>
            <div className="relative">
              <input 
                type={showPassword ? 'text' : 'password'}
                required
                value={passwords.current}
                onChange={e => setPasswords({...passwords, current: e.target.value})}
                className="w-full bg-[#09090b] border border-white/10 rounded-xl py-3 pl-4 pr-10 text-sm text-white focus:outline-none focus:border-teal/50 focus:ring-1 focus:ring-teal/50 transition-all"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          
          <div>
            <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">New Password</label>
            <input 
              type="password" 
              required
              minLength={8}
              value={passwords.new}
              onChange={e => setPasswords({...passwords, new: e.target.value})}
              className="w-full bg-[#09090b] border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-teal/50 focus:ring-1 focus:ring-teal/50 transition-all"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Confirm New Password</label>
            <input 
              type="password" 
              required
              minLength={8}
              value={passwords.confirm}
              onChange={e => setPasswords({...passwords, confirm: e.target.value})}
              className="w-full bg-[#09090b] border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-teal/50 focus:ring-1 focus:ring-teal/50 transition-all"
            />
          </div>
          
          <button 
            type="submit"
            disabled={isChangingPassword || !passwords.current || !passwords.new}
            className="mt-2 bg-white text-ink font-bold px-6 py-3 rounded-xl flex items-center gap-2 hover:bg-neutral-200 transition-all disabled:opacity-50"
          >
            {isChangingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
            {isChangingPassword ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* 2. Two-Factor Authentication (2FA) */}
      <div className="glass-inner rounded-2xl border border-white/10 shadow-xl overflow-hidden p-8">
        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
          <Shield className="w-5 h-5 text-teal" />
          Two-Factor Authentication
        </h2>
        <p className="text-white/60 text-sm mb-6 max-w-2xl">
          Add an extra layer of security to your account. Once enabled, you will be required to enter a code from your authenticator app during login.
        </p>

        <div className="flex items-center gap-6">
          <div className="flex-1 max-w-sm p-4 rounded-xl border border-white/10 bg-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${is2faEnabled ? 'bg-semantic-success shadow-[0_0_10px_rgba(29,209,161,0.5)] animate-pulse-node' : 'bg-white/20'}`} />
              <span className="font-bold text-white text-sm">{is2faEnabled ? '2FA is Enabled' : '2FA is Disabled'}</span>
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
              className="px-6 py-3 rounded-xl font-bold text-ink bg-white hover:bg-neutral-200 transition-all text-sm shadow-[0_0_15px_rgba(255,255,255,0.1)]"
            >
              Enable 2FA
            </button>
          )}
        </div>
      </div>

      {/* 3. Active Sessions */}
      <div className="glass-inner rounded-2xl border border-white/10 shadow-xl overflow-hidden">
        <div className="p-8 border-b border-white/10">
          <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-teal" />
            Active Sessions
          </h2>
          <p className="text-white/60 text-sm">
            View and manage devices currently logged into your account.
          </p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#09090b]/80 border-b border-white/10 text-white/50 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-8 py-4">Device & Browser</th>
                <th className="px-6 py-4">Location & IP</th>
                <th className="px-6 py-4">Last Active</th>
                <th className="px-8 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-white/80">
              {activeSessions.length === 0 ? (
                <tr><td colSpan={4} className="px-8 py-6 text-white/40 text-center">No active sessions.</td></tr>
              ) : activeSessions.map(session => (
                <tr key={session.id} className="hover:bg-white/5 transition-colors group">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      {session.device.includes('iPhone') || session.device.includes('Android') ? (
                        <Smartphone className="w-5 h-5 text-white/40" />
                      ) : (
                        <Laptop className="w-5 h-5 text-white/40" />
                      )}
                      <div>
                        <div className="font-bold text-white flex items-center gap-2">
                          {session.device} 
                          {session.isCurrent && <span className="bg-teal/20 text-teal text-[9px] px-2 py-0.5 rounded uppercase tracking-widest">Current</span>}
                        </div>
                        <div className="text-xs text-white/40">{session.browser}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="text-white">{session.location}</div>
                    <div className="text-xs text-white/40 font-mono">{session.ip}</div>
                  </td>
                  <td className="px-6 py-5 text-white/60 text-xs">
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

      {/* 2FA Setup Modal */}
      <AnimatePresence>
        {is2faModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIs2faModalOpen(false)}
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-[#09090b] border border-white/10 rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col"
            >
              {twoFaStep === 'scan' ? (
                <>
                  <div className="p-8 border-b border-white/10 text-center">
                    <h3 className="text-2xl font-bold text-white mb-2">Set up 2FA</h3>
                    <p className="text-sm text-white/50">Scan the QR code with your authenticator app.</p>
                  </div>
                  <div className="p-8 flex flex-col items-center">
                    {/* Fake QR Code */}
                    <div className="w-48 h-48 bg-white rounded-xl p-3 mb-6 relative overflow-hidden group">
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
                          className="w-full bg-[#111116] border border-white/10 rounded-xl py-3 px-4 text-center text-2xl tracking-[0.5em] font-mono text-white placeholder-white/10 focus:outline-none focus:border-teal/50 focus:ring-1 focus:ring-teal/50 transition-all"
                        />
                      </div>
                      <button 
                        type="submit"
                        disabled={otp.length < 6 || isVerifying}
                        className="w-full py-3 px-4 rounded-xl font-bold bg-white text-ink hover:bg-neutral-200 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.1)] flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isVerifying ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify & Continue'}
                      </button>
                    </form>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-8 border-b border-white/10 text-center">
                    <div className="w-16 h-16 bg-semantic-success/10 text-semantic-success rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">2FA Enabled Successfully</h3>
                    <p className="text-sm text-white/50">Save these recovery codes in a secure place. They are the only way to access your account if you lose your device.</p>
                  </div>
                  <div className="p-8">
                    <div className="grid grid-cols-2 gap-3 mb-6">
                      {recoveryCodes.map(code => (
                        <div key={code} className="bg-white/5 border border-white/10 rounded-lg py-2 px-3 flex items-center justify-between group">
                          <span className="font-mono text-sm tracking-wider text-white/80">{code}</span>
                          <button onClick={() => copyToClipboard(code)} className="text-white/30 hover:text-white opacity-0 group-hover:opacity-100 transition-all">
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button 
                      onClick={complete2faSetup}
                      className="w-full py-3 px-4 rounded-xl font-bold bg-white text-ink hover:bg-neutral-200 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.1)]"
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

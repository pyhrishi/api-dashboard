import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Shield, Plus, Key, EyeOff, ShieldAlert } from 'lucide-react';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';

interface PrivacySettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PrivacySettingsDrawer({ isOpen, onClose }: PrivacySettingsDrawerProps) {
  const { privacySettings, updatePrivacySettings, addRedactedKey, removeRedactedKey } = useStore();
  const [newKey, setNewKey] = useState('');

  const handleAddKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (newKey.trim()) {
      addRedactedKey(newKey.trim().toLowerCase());
      setNewKey('');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-overlay backdrop-blur-sm z-50"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 w-full max-w-md bg-[#0a0a0c] border-l border-border z-50 shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-border-subtle">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-fg">Privacy Engine</h2>
                  <p className="text-xs text-fg-muted">Data Redaction Settings</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 text-fg-muted hover:text-fg hover:bg-glass rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              
              {/* Auto PII Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-fg flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-emerald-500" />
                      Auto-Redact PII
                    </h3>
                    <p className="text-xs text-fg-muted mt-1">
                      Automatically detect and mask Credit Cards, SSNs, and Phone Numbers in any payload, regardless of the key name.
                    </p>
                  </div>
                  
                  <button
                    onClick={() => updatePrivacySettings({ autoRedactPII: !privacySettings.autoRedactPII })}
                    className={cn(
                      "relative w-12 h-6 rounded-full transition-colors flex-shrink-0",
                      privacySettings.autoRedactPII ? "bg-emerald-500" : "bg-white/10"
                    )}
                  >
                    <motion.div
                      className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm"
                      animate={{ x: privacySettings.autoRedactPII ? 24 : 0 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  </button>
                </div>
              </div>

              <div className="h-px bg-glass w-full" />

              {/* Custom Keys Section */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-fg flex items-center gap-2">
                    <Key className="w-4 h-4 text-emerald-500" />
                    Targeted Key Redaction
                  </h3>
                  <p className="text-xs text-fg-muted mt-1 mb-4">
                    Values associated with these specific JSON keys will always be masked in the UI logs.
                  </p>
                </div>

                <form onSubmit={handleAddKey} className="flex gap-2">
                  <input
                    type="text"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="e.g. 'stripe_token'"
                    className="flex-1 bg-glass border border-border rounded-xl px-4 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:border-emerald-500/50"
                  />
                  <button 
                    type="submit"
                    disabled={!newKey.trim()}
                    className="bg-emerald-500 text-black px-3 py-2 rounded-xl font-bold disabled:opacity-50 flex items-center justify-center transition-colors hover:bg-emerald-400"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </form>

                <div className="pt-4 space-y-2">
                  <AnimatePresence>
                    {privacySettings.customKeys.map(key => (
                      <motion.div
                        key={key}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex items-center justify-between bg-white/[0.02] border border-border-subtle p-3 rounded-xl group"
                      >
                        <div className="flex items-center gap-2">
                          <EyeOff className="w-3.5 h-3.5 text-fg-subtle" />
                          <span className="font-mono text-sm text-fg">{key}</span>
                        </div>
                        <button
                          onClick={() => removeRedactedKey(key)}
                          className="text-fg-subtle hover:text-semantic-error transition-colors p-1"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  
                  {privacySettings.customKeys.length === 0 && (
                    <div className="text-center p-6 bg-glass rounded-xl border border-border-subtle border-dashed">
                      <p className="text-xs text-fg-muted">No targeted keys configured.</p>
                    </div>
                  )}
                </div>
              </div>

            </div>
            
            {/* Footer */}
            <div className="p-6 border-t border-border-subtle bg-[#121212]">
              <p className="text-[10px] text-fg-subtle flex items-center gap-2 justify-center">
                <Shield className="w-3 h-3" /> Redaction occurs on the client UI level.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

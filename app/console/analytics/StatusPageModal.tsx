'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Globe, Sun, Moon, Copy, ExternalLink, Activity, CheckCircle2 } from 'lucide-react';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { useState } from 'react';

export function StatusPageModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { statusPageConfig, updateStatusPage } = useStore();
  const [copied, setCopied] = useState(false);

  const url = `http://localhost:3000/status/${statusPageConfig.orgId}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-overlay backdrop-blur-sm"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-xl bg-[#14131E] border border-border rounded-2xl p-6 shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-fg flex items-center gap-2">
                  <Activity className="w-5 h-5 text-indigo-500" /> Public Status Page
                </h2>
                <p className="text-fg-muted text-sm mt-1">Configure your public-facing API health dashboard.</p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-glass rounded-lg text-fg-muted hover:text-fg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Status Toggle */}
              <div className="flex items-center justify-between p-4 bg-glass border border-border-subtle rounded-xl">
                <div>
                  <div className="font-bold text-fg">Publish Status Page</div>
                  <div className="text-sm text-fg-muted">Make your metrics publicly accessible</div>
                </div>
                <button 
                  onClick={() => updateStatusPage({ isPublished: !statusPageConfig.isPublished })}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                    statusPageConfig.isPublished ? "bg-emerald-500" : "bg-white/10"
                  )}
                >
                  <span className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                    statusPageConfig.isPublished ? "translate-x-6" : "translate-x-1"
                  )} />
                </button>
              </div>

              {statusPageConfig.isPublished && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }} 
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-6"
                >
                  {/* Theme Selector */}
                  <div className="space-y-3">
                    <label className="text-sm font-bold text-fg">Page Theme</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => updateStatusPage({ theme: 'dark' })}
                        className={cn(
                          "flex items-center justify-center gap-2 p-3 rounded-xl border transition-all",
                          statusPageConfig.theme === 'dark' ? "bg-indigo-500/10 border-indigo-500 text-indigo-400" : "bg-glass border-border text-fg-muted hover:bg-glass-2"
                        )}
                      >
                        <Moon className="w-4 h-4" /> Dark Mode
                      </button>
                      <button 
                        onClick={() => updateStatusPage({ theme: 'light' })}
                        className={cn(
                          "flex items-center justify-center gap-2 p-3 rounded-xl border transition-all",
                          statusPageConfig.theme === 'light' ? "bg-emerald-500/10 border-emerald-500 text-emerald-400" : "bg-glass border-border text-fg-muted hover:bg-glass-2"
                        )}
                      >
                        <Sun className="w-4 h-4" /> Light Mode
                      </button>
                    </div>
                  </div>

                  {/* Public URL */}
                  <div className="space-y-3">
                    <label className="text-sm font-bold text-fg">Your Public URL</label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 flex items-center gap-2 bg-overlay border border-border rounded-xl px-4 py-3">
                        <Globe className="w-4 h-4 text-fg-muted" />
                        <span className="font-mono text-sm text-fg truncate select-all">{url}</span>
                      </div>
                      <button 
                        onClick={copyToClipboard}
                        className="p-3 bg-glass hover:bg-glass-2 border border-border rounded-xl text-fg transition-colors"
                      >
                        {copied ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Copy className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  <div className="pt-4 flex justify-end">
                    <a 
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-6 py-3 bg-white text-black font-bold rounded-xl flex items-center gap-2 hover:bg-white/90 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" /> View Live Page
                    </a>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

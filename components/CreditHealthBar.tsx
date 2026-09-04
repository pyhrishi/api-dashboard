'use client';

import { useState, useRef, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { BatteryWarning, ChevronDown, Zap, Server, ShieldCheck, Plus, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { RechargeModal } from './RechargeModal';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { track } from '@/lib/telemetry';

export function CreditHealthBar() {
  const { creditBalance, currentQuota, apiQuota, autoRechargeEnabled, toggleAutoRecharge, environment } = useStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const quotaPercentage = Math.min(100, Math.max(0, (currentQuota / apiQuota) * 100));
  const isQuotaDanger = quotaPercentage > 90;
  const isQuotaWarning = quotaPercentage > 75;
  
  const isCreditDanger = creditBalance < 1000;

  // PLG: crossing the low-credit threshold is an upgrade moment — measure it.
  useEffect(() => {
    if (isCreditDanger) {
      track('quota_threshold_reached', { threshold: 1000, surface: 'credit-health-bar' });
      track('upgrade_prompt_shown', { surface: 'credit-health-bar', reason: 'low-credits' });
    }
  }, [isCreditDanger]);

  // Format numbers nicely
  const formatCompact = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  };

  const circumference = 2 * Math.PI * 14; // r=14
  const strokeDashoffset = circumference - (quotaPercentage / 100) * circumference;

  return (
    <>
      <div className="relative z-50" ref={dropdownRef}>
        {/* Collapsed Pill Button */}
        <motion.button 
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "relative flex items-center gap-3 p-1.5 pr-3 rounded-full border transition-all duration-300 group shadow-lg",
            isOpen ? "bg-white/10 border-border-strong" : "bg-surface-2 border-border hover:border-border-strong hover:bg-glass",
            isQuotaDanger && !isOpen && "border-semantic-error/30 bg-semantic-error/10 hover:bg-semantic-error/20"
          )}
          whileTap={{ scale: 0.98 }}
        >
          {/* Circular SVG Gauge */}
          <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="14" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
              <motion.circle 
                cx="16" cy="16" r="14" fill="none" 
                stroke={isQuotaDanger ? "#F04438" : isQuotaWarning ? "#F5A623" : "#46BDC6"} 
                strokeWidth="3"
                strokeDasharray={circumference}
                animate={{ strokeDashoffset }}
                transition={{ duration: 1, type: "spring", bounce: 0.1 }}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              {isQuotaDanger ? (
                <BatteryWarning className="w-3.5 h-3.5 text-semantic-error animate-pulse" />
              ) : (
                <Server className={cn("w-3.5 h-3.5", isQuotaWarning ? "text-[#F5A623]" : "text-[#46BDC6]")} />
              )}
            </div>
            
            {/* Glow effect when danger */}
            {isQuotaDanger && (
              <div className="absolute inset-0 rounded-full bg-semantic-error/20 blur-md -z-10 animate-pulse" />
            )}
          </div>

          <div className="flex flex-col items-start min-w-0 mr-1 hidden sm:flex">
            <span className={cn(
              "text-[10px] font-black uppercase tracking-widest leading-none mb-1",
              isQuotaDanger ? "text-semantic-error" : "text-fg-muted"
            )}>
              {isQuotaDanger ? 'Quota Critical' : 'Enterprise'}
            </span>
            <div className="flex items-center gap-1.5 leading-none">
              <span className="text-sm font-bold text-fg tracking-tight">{formatCompact(currentQuota)}</span>
              <span className="text-xs text-fg-muted font-medium">/ {formatCompact(apiQuota)}</span>
            </div>
          </div>

          <ChevronDown className={cn("w-4 h-4 text-fg-muted transition-transform duration-300", isOpen && "-rotate-180")} />
        </motion.button>

        {/* Expanded Popover */}
        <AnimatePresence>
          {isOpen && (
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="absolute right-0 top-full mt-3 w-80 bg-[#14131E]/95 backdrop-blur-2xl border border-border rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden origin-top-right"
            >
              {/* Header / Monthly Quota Section */}
              <div className="p-5 border-b border-border relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-teal via-indigo-500 to-purple-500 opacity-50" />
                
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-fg flex items-center gap-2">
                      Monthly API Quota
                      {environment === 'sandbox' && (
                        <span className="px-1.5 py-0.5 rounded bg-teal/10 text-teal text-[9px] uppercase tracking-widest">Sandbox</span>
                      )}
                    </h3>
                    <p className="text-xs text-fg-muted mt-1">Resets in 12 days</p>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-glass border border-border flex items-center justify-center shrink-0">
                    <Activity className="w-4 h-4 text-fg-muted" />
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <span className="text-2xl font-black tracking-tighter text-fg">{currentQuota.toLocaleString()}</span>
                    <span className="text-sm font-medium text-fg-muted">/ {apiQuota.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-2 bg-overlay rounded-full overflow-hidden relative shadow-inner">
                    <motion.div 
                      className={cn(
                        "absolute top-0 left-0 h-full rounded-full shadow-[0_0_15px_rgba(0,0,0,0.5)]",
                        isQuotaDanger ? "bg-semantic-error" : isQuotaWarning ? "bg-[#F5A623]" : "bg-gradient-to-r from-teal to-[#5D5FEF]"
                      )}
                      initial={{ width: 0 }}
                      animate={{ width: `${quotaPercentage}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-fg-muted pt-1">
                    <span>{quotaPercentage.toFixed(1)}% Used</span>
                    {isQuotaDanger && <span className="text-semantic-error animate-pulse">Action Required</span>}
                  </div>
                </div>
              </div>

              {/* Pay-as-you-go Section */}
              <div className="p-5 bg-black/20">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Zap className={cn("w-4 h-4", isCreditDanger ? "text-semantic-warning" : "text-amber-400")} />
                    <span className="text-sm font-bold text-fg">Prepaid Credits</span>
                  </div>
                  <span className={cn(
                    "text-sm font-mono font-bold px-2 py-1 rounded-md border",
                    isCreditDanger ? "bg-semantic-warning/10 text-semantic-warning border-semantic-warning/20" : "bg-amber-400/10 text-amber-400 border-amber-400/20"
                  )}>
                    {creditBalance.toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-fg-muted leading-relaxed mb-5">
                  Credits are automatically consumed for overages once your monthly API quota is exhausted (1 credit = 1 request).
                </p>

                {/* Auto Recharge Toggle */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-glass border border-border-subtle mb-5 hover:bg-glass-2 transition-colors cursor-pointer group" onClick={toggleAutoRecharge}>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-fg flex items-center gap-2">
                      Auto-Recharge
                      <ShieldCheck className={cn("w-3.5 h-3.5 transition-colors", autoRechargeEnabled ? "text-semantic-success" : "text-fg-subtle")} />
                    </span>
                    <span className="text-[10px] text-fg-muted mt-0.5">Top up $10 when balance is 0</span>
                  </div>
                  
                  {/* Custom animated switch */}
                  <div className={cn(
                    "relative w-10 h-6 rounded-full transition-colors duration-300 border",
                    autoRechargeEnabled ? "bg-semantic-success/20 border-semantic-success/30" : "bg-overlay border-border"
                  )}>
                    <motion.div 
                      layout
                      className={cn(
                        "absolute top-1 bottom-1 w-4 rounded-full shadow-sm",
                        autoRechargeEnabled ? "bg-semantic-success" : "bg-white/40"
                      )}
                      initial={false}
                      animate={{
                        left: autoRechargeEnabled ? "calc(100% - 20px)" : "4px"
                      }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  </div>
                </div>

                {/* CTAs */}
                <div className="grid grid-cols-2 gap-3">
                  <Link href="/console/billing">
                    <button className="w-full py-2.5 rounded-lg border border-border bg-glass hover:bg-glass-2 text-fg text-xs font-bold transition-colors">
                      Manage Plan
                    </button>
                  </Link>
                  <button 
                    onClick={() => { setIsOpen(false); setIsModalOpen(true); track('upgrade_prompt_clicked', { surface: 'credit-health-bar' }); }}
                    className="w-full py-2.5 rounded-lg border border-transparent bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black text-xs font-black flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(245,166,35,0.3)]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Top Up
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      <RechargeModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}

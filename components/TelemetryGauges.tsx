'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Gauge, Zap, Server, ChevronRight, Settings, Plus, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore } from '@/lib/store';

// Helper for SVG polar coordinates
const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
  const angleInRadians = (angleInDegrees - 180) * Math.PI / 180.0;
  return {
    x: centerX + (radius * Math.cos(angleInRadians)),
    y: centerY + (radius * Math.sin(angleInRadians))
  };
};

const describeArc = (x: number, y: number, radius: number, startAngle: number, endAngle: number) => {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return [
    "M", start.x, start.y, 
    "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y
  ].join(" ");
};

export const TelemetryGauges = () => {
  // Global State
  const { 
    apiQuota, currentQuota, quotaAlertSettings,
    isSimulating429, toggleSimulate429, rateLimitBreaches, addRateLimitBreach, addQuota
  } = useStore();

  const maxRpm = 600;
  const maxQuota = apiQuota;
  const maxConcurrency = 50;

  // Local UI State
  const [rpm, setRpm] = useState(450);
  const [concurrency, setConcurrency] = useState(12);
  const [, setNow] = useState(Date.now());
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [isToppingUp, setIsToppingUp] = useState(false);

  // Simulation Loop
  useEffect(() => {
    const interval = setInterval(() => {
      // Fluctuate RPM slightly every 2 seconds
      setRpm(prev => {
        if (isSimulating429) {
          const breachedRpm = maxRpm + Math.floor(Math.random() * 50) + 10;
          if (Math.random() > 0.7) {
            addRateLimitBreach(breachedRpm);
          }
          return breachedRpm;
        }
        const jitter = Math.floor(Math.random() * 40) - 20; // -20 to +20
        return Math.max(10, Math.min(maxRpm, prev + jitter));
      });
      // Fluctuate Concurrency
      setConcurrency(prev => {
        const jitter = Math.floor(Math.random() * 4) - 2; // -2 to +2
        return Math.max(2, Math.min(maxConcurrency, prev + jitter));
      });
      setNow(Date.now());
    }, 2000);
    return () => clearInterval(interval);
  }, [isSimulating429, addRateLimitBreach, maxRpm, maxConcurrency]);

  // Calculations
  const rpmPercent = Math.min(100, (rpm / maxRpm) * 100);
  const quotaPercent = (currentQuota / maxQuota) * 100;
  const concPercent = (concurrency / maxConcurrency) * 100;

  // Dynamic Colors
  const getRpmColor = (p: number) => {
    if (p > 90) return '#DD1B24'; // Red
    if (p > 75) return '#F5A623'; // Amber
    return '#46BDC6'; // Teal
  };

  const getRpmGlow = (p: number) => {
    if (p > 90) return 'rgba(221,27,36,0.3)';
    if (p > 75) return 'rgba(245,166,35,0.3)';
    return 'rgba(70,189,198,0.3)';
  };

  const rpmColor = getRpmColor(rpmPercent);
  const rpmGlow = getRpmGlow(rpmPercent);
  
  const handleTopUp = async () => {
    setIsToppingUp(true);
    await new Promise(r => setTimeout(r, 1200));
    addQuota(1000000, 500); // 1M calls for $500
    setIsToppingUp(false);
    setIsTopUpOpen(false);
  };

  // SVG Arc Setup for RPM
  const radius = 80;
  const cx = 100;
  const cy = 100;
  const backgroundArc = describeArc(cx, cy, radius, 0, 180);
  const strokeLength = Math.PI * radius; // Half circle length

  return (
    <div className="glass-inner p-8 rounded-2xl border border-border relative overflow-hidden group">
      {/* Background ambient glow based on RPM severity */}
      <motion.div 
        animate={{ backgroundColor: rpmGlow, opacity: [0.1, 0.2, 0.1] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-40 -left-40 w-96 h-96 rounded-full blur-[100px] pointer-events-none transition-colors duration-1000" 
      />

      <div className="flex items-center justify-between mb-8 z-10 relative">
        <div>
          <h3 className="text-lg font-bold text-fg flex items-center gap-2">
            <Server className="w-5 h-5 text-teal" />
            System Telemetry & Quotas
          </h3>
          <p className="text-fg-muted text-xs mt-1">Live infrastructure utilization and rate limits.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-glass border border-border rounded-md text-[10px] font-black uppercase tracking-widest text-fg-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-semantic-success animate-pulse" />
            Live SYNC
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 z-10 relative">
        
        {/* 1. Live Rate Limit (RPM) Gauge */}
        <div className="bg-surface/40 rounded-xl p-6 border border-border-subtle relative flex flex-col items-center">
          <div className="w-full flex justify-between items-start mb-4">
            <span className="text-xs font-bold text-fg-muted uppercase tracking-widest flex items-center gap-1.5">
              <Gauge className="w-4 h-4 text-fg-muted" /> Rate Limit
            </span>
            <div className={cn("px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest transition-colors duration-500", rpmPercent > 90 ? "bg-semantic-error/20 text-semantic-error" : rpmPercent > 75 ? "bg-semantic-warning/20 text-semantic-warning" : "bg-teal/10 text-teal")}>
              {rpmPercent > 90 ? 'Critical' : rpmPercent > 75 ? 'Warning' : 'Healthy'}
            </div>
          </div>

          <div className="relative w-[200px] h-[110px] mt-2">
            <svg viewBox="0 0 200 110" className="w-full h-full overflow-visible">
              {/* Background Track */}
              <path 
                d={backgroundArc} 
                fill="none" 
                stroke="rgba(255,255,255,0.05)" 
                strokeWidth="16" 
                strokeLinecap="round" 
              />
              
              {/* Animated Value Arc */}
              <motion.path 
                d={backgroundArc}
                fill="none"
                stroke={rpmColor}
                strokeWidth="16"
                strokeLinecap="round"
                strokeDasharray={strokeLength}
                animate={{ 
                  strokeDashoffset: strokeLength - (strokeLength * (rpmPercent / 100)),
                  stroke: rpmColor
                }}
                transition={{ type: "spring", bounce: 0, duration: 1.5 }}
                className="transition-colors duration-500"
                style={{
                  filter: `drop-shadow(0 0 12px ${rpmGlow})`
                }}
              />
            </svg>
            
            {/* Center Value */}
            <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center">
              <motion.span 
                key={rpm}
                initial={{ opacity: 0.5, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-4xl font-display font-black text-fg leading-none"
              >
                {rpm}
              </motion.span>
              <span className="text-xs font-medium text-fg-muted mt-1">RPM / {maxRpm}</span>
            </div>
          </div>

          {/* Rate Limit Actions & Breaches */}
          <div className="w-full mt-4 pt-4 border-t border-border-subtle space-y-4">
            <label className="flex items-center justify-between cursor-pointer group">
              <span className="text-xs font-bold text-fg-muted group-hover:text-fg transition-colors">Simulate 429 Responses</span>
              <div className={cn("w-8 h-4 rounded-full relative transition-colors duration-300", isSimulating429 ? "bg-semantic-error" : "bg-white/10")}>
                <div className={cn("w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all duration-300", isSimulating429 ? "left-4.5 shadow-[0_0_10px_rgba(255,255,255,0.5)]" : "left-0.5")} />
              </div>
              <button 
                className="absolute inset-0 opacity-0 cursor-pointer" 
                onClick={toggleSimulate429} 
                title="Force sandbox keys to hit rate limits"
              />
            </label>
            
            {rateLimitBreaches.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-black text-semantic-error uppercase tracking-widest flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3" /> Recent Breaches
                </div>
                <div className="flex flex-col gap-1.5 h-20 overflow-y-auto pr-2 custom-scrollbar">
                  <AnimatePresence>
                    {rateLimitBreaches.map(b => (
                      <motion.div 
                        key={b.id} 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center justify-between bg-semantic-error/10 border border-semantic-error/20 rounded-md px-2 py-1"
                      >
                        <span className="text-[10px] font-mono text-semantic-error font-bold">{b.rpm} RPM</span>
                        <span className="text-[10px] text-fg-muted">{new Date(b.timestamp).toLocaleTimeString()}</span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 2. Monthly Quota Headroom */}
        <div className="bg-surface/40 rounded-xl p-6 border border-border-subtle relative flex flex-col justify-between">
          <div className="w-full flex justify-between items-start mb-6">
            <span className="text-xs font-bold text-fg-muted uppercase tracking-widest flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-fg-muted" /> Quota Headroom
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-fg-muted">{quotaPercent.toFixed(1)}% Used</span>
              <button 
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                className="p-1 hover:bg-glass-2 rounded-md transition-colors text-fg-muted hover:text-fg"
                title="Configure Threshold Alerts"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-end gap-2 mb-4">
              <span className="text-3xl font-display font-black text-fg">{(currentQuota / 1000000).toFixed(1)}M</span>
              <span className="text-sm font-medium text-fg-muted mb-1">/ {(maxQuota / 1000000).toFixed(1)}M Calls</span>
            </div>

            {/* Segmented Linear Gauge */}
            <div className="h-3 bg-glass rounded-full overflow-hidden flex gap-0.5">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${quotaPercent}%` }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                className="bg-indigo-500 h-full relative"
              >
                {/* Micro-shimmer effect */}
                <motion.div 
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                />
              </motion.div>
              {/* Projected burn indicator */}
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: '15%' }}
                transition={{ duration: 2, delay: 0.5, ease: "easeOut" }}
                className="bg-indigo-500/20 h-full border-r border-indigo-500 border-dashed"
                title="Projected usage by month end"
              />
            </div>
            <div className="flex justify-between mt-2 text-[10px] font-bold uppercase tracking-widest text-fg-subtle">
              <span>0</span>
              <span className="text-indigo-400">Projected: {((currentQuota * 1.25) / 1000000).toFixed(1)}M</span>
              <span>{(maxQuota / 1000000).toFixed(1)}M</span>
            </div>
          </div>
          
          {/* Action Area */}
          <div className="w-full mt-4 pt-4 border-t border-border-subtle">
            <AnimatePresence mode="wait">
              {!isTopUpOpen ? (
                <motion.button
                  key="btn"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsTopUpOpen(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 font-bold text-xs rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Credits
                </motion.button>
              ) : (
                <motion.div
                  key="flow"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-3 overflow-hidden"
                >
                  <div className="text-xs font-bold text-fg mb-1">+1.0M API Calls</div>
                  <div className="text-[10px] text-fg-muted mb-3">$500 one-time charge to existing card</div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setIsTopUpOpen(false)}
                      disabled={isToppingUp}
                      className="flex-1 px-2 py-1.5 bg-glass hover:bg-glass-2 text-fg text-xs font-bold rounded transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleTopUp}
                      disabled={isToppingUp}
                      className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-fg text-xs font-bold rounded transition-colors disabled:opacity-50"
                    >
                      {isToppingUp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Confirm"}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            
            {/* Threshold Settings Modal overlay inside the card */}
            <AnimatePresence>
              {isSettingsOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute inset-0 bg-surface/95 backdrop-blur-md rounded-xl p-6 z-20 flex flex-col border border-border"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-xs font-bold text-fg uppercase tracking-widest flex items-center gap-2">
                      <Settings className="w-4 h-4 text-fg-muted" /> Alert Settings
                    </h4>
                    <button onClick={() => setIsSettingsOpen(false)} className="text-fg-muted hover:text-fg">✕</button>
                  </div>
                  <div className="flex-1 space-y-4">
                    {quotaAlertSettings.map((alert, idx) => (
                      <div key={idx} className="bg-glass border border-border rounded-lg p-3">
                        <div className="text-xs font-bold text-fg mb-2">Notify at {alert.threshold}% Quota</div>
                        <div className="flex gap-2">
                          <span className={cn("px-2 py-1 text-[10px] font-bold rounded", alert.channels.includes('email') ? "bg-teal/20 text-teal" : "bg-glass text-fg-muted")}>Email</span>
                          <span className={cn("px-2 py-1 text-[10px] font-bold rounded", alert.channels.includes('slack') ? "bg-indigo-500/20 text-indigo-400" : "bg-glass text-fg-muted")}>Slack</span>
                        </div>
                      </div>
                    ))}
                    <button className="w-full py-2 border border-dashed border-border-strong text-fg-muted hover:text-fg hover:border-white/40 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1">
                      <Plus className="w-3.5 h-3.5" /> Add Threshold
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* 3. Concurrent Connections & Sockets */}
        <div className="bg-surface/40 rounded-xl p-6 border border-border-subtle relative flex flex-col justify-between">
          <div className="w-full flex justify-between items-start mb-6">
            <span className="text-xs font-bold text-fg-muted uppercase tracking-widest flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-fg-muted" /> Concurrency
            </span>
          </div>

          <div className="flex items-center gap-6">
            <div>
              <motion.span 
                key={concurrency}
                initial={{ opacity: 0.8, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-4xl font-display font-black text-fg leading-none block mb-1"
              >
                {concurrency}
              </motion.span>
              <span className="text-xs font-medium text-fg-muted">Active Sockets</span>
            </div>

            {/* Audio-visualizer style bars */}
            <div className="flex-1 flex items-end justify-between h-12 gap-1 relative">
              <div className="absolute bottom-0 left-0 w-full h-[1px] bg-white/10" />
              {Array.from({ length: 15 }).map((_, i) => {
                const isActive = (i / 15) * 100 <= concPercent;
                // Add some random flutter to active bars to make it feel alive
                const randomHeight = isActive ? Math.random() * 40 + 60 : Math.random() * 10 + 10;
                
                return (
                  <motion.div
                    key={i}
                    animate={{ height: `${randomHeight}%` }}
                    transition={{ duration: 0.5, ease: "easeInOut" }}
                    className={cn(
                      "w-full rounded-t-sm transition-colors duration-300",
                      isActive ? "bg-teal shadow-[0_0_8px_rgba(70,189,198,0.5)]" : "bg-glass"
                    )}
                  />
                );
              })}
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-border-subtle flex items-center justify-between group cursor-pointer">
            <span className="text-xs font-medium text-fg-muted group-hover:text-fg transition-colors">Max Allowed: {maxConcurrency}</span>
            <ChevronRight className="w-4 h-4 text-fg-muted group-hover:text-fg group-hover:translate-x-1 transition-all" />
          </div>
        </div>

      </div>
    </div>
  );
};

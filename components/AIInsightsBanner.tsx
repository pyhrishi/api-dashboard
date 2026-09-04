'use client';

import { useStore } from '@/lib/store';
import { generateInsights } from '@/lib/analytics-engine';
import { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ArrowRight, TrendingUp, AlertTriangle, Info } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line } from 'recharts';
import { cn } from '@/lib/utils';

export function AIInsightsBanner() {
  const { dailyMetrics, environment } = useStore();
  const [activeIndex, setActiveIndex] = useState(0);

  const insights = useMemo(() => {
    return generateInsights(dailyMetrics, environment);
  }, [dailyMetrics, environment]);

  useEffect(() => {
    if (insights.length <= 1) return;
    const interval = setInterval(() => {
      setActiveIndex(prev => (prev + 1) % insights.length);
    }, 8000); // Rotate every 8 seconds
    return () => clearInterval(interval);
  }, [insights.length]);

  if (insights.length === 0) return null;

  const current = insights[activeIndex];

  const getIcon = (type: string) => {
    if (type === 'success') return <TrendingUp className="w-5 h-5 text-emerald-400" />;
    if (type === 'warning') return <AlertTriangle className="w-5 h-5 text-amber-400" />;
    return <Info className="w-5 h-5 text-indigo-400" />;
  };

  const getBg = (type: string) => {
    if (type === 'success') return 'from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-500/20';
    if (type === 'warning') return 'from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/20';
    return 'from-indigo-500/10 via-indigo-500/5 to-transparent border-indigo-500/20';
  };

  return (
    <div className={cn("relative overflow-hidden rounded-2xl border bg-gradient-to-r p-6 mb-8 transition-colors duration-1000", getBg(current.type))}>
      {/* Decorative Sparkle */}
      <div className="absolute -top-6 -right-6 w-32 h-32 bg-glass rounded-full blur-3xl" />
      
      <div className="relative z-10 flex items-center justify-between gap-6">
        <div className="flex items-start gap-4 flex-1">
          <div className="mt-1 flex-shrink-0">
            <div className="relative">
              <Sparkles className="w-6 h-6 text-fg opacity-80" />
              <div className="absolute inset-0 blur-md bg-white/20" />
            </div>
          </div>
          <div className="flex-1">
            <div className="text-xs font-bold uppercase tracking-widest text-fg-muted mb-1 flex items-center gap-2">
              Zinbit AI Analysis
              {insights.length > 1 && (
                <span className="flex gap-1">
                  {insights.map((_, i) => (
                    <div key={i} className={cn("w-1.5 h-1.5 rounded-full transition-colors", i === activeIndex ? "bg-white" : "bg-white/20")} />
                  ))}
                </span>
              )}
            </div>
            
            <AnimatePresence mode="wait">
              <motion.div
                key={current.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="flex items-center gap-6"
              >
                <div className="flex items-center gap-3">
                  {getIcon(current.type)}
                  <p className="text-fg text-lg font-medium leading-tight">
                    {current.message}
                  </p>
                </div>

                {current.metricData && current.metricData.length > 0 && (
                  <div className="hidden lg:flex items-center gap-4 border-l border-border pl-6 h-12">
                    <div className="text-xs text-fg-muted uppercase tracking-widest">{current.metricLabel} (7d)</div>
                    <div className="w-24 h-8 opacity-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={current.metricData.map((val, i) => ({ val, i }))}>
                          <Line 
                            type="monotone" 
                            dataKey="val" 
                            stroke={current.type === 'success' ? '#34d399' : '#fbbf24'} 
                            strokeWidth={2} 
                            dot={false}
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

          </div>
        </div>

        <button className="flex-shrink-0 px-4 py-2 bg-white/10 hover:bg-white/20 border border-border rounded-xl text-sm font-bold text-fg transition-colors flex items-center gap-2 group">
          View Report <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  );
}

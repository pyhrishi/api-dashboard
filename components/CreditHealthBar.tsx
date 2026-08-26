'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { Battery, BatteryCharging, BatteryWarning, ChevronRight, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { RechargeModal } from './RechargeModal';

export function CreditHealthBar() {
  const { creditBalance } = useStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const MAX_CREDITS = 10000;
  const percentage = Math.min(100, Math.max(0, (creditBalance / MAX_CREDITS) * 100));
  
  const isDanger = percentage < 20;
  
  return (
    <>
      <div 
        onClick={() => setIsModalOpen(true)}
        className={`relative flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer group shadow-lg ${
          isDanger 
            ? 'bg-semantic-error/10 border-semantic-error/30 hover:bg-semantic-error/20' 
            : 'bg-[#111115] border-white/10 hover:border-teal/30 hover:bg-white/5'
        }`}
      >
        <div className="flex items-center gap-3 w-full">
          {/* Icon */}
          <div className={`p-1.5 rounded-lg flex-shrink-0 transition-colors ${
            isDanger ? 'bg-semantic-error/20 text-semantic-error animate-pulse' : 'bg-teal/10 text-teal'
          }`}>
            {isDanger ? <BatteryWarning className="w-4 h-4" /> : <Battery className="w-4 h-4" />}
          </div>
          
          {/* Bar & Text */}
          <div className="flex-1 min-w-0 pr-2">
            <div className="flex justify-between items-end mb-1.5">
              <span className={`text-xs font-bold ${isDanger ? 'text-semantic-error' : 'text-white'}`}>
                API Fuel
              </span>
              <span className="text-[10px] font-mono text-white/50">{creditBalance.toLocaleString()} left</span>
            </div>
            
            {/* Progress Track */}
            <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden relative">
              <motion.div 
                className={`absolute top-0 left-0 h-full rounded-full ${
                  isDanger ? 'bg-semantic-error shadow-[0_0_10px_rgba(255,71,87,0.8)]' : 'bg-teal shadow-[0_0_10px_rgba(70,189,198,0.5)]'
                }`}
                initial={{ width: 0 }}
                animate={{ width: `${percentage}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
          </div>
          
          <ChevronRight className={`w-4 h-4 flex-shrink-0 transition-transform group-hover:translate-x-1 ${
            isDanger ? 'text-semantic-error' : 'text-white/30 group-hover:text-teal'
          }`} />
        </div>
      </div>
      
      <RechargeModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}

'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, Zap, Trophy, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface PricingSliderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PricingSliderModal({ isOpen, onClose }: PricingSliderModalProps) {
  const router = useRouter();
  const [volume, setVolume] = useState(50000);
  const [isProcessing, setIsProcessing] = useState(false);

  // Gamification logic
  const getLevel = () => {
    if (volume >= 500000) return { name: 'Enterprise', discount: 25, color: 'text-[#C47B0A]' };
    if (volume >= 250000) return { name: 'Growth', discount: 15, color: 'text-[#1DD1A1]' };
    if (volume >= 100000) return { name: 'Pro', discount: 10, color: 'text-teal' };
    return { name: 'Starter', discount: 0, color: 'text-white' };
  };

  const level = getLevel();
  const basePricePer10k = 19;
  const rawPrice = (volume / 10000) * basePricePer10k;
  const finalPrice = Math.round(rawPrice * (1 - level.discount / 100));

  const handleContinue = async () => {
    setIsProcessing(true);
    await new Promise(r => setTimeout(r, 800));
    router.push(`/signup?plan=${level.name.toLowerCase()}&volume=${volume}`);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={onClose}
          />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-2xl bg-ink border border-white/10 rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col"
          >
            {/* Header */}
            <div className="p-8 pb-6 border-b border-white/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-teal/10 blur-[100px] rounded-full pointer-events-none" />
              <div className="relative z-10">
                <h2 className="text-3xl font-display font-black text-white mb-2">Build Your Plan</h2>
                <p className="text-white/60">Drag the slider to set your API volume. Higher volume unlocks steeper discounts.</p>
              </div>
              <button onClick={onClose} className="absolute top-6 right-6 p-2 text-white/40 hover:text-white transition-colors rounded-lg hover:bg-white/5 z-10">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Slider Section */}
            <div className="p-10 space-y-8 bg-gradient-to-b from-white/[0.02] to-transparent">
              {/* Level Badge */}
              <div className="flex justify-center">
                <motion.div 
                  key={level.name}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 font-bold ${level.color}`}
                >
                  <Trophy className="w-4 h-4" /> {level.name} Tier
                </motion.div>
              </div>

              {/* Slider */}
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <span className="text-sm font-bold text-white/40 uppercase tracking-widest">Monthly API Calls</span>
                  <span className="text-3xl font-black text-white font-mono">{volume.toLocaleString()}</span>
                </div>
                
                <input 
                  type="range" 
                  min="10000" 
                  max="1000000" 
                  step="10000"
                  value={volume} 
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-teal hover:accent-teal-ice transition-all"
                />
                
                <div className="flex justify-between text-xs font-mono text-white/30">
                  <span>10k</span>
                  <span>1M+</span>
                </div>
              </div>

              {/* Price Calculation */}
              <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-4 relative overflow-hidden">
                {level.discount > 0 && (
                  <div className="absolute top-0 right-0 bg-teal text-ink text-xs font-bold px-3 py-1 rounded-bl-lg flex items-center gap-1 shadow-lg">
                    <Zap className="w-3 h-3" /> {level.discount}% Volume Discount!
                  </div>
                )}
                
                <div className="flex justify-between items-center text-white/60">
                  <span>Base Price</span>
                  <span className={level.discount > 0 ? "line-through" : ""}>${rawPrice}/mo</span>
                </div>
                
                <div className="flex justify-between items-end pt-4 border-t border-white/5">
                  <span className="font-bold text-white">Your Price</span>
                  <div className="text-right">
                    <span className="text-4xl font-black text-white">${finalPrice}</span>
                    <span className="text-white/40 ml-1">/mo</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-6 bg-[#09090b]">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-white/60 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-teal" /> No hidden overage fees
                </div>
                <div className="flex items-center gap-2 text-white/60 text-sm">
                  <ShieldCheck className="w-4 h-4 text-teal" /> 14-day free trial included
                </div>
              </div>
              
              <button 
                onClick={handleContinue}
                disabled={isProcessing}
                className="w-full sm:w-auto px-10 py-4 rounded-full font-bold bg-white text-ink hover:bg-neutral-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-xl shadow-white/10"
              >
                {isProcessing ? 'Preparing Workspace...' : 'Continue to Signup'} <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

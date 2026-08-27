'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/lib/store';
import { X, Zap, ArrowRight, ShieldCheck, CreditCard } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useToast } from '@/components/Toast';
import { Portal } from './Portal';

interface RechargeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RechargeModal({ isOpen, onClose }: RechargeModalProps) {
  const { rechargeCredits, creditBalance } = useStore();
  const { success } = useToast();
  const [selectedPack, setSelectedPack] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const packs = [
    { id: 1, name: 'Starter Pack', credits: 5000, price: '$49', bonus: 0 },
    { id: 2, name: 'Pro Pack', credits: 25000, price: '$199', bonus: 5000, popular: true },
    { id: 3, name: 'Mega Pack', credits: 100000, price: '$499', bonus: 25000 },
  ];

  const handleRecharge = async () => {
    if (!selectedPack) return;
    const pack = packs.find(p => p.id === selectedPack);
    if (!pack) return;

    setIsProcessing(true);
    // Simulate network delay
    await new Promise(r => setTimeout(r, 1200));
    
    // Add credits
    rechargeCredits(pack.credits + pack.bonus);
    
    // Trigger gamified effects
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.6 },
      colors: ['#46BDC6', '#ffffff', '#1D1D21']
    });
    
    success(
      'Level Up! ⚡',
      `Successfully added ${(pack.credits + pack.bonus).toLocaleString()} credits to your account.`
    );

    setIsProcessing(false);
    onClose();
  };

  return (
    <Portal>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={onClose}
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-3xl bg-[#09090b] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col"
            >
              {/* Header */}
              <div className="p-8 border-b border-white/10 bg-gradient-to-r from-[#09090b] to-teal/10 flex items-start justify-between relative overflow-hidden">
                <div className="absolute right-0 top-0 w-64 h-64 bg-teal/20 blur-[100px] rounded-full pointer-events-none" />
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-teal/20 text-teal rounded-lg">
                      <Zap className="w-6 h-6" />
                    </div>
                    <h2 className="text-2xl font-bold text-white">Recharge Credits</h2>
                  </div>
                  <p className="text-white/60">Your current balance is <strong className="text-white">{creditBalance.toLocaleString()}</strong>. Top up your API fuel to keep building.</p>
                </div>
                <button onClick={onClose} className="p-2 text-white/40 hover:text-white transition-colors rounded-lg hover:bg-white/5 relative z-10">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {packs.map((pack) => (
                    <div 
                      key={pack.id}
                      onClick={() => setSelectedPack(pack.id)}
                      className={`relative p-6 rounded-2xl border-2 transition-all cursor-pointer ${
                        selectedPack === pack.id 
                          ? 'border-teal bg-teal/5 shadow-[0_0_30px_rgba(70,189,198,0.15)]' 
                          : 'border-white/10 bg-[#111115] hover:border-white/30 hover:bg-white/5'
                      }`}
                    >
                      {pack.popular && (
                        <div className="absolute -top-3 inset-x-0 flex justify-center">
                          <span className="bg-teal text-ink text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                            Most Popular
                          </span>
                        </div>
                      )}
                      
                      <div className="text-center mb-6 mt-2">
                        <h3 className="text-lg font-bold text-white mb-1">{pack.name}</h3>
                        <div className="text-3xl font-black text-white">{pack.price}</div>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-white/60">Base Credits</span>
                          <span className="font-mono font-bold text-white">{pack.credits.toLocaleString()}</span>
                        </div>
                        
                        {pack.bonus > 0 ? (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-teal font-medium flex items-center gap-1"><Zap className="w-3 h-3" /> Bonus</span>
                            <span className="font-mono font-bold text-teal">+{pack.bonus.toLocaleString()}</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between text-sm opacity-30">
                            <span className="text-white/60">Bonus</span>
                            <span className="font-mono font-bold text-white">0</span>
                          </div>
                        )}
                        
                        <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                          <span className="font-bold text-white">Total</span>
                          <span className="font-mono font-black text-white text-lg">{(pack.credits + pack.bonus).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-white/10 bg-[#111115] flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-white/40 text-sm">
                  <ShieldCheck className="w-4 h-4 text-teal" /> Secure Stripe checkout
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button 
                    onClick={onClose}
                    className="px-6 py-3 rounded-xl font-bold text-white hover:bg-white/10 transition-colors w-full sm:w-auto"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleRecharge}
                    disabled={!selectedPack || isProcessing}
                    className="px-8 py-3 rounded-xl font-bold bg-teal text-ink hover:bg-teal-ice transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 w-full sm:w-auto shadow-lg shadow-teal/20"
                  >
                    {isProcessing ? (
                      'Processing...'
                    ) : (
                      <>Checkout <CreditCard className="w-4 h-4" /></>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
}

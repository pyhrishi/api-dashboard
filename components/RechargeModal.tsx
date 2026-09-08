'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/lib/store';
import { X, Zap, ShieldCheck, CreditCard, AlertTriangle, RotateCw } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useToast } from '@/components/Toast';
import { Portal } from './Portal';
import { track } from '@/lib/telemetry';

interface RechargeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Saved payment methods. The expired card reproduces a real gateway decline
 * (`card_expired`) so the wallet top-up failure path — and the Growth KPI alert
 * "top-up failure rate >5% → Eng" — has a genuine source, not a toggle.
 */
const PAYMENT_METHODS = [
  { id: 'pm_visa_4242', brand: 'Visa', last4: '4242', expiry: '11/28', status: 'valid' as const },
  { id: 'pm_mc_0341', brand: 'Mastercard', last4: '0341', expiry: '08/26', status: 'expired' as const },
];

interface DeclineState {
  code: 'card_expired';
  message: string;
  requestId: string;
}

export function RechargeModal({ isOpen, onClose }: RechargeModalProps) {
  const { rechargeCredits, creditBalance } = useStore();
  const { success, error: toastError } = useToast();
  const [selectedPack, setSelectedPack] = useState<number | null>(null);
  const [paymentMethodId, setPaymentMethodId] = useState<string>(PAYMENT_METHODS[0].id);
  const [isProcessing, setIsProcessing] = useState(false);
  const [decline, setDecline] = useState<DeclineState | null>(null);

  const packs = [
    { id: 1, name: 'Starter Pack', credits: 5000, price: '$49', bonus: 0 },
    { id: 2, name: 'Pro Pack', credits: 25000, price: '$199', bonus: 5000, popular: true },
    { id: 3, name: 'Mega Pack', credits: 100000, price: '$499', bonus: 25000 },
  ];

  const handleRecharge = async () => {
    if (!selectedPack) return;
    const pack = packs.find(p => p.id === selectedPack);
    if (!pack) return;
    const method = PAYMENT_METHODS.find(m => m.id === paymentMethodId) ?? PAYMENT_METHODS[0];

    setIsProcessing(true);
    setDecline(null);
    // Simulate the gateway round-trip
    await new Promise(r => setTimeout(r, 1200));

    if (method.status === 'expired') {
      // A real decline: the gateway refuses the charge, nothing is credited.
      const requestId = `ch_${Date.now().toString(36)}`;
      setDecline({ code: 'card_expired', message: `${method.brand} •••• ${method.last4} expired ${method.expiry}. No charge was made.`, requestId });
      track('credits_recharge_failed', { pack: pack.id, credits: pack.credits, reason: 'card_expired', gateway: 'stripe', paymentMethod: method.id });
      toastError('Payment declined', `${method.brand} •••• ${method.last4} has expired — choose another card and retry.`);
      setIsProcessing(false);
      return;
    }

    // Add credits
    rechargeCredits(pack.credits + pack.bonus);
    track('credits_recharged', { pack: pack.id, credits: pack.credits, bonus: pack.bonus, paymentMethod: method.id });
    
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
              className="absolute inset-0 bg-overlay backdrop-blur-sm"
              onClick={onClose}
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-3xl bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col"
            >
              {/* Header */}
              <div className="p-8 border-b border-border bg-gradient-to-r from-surface-2 to-teal/10 flex items-start justify-between relative overflow-hidden">
                <div className="absolute right-0 top-0 w-64 h-64 bg-teal/20 blur-[100px] rounded-full pointer-events-none" />
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-teal/20 text-teal rounded-lg">
                      <Zap className="w-6 h-6" />
                    </div>
                    <h2 className="text-2xl font-bold text-fg">Recharge Credits</h2>
                  </div>
                  <p className="text-fg-muted">Your current balance is <strong className="text-fg">{creditBalance.toLocaleString()}</strong>. Top up your API fuel to keep building.</p>
                </div>
                <button type="button" onClick={onClose} aria-label="Close" className="p-2 text-fg-muted hover:text-fg transition-colors rounded-lg hover:bg-glass relative z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-8">
                <div role="radiogroup" aria-label="Credit pack" className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {packs.map((pack) => (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selectedPack === pack.id}
                      key={pack.id}
                      onClick={() => setSelectedPack(pack.id)}
                      className={`relative p-6 rounded-2xl border-2 transition-all cursor-pointer text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 ${
                        selectedPack === pack.id
                          ? 'border-teal bg-teal/5 shadow-lg shadow-teal/15'
                          : 'border-border bg-surface-2 hover:border-teal/40 hover:bg-glass'
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
                        <h3 className="text-lg font-bold text-fg mb-1">{pack.name}</h3>
                        <div className="text-3xl font-black text-fg">{pack.price}</div>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-fg-muted">Base Credits</span>
                          <span className="font-mono font-bold text-fg">{pack.credits.toLocaleString()}</span>
                        </div>
                        
                        {pack.bonus > 0 ? (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-teal font-medium flex items-center gap-1"><Zap className="w-3 h-3" /> Bonus</span>
                            <span className="font-mono font-bold text-teal">+{pack.bonus.toLocaleString()}</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between text-sm opacity-30">
                            <span className="text-fg-muted">Bonus</span>
                            <span className="font-mono font-bold text-fg">0</span>
                          </div>
                        )}
                        
                        <div className="pt-4 border-t border-border flex items-center justify-between">
                          <span className="font-bold text-fg">Total</span>
                          <span className="font-mono font-black text-fg text-lg">{(pack.credits + pack.bonus).toLocaleString()}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment method + decline state */}
              <div className="px-8 pb-6 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-[11px] font-black uppercase tracking-widest text-fg-muted">Payment method</span>
                  <span className="text-[11px] text-fg-subtle">Saved cards on this organization</span>
                </div>
                <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {PAYMENT_METHODS.map((m) => {
                    const selected = m.id === paymentMethodId;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => { setPaymentMethodId(m.id); setDecline(null); }}
                        className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 ${selected ? 'border-teal bg-teal/5' : 'border-border bg-surface-2 hover:border-teal/40'}`}
                      >
                        <CreditCard className={`w-4 h-4 shrink-0 ${selected ? 'text-teal' : 'text-fg-muted'}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-fg">{m.brand} •••• {m.last4}</span>
                          <span className={`block text-[11px] ${m.status === 'expired' ? 'text-semantic-error' : 'text-fg-muted'}`}>{m.status === 'expired' ? `Expired ${m.expiry}` : `Expires ${m.expiry}`}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <AnimatePresence>
                  {decline && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      role="alert"
                      className="rounded-xl border border-semantic-error/30 bg-semantic-error/5 p-4 flex items-start gap-3"
                    >
                      <AlertTriangle className="w-4 h-4 text-semantic-error shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1 text-sm">
                        <div className="font-bold text-fg">Payment declined <span className="font-mono text-[11px] text-fg-muted">{decline.code} · {decline.requestId}</span></div>
                        <p className="text-fg-muted text-[12px] mt-0.5">{decline.message} Pick the other card and retry — your credits are unchanged.</p>
                      </div>
                      <button type="button" onClick={() => { setPaymentMethodId(PAYMENT_METHODS[0].id); setDecline(null); }} className="text-[12px] font-bold text-teal hover:underline inline-flex items-center gap-1 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 rounded">
                        <RotateCw className="w-3 h-3" /> Use Visa •••• 4242
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-border bg-surface-2 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-fg-muted text-sm">
                  <ShieldCheck className="w-4 h-4 text-teal" /> Secure Stripe checkout
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button 
                    onClick={onClose}
                    className="px-6 py-3 rounded-xl font-bold text-fg hover:bg-glass-2 transition-colors w-full sm:w-auto"
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

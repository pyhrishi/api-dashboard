'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/lib/store';
import RequestBuilder from './RequestBuilder';
import { motion, AnimatePresence } from 'framer-motion';
import { PartyPopper, ArrowRight, Code2 } from 'lucide-react';
import { Endpoint } from '@/data/endpoints';
import { track } from '@/lib/telemetry';

export function FirstCallWizard() {
  const { isFirstCallMade, markFirstCallMade, activeKeys, environment, logApiRequest } = useStore();
  const [showCelebration, setShowCelebration] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  const apiKey = activeKeys[0]?.key || 'sk_test_demo_key';

  // If we load and it's already made (from a previous session), just hide it
  useEffect(() => {
    if (isFirstCallMade && !showCelebration) {
      setIsDismissed(true);
    }
  }, [isFirstCallMade, showCelebration]);

  // If already dismissed, don't render anything
  if (isFirstCallMade && !showCelebration && isDismissed) {
    return null;
  }
  
  if (isDismissed) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleExecute = (result: { endpoint: Endpoint; statusCode: number; responseTime: number; response: any; }) => {
    // Record the first call in the shared log stream so it immediately shows up
    // in the console Logs / Analytics (the golden-path spine).
    logApiRequest({
      id: `req_${Math.random().toString(36).substring(2, 9)}`,
      environment,
      timestamp: new Date().toISOString(),
      method: result.endpoint.method,
      path: result.endpoint.path,
      status: result.statusCode,
      duration: result.responseTime,
      ip: '203.0.113.10',
      request: { headers: { 'Authorization': `Bearer ${apiKey}`, 'User-Agent': 'node-fetch/1.0' }, parameters: {} },
      response: result.response,
    });

    if (result.statusCode >= 200 && result.statusCode < 300) {
      // Small delay to let them see the response in the builder
      setTimeout(() => {
        markFirstCallMade({
          endpoint: result.endpoint.id,
          method: result.endpoint.method,
          statusCode: result.statusCode,
          responseTime: result.responseTime,
          response: result.response
        });
        track('first_call_made', { endpoint: result.endpoint.id, status: result.statusCode, responseTimeMs: result.responseTime });
        setShowCelebration(true);
      }, 1500);
    }
  };

  return (
    <AnimatePresence mode="wait">
      {!showCelebration ? (
        <motion.div 
          key="wizard"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="bg-gradient-to-br from-[#1D1C39] to-[#2A284D] rounded-3xl p-1 shadow-2xl mb-12 relative overflow-hidden group"
        >
          {/* Decorative background elements */}
          <div className="absolute top-0 right-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 pointer-events-none mix-blend-overlay" />
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-teal/30 rounded-full blur-[100px] pointer-events-none group-hover:bg-teal/40 transition-colors duration-700" />
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#5D5FEF]/30 rounded-full blur-[100px] pointer-events-none group-hover:bg-[#5D5FEF]/40 transition-colors duration-700" />

          <div className="bg-[#1D1C39]/80 backdrop-blur-xl rounded-[22px] p-8 md:p-10 relative z-10 border border-white/5">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-10">
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.2 }}
                  className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-teal/20 to-teal/5 border border-teal/20 mb-8 shadow-inner"
                >
                  <Code2 className="w-7 h-7 text-teal" />
                </motion.div>
                <h2 className="text-3xl md:text-4xl font-extrabold mb-3 text-white tracking-tight">Time for your first API call.</h2>
                <p className="text-white/60 font-medium text-lg max-w-2xl mx-auto">
                  Experience the speed and power of our enrichment engine. Choose an endpoint, configure parameters, and see real-time data in action.
                </p>
              </div>

              <div className="bg-white rounded-2xl shadow-2xl p-2 md:p-4 text-ink ring-1 ring-black/5 transform transition-transform duration-500 hover:scale-[1.01]">
                <RequestBuilder 
                  onExecute={handleExecute} 
                  apiKey={apiKey}
                  mode="full"
                />
              </div>
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="celebration"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="bg-white rounded-3xl p-12 mb-12 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] border border-neutral-100 text-center relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-teal/5 via-transparent to-transparent pointer-events-none" />
          
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", bounce: 0.6, delay: 0.1, duration: 0.8 }}
            className="w-24 h-24 mx-auto bg-gradient-to-br from-teal/20 to-teal/5 border border-teal/10 rounded-full flex items-center justify-center mb-8 shadow-inner"
          >
            <PartyPopper className="w-12 h-12 text-teal" />
          </motion.div>
          
          <motion.h2 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-4xl font-extrabold text-neutral-900 mb-4 tracking-tight"
          >
            Boom! Request Successful.
          </motion.h2>
          
          <motion.p 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-neutral-500 font-medium text-lg max-w-lg mx-auto mb-10"
          >
            You just made your first successful API call. Your integration is ready to scale. Welcome to the future of data enrichment.
          </motion.p>

          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsDismissed(true)}
            className="inline-flex items-center gap-3 bg-neutral-900 text-white px-8 py-4 rounded-xl font-bold hover:bg-neutral-800 transition-all shadow-xl shadow-neutral-900/20 text-lg"
          >
            Continue to Dashboard
            <ArrowRight className="w-5 h-5" />
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

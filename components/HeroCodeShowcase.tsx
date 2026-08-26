'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const scenarios = [
  {
    name: 'Reverse Email Lookup',
    request: `curl -X POST https://api.zintlr.com/b2b2b/v1/email-to-phone/ \\
  -H "Access-Token: sk_live_••••••" \\
  -d '{"emails": ["ceo@example.com"]}'`,
    response: `{
  "status": "success",
  "data": [
    {
      "email": "ceo@example.com",
      "person_name": "Jane Doe",
      "company": "Example Inc",
      "direct_dial": "+1 (555) 123-4567",
      "confidence_score": 0.99
    }
  ]
}`
  },
  {
    name: 'Company Verification',
    request: `curl -X POST https://api.zintlr.com/b2b2b/v1/domain-to-cin/ \\
  -H "Access-Token: sk_live_••••••" \\
  -d '{"domain_list": ["example.in"]}'`,
    response: `{
  "status": "success",
  "data": [
    {
      "domain": "example.in",
      "cin": "U72900KA2021PTC142000",
      "legal_name": "Example India Pvt Ltd",
      "status": "Active",
      "paid_up_capital": "₹1,00,00,000"
    }
  ]
}`
  }
];

export function HeroCodeShowcase() {
  const [mounted, setMounted] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [typedRequest, setTypedRequest] = useState('');
  const [showResponse, setShowResponse] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    
    let isCancelled = false;
    
    const runTyping = async () => {
      const currentReq = scenarios[activeIdx].request;
      
      // Reset state for new scenario
      setTypedRequest('');
      setShowResponse(false);
      
      // Typing effect
      for (let i = 0; i <= currentReq.length; i++) {
        if (isCancelled) return;
        setTypedRequest(currentReq.substring(0, i));
        await new Promise(r => setTimeout(r, 20 + Math.random() * 30));
      }
      
      if (isCancelled) return;
      // Wait a moment after typing
      await new Promise(r => setTimeout(r, 500));
      
      if (isCancelled) return;
      // Show response
      setShowResponse(true);
      
      if (isCancelled) return;
      // Wait before next scenario
      await new Promise(r => setTimeout(r, 4000));
      
      if (isCancelled) return;
      // Advance to next scenario
      setActiveIdx((prev) => (prev + 1) % scenarios.length);
    };

    runTyping();
    
    return () => {
      isCancelled = true;
    };
  }, [activeIdx, mounted]);

  if (!mounted) {
    return (
      <div className="w-full h-full min-h-[400px] flex flex-col font-mono text-sm shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
        <div className="flex items-center px-4 py-3 bg-[#1A1924] border-b border-white/10 rounded-t-2xl">
          <div className="flex space-x-2">
            <div className="w-3 h-3 rounded-full bg-semantic-error/80" />
            <div className="w-3 h-3 rounded-full bg-semantic-warning/80" />
            <div className="w-3 h-3 rounded-full bg-semantic-success/80" />
          </div>
          <div className="mx-auto text-xs font-bold text-white/40 tracking-wider">
            Loading...
          </div>
        </div>
        <div className="flex-1 bg-[#09090B] p-5 rounded-b-2xl flex flex-col relative overflow-hidden text-left border border-white/10 border-t-0" />
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[400px] flex flex-col font-mono text-sm shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
      {/* macOS Window Header */}
      <div className="flex items-center px-4 py-3 bg-[#1A1924] border-b border-white/10 rounded-t-2xl">
        <div className="flex space-x-2">
          <div className="w-3 h-3 rounded-full bg-semantic-error/80" />
          <div className="w-3 h-3 rounded-full bg-semantic-warning/80" />
          <div className="w-3 h-3 rounded-full bg-semantic-success/80" />
        </div>
        <div className="mx-auto text-xs font-bold text-white/40 tracking-wider">
          {scenarios[activeIdx].name}
        </div>
      </div>
      
      {/* Editor Body */}
      <div className="flex-1 bg-[#09090B] p-5 rounded-b-2xl flex flex-col relative overflow-hidden text-left border border-white/10 border-t-0">
        
        {/* Abstract glow */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-teal/20 blur-[50px] -z-10 pointer-events-none" />

        {/* Request */}
        <div className="mb-6">
          <div className="text-white/40 text-xs font-bold mb-2 uppercase tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
            Request
          </div>
          <div className="text-white/90 whitespace-pre-wrap leading-relaxed">
            <span className="text-brand">➜</span> <span className="text-teal">~</span> {typedRequest}
            {!showResponse && <span className="inline-block w-2 h-4 bg-white/70 ml-1 animate-pulse align-middle" />}
          </div>
        </div>

        {/* Response */}
        <div className="flex-1 min-h-[200px]">
          <AnimatePresence>
            {showResponse && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
              >
                <div className="text-white/40 text-xs font-bold mb-2 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-semantic-success" />
                  Response <span className="text-[10px] text-white/30 ml-2 font-normal">200 OK • 120ms</span>
                </div>
                <div className="bg-[#111115] rounded-xl p-4 border border-white/5 shadow-inner">
                  <pre className="text-white/70 overflow-hidden text-[13px] leading-relaxed">
                    <code dangerouslySetInnerHTML={{ 
                      __html: scenarios[activeIdx].response
                        .replace(/"(.*?)":/g, '<span class="text-teal">"$1"</span>:')
                        .replace(/"(.*?)"/g, (match, p1) => match.includes(':') ? match : `<span class="text-teal-ice">"${p1}"</span>`) 
                        .replace(/\b(\d+\.?\d*)\b/g, '<span class="text-semantic-success">$1</span>')
                    }} />
                  </pre>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

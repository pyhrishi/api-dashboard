'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, ShieldCheck, Zap, Database, Copy, Check, Loader2 } from 'lucide-react';

type ApiExample = {
  id: string;
  name: string;
  icon: React.ElementType;
  method: string;
  endpoint: string;
  payload: string;
  response: string;
};

const examples: ApiExample[] = [
  {
    id: 'verify-cin',
    name: 'Verify CIN',
    icon: ShieldCheck,
    method: 'POST',
    endpoint: '/v1/corporate/verify',
    payload: `{\n  "cin": "L72200MH1989PLC053666"\n}`,
    response: `{\n  "status": "success",\n  "data": {\n    "company_name": "TATA CONSULTANCY SERVICES LIMITED",\n    "status": "Active",\n    "class": "Public",\n    "category": "Company limited by Shares",\n    "incorporation_date": "1989-01-19",\n    "authorized_capital": 45000000000,\n    "paid_up_capital": 3659051373\n  }\n}`
  },
  {
    id: 'enrich-profile',
    name: 'Enrich Profile',
    icon: Zap,
    method: 'GET',
    endpoint: '/v1/enrich/person?email=john.doe@stripe.com',
    payload: `// No payload required for GET requests`,
    response: `{\n  "status": "success",\n  "data": {\n    "name": "John Doe",\n    "title": "VP of Engineering",\n    "company": "Stripe",\n    "linkedin_url": "https://linkedin.com/in/johndoe",\n    "direct_dial": "+1 (415) 555-0198",\n    "confidence_score": 0.99\n  }\n}`
  },
  {
    id: 'fetch-gst',
    name: 'Fetch GST Details',
    icon: Database,
    method: 'POST',
    endpoint: '/v1/tax/gst',
    payload: `{\n  "gstin": "27AAACT0268S1ZT"\n}`,
    response: `{\n  "status": "success",\n  "data": {\n    "legal_name": "TATA CONSULTANCY SERVICES LIMITED",\n    "trade_name": "TATA CONSULTANCY SERVICES",\n    "taxpayer_type": "Regular",\n    "gst_status": "Active",\n    "registration_date": "2017-07-01"\n  }\n}`
  }
];

export function InteractiveApiPlayground() {
  const [activeId, setActiveId] = useState<string>(examples[0].id);
  const [isLoading, setIsLoading] = useState(false);
  const [showResponse, setShowResponse] = useState(true);
  const [copied, setCopied] = useState(false);

  const activeExample = examples.find((e) => e.id === activeId) || examples[0];

  const handleTabClick = (id: string) => {
    if (id === activeId) return;
    setActiveId(id);
    setIsLoading(true);
    setShowResponse(false);
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isLoading) {
      timer = setTimeout(() => {
        setIsLoading(false);
        setShowResponse(true);
      }, 800); // Simulate API latency
    }
    return () => clearTimeout(timer);
  }, [isLoading]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(activeExample.response);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#0A0A0C] rounded-2xl border border-white/10 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] overflow-hidden font-mono text-sm relative">
      
      {/* MAC OS TOP BAR */}
      <div className="flex items-center justify-between px-4 py-3 bg-white/5 border-b border-white/10">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <div className="text-white/40 text-xs tracking-wider uppercase font-semibold flex items-center gap-2">
          <Terminal className="w-4 h-4" /> api.zinbit.zintlr.com
        </div>
        <div className="w-16" />
      </div>

      {/* INTERACTIVE TABS */}
      <div className="flex flex-col sm:flex-row bg-white/5 border-b border-white/10 p-2 gap-2 overflow-x-auto no-scrollbar">
        {examples.map((example) => {
          const Icon = example.icon;
          const isActive = example.id === activeId;
          return (
            <button
              key={example.id}
              onClick={() => handleTabClick(example.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                isActive 
                  ? 'bg-teal/20 text-teal border border-teal/30 shadow-[0_0_15px_rgba(70,189,198,0.2)]' 
                  : 'text-white/50 hover:bg-white/10 hover:text-white/80 border border-transparent'
              }`}
            >
              <Icon className="w-4 h-4" /> {example.name}
            </button>
          );
        })}
      </div>

      {/* API INTERFACE */}
      <div className="flex-1 overflow-hidden flex flex-col">
        
        {/* REQUEST SECTION */}
        <div className="p-4 border-b border-white/10 bg-black/40">
          <div className="flex items-center gap-3 mb-4">
            <span className={`px-2 py-1 rounded text-xs font-bold ${activeExample.method === 'GET' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}`}>
              {activeExample.method}
            </span>
            <span className="text-white/80 break-all">https://api.zinbit.zintlr.com{activeExample.endpoint}</span>
          </div>
          
          <div className="text-white/50 text-xs mb-2">Request Body</div>
          <pre className="text-white/80 overflow-x-auto p-3 bg-white/5 rounded-xl border border-white/5">
            {activeExample.payload}
          </pre>
        </div>

        {/* RESPONSE SECTION */}
        <div className="flex-1 p-4 relative bg-[#09090B]">
          <div className="flex items-center justify-between mb-2">
             <div className="text-white/50 text-xs">Response</div>
             {showResponse && (
               <button 
                onClick={copyToClipboard}
                className="text-white/40 hover:text-white transition-colors"
               >
                 {copied ? <Check className="w-4 h-4 text-teal" /> : <Copy className="w-4 h-4" />}
               </button>
             )}
          </div>
          
          <div className="h-full">
            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div 
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex flex-col items-center justify-center text-teal/60 gap-3"
                >
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="text-xs tracking-widest uppercase">Executing Request...</span>
                </motion.div>
              ) : (
                <motion.pre
                  key="response"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="text-teal-ice h-full overflow-y-auto pb-8"
                >
                  {activeExample.response}
                </motion.pre>
              )}
            </AnimatePresence>
          </div>
        </div>

      </div>
    </div>
  );
}

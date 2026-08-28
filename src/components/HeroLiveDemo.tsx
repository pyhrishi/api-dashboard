'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Loader2, Code2, Terminal, Database, ArrowRight, Zap, CheckCircle2, AlertCircle, Coins } from 'lucide-react';
import { cn } from '@/lib/utils';

type EndpointType = 'domain' | 'email' | 'cin';

interface EndpointConfig {
  id: EndpointType;
  label: string;
  placeholder: string;
  defaultInput: string;
  mockResponse: any;
  method: string;
  path: string;
}

const ENDPOINTS: Record<EndpointType, EndpointConfig> = {
  domain: {
    id: 'domain',
    label: 'Enrich Domain',
    placeholder: 'Enter domain (e.g., stripe.com)',
    defaultInput: 'stripe.com',
    method: 'GET',
    path: '/v1/companies/enrich?domain=',
    mockResponse: {
      id: "comp_9238472",
      name: "Stripe",
      legal_name: "Stripe, Inc.",
      domain: "stripe.com",
      industry: "Financial Services",
      metrics: {
        employees: 7000,
        estimated_revenue: "$10B+"
      },
      headquarters: {
        city: "South San Francisco",
        country: "USA"
      }
    }
  },
  email: {
    id: 'email',
    label: 'Lookup Email',
    placeholder: 'Enter corporate email...',
    defaultInput: 'john@stripe.com',
    method: 'GET',
    path: '/v1/people/lookup?email=',
    mockResponse: {
      id: "usr_445892",
      first_name: "John",
      last_name: "Collison",
      job_title: "President",
      company: {
        name: "Stripe",
        domain: "stripe.com"
      },
      contact: {
        email: "john@stripe.com",
        email_verified: true,
      }
    }
  },
  cin: {
    id: 'cin',
    label: 'Verify CIN',
    placeholder: 'Enter MCA CIN...',
    defaultInput: 'U72900KA2021PTC',
    method: 'GET',
    path: '/v1/entities/verify?cin=',
    mockResponse: {
      cin: "U72900KA2021PTC",
      entity_name: "TECHCORP INDIA",
      status: "Active",
      incorporation_date: "2021-04-12",
      directors: [
        { name: "Jane Doe", din: "01234567" }
      ],
      compliance: {
        kyc_status: "Verified"
      }
    }
  }
};

type Lang = 'curl' | 'node' | 'python';

export function HeroLiveDemo() {
  const [activeTab, setActiveTab] = useState<EndpointType>('domain');
  const [input, setInput] = useState(ENDPOINTS['domain'].defaultInput);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [activeLang, setActiveLang] = useState<Lang>('node');
  const [displayedJson, setDisplayedJson] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const currentEndpoint = ENDPOINTS[activeTab];

  useEffect(() => {
    setInput(ENDPOINTS[activeTab].defaultInput);
    setStatus('idle');
    setDisplayedJson('');
    setIsTyping(false);
  }, [activeTab]);

  const handleRun = async () => {
    if (!input.trim()) {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 1000);
      return;
    }

    setStatus('loading');
    setDisplayedJson('');
    setIsTyping(false);

    // Simulate network latency
    await new Promise(resolve => setTimeout(resolve, 600));

    // Simulate validation error
    if (input.includes('error') || input.includes('!')) {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
      return;
    }

    setStatus('success');
    
    // Typewriter effect for JSON
    const jsonString = JSON.stringify(currentEndpoint.mockResponse, null, 2);
    setIsTyping(true);
    
    let i = 0;
    const typeInterval = setInterval(() => {
      setDisplayedJson(jsonString.substring(0, i));
      i += 8;
      if (i > jsonString.length) {
        setDisplayedJson(jsonString);
        setIsTyping(false);
        clearInterval(typeInterval);
      }
    }, 10);
  };

  const getCodeSnippet = (lang: Lang) => {
    const fullUrl = `https://api.zinbit.com${currentEndpoint.path}${input}`;
    if (lang === 'curl') {
      return `curl -X GET "${fullUrl}" \\\n  -H "Authorization: Bearer sk_live_..."`;
    }
    if (lang === 'node') {
      return `import { Zinbit } from 'zinbit';\n\nconst client = new Zinbit('sk_live_...');\nconst res = await client.get(\n  '${currentEndpoint.path}${input}'\n);\nconsole.log(res.data);`;
    }
    if (lang === 'python') {
      return `import zinbit\n\nclient = zinbit.Client('sk_live_...')\nres = client.get('${currentEndpoint.path}${input}')\nprint(res.json())`;
    }
    return '';
  };

  return (
    <div className="w-full rounded-2xl bg-[#09090b]/80 dark:bg-[#09090b]/80 backdrop-blur-xl border border-white/10 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.5)] overflow-hidden relative flex flex-col h-[550px]">
      
      {/* Background glowing effects */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-teal/10 blur-[80px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-teal/5 blur-[80px] rounded-full pointer-events-none" />

      {/* Header Tabs */}
      <div className="flex border-b border-white/10 bg-black/40">
        {(Object.keys(ENDPOINTS) as EndpointType[]).map((key) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "px-4 py-3 text-xs font-bold uppercase tracking-wider transition-colors relative",
              activeTab === key ? "text-teal" : "text-white/40 hover:text-white/70"
            )}
          >
            {ENDPOINTS[key].label}
            {activeTab === key && (
              <motion.div layoutId="activeTabIndicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal" />
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col md:flex-row relative z-10 overflow-hidden">
        
        {/* LEFT PANEL: Input & Code */}
        <div className="w-full md:w-[45%] flex flex-col border-b md:border-b-0 md:border-r border-white/10 bg-black/20">
          
          <div className="p-4 border-b border-white/5">
            <label className="block text-xs font-bold text-white/50 uppercase mb-2">Input</label>
            <div className="relative">
              <motion.div 
                animate={status === 'error' ? { x: [-10, 10, -10, 10, 0] } : {}}
                transition={{ duration: 0.4 }}
                className="flex items-center gap-2 bg-black/60 border border-white/10 rounded-lg p-1.5 pl-3 focus-within:border-teal/50 transition-colors"
              >
                <div className="text-teal font-mono text-xs font-bold border-r border-white/10 pr-2">
                  {currentEndpoint.method}
                </div>
                <input 
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={currentEndpoint.placeholder}
                  className="flex-1 bg-transparent border-none text-white text-sm font-mono focus:outline-none focus:ring-0 placeholder:text-white/20 min-w-0"
                  onKeyDown={(e) => e.key === 'Enter' && handleRun()}
                />
                <button 
                  onClick={handleRun}
                  disabled={status === 'loading'}
                  className="bg-teal hover:bg-teal-ice text-ink p-1.5 rounded-md transition-colors disabled:opacity-50 flex items-center justify-center shrink-0"
                >
                  {status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                </button>
              </motion.div>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0 bg-[#0c0c0e]">
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-black/40">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-white/40" />
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Live Request</span>
              </div>
              <div className="flex gap-2">
                {(['node', 'python', 'curl'] as Lang[]).map(lang => (
                  <button 
                    key={lang}
                    onClick={() => setActiveLang(lang)}
                    className={cn(
                      "text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded transition-colors",
                      activeLang === lang ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
                    )}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-4 flex-1 overflow-auto">
              <pre className="text-xs font-mono text-white/70">
                <code>{getCodeSnippet(activeLang)}</code>
              </pre>
            </div>
          </div>

        </div>

        {/* RIGHT PANEL: Output & Data Flow Graph */}
        <div className="w-full md:w-[55%] flex flex-col bg-[#050505] relative overflow-hidden">
          
          {/* Data Flow Animation Layer */}
          <div className="absolute inset-0 pointer-events-none z-0 opacity-20">
            <svg className="w-full h-full" preserveAspectRatio="none">
              <path d="M 0 50 C 150 50, 150 200, 300 200" fill="none" stroke="rgba(70,189,198,0.2)" strokeWidth="1" strokeDasharray="4 4" />
              {status === 'loading' && (
                <path d="M 0 50 C 150 50, 150 200, 300 200" fill="none" stroke="#46bdc6" strokeWidth="2">
                  <animate attributeName="stroke-dasharray" values="0, 500; 500, 0" dur="0.6s" />
                </path>
              )}
            </svg>
          </div>

          <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-black/60 relative z-10">
            <div className="flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-teal" />
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">JSON Payload</span>
            </div>
            
            {/* Performance Overlay */}
            <AnimatePresence>
              {status === 'success' && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-3"
                >
                  <div className="flex items-center gap-1 text-[10px] font-bold text-semantic-success bg-semantic-success/10 px-2 py-0.5 rounded border border-semantic-success/20">
                    <Zap className="w-3 h-3" /> 114ms
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-bold text-teal bg-teal/10 px-2 py-0.5 rounded border border-teal/20">
                    <CheckCircle2 className="w-3 h-3" /> 99% Conf
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-bold text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/20">
                    <Coins className="w-3 h-3" /> 1 Credit
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex-1 p-4 overflow-auto relative z-10">
            {status === 'idle' ? (
              <div className="h-full flex flex-col items-center justify-center text-white/20">
                <Code2 className="w-8 h-8 mb-3 opacity-50" />
                <p className="text-sm font-medium">Hit run to execute the API call</p>
              </div>
            ) : status === 'error' ? (
              <div className="h-full flex flex-col items-center justify-center text-red-500/50">
                <AlertCircle className="w-8 h-8 mb-3 opacity-50" />
                <p className="text-sm font-medium">Invalid input. Please try again.</p>
              </div>
            ) : status === 'loading' ? (
              <div className="space-y-3 opacity-50 animate-pulse">
                <div className="h-4 w-32 bg-white/10 rounded" />
                <div className="h-4 w-48 bg-white/10 rounded ml-4" />
                <div className="h-4 w-40 bg-white/10 rounded ml-4" />
                <div className="h-4 w-56 bg-white/10 rounded ml-4" />
                <div className="h-4 w-24 bg-white/10 rounded" />
              </div>
            ) : (
              <pre className="text-sm font-mono text-teal">
                <code>
                  {displayedJson}
                  {isTyping && <span className="inline-block w-2 h-4 ml-1 bg-teal animate-pulse" />}
                </code>
              </pre>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Zap, Network, PhoneCall, Building2, ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

type Capability = {
  id: string;
  title: string;
  icon: React.ElementType;
  shortDesc: string;
  whyUseIt: string;
  howItHelps: string;
  input: string;
  output: string;
};

const capabilities: Capability[] = [
  {
    id: 'ai-search',
    title: 'People AI Search',
    icon: Search,
    shortDesc: 'Natural language search across 400M+ professionals.',
    whyUseIt: 'Stop wrestling with complex filters. Use natural language like "VPs of Sales at SaaS companies in India with 100-500 employees".',
    howItHelps: 'Accelerates list building by letting AI parse your exact intent and instantly return highly targeted, enriched prospects.',
    input: '"Heads of Marketing at fintech companies in Bengaluru"',
    output: '{\n  "results": [\n    {\n      "name": "Arjun Sharma",\n      "title": "CMO",\n      "company": "Razorpay",\n      "email": "arjun@...",\n      "phone": "+91 98..."\n    }\n  ]\n}'
  },
  {
    id: 'reverse-enrich',
    title: 'Reverse Enrichment',
    icon: Zap,
    shortDesc: 'Turn basic details into comprehensive profiles.',
    whyUseIt: 'You only have a prospect\'s name and company, but you need their full professional background and direct contact info.',
    howItHelps: 'Automatically discovers the correct LinkedIn profile, verifies employment, and unlocks direct-dial phone numbers and verified emails.',
    input: '{\n  "name": "John Doe",\n  "company": "Stripe"\n}',
    output: '{\n  "linkedin_url": "linkedin.com/in/johndoe",\n  "verified_email": "john.doe@stripe.com",\n  "direct_dial": "+1 (415) 555-0198"\n}'
  },
  {
    id: 'linkedin-data',
    title: 'LinkedIn to Profile Data',
    icon: Network,
    shortDesc: 'Extract structured data from any LinkedIn URL.',
    whyUseIt: 'Your CRM has LinkedIn URLs, but lacks actionable data like skills, education history, and current verified contact details.',
    howItHelps: 'Instantly converts a simple URL into a massive JSON payload of structured intelligence, perfect for automated CRM enrichment or AI personalization.',
    input: '{\n  "ln_urls": ["linkedin.com/in/jane-doe"]\n}',
    output: '{\n  "skills": ["Python", "Machine Learning"],\n  "experience": [...],\n  "emails": ["jane@example.com"]\n}'
  },
  {
    id: 'email-to-phone',
    title: 'Email to Phone',
    icon: PhoneCall,
    shortDesc: 'Find direct-dial mobile numbers from an email address.',
    whyUseIt: 'Cold emailing has low open rates. You need to call your prospects directly, but you only have their business email.',
    howItHelps: 'Cross-references our 400M+ database to instantly append highly accurate, direct-dial phone numbers to your email lists, increasing connection rates by up to 3x.',
    input: '{\n  "emails": ["sales@target-account.com"]\n}',
    output: '{\n  "phone_numbers": [\n    "+1 (555) 019-8273",\n    "+1 (555) 928-1122"\n  ]\n}'
  },
  {
    id: 'indian-data',
    title: 'Indian Data Suite (DIN/CIN)',
    icon: Building2,
    shortDesc: 'Deep demographic intelligence for Indian companies.',
    whyUseIt: 'You need reliable, government-backed data on Indian corporations and their directors for KYC, compliance, or enterprise sales.',
    howItHelps: 'Resolves Director Identification Numbers (DIN) to phone numbers, and Corporate Identification Numbers (CIN) to full financial and structural company data.',
    input: '{\n  "cin_list": ["U00000AA0000AAA000001"],\n  "include_directors": true\n}',
    output: '{\n  "company_name": "TATA CONSULTANCY",\n  "paid_up_capital": 3659051373,\n  "directors": [...]\n}'
  }
];

export function CapabilitiesShowcase() {
  const [activeTab, setActiveTab] = useState<string>(capabilities[0].id);

  const activeCapability = capabilities.find(c => c.id === activeTab) || capabilities[0];

  return (
    <div className="glass rounded-3xl border border-border overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.5)]">
      <div className="grid lg:grid-cols-[400px_1fr]">
        
        {/* LEFT PANE: Clickable List */}
        <div className="bg-surface-2/90 border-r border-border-subtle flex flex-col backdrop-blur-xl p-6 gap-3">
          <div className="mb-4">
            <h3 className="text-xl font-display font-bold text-fg mb-2">Core Capabilities</h3>
            <p className="text-fg-muted text-sm">Select an API to see how it transforms your data.</p>
          </div>
          
          <div className="flex flex-col gap-2">
            {capabilities.map(cap => {
              const Icon = cap.icon;
              const isActive = cap.id === activeTab;
              return (
                <button
                  key={cap.id}
                  onClick={() => setActiveTab(cap.id)}
                  className={`w-full text-left p-4 rounded-xl transition-all duration-300 group relative overflow-hidden ${
                    isActive 
                      ? 'bg-teal/10 border-teal/30 shadow-[inset_0_0_20px_rgba(70,189,198,0.1)]' 
                      : 'bg-glass border-transparent hover:bg-glass-2'
                  } border`}
                >
                  {isActive && (
                    <motion.div 
                      layoutId="active-indicator"
                      className="absolute left-0 top-0 bottom-0 w-1 bg-teal"
                    />
                  )}
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`p-2 rounded-lg ${isActive ? 'bg-teal/20 text-teal' : 'bg-white/10 text-fg-muted group-hover:text-fg'}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className={`font-bold ${isActive ? 'text-fg' : 'text-fg-muted group-hover:text-fg'}`}>
                      {cap.title}
                    </span>
                  </div>
                  <p className={`text-xs leading-relaxed ${isActive ? 'text-fg-muted' : 'text-fg-muted group-hover:text-fg-muted'}`}>
                    {cap.shortDesc}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT PANE: Details & Interactive Visualization */}
        <div className="bg-[#0A0A0C] flex flex-col relative overflow-hidden">
          {/* Ambient Glow */}
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-teal/10 blur-[120px] pointer-events-none rounded-full" />
          
          <AnimatePresence mode="wait">
            <motion.div
              key={activeCapability.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="flex-1 p-8 md:p-12 flex flex-col h-full relative z-10"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-teal/10 text-teal rounded-xl border border-teal/20">
                  {(() => {
                    const ActiveIcon = activeCapability.icon;
                    return <ActiveIcon className="w-8 h-8" />;
                  })()}
                </div>
                <h2 className="text-3xl font-display font-bold text-fg">{activeCapability.title}</h2>
              </div>

              <div className="grid md:grid-cols-2 gap-8 mb-12">
                <div>
                  <h4 className="text-teal text-sm font-bold uppercase tracking-wider mb-3">Why Use It</h4>
                  <p className="text-fg-muted leading-relaxed">{activeCapability.whyUseIt}</p>
                </div>
                <div>
                  <h4 className="text-teal text-sm font-bold uppercase tracking-wider mb-3">How It Helps</h4>
                  <p className="text-fg-muted leading-relaxed">{activeCapability.howItHelps}</p>
                </div>
              </div>

              {/* Data Transformation Visualization */}
              <div className="flex-1 bg-surface-2 rounded-2xl border border-border p-6 flex flex-col mb-8 relative">
                 <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-surface-2 px-4 py-1 border border-border rounded-full text-xs font-bold text-fg-muted tracking-widest uppercase">
                   Data Transformation
                 </div>
                 <div className="grid md:grid-cols-[1fr_auto_1fr] gap-6 items-center h-full">
                    
                    {/* Input */}
                    <div className="bg-overlay border border-border-subtle rounded-xl p-4 h-full flex flex-col">
                      <div className="text-fg-subtle text-xs font-bold mb-3 uppercase tracking-wider">Input Request</div>
                      <pre className="text-fg font-mono text-sm whitespace-pre-wrap flex-1">
                        {activeCapability.input}
                      </pre>
                    </div>

                    {/* Arrow */}
                    <div className="hidden md:flex flex-col items-center justify-center text-teal">
                      <motion.div
                        animate={{ x: [0, 10, 0] }}
                        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                      >
                        <ArrowRight className="w-8 h-8 opacity-50" />
                      </motion.div>
                    </div>

                    {/* Output */}
                    <div className="bg-teal/5 border border-teal/20 rounded-xl p-4 h-full flex flex-col shadow-[0_0_30px_rgba(70,189,198,0.1)]">
                      <div className="text-teal/80 text-xs font-bold mb-3 uppercase tracking-wider flex items-center justify-between">
                        <span>Enriched Payload</span>
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <pre className="text-teal-ice font-mono text-sm whitespace-pre-wrap flex-1">
                        {activeCapability.output}
                      </pre>
                    </div>
                 </div>
              </div>

              {/* CTAs */}
              <div className="mt-auto flex items-center gap-4">
                <Link href="/contact" className="px-6 py-3 bg-teal text-ink font-bold rounded-lg hover:bg-teal-ice transition-colors flex items-center gap-2">
                  Contact Sales <ArrowRight className="w-4 h-4" />
                </Link>
                <Link href="/docs" className="px-6 py-3 bg-glass text-fg font-semibold rounded-lg hover:bg-glass-2 transition-colors border border-border">
                  Read Documentation
                </Link>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

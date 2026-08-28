'use client';

import { useState } from 'react';
import { HeroLiveDemo } from '@/components/HeroLiveDemo';
import { IntegrationTerminal } from '@/components/IntegrationTerminal';
import { CapabilitiesShowcase } from '@/components/CapabilitiesShowcase';
import { ShieldCheck, Search, Users, PhoneCall, KeyRound, Building2, SearchCheck, Check, ArrowRight, Zap, Network, Database, Cloud, FileCode, Workflow, ArrowRightLeft, AlertCircle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PricingSliderModal } from '@/components/PricingSliderModal';
import { motion, Variants } from 'framer-motion';
import { Logo } from '@/components/Logo';
import { useStore } from '@/lib/store';

export default function ApiLandingPage() {
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const router = useRouter();
  const { isAuthenticated, user } = useStore();

  const endpoints = [
    { title: "Find Phone by Email", icon: <PhoneCall className="w-5 h-5" />, desc: "Convert any corporate email address into a direct-dial phone number." },
    { title: "Find Email by Phone", icon: <Search className="w-5 h-5" />, desc: "Reverse lookup a mobile or landline to find the associated corporate email." },
    { title: "LinkedIn to Profile Data", icon: <Users className="w-5 h-5" />, desc: "Extract rich, structured JSON data from a LinkedIn URL." },
    { title: "LinkedIn to Contact", icon: <PhoneCall className="w-5 h-5" />, desc: "Resolve a LinkedIn URL to verified email addresses and direct-dials." },
    { title: "People Search", icon: <SearchCheck className="w-5 h-5" />, desc: "Query our 400M+ contact graph using names, companies, and roles." },
    { title: "People AI Search", icon: <Search className="w-5 h-5" />, desc: "Use natural language (e.g. 'VP of Sales at SaaS startups in Bangalore')." },
    { title: "Domain to CIN", icon: <Building2 className="w-5 h-5" />, desc: "Map any company domain to its official Ministry of Corporate Affairs CIN." },
    { title: "CIN to Company Data", icon: <ShieldCheck className="w-5 h-5" />, desc: "Retrieve verified financial and compliance data using a CIN." },
    { title: "Domain to LinkedIn URL", icon: <Users className="w-5 h-5" />, desc: "Find the official company LinkedIn page from a bare domain." },
    { title: "Contact to LinkedIn URL", icon: <Users className="w-5 h-5" />, desc: "Find a person's LinkedIn profile using their name and company." },
    { title: "Reverse Enrichment", icon: <SearchCheck className="w-5 h-5" />, desc: "Input an IP address or partial footprint to identify the B2B visitor." },
    { title: "DIN to Phone", icon: <KeyRound className="w-5 h-5" />, desc: "Map a Director Identification Number to direct contact information." },
  ];

  const pricingTiers = [
    { name: "Starter", limit: "10,000", price: "$99" },
    { name: "Growth", limit: "100,000", price: "$499" },
    { name: "Scale", limit: "1,000,000", price: "$2,999" },
  ];

  const fadeUp: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.4, 0, 0.2, 1] } }
  };

  const staggerContainer: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  return (
    <>
      <div className="bg-mist dark:bg-ink min-h-screen text-ink dark:text-white font-sans overflow-hidden selection:bg-teal selection:text-ink">
      <PricingSliderModal isOpen={isPricingModalOpen} onClose={() => setIsPricingModalOpen(false)} />
      
      {/* Background Grids & Ambient Blurs */}
      <div className="grid-light dark:grid-dark absolute inset-0 opacity-40 pointer-events-none" />
      <div className="absolute top-0 right-0 w-[800px] h-[500px] bg-teal/10 blur-[130px] rounded-full -z-10 pointer-events-none translate-x-1/3 -translate-y-1/3" />
      
      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-black/5 dark:border-white/10 bg-white/70 dark:bg-ink/70 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-[76px] flex items-center justify-between">
          <div className="flex items-center gap-2 w-fit">
            <Logo variant="auto" />
          </div>
          <div className="flex items-center gap-4 md:gap-6">
            <Link href="/docs" className="text-sm font-medium text-ink dark:text-white/70 hover:text-ink dark:text-white transition-colors hidden sm:block">Documentation</Link>
            {isAuthenticated ? (
              <button onClick={() => router.push('/console')} className="text-sm font-bold bg-teal text-ink px-4 md:px-6 py-2.5 rounded-full hover:bg-teal-ice transition-all shadow-[0_8px_28px_-10px_rgba(70,189,198,0.7)] hover:-translate-y-0.5">
                Go to Console
              </button>
            ) : (
              <button onClick={() => setIsPricingModalOpen(true)} className="text-sm font-bold bg-teal text-ink px-4 md:px-6 py-2.5 rounded-full hover:bg-teal-ice transition-all shadow-[0_8px_28px_-10px_rgba(70,189,198,0.7)] hover:-translate-y-0.5">
                Start Building
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        {/* HERO SECTION - SPLIT PANE */}
        <section className="relative px-6 pt-24 pb-28 mx-auto max-w-7xl">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            
            {/* LEFT PANE: COPY & CTAS */}
            <motion.div 
              initial="hidden" 
              animate="visible" 
              variants={staggerContainer} 
              className="text-left"
            >
              <motion.div variants={fadeUp} className="inline-flex items-center gap-2.5 rounded-full border border-black/5 dark:border-white/12 bg-white dark:bg-white/5 px-4 py-2 text-[13px] font-bold tracking-widest text-teal mb-8 uppercase">
                <span className="h-2 w-2 rounded-full bg-teal animate-pulse-node" />
                Identity Infrastructure for the AI Era.
              </motion.div>
              
              <motion.h1 variants={fadeUp} className="font-display text-4xl sm:text-5xl lg:text-[4.5rem] leading-[1.05] tracking-[-0.02em] text-ink dark:text-white font-extrabold mb-6">
                The Developer API for <br/>
                <span className="relative text-teal">B2B Identity.
                  <svg viewBox="0 0 300 12" className="absolute -bottom-2 left-0 w-full text-teal/40 hidden sm:block" fill="none" stroke="currentColor" strokeWidth="2" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M2 9c60-6 180-8 296-4" strokeLinecap="round" />
                  </svg>
                </span>
              </motion.h1>
              
              <motion.p variants={fadeUp} className="text-[18px] leading-[1.65] text-ink dark:text-white/65 max-w-lg mb-10">
                Enrich companies, verify contacts, and orchestrate compliance workflows with a single endpoint. Grounded in live MCA registry data and a 400M+ contact graph.
              </motion.p>
              
              <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                {isAuthenticated ? (
                  <button onClick={() => router.push('/console')} className="inline-flex items-center justify-center gap-2 rounded-full bg-teal px-8 py-4 text-[16px] font-bold text-ink shadow-[0_10px_36px_-10px_rgba(70,189,198,0.65)] transition-all duration-300 hover:bg-teal-ice hover:shadow-[0_14px_44px_-10px_rgba(70,189,198,0.8)] hover:-translate-y-0.5 w-full sm:w-auto">
                    Go to Console, {user?.email?.split('@')[0] || 'Developer'} <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button onClick={() => setIsPricingModalOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-full bg-teal px-8 py-4 text-[16px] font-bold text-ink shadow-[0_10px_36px_-10px_rgba(70,189,198,0.65)] transition-all duration-300 hover:bg-teal-ice hover:shadow-[0_14px_44px_-10px_rgba(70,189,198,0.8)] hover:-translate-y-0.5 w-full sm:w-auto">
                    Start Building for Free <ArrowRight className="w-4 h-4" />
                  </button>
                )}
                <Link href="/contact" className="inline-flex items-center justify-center gap-2 rounded-full bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 px-8 py-4 text-[16px] font-bold text-ink dark:text-white transition-all duration-300 hover:bg-white/10 w-full sm:w-auto">
                  Contact Sales
                </Link>
              </motion.div>
              
              <motion.div variants={fadeUp} className="mt-10 flex items-center gap-6 text-sm font-medium text-ink dark:text-white/40">
                <div className="flex items-center gap-2"><Check className="w-4 h-4 text-teal" /> GDPR Compliant</div>
                <div className="flex items-center gap-2"><Check className="w-4 h-4 text-teal" /> SOC2 Certified</div>
                <div className="flex items-center gap-2"><Zap className="w-4 h-4 text-teal" /> 120ms Avg Latency</div>
              </motion.div>
            </motion.div>

            {/* RIGHT PANE: ANIMATED CODE SHOWCASE */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4, duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
              className="relative w-full lg:w-[110%] -mr-10 h-auto"
            >
              <HeroLiveDemo />
            </motion.div>
            
          </div>
        </section>

        {/* SOCIAL PROOF: LOGO BAND */}
        <section className="border-t border-b border-black/5 dark:border-white/10 bg-white/40 dark:bg-black/20 py-10 overflow-hidden">
          <div className="max-w-7xl mx-auto px-6 flex flex-col items-center">
            <p className="text-xs font-bold uppercase tracking-widest text-ink dark:text-white/40 mb-8 text-center">Trusted by compliance and RevOps teams at industry leaders</p>
            <div className="flex flex-wrap justify-center items-center gap-12 sm:gap-20 opacity-50 dark:opacity-40 grayscale hover:grayscale-0 transition-all duration-500">
              <div className="flex items-center gap-2 font-bold text-xl"><Network className="w-6 h-6" /> FinTech Inc</div>
              <div className="flex items-center gap-2 font-bold text-xl"><Database className="w-6 h-6" /> DataScale</div>
              <div className="flex items-center gap-2 font-bold text-xl"><Cloud className="w-6 h-6" /> CloudNative</div>
              <div className="flex items-center gap-2 font-bold text-xl"><Workflow className="w-6 h-6" /> Orchestrate</div>
              <div className="flex items-center gap-2 font-bold text-xl hidden sm:flex"><FileCode className="w-6 h-6" /> API-First</div>
            </div>
          </div>
        </section>

        {/* STORYTELLING: BEFORE VS AFTER USE CASE */}
        <section className="py-48 relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <p className="mb-4 text-[13px] font-semibold uppercase tracking-[0.2em] text-teal">Business Value</p>
              <h2 className="text-3xl md:text-4xl font-display font-extrabold text-ink dark:text-white">Turn messy inputs into actionable intelligence.</h2>
              <p className="mt-4 text-ink dark:text-white/60 max-w-2xl mx-auto">Stop losing deals and failing compliance checks due to bad data. Enrich CRM records and verify entities instantly.</p>
            </div>
            
            <div className="grid lg:grid-cols-[1fr_auto_1fr] gap-8 items-center max-w-5xl mx-auto">
              
              {/* BEFORE PANE */}
              <div className="bg-white/40 dark:glass border border-black/5 dark:border-white/10 rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-red-500/50" />
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold text-ink dark:text-white flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500" /> Incomplete Lead
                  </h3>
                  <span className="text-xs font-mono bg-red-500/10 text-red-500 px-2 py-1 rounded">Before zinbit</span>
                </div>
                
                <div className="space-y-4">
                  <div className="bg-black/5 dark:bg-black/40 rounded-xl p-4 border border-black/5 dark:border-white/5 opacity-70 grayscale">
                    <div className="text-xs font-bold text-ink dark:text-white/40 mb-1 uppercase">Name</div>
                    <div className="font-mono text-sm">John D.</div>
                  </div>
                  <div className="bg-black/5 dark:bg-black/40 rounded-xl p-4 border border-black/5 dark:border-white/5 opacity-70 grayscale">
                    <div className="text-xs font-bold text-ink dark:text-white/40 mb-1 uppercase">Email</div>
                    <div className="font-mono text-sm">john@stripe.com</div>
                  </div>
                  <div className="bg-red-500/5 dark:bg-red-500/10 rounded-xl p-4 border border-red-500/20 opacity-70">
                    <div className="text-xs font-bold text-red-500/70 mb-1 uppercase">Direct Dial</div>
                    <div className="font-mono text-sm text-red-500/50">Missing / Unverified</div>
                  </div>
                </div>
              </div>

              {/* TRANSITION ARROW */}
              <div className="hidden lg:flex justify-center items-center">
                <div className="bg-teal/10 p-4 rounded-full border border-teal/20 relative">
                  <div className="absolute inset-0 bg-teal/20 blur-xl rounded-full animate-pulse-node" />
                  <ArrowRightLeft className="w-6 h-6 text-teal relative z-10" />
                </div>
              </div>

              {/* AFTER PANE */}
              <div className="bg-[#09090B] border border-white/10 rounded-3xl p-6 md:p-8 shadow-[0_30px_60px_rgba(0,0,0,0.5)] relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-teal" />
                <div className="absolute -top-32 -right-32 w-64 h-64 bg-teal/10 blur-[80px] pointer-events-none rounded-full" />
                
                <div className="flex items-center justify-between mb-6 relative z-10">
                  <h3 className="font-bold text-white flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal" /> Enriched Payload
                  </h3>
                  <span className="text-xs font-mono bg-teal/10 text-teal px-2 py-1 rounded border border-teal/20">After zinbit</span>
                </div>
                
                <div className="space-y-4 relative z-10">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-teal/20 border border-teal flex items-center justify-center text-teal font-bold text-lg">JD</div>
                    <div>
                      <h4 className="text-white font-bold flex items-center gap-2">John Doe <CheckCircle2 className="w-4 h-4 text-teal" /></h4>
                      <p className="text-white/60 text-sm">VP of Engineering at Stripe</p>
                    </div>
                  </div>
                  
                  <div className="bg-black/40 rounded-xl p-4 border border-white/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-white/40 text-xs font-bold uppercase">Email (Verified)</span>
                      <span className="text-white text-sm font-mono">john@stripe.com</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white/40 text-xs font-bold uppercase">Direct Dial</span>
                      <span className="text-semantic-success text-sm font-mono bg-semantic-success/10 px-2 py-0.5 rounded border border-semantic-success/20">+1 (415) 555-0198</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* DUAL-ENGINE ARCHITECTURE */}
        <section className="py-48 relative overflow-hidden bg-black">
          {/* Deep Space Background & Grid */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-teal/10 blur-[120px] rounded-full pointer-events-none" />

          <div className="max-w-7xl mx-auto px-6 relative z-10">
            <div className="text-center mb-24">
              <p className="mb-4 text-[13px] font-semibold uppercase tracking-[0.2em] text-teal">Architecture</p>
              <h2 className="text-4xl md:text-5xl font-display font-extrabold text-white">The Dual-Engine Advantage</h2>
              <p className="mt-6 text-white/60 max-w-2xl mx-auto text-lg">Our infrastructure queries two separate engines and automatically resolves conflicts using strict registry precedence.</p>
            </div>
            
            <div className="relative max-w-5xl mx-auto py-10">
              
              {/* ANIMATED CONNECTING LINES (SVG Background) */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none hidden md:block" style={{ zIndex: 0 }}>
                {/* Left Line */}
                <path d="M 250 150 C 350 150, 350 300, 500 300" fill="none" stroke="rgba(70,189,198,0.2)" strokeWidth="2" strokeDasharray="6 6" />
                <path d="M 250 150 C 350 150, 350 300, 500 300" fill="none" stroke="rgba(70,189,198,0.8)" strokeWidth="3">
                  <animate attributeName="stroke-dasharray" values="0, 1000; 1000, 0" dur="3s" repeatCount="indefinite" />
                </path>
                {/* Right Line */}
                <path d="M 750 150 C 650 150, 650 300, 500 300" fill="none" stroke="rgba(70,189,198,0.2)" strokeWidth="2" strokeDasharray="6 6" />
                <path d="M 750 150 C 650 150, 650 300, 500 300" fill="none" stroke="rgba(70,189,198,0.8)" strokeWidth="3">
                  <animate attributeName="stroke-dasharray" values="0, 1000; 1000, 0" dur="3s" repeatCount="indefinite" />
                </path>
                {/* Bottom Line */}
                <path d="M 500 300 L 500 450" fill="none" stroke="rgba(70,189,198,0.2)" strokeWidth="2" strokeDasharray="6 6" />
                <path d="M 500 300 L 500 450" fill="none" stroke="rgba(70,189,198,0.8)" strokeWidth="3">
                  <animate attributeName="stroke-dasharray" values="0, 1000; 1000, 0" dur="2s" repeatCount="indefinite" />
                </path>
              </svg>

              <div className="grid md:grid-cols-2 gap-8 relative z-10 md:mb-32">
                
                {/* NODE 1: LOOKUP ENGINE */}
                <div className="bg-[#111115] border border-white/10 rounded-[2rem] p-8 relative overflow-hidden group shadow-[0_0_40px_rgba(0,0,0,0.5)] hover:border-teal/50 transition-all duration-500 hover:-translate-y-2">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center mb-6 border border-white/10 group-hover:bg-white/10 transition-colors">
                    <SearchCheck className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">Lookup Engine</h3>
                  <p className="text-white/50 mb-8 leading-relaxed">Massive scale entity resolution relying on public web footprints, LinkedIn data, and historic contact databases.</p>
                  
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 bg-black/40 rounded-xl p-3 border border-white/5">
                      <div className="w-8 h-8 rounded-full bg-teal/20 flex items-center justify-center"><Users className="w-4 h-4 text-teal" /></div>
                      <span className="text-sm font-medium text-white/80">400M+ Contact Records</span>
                    </div>
                    <div className="flex items-center gap-4 bg-black/40 rounded-xl p-3 border border-white/5">
                      <div className="w-8 h-8 rounded-full bg-teal/20 flex items-center justify-center"><Network className="w-4 h-4 text-teal" /></div>
                      <span className="text-sm font-medium text-white/80">Social Enrichment Graph</span>
                    </div>
                  </div>
                </div>

                {/* NODE 2: IDS ENGINE */}
                <div className="bg-[#111115] border border-white/10 rounded-[2rem] p-8 relative overflow-hidden group shadow-[0_0_40px_rgba(0,0,0,0.5)] hover:border-teal/50 transition-all duration-500 hover:-translate-y-2">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-teal to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="w-12 h-12 bg-teal/10 rounded-2xl flex items-center justify-center mb-6 border border-teal/20 group-hover:bg-teal/20 transition-colors">
                    <ShieldCheck className="w-6 h-6 text-teal" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">IDS Engine</h3>
                  <p className="text-white/50 mb-8 leading-relaxed">Deterministic intelligence sourced exclusively from the Ministry of Corporate Affairs (MCA) and government registries.</p>
                  
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 bg-black/40 rounded-xl p-3 border border-white/5">
                      <div className="w-8 h-8 rounded-full bg-teal/20 flex items-center justify-center"><Building2 className="w-4 h-4 text-teal" /></div>
                      <span className="text-sm font-medium text-white/80">CIN & DIN Resolution</span>
                    </div>
                    <div className="flex items-center gap-4 bg-black/40 rounded-xl p-3 border border-white/5">
                      <div className="w-8 h-8 rounded-full bg-teal/20 flex items-center justify-center"><Database className="w-4 h-4 text-teal" /></div>
                      <span className="text-sm font-medium text-white/80">Audited Financial Overlays</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* CENTER RESOLUTION NODE */}
              <div className="relative z-20 flex justify-center -mt-8 md:-mt-0 mb-8 md:mb-0">
                <div className="bg-black border-2 border-teal rounded-3xl p-6 shadow-[0_0_50px_rgba(70,189,198,0.3)] text-center w-full max-w-sm relative">
                  <div className="absolute inset-0 bg-teal/5 rounded-3xl animate-pulse" />
                  <div className="relative z-10">
                    <div className="inline-flex items-center justify-center bg-teal/20 text-teal px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-4 border border-teal/30">
                      Conflict Resolution
                    </div>
                    <h4 className="text-xl font-bold text-white mb-2">Strict Precedence</h4>
                    <p className="text-white/60 text-sm">When data conflicts, the deterministic registry (MCA) always overrides scraped web data.</p>
                  </div>
                </div>
              </div>

              {/* OUTPUT PAYLOAD */}
              <div className="relative z-10 flex justify-center mt-8 md:mt-16">
                <div className="bg-[#111115] border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-2 h-full bg-teal" />
                  <div className="flex items-center justify-between mb-4 pl-4">
                    <div className="flex items-center gap-2 text-white font-bold"><CheckCircle2 className="w-5 h-5 text-semantic-success" /> Master Record</div>
                    <div className="text-xs text-white/40 font-mono">120ms</div>
                  </div>
                  <div className="mt-4 bg-black/40 rounded-xl border border-white/5 overflow-hidden">
                    <div className="bg-white/5 px-4 py-3 border-b border-white/5 flex items-center justify-between">
                      <span className="text-white/90 font-bold text-sm">TechCorp India Pvt Ltd</span>
                      <span className="text-[10px] bg-semantic-success/20 text-semantic-success px-2 py-0.5 rounded-full font-bold border border-semantic-success/30 uppercase tracking-wider">Active MCA</span>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-white/40">CIN</span>
                        <span className="text-white font-mono">U72900KA2021PTC</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-white/40">Confidence</span>
                        <span className="text-teal font-mono">100% Deterministic</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-white/40">Last Audited</span>
                        <span className="text-white font-mono">March 2026</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* CAPABILITIES SHOWCASE */}
        <section className="py-48 relative">
          <div className="max-w-[1400px] mx-auto px-6">
            <div className="text-center mb-16">
              <p className="mb-4 text-[13px] font-semibold uppercase tracking-[0.2em] text-teal">Capabilities</p>
              <h2 className="text-3xl md:text-4xl font-display font-extrabold text-ink dark:text-white">Everything your stack needs</h2>
            </div>
            
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8 }}
            >
              <CapabilitiesShowcase />
            </motion.div>
          </div>
        </section>

        {/* INTEGRATION TERMINAL */}
        <section className="py-48 border-t border-black/5 dark:border-white/10 relative z-20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <p className="mb-4 text-[13px] font-semibold uppercase tracking-[0.2em] text-teal">Developer Experience</p>
              <h2 className="text-3xl md:text-4xl font-display font-extrabold text-ink dark:text-white">Integrate in minutes.</h2>
              <p className="mt-4 text-ink dark:text-white/60 max-w-2xl mx-auto">Native SDKs and standard REST APIs. Copy, paste, and ship to production today.</p>
            </div>
            
            <motion.div 
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
            >
              <IntegrationTerminal />
            </motion.div>
          </div>
        </section>

        {/* PRICING */}
        <section className="py-48 border-t border-black/5 dark:border-white/10 bg-gradient-to-b from-white/5 to-transparent relative z-10">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-display font-extrabold text-ink dark:text-white">Simple, Usage-Based Economics</h2>
              <p className="mt-4 text-ink dark:text-white/60 max-w-xl mx-auto">Credits are deducted only on successful `200 OK` resolutions. Cached hits cost 0 credits.</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              {pricingTiers.map((tier) => (
                <div key={tier.name} className="bg-white/40 dark:glass border-black/5-inner rounded-3xl p-8 flex flex-col items-center text-center hover:border-teal/30 transition-colors">
                  <h3 className="text-xl font-bold text-ink dark:text-white mb-2">{tier.name}</h3>
                  <div className="text-sm font-semibold text-teal bg-teal/10 px-3 py-1 rounded-full mb-6">
                    {tier.limit} Credits
                  </div>
                  <div className="text-4xl font-black text-ink dark:text-white mb-8">{tier.price}<span className="text-lg text-ink dark:text-white/40 font-medium">/mo</span></div>
                  <button onClick={() => setIsPricingModalOpen(true)} className="w-full text-center py-3 rounded-full border border-white/20 text-ink dark:text-white font-bold hover:bg-white hover:text-ink transition-colors block">
                    Get Started
                  </button>
                </div>
              ))}
            </div>
            
            <div className="mt-8 p-8 bg-white/40 dark:glass border-black/5 rounded-2xl flex justify-between items-center flex-col sm:flex-row gap-6 border-gradient">
              <div>
                <p className="font-bold text-ink dark:text-white mb-1">Volume Pricing</p>
                <p className="text-sm text-ink dark:text-white/60">Need high-volume orchestration for enterprise workloads?</p>
              </div>
              <Link href="/contact" className="bg-white text-ink px-8 py-3 rounded-full font-bold hover:bg-neutral-200 transition-colors shadow-lg shadow-white/10 block">
                Talk to Sales
              </Link>
            </div>
          </div>
        </section>
        {/* FAQs */}
        <section className="py-24 border-t border-black/5 dark:border-white/10 relative z-10">
          <div className="max-w-3xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-display font-extrabold text-ink dark:text-white">FAQs</h2>
              <p className="mt-4 text-ink dark:text-white/60">Common questions from engineering and security teams.</p>
            </div>
            
            <div className="space-y-4">
              <details className="bg-white/40 dark:glass border-black/5-inner rounded-2xl p-6 border border-black/5 dark:border-white/10 hover:border-white/20 transition-colors group">
                <summary className="text-lg font-bold text-ink dark:text-white cursor-pointer list-none flex justify-between items-center">
                  What are your SLAs and expected latencies?
                  <span className="transition-transform duration-300 group-open:rotate-180">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50"><polyline points="6 9 12 15 18 9"></polyline></svg>
                  </span>
                </summary>
                <div className="text-ink dark:text-white/70 text-sm leading-relaxed mt-4 pt-4 border-t border-black/5 dark:border-white/10">
                  We offer a financially backed 99.99% uptime SLA for Enterprise tiers. Our distributed graph architecture guarantees a p99 response time of &lt;120ms globally for cached hits, and &lt;800ms for deep deterministic resolutions.
                </div>
              </details>

              <details className="bg-white/40 dark:glass border-black/5-inner rounded-2xl p-6 border border-black/5 dark:border-white/10 hover:border-white/20 transition-colors group">
                <summary className="text-lg font-bold text-ink dark:text-white cursor-pointer list-none flex justify-between items-center">
                  How do you ensure data compliance (DPDP, GDPR)?
                  <span className="transition-transform duration-300 group-open:rotate-180">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50"><polyline points="6 9 12 15 18 9"></polyline></svg>
                  </span>
                </summary>
                <div className="text-ink dark:text-white/70 text-sm leading-relaxed mt-4 pt-4 border-t border-black/5 dark:border-white/10">
                  zinbit operates strictly on deterministic public registry guidelines. We automatically propagate opt-outs globally within 24 hours. SOC2 Type II and ISO 27001 compliance reports are available under NDA.
                </div>
              </details>

              <details className="bg-white/40 dark:glass border-black/5-inner rounded-2xl p-6 border border-black/5 dark:border-white/10 hover:border-white/20 transition-colors group">
                <summary className="text-lg font-bold text-ink dark:text-white cursor-pointer list-none flex justify-between items-center">
                  Is the API idempotent?
                  <span className="transition-transform duration-300 group-open:rotate-180">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50"><polyline points="6 9 12 15 18 9"></polyline></svg>
                  </span>
                </summary>
                <div className="text-ink dark:text-white/70 text-sm leading-relaxed mt-4 pt-4 border-t border-black/5 dark:border-white/10">
                  Yes, all mutating and billed endpoints support idempotency keys (V4 UUIDs recommended) to allow for safe retries without double-deducting credits during network timeouts.
                </div>
              </details>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-mist dark:bg-ink border-t border-black/5 dark:border-white/10 py-16 text-center">
        <div className="max-w-7xl mx-auto px-6 flex flex-col items-center">
          <ShieldCheck className="w-10 h-10 text-teal/40 mb-6" />
          <p className="text-ink dark:text-white/40 max-w-3xl text-sm leading-relaxed font-medium">
            We are fully committed to DPDP compliance. Data retrieval strictly adheres to deterministic public registry guidelines. Opt-out propagation scope is defined in our compliance documentation.
          </p>
          <div className="mt-8 flex items-center gap-4 text-sm font-semibold text-ink dark:text-white/30">
            <span>© {new Date().getFullYear()} zinbit by Zintlr. All rights reserved.</span>
            <span>•</span>
            <Link href="/status" className="hover:text-ink dark:text-white/60 transition-colors">System Status</Link>
          </div>
        </div>
      </footer>
      
      <PricingSliderModal isOpen={isPricingModalOpen} onClose={() => setIsPricingModalOpen(false)} />
    </div>
    </>
  );
}

'use client';

import { HeroCodeShowcase } from '@/components/HeroCodeShowcase';
import { IntegrationTerminal } from '@/components/IntegrationTerminal';
import { ShieldCheck, Search, Users, PhoneCall, KeyRound, Building2, SearchCheck, Check, ArrowRight, Zap } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';

export default function ApiLandingPage() {
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

  const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.4, 0, 0.2, 1] as const } }
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  return (
    <div className="bg-mist dark:bg-ink min-h-screen text-ink dark:text-white font-sans overflow-hidden selection:bg-teal selection:text-ink">
      {/* Background Grids & Ambient Blurs */}
      <div className="grid-light dark:grid-dark absolute inset-0 opacity-40 pointer-events-none" />
      <div className="absolute top-0 right-0 w-[800px] h-[500px] bg-teal/10 blur-[130px] rounded-full -z-10 pointer-events-none translate-x-1/3 -translate-y-1/3" />
      
      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-black/5 dark:border-white/10 bg-white/70 dark:bg-ink/70 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-[76px] flex items-center justify-between">
          <div className="flex items-center gap-2 w-fit">
            <img src="/logo.png" alt="Zintlr B2B2B" className="h-8 w-auto" />
          </div>
          <div className="flex items-center gap-4 md:gap-6">
            <Link href="/docs" className="text-sm font-medium text-ink dark:text-white/70 hover:text-ink dark:text-white transition-colors hidden sm:block">Documentation</Link>
            <Link href="/console" className="text-sm font-bold bg-teal text-ink px-4 md:px-6 py-2.5 rounded-full hover:bg-teal-ice transition-all shadow-[0_8px_28px_-10px_rgba(70,189,198,0.7)] hover:-translate-y-0.5">
              Partner Console
            </Link>
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
                12 Endpoints. 99.99% Uptime.
              </motion.div>
              
              <motion.h1 variants={fadeUp} className="font-display text-4xl sm:text-5xl lg:text-[4rem] leading-[1.1] tracking-[-0.02em] text-ink dark:text-white font-extrabold mb-6">
                One API.<br/>
                <span className="relative text-teal">400M+ B2B Identities.
                  <svg viewBox="0 0 300 12" className="absolute -bottom-2 left-0 w-full text-teal/40 hidden sm:block" fill="none" stroke="currentColor" strokeWidth="2" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M2 9c60-6 180-8 296-4" strokeLinecap="round" />
                  </svg>
                </span>
              </motion.h1>
              
              <motion.p variants={fadeUp} className="text-[18px] leading-[1.65] text-ink dark:text-white/65 max-w-lg mb-10">
                Enrich contacts, verify corporate entities, and orchestrate high-trust onboarding workflows with a single integration. Grounded in live MCA registry data.
              </motion.p>
              
              <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <Link href="/console" className="inline-flex items-center justify-center gap-2 rounded-full bg-teal px-8 py-4 text-[16px] font-bold text-ink shadow-[0_10px_36px_-10px_rgba(70,189,198,0.65)] transition-all duration-300 hover:bg-teal-ice hover:shadow-[0_14px_44px_-10px_rgba(70,189,198,0.8)] hover:-translate-y-0.5 w-full sm:w-auto">
                  Start Building for Free <ArrowRight className="w-4 h-4" />
                </Link>
                <Link href="/docs" className="inline-flex items-center justify-center gap-2 rounded-full bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 px-8 py-4 text-[16px] font-bold text-ink dark:text-white transition-all duration-300 hover:bg-white/10 w-full sm:w-auto">
                  Read the Docs
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
              className="relative w-full h-[400px] sm:h-[500px]"
            >
              <div className="absolute inset-0 rounded-[40px] bg-teal/10 blur-[60px] sm:blur-[80px] -z-10 pointer-events-none" />
              <div className="w-full h-full rounded-2xl bg-white/40 dark:glass border-black/5 p-1 overflow-hidden">
                <HeroCodeShowcase />
              </div>
            </motion.div>
            
          </div>
        </section>

        {/* DUAL-ENGINE ARCHITECTURE */}
        <section className="border-t border-black/5 dark:border-white/10 bg-white dark:bg-white/5 py-24">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <p className="mb-4 text-[13px] font-semibold uppercase tracking-[0.2em] text-teal">Architecture</p>
              <h2 className="text-3xl md:text-4xl font-display font-extrabold text-ink dark:text-white">The Dual-Engine Advantage</h2>
              <p className="mt-4 text-ink dark:text-white/60 max-w-2xl mx-auto">Our infrastructure queries two separate engines and automatically resolves conflicts using strict registry precedence.</p>
            </div>
            
            <div className="grid md:grid-cols-2 gap-8 relative">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-teal text-ink font-bold px-4 py-2 rounded-full z-10 shadow-[0_0_20px_rgba(70,189,198,0.5)] border-4 border-ink flex items-center gap-2 text-sm">
                <ShieldCheck className="w-4 h-4" /> The Conflict Rule: Registry Wins
              </div>
              
              <div className="bg-white/40 dark:glass border-black/5-inner rounded-3xl p-8 relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-white/20 transition-colors group-hover:bg-white/40" />
                <h3 className="text-2xl font-bold text-ink dark:text-white mb-4">Lookup Engine</h3>
                <p className="text-ink dark:text-white/60 mb-6">Massive scale entity resolution relying on public web footprints, LinkedIn data, and historic contact databases.</p>
                <ul className="space-y-3">
                  <li className="flex items-center gap-3 text-sm text-ink dark:text-white/70"><Check className="w-4 h-4 text-teal" /> 400M+ Contact Records</li>
                  <li className="flex items-center gap-3 text-sm text-ink dark:text-white/70"><Check className="w-4 h-4 text-teal" /> Real-time Social Enrichment</li>
                  <li className="flex items-center gap-3 text-sm text-ink dark:text-white/70"><Check className="w-4 h-4 text-teal" /> Historic Phone/Email mapping</li>
                </ul>
              </div>

              <div className="bg-white/40 dark:glass border-black/5-inner rounded-3xl p-8 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-1.5 h-full bg-teal transition-colors group-hover:bg-teal-ice" />
                <h3 className="text-2xl font-bold text-ink dark:text-white mb-4">IDS Engine</h3>
                <p className="text-ink dark:text-white/60 mb-6">Deterministic intelligence sourced exclusively from the Ministry of Corporate Affairs (MCA) and government registries.</p>
                <ul className="space-y-3">
                  <li className="flex items-center gap-3 text-sm text-ink dark:text-white/70"><Check className="w-4 h-4 text-teal" /> CIN & DIN Resolution</li>
                  <li className="flex items-center gap-3 text-sm text-ink dark:text-white/70"><Check className="w-4 h-4 text-teal" /> Legal Entity Structures</li>
                  <li className="flex items-center gap-3 text-sm text-ink dark:text-white/70"><Check className="w-4 h-4 text-teal" /> Audited Financial Overlays</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ENDPOINTS GRID */}
        <section className="py-24 relative">
          <div className="max-w-7xl mx-auto px-6">
            <div className="mb-16">
              <p className="mb-4 text-[13px] font-semibold uppercase tracking-[0.2em] text-teal">Capabilities</p>
              <h2 className="text-3xl md:text-4xl font-display font-extrabold text-ink dark:text-white">Everything your stack needs</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {endpoints.map((endpoint, i) => (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ delay: i * 0.05 }}
                  key={endpoint.title} 
                  className="bg-white/40 dark:glass border-black/5-inner rounded-2xl p-6 hover:-translate-y-1 transition-all duration-300 group flex flex-col justify-between hover:border-teal/50"
                >
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-white dark:bg-white/5 border border-black/5 dark:border-white/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 text-teal">
                      {endpoint.icon}
                    </div>
                    <h3 className="text-lg font-bold text-ink dark:text-white mb-2">{endpoint.title}</h3>
                    <p className="text-ink dark:text-white/50 text-sm leading-relaxed">{endpoint.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* INTEGRATION TERMINAL */}
        <section className="py-24 border-t border-black/5 dark:border-white/10 relative z-20">
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
        <section className="py-24 border-t border-black/5 dark:border-white/10 bg-gradient-to-b from-white/5 to-transparent relative z-10">
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
                  <button className="w-full py-3 rounded-full border border-white/20 text-ink dark:text-white font-bold hover:bg-white hover:text-ink transition-colors">
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
              <button className="bg-white text-ink px-8 py-3 rounded-full font-bold hover:bg-neutral-200 transition-colors shadow-lg shadow-white/10">
                Talk to Sales
              </button>
            </div>
          </div>
        </section>
        {/* TECHNICAL BUYER FAQ */}
        <section className="py-24 border-t border-black/5 dark:border-white/10 relative z-10">
          <div className="max-w-4xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-display font-extrabold text-ink dark:text-white">Technical FAQ</h2>
              <p className="mt-4 text-ink dark:text-white/60">Common questions from engineering and security teams.</p>
            </div>
            
            <div className="space-y-6">
              <div className="bg-white/40 dark:glass border-black/5-inner rounded-2xl p-6 md:p-8 border border-black/5 dark:border-white/10 hover:border-white/20 transition-colors">
                <h3 className="text-lg font-bold text-ink dark:text-white mb-3">What are your SLAs and expected latencies?</h3>
                <p className="text-ink dark:text-white/70 text-sm leading-relaxed">
                  We offer a financially backed 99.99% uptime SLA for Enterprise tiers. Our distributed graph architecture guarantees a p99 response time of &lt;120ms globally for cached hits, and &lt;800ms for deep deterministic resolutions.
                </p>
              </div>
              <div className="bg-white/40 dark:glass border-black/5-inner rounded-2xl p-6 md:p-8 border border-black/5 dark:border-white/10 hover:border-white/20 transition-colors">
                <h3 className="text-lg font-bold text-ink dark:text-white mb-3">How do you ensure data compliance (DPDP, GDPR)?</h3>
                <p className="text-ink dark:text-white/70 text-sm leading-relaxed">
                  Zintlr operates strictly on deterministic public registry guidelines. We automatically propagate opt-outs globally within 24 hours. SOC2 Type II and ISO 27001 compliance reports are available under NDA.
                </p>
              </div>
              <div className="bg-white/40 dark:glass border-black/5-inner rounded-2xl p-6 md:p-8 border border-black/5 dark:border-white/10 hover:border-white/20 transition-colors">
                <h3 className="text-lg font-bold text-ink dark:text-white mb-3">Is the API idempotent?</h3>
                <p className="text-ink dark:text-white/70 text-sm leading-relaxed">
                  Yes, all mutating and billed endpoints support idempotency keys (V4 UUIDs recommended) to allow for safe retries without double-deducting credits during network timeouts.
                </p>
              </div>
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
            <span>© {new Date().getFullYear()} Zintlr B2B2B. All rights reserved.</span>
            <span>•</span>
            <Link href="/status" className="hover:text-ink dark:text-white/60 transition-colors">System Status</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Scale, Shield, FileText, Clock, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, AlertTriangle, Award, Globe, Lock, Download, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Legal Document Data ──────────────────────────────────────────────────────

const SLA_TIERS = [
  {
    tier: 'Developer',
    uptime: '99.5%',
    uptimeMinutes: '~3.65 hrs/mo downtime',
    responseTime: 'P99 < 2,000ms',
    support: 'Community + Docs',
    incident: '4 business hours',
    credits: '10% service credit',
    color: 'border-white/10 text-white/60',
    badge: 'bg-white/5 text-white/50',
  },
  {
    tier: 'Startup',
    uptime: '99.9%',
    uptimeMinutes: '~43.8 min/mo',
    responseTime: 'P99 < 800ms',
    support: 'Email (24h SLA)',
    incident: '2 business hours',
    credits: '15% service credit',
    color: 'border-teal/20 text-white',
    badge: 'bg-teal/10 text-teal',
    highlight: true,
  },
  {
    tier: 'Enterprise',
    uptime: '99.99%',
    uptimeMinutes: '~4.38 min/mo',
    responseTime: 'P99 < 250ms',
    support: 'Dedicated CSM + Slack',
    incident: '15 minutes (24/7)',
    credits: '25% service credit + SLA breach payout',
    color: 'border-amber-400/30 text-white',
    badge: 'bg-amber-400/10 text-amber-400',
  },
];

const TOC_SECTIONS = [
  { id: 'sla', label: 'Service Level Agreement', icon: Award },
  { id: 'terms', label: 'Terms of Service', icon: FileText },
  { id: 'privacy', label: 'Privacy Policy', icon: Shield },
  { id: 'dpa', label: 'Data Processing Agreement', icon: Lock },
  { id: 'aup', label: 'Acceptable Use Policy', icon: Globe },
];

const TERMS_SECTIONS = [
  {
    title: '1. Acceptance of Terms',
    content: `By accessing or using the zinbit by Zintlr API ("Service"), you agree to be bound by these Terms of Service ("Terms"). If you are accessing the Service on behalf of an organization, you represent that you have authority to bind that organization to these Terms. zinbit reserves the right to update these Terms at any time with 30 days' written notice.`,
  },
  {
    title: '2. API Access and Keys',
    content: `You will be issued API keys ("Keys") for authenticating requests. Keys are confidential credentials — you are solely responsible for all activity under your Keys. zinbit implements one-way SHA-256 hashing for all Keys: plaintext is never stored. If you believe your Keys have been compromised, revoke them immediately from the Partner Console. zinbit is not liable for unauthorized use prior to revocation.`,
  },
  {
    title: '3. Permitted Use',
    content: `The Service may only be used for lawful B2B data enrichment workflows within the scope of your subscribed plan. You may not: (a) resell or sublicense API access without a signed OEM Agreement; (b) scrape, mirror, or bulk-export datasets beyond your contracted volume; (c) use the Service to process Personal Data of individuals in jurisdictions where you lack a legal basis under GDPR, DPDP, or CCPA; (d) reverse-engineer the underlying data graph or machine learning models.`,
  },
  {
    title: '4. Billing, Credits, and Refunds',
    content: `Prepaid credits are non-refundable once consumed. Postpaid invoices are due Net-30. Overdue accounts accrue 1.5% monthly interest. Enterprise contracts include a minimum commitment period defined in your Order Form. zinbit may suspend access immediately upon non-payment, with 5 business days' notice for cure. Volume discounts are computed at billing cycle close and applied as account credits.`,
  },
  {
    title: '5. Intellectual Property',
    content: `zinbit retains all rights to the underlying data compilations, matching algorithms, and API infrastructure. You own your application code and derivatives of API responses integrated into your product. You may not create a competing data enrichment product using output from zinbit's APIs. Feedback submitted to zinbit may be used to improve the Service without compensation.`,
  },
  {
    title: '6. Limitation of Liability',
    content: `TO THE MAXIMUM EXTENT PERMITTED BY LAW, ZINBIT'S AGGREGATE LIABILITY ARISING OUT OF OR RELATED TO THESE TERMS SHALL NOT EXCEED THE FEES PAID BY YOU IN THE 12 MONTHS PRECEDING THE CLAIM. ZINBIT SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, EVEN IF ADVISED OF THEIR POSSIBILITY.`,
  },
  {
    title: '7. Governing Law',
    content: `These Terms shall be governed by and construed in accordance with the laws of the State of Delaware, USA, without regard to conflict of law principles. Any disputes shall be resolved by binding arbitration under the AAA Commercial Arbitration Rules in San Francisco, CA. The United Nations Convention on Contracts for the International Sale of Goods does not apply.`,
  },
];

const PRIVACY_SECTIONS = [
  {
    title: 'Data We Collect',
    content: `We collect (a) Account Data: email, company name, billing address, payment method tokens; (b) Usage Data: API call logs, endpoint paths, response times, credit consumption — all stored with PII redacted at ingestion via our automated logger; (c) Technical Data: IP addresses, User-Agent strings, geographic region signals used for fraud detection and data residency routing.`,
  },
  {
    title: 'Data We Process on Your Behalf',
    content: `As a Data Processor under GDPR Art. 28, zinbit processes B2B contact and company data strictly per your instructions. We do not sell or share this data with third parties. Data is processed in the region you configure (EU, US, or IN). We apply automated PII redaction (emails, SSNs, credit card numbers) before writing to internal logs.`,
  },
  {
    title: 'Your Rights (GDPR / CCPA / DPDP)',
    content: `Depending on your jurisdiction, you have rights to: (1) Access — request a copy of data we hold about you; (2) Rectification — correct inaccurate data; (3) Erasure — "right to be forgotten" requests are honored within 30 days and propagated via our End-to-End Opt-Out engine within 24 hours; (4) Data Portability — export your account data via the Console; (5) Restriction — limit processing while a dispute is pending; (6) Object — opt out of any direct marketing.`,
  },
  {
    title: 'Data Retention',
    content: `API request logs are retained for 90 days. Billing records are retained for 7 years per tax law. Anonymized aggregate analytics are retained indefinitely. Upon account deletion, personal data is purged within 30 days from active systems and within 90 days from backups.`,
  },
  {
    title: 'Security Measures',
    content: `zinbit maintains SOC 2 Type II and ISO 27001 certifications. All data is encrypted at rest (AES-256) and in transit (TLS 1.3). API Keys are stored as one-way SHA-256 hashes only. We conduct quarterly penetration testing and operate a public Bug Bounty program with Safe Harbor protections for qualifying researchers.`,
  },
  {
    title: 'Cookies and Tracking',
    content: `The zinbit Console uses strictly necessary cookies for authentication session management. We do not use advertising cookies or third-party trackers. Analytics are collected via a self-hosted, privacy-preserving system. You can disable non-essential cookies at any time from your browser settings.`,
  },
];

const DPA_SECTIONS = [
  {
    title: 'Subject Matter and Duration',
    content: `This DPA governs the processing of Personal Data by zinbit ("Processor") on behalf of the Customer ("Controller") in connection with the zinbit API Service. The DPA remains in effect for the duration of the Service Agreement.`,
  },
  {
    title: 'Nature and Purpose of Processing',
    content: `Personal Data is processed to perform B2B data enrichment, identity resolution, and contact intelligence services as described in the API documentation. Processing occurs only on documented instructions from the Controller.`,
  },
  {
    title: 'Technical and Organisational Measures (TOMs)',
    content: `zinbit implements TOMs including: (a) pseudonymization and encryption of Personal Data; (b) ongoing confidentiality, integrity, availability, and resilience of processing systems; (c) ability to restore data access following a physical or technical incident; (d) regular testing and evaluation of TOMs effectiveness via our quarterly pen-test program and Bug Bounty.`,
  },
  {
    title: 'Sub-processors',
    content: `zinbit uses the following approved sub-processors: AWS (infrastructure, EU/US/APAC regions), Stripe (payment processing), Postmark (transactional email), PlanetScale (managed database). You will be notified 30 days in advance of any changes to this list.`,
  },
  {
    title: 'Data Subject Rights',
    content: `zinbit will assist the Controller in fulfilling Data Subject requests (access, erasure, portability, restriction) within 5 business days of receiving a written request. Opt-out propagation is handled automatically within 24 hours via the End-to-End Opt-Out engine.`,
  },
];

const AUP_RULES = [
  { icon: '🚫', label: 'No Mass Scraping', detail: 'Automated bulk extraction beyond contracted volumes is prohibited and will trigger automatic key suspension.' },
  { icon: '🚫', label: 'No Resale Without License', detail: 'Redistributing or reselling API access or data outputs without a signed OEM Agreement is a material breach.' },
  { icon: '🚫', label: 'No Consumer Data', detail: 'The API is strictly for B2B use cases. Processing personal data of consumers (B2C) without explicit consent violates this policy.' },
  { icon: '🚫', label: 'No Weaponization', detail: 'Data may not be used for doxxing, harassment, surveillance, voter profiling, or any other harmful purpose.' },
  { icon: '✅', label: 'Permitted: CRM Enrichment', detail: 'Enriching your own CRM contacts with company and role data is the primary intended use case.' },
  { icon: '✅', label: 'Permitted: Sales Intelligence', detail: 'Building TAM lists, ICP filters, and account intelligence workflows is explicitly permitted.' },
  { icon: '✅', label: 'Permitted: Fraud Prevention', detail: 'Using entity resolution to validate business identities for KYB or fraud prevention is permitted.' },
  { icon: '✅', label: 'Permitted: Academic Research', detail: 'Non-commercial academic research with IRB approval is permitted under the Developer plan.' },
];

// ─── Sub-Components ───────────────────────────────────────────────────────────

function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-white/10 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-white/5 transition-colors"
      >
        <span className="text-sm font-bold text-white">{title}</span>
        <ChevronDown className={cn('w-4 h-4 text-white/40 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="px-6 pb-5 pt-1 border-t border-white/5">
          <p className="text-sm text-white/60 leading-relaxed">{children}</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LegalPage() {
  const [activeSection, setActiveSection] = useState('sla');
  const [searchQuery, setSearchQuery] = useState('');

  const lastUpdated = 'August 26, 2026';

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">

      {/* ── Header ── */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#111115] via-[#0d1117] to-[#09090b] p-8">
        <div className="absolute inset-0 opacity-20 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(ellipse at 20% 50%, rgba(70,189,198,0.15) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(139,92,246,0.1) 0%, transparent 50%)' }} />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-teal/10 border border-teal/20 flex items-center justify-center flex-shrink-0">
              <Scale className="w-7 h-7 text-teal" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-white tracking-tight">Legal Center</h1>
              <p className="text-white/50 text-sm mt-0.5">SLAs, Terms of Service, Privacy Policies & Compliance Documents</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-emerald-400">SOC 2 Type II Certified</span>
            </div>
            <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-2.5">
              <Award className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-bold text-blue-400">ISO 27001</span>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative mt-6 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            placeholder="Search legal documents…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-white/30 focus:outline-none focus:border-teal/50 focus:ring-1 focus:ring-teal/30 transition-all"
          />
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs text-white/30">
          <Clock className="w-3.5 h-3.5" />
          <span>Last updated: {lastUpdated} · Effective immediately for new accounts</span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">

        {/* ── Sidebar TOC ── */}
        <aside className="lg:w-56 flex-shrink-0">
          <div className="sticky top-4 bg-[#111115] border border-white/10 rounded-2xl p-3 space-y-1">
            <p className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white/30">Documents</p>
            {TOC_SECTIONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveSection(id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left',
                  activeSection === id
                    ? 'bg-teal/10 text-teal border border-teal/20'
                    : 'text-white/50 hover:text-white hover:bg-white/5 border border-transparent'
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="leading-tight">{label}</span>
              </button>
            ))}

            <div className="pt-3 border-t border-white/10 mt-2 space-y-2">
              <button onClick={window.print} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-white/40 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                <FileText className="w-4 h-4" /> Download PDF
              </button>
              
              <a href="mailto:legal@zintlr.com?subject=Custom DPA Request" className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-white/40 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                <Mail className="w-4 h-4" /> Request Custom DPA
              </a>
            </div>
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main className="flex-1 min-w-0 space-y-6">

          {/* === SLA === */}
          {activeSection === 'sla' && (
            <div className="space-y-6">
              <SectionHeader
                title="Service Level Agreement (SLA)"
                subtitle="Uptime guarantees, response time commitments, and service credit policies by plan tier."
                effectiveDate={lastUpdated}
                version="v3.1"
              />

              {/* Uptime Tiers */}
              <div className="grid gap-4 md:grid-cols-3">
                {SLA_TIERS.map(tier => (
                  <div key={tier.tier} className={cn(
                    'relative rounded-2xl border bg-[#111115] p-5 space-y-4',
                    tier.highlight ? 'border-teal/30 shadow-[0_0_30px_rgba(70,189,198,0.08)]' : 'border-white/10'
                  )}>
                    {tier.highlight && (
                      <div className="absolute -top-3 left-4">
                        <span className="bg-teal text-ink text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full">Most Popular</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-base font-extrabold text-white">{tier.tier}</span>
                      <span className={cn('text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full', tier.badge)}>{tier.uptime} SLA</span>
                    </div>
                    <div className="space-y-2.5">
                      {[
                        { label: 'Max Downtime', value: tier.uptimeMinutes },
                        { label: 'Latency (P99)', value: tier.responseTime },
                        { label: 'Support', value: tier.support },
                        { label: 'Incident Response', value: tier.incident },
                        { label: 'Service Credits', value: tier.credits },
                      ].map(row => (
                        <div key={row.label} className="flex items-start justify-between gap-2">
                          <span className="text-xs text-white/40 whitespace-nowrap">{row.label}</span>
                          <span className="text-xs text-white/80 text-right">{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* SLA Terms */}
              <div className="bg-[#111115] border border-white/10 rounded-2xl p-6 space-y-4">
                <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">Credit Claim Process</h3>
                <div className="grid sm:grid-cols-3 gap-4">
                  {[
                    { step: '01', title: 'Detect Incident', detail: 'Status page auto-updates at status.zinbit.zintlr.com. Subscribe to email/webhook alerts.' },
                    { step: '02', title: 'Submit Claim', detail: 'Email sla-claims@zintlr.com within 30 days of the incident with your account ID and request IDs.' },
                    { step: '03', title: 'Receive Credit', detail: 'Approved credits are applied to your next billing cycle within 5 business days.' },
                  ].map(s => (
                    <div key={s.step} className="flex gap-3">
                      <span className="text-2xl font-black text-teal/30 leading-none">{s.step}</span>
                      <div>
                        <p className="text-sm font-bold text-white">{s.title}</p>
                        <p className="text-xs text-white/50 mt-1">{s.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-start gap-3 bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-200/70">SLA exclusions apply for: scheduled maintenance windows (announced 72h in advance), force majeure events, client-side network issues, and API abuse that triggers DDoS mitigation.</p>
                </div>
              </div>
            </div>
          )}

          {/* === Terms of Service === */}
          {activeSection === 'terms' && (
            <div className="space-y-4">
              <SectionHeader title="Terms of Service" subtitle="The legal agreement governing your use of the zinbit API platform." effectiveDate={lastUpdated} version="v5.2" />
              <div className="space-y-2">
                {TERMS_SECTIONS.map(s => <CollapsibleSection key={s.title} title={s.title}>{s.content}</CollapsibleSection>)}
              </div>
              <LegalFooter docName="Terms of Service" />
            </div>
          )}

          {/* === Privacy Policy === */}
          {activeSection === 'privacy' && (
            <div className="space-y-4">
              <SectionHeader title="Privacy Policy" subtitle="How zinbit collects, uses, and protects your personal information." effectiveDate={lastUpdated} version="v4.0" />

              {/* GDPR/CCPA/DPDP Badge Row */}
              <div className="flex flex-wrap gap-3">
                {['GDPR Compliant', 'CCPA Ready', 'DPDP (India)', 'UK GDPR'].map(badge => (
                  <div key={badge} className="flex items-center gap-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-xs font-bold text-emerald-400">{badge}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                {PRIVACY_SECTIONS.map(s => <CollapsibleSection key={s.title} title={s.title}>{s.content}</CollapsibleSection>)}
              </div>

              {/* Contact DPO */}
              <div className="bg-[#111115] border border-white/10 rounded-2xl p-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-white">Data Protection Officer</p>
                  <p className="text-xs text-white/50 mt-1">For privacy requests, erasure requests, or DPO inquiries, contact our DPO directly.</p>
                </div>
                <a href="mailto:privacy@zintlr.com" className="flex-shrink-0 flex items-center gap-2 bg-teal/10 hover:bg-teal/20 border border-teal/20 text-teal text-xs font-bold px-4 py-2.5 rounded-xl transition-colors">
                  <ExternalLink className="w-3.5 h-3.5" />
                  privacy@zintlr.com
                </a>
              </div>
              <LegalFooter docName="Privacy Policy" />
            </div>
          )}

          {/* === DPA === */}
          {activeSection === 'dpa' && (
            <div className="space-y-4">
              <SectionHeader title="Data Processing Agreement" subtitle="GDPR Article 28 compliant DPA governing zinbit's role as a Data Processor." effectiveDate={lastUpdated} version="v2.3" />

              <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 flex items-start gap-3">
                <Lock className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-blue-300">Automatic DPA for EU Customers</p>
                  <p className="text-xs text-blue-300/70 mt-1">If your API key is configured with EU data residency, this DPA is automatically incorporated into your Service Agreement. For custom DPAs with specific schedules, contact legal@zintlr.com.</p>
                </div>
              </div>

              <div className="space-y-2">
                {DPA_SECTIONS.map(s => <CollapsibleSection key={s.title} title={s.title}>{s.content}</CollapsibleSection>)}
              </div>

              {/* Sub-processor list */}
              <div className="bg-[#111115] border border-white/10 rounded-2xl p-6 space-y-4">
                <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">Approved Sub-Processors</h3>
                <div className="divide-y divide-white/5">
                  {[
                    { name: 'Amazon Web Services', purpose: 'Cloud Infrastructure (EU/US/APAC)', country: 'USA', certifications: 'ISO 27001, SOC 2' },
                    { name: 'Stripe Inc.', purpose: 'Payment Processing', country: 'USA', certifications: 'PCI DSS Level 1' },
                    { name: 'Postmark (ActiveCampaign)', purpose: 'Transactional Email', country: 'USA', certifications: 'SOC 2' },
                    { name: 'PlanetScale', purpose: 'Managed Database (sharded MySQL)', country: 'USA', certifications: 'SOC 2' },
                  ].map(sp => (
                    <div key={sp.name} className="flex items-center justify-between py-3 gap-4">
                      <div>
                        <p className="text-sm font-bold text-white">{sp.name}</p>
                        <p className="text-xs text-white/40">{sp.purpose}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-white/60">{sp.country}</p>
                        <p className="text-[10px] text-white/30 mt-0.5">{sp.certifications}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <LegalFooter docName="Data Processing Agreement" />
            </div>
          )}

          {/* === AUP === */}
          {activeSection === 'aup' && (
            <div className="space-y-6">
              <SectionHeader title="Acceptable Use Policy" subtitle="What you can and cannot build with zinbit APIs." effectiveDate={lastUpdated} version="v1.8" />

              <div className="grid sm:grid-cols-2 gap-3">
                {AUP_RULES.map(rule => {
                  const isAllowed = rule.icon === '✅';
                  return (
                    <div key={rule.label} className={cn(
                      'rounded-xl border p-4 space-y-1.5',
                      isAllowed ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'
                    )}>
                      <div className="flex items-center gap-2.5">
                        <span className="text-base leading-none">{rule.icon}</span>
                        <span className={cn('text-sm font-bold', isAllowed ? 'text-emerald-300' : 'text-red-300')}>{rule.label}</span>
                      </div>
                      <p className="text-xs text-white/50 pl-7">{rule.detail}</p>
                    </div>
                  );
                })}
              </div>

              <div className="bg-[#111115] border border-white/10 rounded-2xl p-5 space-y-2">
                <h3 className="text-sm font-extrabold text-white">Enforcement</h3>
                <p className="text-sm text-white/50 leading-relaxed">Violations of this AUP may result in immediate API key suspension, account termination, or legal action without prior notice. zinbit's fraud detection and WAF systems automatically enforce rate limits and behavioral anomaly policies in real time. To report suspected abuse, email abuse@zintlr.com.</p>
              </div>
              <LegalFooter docName="Acceptable Use Policy" />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ─── Shared Sub-Components ────────────────────────────────────────────────────

function SectionHeader({ title, subtitle, effectiveDate, version }: {
  title: string; subtitle: string; effectiveDate: string; version: string;
}) {
  return (
    <div className="bg-[#111115] border border-white/10 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 className="text-xl font-extrabold text-white">{title}</h2>
        <p className="text-sm text-white/50 mt-1">{subtitle}</p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="text-right">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Version</p>
          <p className="text-sm font-bold text-white">{version}</p>
        </div>
        <div className="w-px h-8 bg-white/10" />
        <div className="text-right">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Effective</p>
          <p className="text-xs font-bold text-white">{effectiveDate}</p>
        </div>
        <button onClick={window.print} className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors">
          <Download className="w-3.5 h-3.5" />
          PDF
        </button>
      </div>
    </div>
  );
}

function LegalFooter({ docName }: { docName: string }) {
  return (
    <div className="border-t border-white/5 pt-4 flex items-center justify-between text-xs text-white/30">
      <span>© {new Date().getFullYear()} zinbit by Zintlr. All rights reserved.</span>
      <span>Questions about this {docName}? <a href="mailto:legal@zintlr.com" className="text-teal hover:underline">legal@zintlr.com</a></span>
    </div>
  );
}

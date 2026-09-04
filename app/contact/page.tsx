'use client';

import { useState } from 'react';
import { Mail, Building2, User, Send, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    company: '',
    volume: 'under_1m',
    message: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white flex flex-col">
      {/* Navbar */}
      <nav className="h-20 border-b border-white/10 flex items-center justify-between px-6 lg:px-12 relative z-50">
        <Link href="/" className="flex items-center gap-3 group">
          <Logo variant="auto" />
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/login" className="text-sm font-bold text-white/70 hover:text-white transition-colors">Log In</Link>
          <Link href="/signup" className="text-sm font-bold bg-white text-ink px-5 py-2.5 rounded-full hover:bg-neutral-200 transition-colors">Start Free Trial</Link>
        </div>
      </nav>

      <main className="flex-grow flex items-center justify-center py-20 px-6">
        <div className="max-w-5xl w-full grid md:grid-cols-2 gap-16 lg:gap-24 items-center">
          
          {/* Left: Copy */}
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal/10 border border-teal/20 text-teal text-xs font-bold uppercase tracking-widest">
              Enterprise Sales
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1]">
              Talk to our data <br className="hidden lg:block"/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal to-blue-500">specialists.</span>
            </h1>
            <p className="text-lg text-white/60 leading-relaxed max-w-md">
              Whether you need custom SLA commitments, OEM licensing for your SaaS, or multi-region data residency, we&apos;re here to help you scale.
            </p>

            <div className="space-y-6 pt-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 mt-1">
                  <CheckCircle2 className="w-5 h-5 text-teal" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Custom Volume Pricing</h3>
                  <p className="text-sm text-white/50 mt-1">Discounts available for &gt;10M requests/mo.</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 mt-1">
                  <CheckCircle2 className="w-5 h-5 text-teal" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Dedicated Support</h3>
                  <p className="text-sm text-white/50 mt-1">Shared Slack channels and 15-min SLAs.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Form */}
          <div className="bg-[#111115] border border-white/10 rounded-3xl p-8 lg:p-10 shadow-2xl relative overflow-hidden">
            {submitted ? (
              <div className="text-center py-16 animate-in fade-in zoom-in duration-500">
                <div className="w-20 h-20 mx-auto bg-teal/10 border border-teal/20 rounded-full flex items-center justify-center mb-6">
                  <CheckCircle2 className="w-10 h-10 text-teal" />
                </div>
                <h3 className="text-2xl font-extrabold text-white mb-3">Request Received</h3>
                <p className="text-white/60 leading-relaxed mb-8">
                  Our enterprise team will reach out to {formData.email} within 1 business day.
                </p>
                <button 
                  onClick={() => setSubmitted(false)}
                  className="text-sm font-bold text-teal hover:text-teal-ice transition-colors"
                >
                  Submit another request
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-white/60">First Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                      <input required type="text" value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:border-teal/50 focus:ring-1 focus:ring-teal/30 outline-none transition-all" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-white/60">Last Name</label>
                    <input required type="text" value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-white focus:border-teal/50 focus:ring-1 focus:ring-teal/30 outline-none transition-all" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/60">Work Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                    <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:border-teal/50 focus:ring-1 focus:ring-teal/30 outline-none transition-all" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/60">Company Name</label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                    <input required type="text" value={formData.company} onChange={e => setFormData({...formData, company: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:border-teal/50 focus:ring-1 focus:ring-teal/30 outline-none transition-all" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/60">Expected API Volume</label>
                  <select value={formData.volume} onChange={e => setFormData({...formData, volume: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-white focus:border-teal/50 focus:ring-1 focus:ring-teal/30 outline-none transition-all appearance-none cursor-pointer">
                    <option value="under_1m" className="bg-[#111115]">Under 1,000,000 req/mo</option>
                    <option value="1m_10m" className="bg-[#111115]">1M - 10M req/mo</option>
                    <option value="over_10m" className="bg-[#111115]">10M+ req/mo</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-white/60">How can we help?</label>
                  <textarea required rows={4} value={formData.message} onChange={e => setFormData({...formData, message: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm text-white focus:border-teal/50 focus:ring-1 focus:ring-teal/30 outline-none transition-all resize-none" placeholder="Tell us about your use case..."></textarea>
                </div>

                <button type="submit" className="w-full bg-teal hover:bg-teal-ice text-ink font-bold py-3.5 rounded-xl transition-all shadow-[0_0_20px_rgba(70,189,198,0.2)] hover:shadow-[0_0_30px_rgba(70,189,198,0.4)] flex items-center justify-center gap-2 mt-2">
                  Send Message
                  <Send className="w-4 h-4" />
                </button>
                <p className="text-[10px] text-white/30 text-center px-4 mt-4">
                  By submitting this form, you agree to our <Link href="/console/legal" className="underline hover:text-white transition-colors">Privacy Policy</Link>.
                </p>
              </form>
            )}
            
            {/* Decorative background glow */}
            <div className="absolute -top-32 -right-32 w-64 h-64 bg-teal/10 rounded-full blur-[80px] pointer-events-none" />
          </div>
        </div>
      </main>
    </div>
  );
}

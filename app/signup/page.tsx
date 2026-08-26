'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ShieldCheck, ArrowRight, Loader2 } from 'lucide-react';
import { useStore } from '@/lib/store';
import Link from 'next/link';
import { Logo } from '@/components/Logo';

export default function SignupPage() {
  const router = useRouter();
  const signup = useStore(state => state.signup);
  
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!email || !company || !password) {
      setError('All fields are required.');
      return;
    }
    
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setIsSubmitting(true);
    setStatusText('Creating account...');
    
    // Simulate network delay for account creation
    await new Promise(r => setTimeout(r, 600));
    
    setStatusText('Provisioning Sandbox Environment...');
    // Simulate delay for sandbox provisioning
    await new Promise(r => setTimeout(r, 800));

    // Update global state
    signup(email, company);
    
    // Redirect to keys
    router.push('/console/keys?new=true');
  };

  return (
    <div className="min-h-screen bg-ink flex flex-col justify-center relative overflow-hidden font-sans selection:bg-teal selection:text-ink">
      
      {/* Background Grids & Blurs */}
      <div className="grid-dark absolute inset-0 opacity-40 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-teal/10 blur-[120px] rounded-full -z-10 pointer-events-none" />

      {/* Top Navigation Logo */}
      <div className="absolute top-0 left-0 w-full p-6">
        <Link href="/" className="flex items-center gap-2 w-fit">
          <Logo />
        </Link>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        className="w-full max-w-[440px] mx-auto px-6"
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-display font-extrabold text-white mb-3">Create your account</h1>
          <p className="text-white/60">Start building with 400M+ B2B identities.</p>
        </div>

        <div className="glass rounded-3xl p-8 border-gradient shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
          <button 
            type="button"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-3 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed mb-6"
          >
            Continue with GitHub
          </button>

          <div className="relative flex items-center py-4 mb-2">
            <div className="flex-grow border-t border-white/10"></div>
            <span className="flex-shrink-0 mx-4 text-white/30 text-xs font-semibold uppercase tracking-wider">Or</span>
            <div className="flex-grow border-t border-white/10"></div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {error && (
              <div className="bg-semantic-error/10 border border-semantic-error/20 text-semantic-error px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-semantic-error flex-shrink-0" />
                {error}
              </div>
            )}
            
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider">Work Email</label>
                <button 
                  type="button" 
                  onClick={() => {
                    setEmail('demo@example.com');
                    setCompany('Acme Corp');
                    setPassword('password123');
                  }}
                  className="text-[10px] uppercase font-bold text-teal bg-teal/10 hover:bg-teal/20 px-2 py-0.5 rounded transition-colors"
                >
                  Fill Demo Data
                </button>
              </div>
              <input 
                type="email" 
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={isSubmitting}
                className="w-full bg-[#09090B] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-teal/50 focus:ring-1 focus:ring-teal/50 transition-all disabled:opacity-50"
                placeholder="developer@startup.com"
              />
            </div>
            
            <div>
              <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">Company Name</label>
              <input 
                type="text" 
                required
                value={company}
                onChange={e => setCompany(e.target.value)}
                disabled={isSubmitting}
                className="w-full bg-[#09090B] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-teal/50 focus:ring-1 focus:ring-teal/50 transition-all disabled:opacity-50"
                placeholder="Acme Corp"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">Password</label>
              <input 
                type="password" 
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={isSubmitting}
                className="w-full bg-[#09090B] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-teal/50 focus:ring-1 focus:ring-teal/50 transition-all disabled:opacity-50"
                placeholder="••••••••"
              />
            </div>

            <div className="flex items-center gap-2 mt-2">
              <input 
                type="checkbox" 
                id="keepLoggedIn" 
                className="w-4 h-4 rounded border-white/10 bg-white/5 text-teal focus:ring-teal/50 focus:ring-offset-0" 
                defaultChecked
              />
              <label htmlFor="keepLoggedIn" className="text-sm text-white/60 font-medium cursor-pointer">
                Keep me logged in
              </label>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 bg-teal text-ink py-3.5 rounded-xl font-bold hover:bg-teal-ice transition-all shadow-[0_0_20px_rgba(70,189,198,0.3)] hover:shadow-[0_0_30px_rgba(70,189,198,0.5)] disabled:opacity-70 disabled:cursor-wait"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {statusText}
                  </>
                ) : (
                  <>
                    Create Account
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
        
        <p className="text-center text-sm text-white/40 mt-8">
          By signing up, you agree to our <Link href="/console/legal" className="text-white hover:text-teal underline decoration-white/20 underline-offset-4">Terms of Service</Link> and <Link href="/console/legal" className="text-white hover:text-teal underline decoration-white/20 underline-offset-4">Privacy Policy</Link>.
        </p>

        <p className="text-center text-sm font-semibold text-white mt-6">
          Already have an account? <Link href="/login" className="text-teal hover:text-teal-ice transition-colors">Sign in</Link>
        </p>
      </motion.div>
    </div>
  );
}

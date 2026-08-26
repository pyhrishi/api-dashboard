'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { motion } from 'framer-motion';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useStore } from '@/lib/store';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const login = useStore(state => state.login);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [resetSent, setResetSent] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Email is required.');
      return;
    }
    setIsSubmitting(true);
    setStatusText('Sending link...');
    await new Promise(r => setTimeout(r, 800));
    setResetSent(true);
    setIsSubmitting(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!email || !password) {
      setError('All fields are required.');
      return;
    }
    
    // Simulate invalid credentials error
    if (email.includes('error') || email.includes('invalid')) {
      setError('Invalid email or password.');
      return;
    }

    setIsSubmitting(true);
    setStatusText('Signing in...');
    
    // Simulate network delay for authentication
    await new Promise(r => setTimeout(r, 800));

    // Update global state
    login(email);
    
    // Redirect to console
    router.push('/console');
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
          <h1 className="text-3xl font-display font-extrabold text-white mb-3">
            {mode === 'login' ? 'Welcome back' : 'Reset password'}
          </h1>
          <p className="text-white/60">
            {mode === 'login' ? 'Sign in to your zinbit account.' : 'Enter your email to receive a reset link.'}
          </p>
        </div>

        <div className="glass rounded-3xl p-8 border-gradient shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
          {mode === 'login' ? (
            <>
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
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider">Password</label>
                    <button 
                      type="button"
                      onClick={() => setMode('forgot')} 
                      className="text-[10px] uppercase font-bold text-teal hover:text-teal-ice transition-colors"
                    >
                      Forgot?
                    </button>
                  </div>
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
                  <input type="checkbox" id="remember" className="rounded border-white/10 bg-white/5 text-teal focus:ring-teal/50" />
                  <label htmlFor="remember" className="text-xs text-white/50">Remember me for 30 days</label>
                </div>

                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="group w-full relative flex items-center justify-center gap-2 bg-teal text-ink font-bold py-3 rounded-xl hover:bg-teal-ice transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4 shadow-[0_0_20px_rgba(70,189,198,0.2)] hover:shadow-[0_0_30px_rgba(70,189,198,0.4)]"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {statusText}
                    </>
                  ) : (
                    <>
                      Sign in
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </button>
              </form>
            </>
          ) : (
            // Forgot Password Mode
            <form onSubmit={handleReset} className="space-y-4">
              {resetSent ? (
                <div className="text-center py-4">
                  <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">Check your email</h3>
                  <p className="text-sm text-white/60 mb-6">We've sent a password reset link to {email}.</p>
                  <button 
                    type="button"
                    onClick={() => { setMode('login'); setResetSent(false); }}
                    className="w-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors py-3 rounded-xl text-sm font-semibold text-white"
                  >
                    Return to login
                  </button>
                </div>
              ) : (
                <>
                  {error && (
                    <div className="bg-semantic-error/10 border border-semantic-error/20 text-semantic-error px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-semantic-error flex-shrink-0" />
                      {error}
                    </div>
                  )}
                  
                  <div>
                    <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">Work Email</label>
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

                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="w-full flex items-center justify-center gap-2 bg-teal text-ink font-bold py-3 rounded-xl hover:bg-teal-ice transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4 shadow-[0_0_20px_rgba(70,189,198,0.2)]"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      'Send Reset Link'
                    )}
                  </button>
                  
                  <button 
                    type="button"
                    onClick={() => { setMode('login'); setError(''); }}
                    className="w-full text-xs font-bold text-white/50 hover:text-white transition-colors mt-4"
                  >
                    Back to login
                  </button>
                </>
              )}
            </form>
          )}
        </div>
        
        <p className="text-center text-sm font-semibold text-white mt-8">
          Don't have an account? <Link href="/signup" className="text-teal hover:text-teal-ice transition-colors">Sign up</Link>
        </p>
      </motion.div>
    </div>
  );
}

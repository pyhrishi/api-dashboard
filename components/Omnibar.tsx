'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Command, ArrowRight, FileText, Play, Settings, CreditCard, Key } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Portal } from './Portal';

export function Omnibar() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Handle Cmd+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else if (!isOpen) {
      setQuery('');
    }
  }, [isOpen]);

  const searchResults = [
    { icon: <Play className="w-4 h-4 text-teal" />, title: 'Find Phone by Email', subtitle: 'API Explorer • GET /v1/people/phone', href: '/console/explorer' },
    { icon: <Key className="w-4 h-4 text-white/60" />, title: 'Create API Key', subtitle: 'Console • Keys', href: '/console/keys' },
    { icon: <FileText className="w-4 h-4 text-white/60" />, title: 'Authentication Setup', subtitle: 'Documentation • Getting Started', href: '/docs' },
    { icon: <CreditCard className="w-4 h-4 text-white/60" />, title: 'Manage Billing', subtitle: 'Console • Billing', href: '/console/billing' },
    { icon: <Settings className="w-4 h-4 text-white/60" />, title: 'Security Settings', subtitle: 'Console • Settings', href: '/console/settings/security' },
  ];

  const filteredResults = query
    ? searchResults.filter(r => r.title.toLowerCase().includes(query.toLowerCase()) || r.subtitle.toLowerCase().includes(query.toLowerCase()))
    : searchResults;

  const handleNavigate = (href: string) => {
    setIsOpen(false);
    router.push(href);
  };

  return (
    <>
      {/* Search Bar Trigger */}
      <div className="relative w-full group max-w-3xl mx-auto mb-8">
        <div className="absolute -inset-1 bg-gradient-to-r from-teal/20 to-teal/0 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200" />
        <button 
          onClick={() => setIsOpen(true)}
          className="relative w-full flex items-center justify-between bg-[#111115] border border-white/10 hover:border-teal/30 rounded-2xl px-6 py-4 transition-all shadow-xl"
        >
          <div className="flex items-center gap-4">
            <Search className="w-5 h-5 text-teal" />
            <span className="text-white/40 font-medium text-lg text-left">Search endpoints, docs, or settings...</span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/40 text-sm font-medium">
            <Command className="w-3.5 h-3.5" /> K
          </div>
        </button>
      </div>

      {/* Command Palette Modal */}
      <Portal>
        <AnimatePresence>
          {isOpen && (
            <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 sm:pt-32 px-4">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsOpen(false)}
              />
              
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: -20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -20 }}
                className="relative w-full max-w-2xl bg-ink border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col"
              >
                {/* Input */}
                <div className="flex items-center px-6 py-4 border-b border-white/10 bg-[#111115]">
                  <Search className="w-6 h-6 text-teal mr-4" />
                  <input 
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="What are you looking for?"
                    className="flex-1 bg-transparent border-none text-xl text-white focus:outline-none focus:ring-0 placeholder-white/30"
                  />
                  <button onClick={() => setIsOpen(false)} className="text-xs font-bold text-white/40 hover:text-white px-2 py-1 rounded-md bg-white/5 border border-white/10 transition-colors ml-4">
                    ESC
                  </button>
                </div>

                {/* Results */}
                <div className="max-h-[60vh] overflow-y-auto p-4 space-y-2 bg-[#09090b]">
                  {filteredResults.length > 0 ? (
                    filteredResults.map((result, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleNavigate(result.href)}
                        className="w-full flex items-center justify-between p-4 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 transition-all text-left group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="p-2 rounded-lg bg-white/5 border border-white/10 group-hover:bg-white/10 transition-colors">
                            {result.icon}
                          </div>
                          <div>
                            <h4 className="text-white font-bold group-hover:text-teal transition-colors">{result.title}</h4>
                            <p className="text-white/40 text-xs mt-0.5 font-medium">{result.subtitle}</p>
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-teal transition-colors" />
                      </button>
                    ))
                  ) : (
                    <div className="py-12 text-center text-white/40">
                      <Search className="w-8 h-8 mx-auto mb-3 opacity-20" />
                      No results found for "{query}"
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </Portal>
    </>
  );
}

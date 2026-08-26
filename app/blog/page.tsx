'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Terminal, Database, ShieldCheck, Cpu, ArrowRight, BookOpen } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { Logo } from '@/components/Logo';

import { BLOG_POSTS } from './data';
export default function BlogIndex() {
  const toast = useToast();
  return (
    <div className="bg-ink min-h-screen text-white font-sans selection:bg-teal selection:text-ink">
      <div className="grid-dark absolute inset-0 opacity-30 pointer-events-none" />
      <div className="absolute top-0 right-0 w-[600px] h-[400px] bg-teal/10 blur-[120px] rounded-full -z-10 pointer-events-none translate-x-1/4 -translate-y-1/4" />
      
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-ink/70 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-6 h-[76px] flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Logo variant="auto" />
            <span className="font-bold text-white/50 border-l border-white/20 pl-4 ml-2">Engineering</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/docs" className="text-sm font-medium text-white/70 hover:text-white transition-colors">API Docs</Link>
            <Link href="/console" className="text-sm font-medium text-white/70 hover:text-white transition-colors">Console</Link>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-20 relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-20 text-center"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-teal/10 border border-teal/20 mb-6 text-teal">
            <BookOpen className="w-8 h-8" />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-4 font-display">Engineering Blog</h1>
          <p className="text-white/60 font-medium text-lg max-w-2xl mx-auto leading-relaxed">
            Technical deep-dives, architecture decisions, and performance optimizations straight from the engineers building the zinbit by Zintlr API.
          </p>
        </motion.div>

        <div className="space-y-8">
          {BLOG_POSTS.map((post, i) => (
            <motion.article 
              key={post.slug}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <Link href={`/blog/${post.slug}`} className="block glass-inner rounded-3xl p-8 border border-white/10 hover:border-teal/30 hover:bg-white/5 transition-all group">
                <div className="flex flex-col md:flex-row md:items-start gap-6">
                  <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    {post.icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3 text-xs font-bold uppercase tracking-wider text-white/40">
                      <span className="text-teal">{post.category}</span>
                      <span>•</span>
                      <span>{post.date}</span>
                      <span>•</span>
                      <span>{post.readTime}</span>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-3 group-hover:text-teal transition-colors">
                      {post.title}
                    </h2>
                    <p className="text-white/60 leading-relaxed font-medium mb-6">
                      {post.excerpt}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-teal to-blue-500" />
                        <div>
                          <p className="text-sm font-bold text-white">{post.author.name}</p>
                          <p className="text-xs text-white/40 font-medium">{post.author.role}</p>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1.5 text-sm font-bold text-teal group-hover:translate-x-1 transition-transform">
                        Read Article <ArrowRight className="w-4 h-4" />
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            </motion.article>
          ))}
        </div>

        <div className="mt-16 flex justify-center">
          <button 
            onClick={() => toast.info('Loading articles...', 'Pagination is mocked for this prototype.')}
            className="px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full font-bold text-white transition-colors"
          >
            Load More Articles
          </button>
        </div>
      </main>

      <footer className="bg-ink border-t border-white/10 py-12 text-center mt-20">
        <div className="max-w-5xl mx-auto px-6 flex flex-col items-center">
          <ShieldCheck className="w-8 h-8 text-white/20 mb-4" />
          <div className="text-sm font-semibold text-white/30">
            © {new Date().getFullYear()} zinbit by Zintlr.
          </div>
        </div>
      </footer>
    </div>
  );
}

'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ShieldCheck, ArrowLeft, Terminal, Copy, Check } from 'lucide-react';
import { BLOG_POSTS } from '../page';

export default function BlogPost({ params }: { params: { slug: string } }) {
  const post = BLOG_POSTS.find((p) => p.slug === params.slug) || BLOG_POSTS[0];
  const [copied, setCopied] = React.useState(false);

  const copyCode = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-ink min-h-screen text-white font-sans selection:bg-teal selection:text-ink">
      <div className="grid-dark absolute inset-0 opacity-30 pointer-events-none" />
      
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-ink/70 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-6 h-[76px] flex items-center justify-between">
          <Link href="/blog" className="flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm font-bold">
            <ArrowLeft className="w-4 h-4" /> Back to Blog
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/docs" className="text-sm font-medium text-white/70 hover:text-white transition-colors">API Docs</Link>
            <Link href="/console" className="text-sm font-medium text-white/70 hover:text-white transition-colors">Console</Link>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-20 relative z-10">
        <motion.article 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Post Header */}
          <header className="mb-16">
            <div className="flex items-center gap-3 mb-6 text-sm font-bold uppercase tracking-wider text-teal">
              <span>{post.category}</span>
              <span className="text-white/20">•</span>
              <span className="text-white/40">{post.date}</span>
              <span className="text-white/20">•</span>
              <span className="text-white/40">{post.readTime}</span>
            </div>
            
            <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-8 font-display leading-[1.1]">
              {post.title}
            </h1>
            
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-teal to-blue-500" />
              <div>
                <p className="text-base font-bold text-white">{post.author.name}</p>
                <p className="text-sm text-white/50 font-medium">{post.author.role} @ Zintlr</p>
              </div>
            </div>
          </header>

          <hr className="border-white/10 mb-12" />

          {/* Dummy Markdown Content */}
          <div className="prose prose-invert prose-teal max-w-none prose-lg prose-p:text-white/70 prose-headings:text-white prose-headings:font-bold prose-a:text-teal hover:prose-a:text-teal-ice prose-code:text-teal-ice prose-code:bg-teal/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:before:content-none prose-code:after:content-none space-y-8">
            <p className="lead text-xl text-white/80 font-medium leading-relaxed">
              {post.excerpt}
            </p>
            
            <p>
              When we first architected the Zintlr Identity Engine, our primary datastore was a vertically scaled PostgreSQL instance. While robust for standard transactional workloads, executing deep relationship queries across hundreds of millions of corporate entities resulted in significant query planner overhead and unacceptable latencies at the edge.
            </p>

            <h2 className="text-2xl font-bold mt-12 mb-6">The Breaking Point</h2>
            <p>
              As our dataset surpassed the 400M entity mark, complex queries like <code>Find all Directors who have worked at a SaaS company in Bangalore with &gt;50 employees</code> started timing out. B-Tree indexes were no longer sufficient for multi-hop relationship traversals.
            </p>

            <h2 className="text-2xl font-bold mt-12 mb-6">Migrating to a Distributed Graph</h2>
            <p>
              We evaluated several distributed graph databases and ultimately settled on a custom architecture utilizing a high-performance graph traversal engine backed by distributed KV stores. This decoupled our storage layer from the query execution layer, allowing us to scale read capacity infinitely across regions.
            </p>

            <div className="my-8 relative group">
              <div className="absolute flex items-center justify-between top-0 inset-x-0 px-4 py-2 bg-white/5 border-b border-white/10 rounded-t-xl">
                <div className="flex items-center gap-2 text-xs font-mono text-white/40">
                  <Terminal className="w-3 h-3" />
                  rust_traversal_engine.rs
                </div>
                <button onClick={copyCode} className="text-white/40 hover:text-white transition-colors">
                  {copied ? <Check className="w-4 h-4 text-semantic-success" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <pre className="!mt-0 !pt-12 bg-[#09090b] border border-white/10 rounded-xl overflow-x-auto shadow-2xl p-6 text-sm font-mono text-white/80">
<code>{`// A simplified snippet of our traversal macro
#[derive(Debug, Clone)]
pub struct IdentityGraph {
    nodes: Arc<DashMap<EntityId, NodeData>>,
    edges: Arc<DashMap<EdgeId, EdgeData>>,
}

impl IdentityGraph {
    pub async fn traverse_relationship(&self, start: EntityId, depth: u8) -> Result<Vec<EntityId>> {
        let mut visited = HashSet::new();
        let mut queue = VecDeque::new();
        
        queue.push_back((start, 0));
        
        while let Some((current_node, current_depth)) = queue.pop_front() {
            if current_depth >= depth { continue; }
            // Highly optimized concurrent neighbor resolution
            // ...
        }
        
        Ok(visited.into_iter().collect())
    }
}`}</code>
              </pre>
            </div>

            <p>
              By utilizing Rust for the core traversal engine, we eliminated garbage collection pauses and maintained deterministic memory access patterns. 
            </p>

            <h2 className="text-2xl font-bold mt-12 mb-6">The Results: 120ms p99 Latency</h2>
            <p>
              The migration resulted in a staggering improvement in query performance. Our p99 latency dropped from 800ms down to a stable 120ms, even during peak load, allowing our API consumers to implement real-time enrichment directly in their front-end workflows without degrading the user experience.
            </p>
          </div>
        </motion.article>
      </main>

      <footer className="bg-ink border-t border-white/10 py-12 text-center mt-20">
        <div className="max-w-5xl mx-auto px-6 flex flex-col items-center">
          <ShieldCheck className="w-8 h-8 text-white/20 mb-4" />
          <div className="text-sm font-semibold text-white/30">
            © {new Date().getFullYear()} Zintlr Engineering.
          </div>
        </div>
      </footer>
    </div>
  );
}

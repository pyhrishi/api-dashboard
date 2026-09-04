'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { ENDPOINTS } from '@/src/data/endpoints';
import RequestBuilder from '@/src/components/RequestBuilder';
import { ArrowLeft, BookOpen, ChevronRight, Server, Terminal, Download, Cloud, Database, ArrowRight } from 'lucide-react';
import { CodeBlock } from '@/components/CodeBlock';
import { cn } from '@/lib/utils';

export default function PremiumDocsPage() {
  const { activeKeys } = useStore();
  const apiKey = activeKeys[0]?.key || 'sk_test_demo_key';
  const [activeEndpoint, setActiveEndpoint] = useState<string>(ENDPOINTS[0].id);
  const [authTab, setAuthTab] = useState<'curl' | 'node' | 'python'>('curl');

  // Simple scroll spying
  useEffect(() => {
    const handleScroll = () => {
      const sections = ENDPOINTS.map(e => document.getElementById(e.id));
      let current = activeEndpoint;
      sections.forEach(sec => {
        if (sec) {
          const rect = sec.getBoundingClientRect();
          // If the top of the section is near the top of the viewport
          if (rect.top <= 200 && rect.bottom >= 200) {
            current = sec.id;
          }
        }
      });
      if (current !== activeEndpoint) {
        setActiveEndpoint(current);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [activeEndpoint]);

  const MethodBadge = ({ method }: { method: string }) => (
    <span className={cn(
      "px-3 py-1 text-[11px] font-black rounded-lg tracking-widest",
      method === 'GET' ? "bg-blue-100 text-blue-700 border border-blue-200 shadow-inner" : "bg-teal/10 text-teal border border-teal/20 shadow-inner"
    )}>
      {method}
    </span>
  );

  return (
    <div className="min-h-screen bg-ink flex flex-col font-sans selection:bg-teal selection:text-ink">
      
      {/* Top Nav */}
      <header className="sticky top-0 z-50 h-16 bg-ink/80 backdrop-blur-xl border-b border-white/10 flex items-center px-6 justify-between flex-shrink-0 shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/console" className="p-2 bg-white/5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-all shadow-inner">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-teal" />
            <h1 className="text-xl font-extrabold text-white tracking-tight">API Reference</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a 
            href="/api/docs/postman"
            download="Zinbit_Postman_Collection.json"
            className="text-xs font-bold text-[#FF6C37] hover:text-[#FF6C37]/80 px-4 py-2 rounded-lg border border-[#FF6C37]/20 bg-[#FF6C37]/5 hover:bg-[#FF6C37]/10 transition-colors flex items-center gap-2 shadow-sm"
          >
            <Download className="w-4 h-4" />
            Run in Postman
          </a>
          <a 
            href="/api/docs" 
            target="_blank"
            className="text-xs font-bold text-teal hover:text-teal-ice px-4 py-2 rounded-lg border border-teal/20 bg-teal/5 hover:bg-teal/10 transition-colors flex items-center gap-2 shadow-sm"
          >
            <Server className="w-4 h-4" />
            OpenAPI Spec
          </a>
        </div>
      </header>

      {/* Main 2-Column Layout */}
      <div className="flex-1 flex w-full max-w-[1400px] mx-auto relative px-6">
        
        {/* Fixed Left Navigation */}
        <aside className="hidden lg:flex flex-col border-r border-white/10 h-[calc(100vh-4rem)] sticky top-16 bg-ink z-20 flex-shrink-0 w-72 overflow-hidden">
          <div className="p-6 flex-1 overflow-y-auto space-y-8 pb-20">
            <div>
              <h3 className="text-[11px] font-black text-white/40 uppercase tracking-widest mb-3">Getting Started</h3>
              <ul className="space-y-1">
                <li><button onClick={() => document.getElementById('architecture')?.scrollIntoView({ behavior: 'smooth' })} className="flex items-center text-sm font-medium text-white/60 hover:text-white py-1.5 transition-colors w-full text-left">
                  Architecture & Data Flow
                </button></li>
                <li><button onClick={() => document.getElementById('authentication')?.scrollIntoView({ behavior: 'smooth' })} className="flex items-center text-sm font-medium text-white/60 hover:text-white py-1.5 transition-colors w-full text-left">
                  Authentication
                </button></li>
                <li><button onClick={() => document.getElementById('sdks')?.scrollIntoView({ behavior: 'smooth' })} className="flex items-center text-sm font-medium text-white/60 hover:text-white py-1.5 transition-colors w-full text-left">
                  Official SDKs
                </button></li>
                <li><button onClick={() => document.getElementById('errors')?.scrollIntoView({ behavior: 'smooth' })} className="flex items-center text-sm font-medium text-white/60 hover:text-white py-1.5 transition-colors w-full text-left">
                  Errors
                </button></li>
                <li><button onClick={() => document.getElementById('mock-data')?.scrollIntoView({ behavior: 'smooth' })} className="flex items-center text-sm font-medium text-white/60 hover:text-white py-1.5 transition-colors w-full text-left">
                  Testing & Mock Data
                </button></li>
                <li><button onClick={() => document.getElementById('rate-limits')?.scrollIntoView({ behavior: 'smooth' })} className="flex items-center text-sm font-medium text-white/60 hover:text-white py-1.5 transition-colors w-full text-left">
                  Rate Limits
                </button></li>
                <li><button onClick={() => document.getElementById('pagination')?.scrollIntoView({ behavior: 'smooth' })} className="flex items-center text-sm font-medium text-white/60 hover:text-white py-1.5 transition-colors w-full text-left">
                  Pagination
                </button></li>
                <li><button onClick={() => document.getElementById('idempotency')?.scrollIntoView({ behavior: 'smooth' })} className="flex items-center text-sm font-medium text-white/60 hover:text-white py-1.5 transition-colors w-full text-left">
                  Idempotency
                </button></li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-[11px] font-black text-white/40 uppercase tracking-widest mb-3">Tutorials</h3>
              <ul className="space-y-1">
                <li><button onClick={() => document.getElementById('tutorial-crm')?.scrollIntoView({ behavior: 'smooth' })} className="flex items-center text-sm font-medium text-white/60 hover:text-white py-1.5 transition-colors w-full text-left">
                  CRM Integration (HubSpot)
                </button></li>
                <li><button onClick={() => document.getElementById('tutorial-webhooks')?.scrollIntoView({ behavior: 'smooth' })} className="flex items-center text-sm font-medium text-white/60 hover:text-white py-1.5 transition-colors w-full text-left">
                  Real-time Webhooks
                </button></li>
              </ul>
            </div>

            <div>
              <h3 className="text-[11px] font-black text-white/40 uppercase tracking-widest mb-3">Migration Guides</h3>
              <ul className="space-y-1">
                <li><button onClick={() => document.getElementById('migration-apollo')?.scrollIntoView({ behavior: 'smooth' })} className="flex items-center text-sm font-medium text-white/60 hover:text-white py-1.5 transition-colors w-full text-left">
                  Apollo / Clearbit
                </button></li>
                <li><button onClick={() => document.getElementById('migration-zoominfo')?.scrollIntoView({ behavior: 'smooth' })} className="flex items-center text-sm font-medium text-white/60 hover:text-white py-1.5 transition-colors w-full text-left">
                  ZoomInfo
                </button></li>
              </ul>
            </div>

            <div>
              <h3 className="text-[11px] font-black text-white/40 uppercase tracking-widest mb-3">Endpoints</h3>
              <ul className="space-y-1">
                {ENDPOINTS.map((endpoint) => (
                  <li key={endpoint.id}>
                    <button 
                      onClick={() => {
                        document.getElementById(endpoint.id)?.scrollIntoView({ behavior: 'smooth' });
                        setActiveEndpoint(endpoint.id);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between text-sm py-2.5 px-3 rounded-lg transition-all",
                        activeEndpoint === endpoint.id 
                          ? "bg-teal/10 text-teal font-extrabold shadow-sm border border-teal/20 ring-1 ring-teal/10" 
                          : "text-white/60 font-medium hover:bg-white/5 hover:text-white border border-transparent hover:shadow-sm"
                      )}
                    >
                      <span className="truncate">{endpoint.name}</span>
                      {activeEndpoint === endpoint.id && <ChevronRight className="w-4 h-4 flex-shrink-0" />}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            
            <div>
              <h3 className="text-[11px] font-black text-white/40 uppercase tracking-widest mb-3">Starter Kits</h3>
              <ul className="space-y-1">
                <li><button onClick={() => document.getElementById('boilerplates')?.scrollIntoView({ behavior: 'smooth' })} className="flex items-center text-sm font-medium text-white/60 hover:text-white py-1.5 transition-colors w-full text-left">
                  Integration Boilerplates
                </button></li>
              </ul>
            </div>

            <div>
              <h3 className="text-[11px] font-black text-white/40 uppercase tracking-widest mb-3">Resources</h3>
              <ul className="space-y-1">
                <li><button onClick={() => document.getElementById('changelog')?.scrollIntoView({ behavior: 'smooth' })} className="flex items-center text-sm font-medium text-white/60 hover:text-white py-1.5 transition-colors w-full text-left">
                  Changelog & History
                </button></li>
                <li><a href="https://discord.gg/zintlr" target="_blank" rel="noopener noreferrer" className="flex items-center text-sm font-bold text-[#5865F2] hover:text-[#7289da] py-1.5 transition-colors w-full text-left">
                  Join Discord Community
                </a></li>
              </ul>
            </div>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 py-10 md:py-14 space-y-28 pb-40 lg:pl-12">
            
            <div className="prose prose-invert max-w-none">
              <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-6">API Documentation</h1>
              <p className="text-lg md:text-xl text-white/60 font-medium leading-relaxed">
                Welcome to the zinbit API. Use this reference to integrate our powerful B2B enrichment and identity resolution engine directly into your products.
              </p>
              <hr className="my-12 border-white/10" />
            </div>

            {/* Architecture Section */}
            <section id="architecture" className="scroll-mt-32 space-y-8 mb-16">
              <div>
                <h2 className="text-3xl font-extrabold text-white tracking-tight mb-4">System Architecture & Data Flow</h2>
                <p className="text-white/60 font-medium leading-relaxed mb-6 text-lg">
                  Understanding how data moves through zinbit will help you build highly scalable and reliable integrations. Our global edge network routes requests directly to the nearest Identity Resolution Engine.
                </p>
              </div>

              {/* Data Flow Diagram (CSS based) */}
              <div className="glass-inner rounded-3xl p-8 border border-white/10 mb-8 overflow-hidden relative">
                {/* Background grid for diagram */}
                <div className="absolute inset-0 grid-dark opacity-40 pointer-events-none" />
                
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8 md:gap-4">
                  {/* Client */}
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/20 flex items-center justify-center mb-3 shadow-lg shadow-black/20">
                      <Terminal className="w-8 h-8 text-white/80" />
                    </div>
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Your App</span>
                  </div>

                  {/* Flow Arrow */}
                  <div className="flex-1 flex flex-col items-center relative hidden md:flex">
                    <div className="w-full h-px bg-gradient-to-r from-transparent via-teal to-transparent absolute top-1/2 -translate-y-1/2" />
                    <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-teal shadow-[0_0_15px_rgba(70,189,198,1)] animate-[pulse-node_2s_ease-in-out_infinite]" />
                    <span className="text-[10px] font-mono font-bold text-teal bg-ink px-2 py-0.5 rounded-full z-10 mb-6 border border-teal/20">REST / HTTPS</span>
                  </div>
                  <div className="md:hidden w-px h-8 bg-gradient-to-b from-transparent via-teal to-transparent" />

                  {/* API Gateway */}
                  <div className="flex flex-col items-center">
                    <div className="w-20 h-20 rounded-full bg-teal/10 border-2 border-teal flex items-center justify-center mb-3 shadow-[0_0_30px_-5px_rgba(70,189,198,0.3)]">
                      <Cloud className="w-10 h-10 text-teal" />
                    </div>
                    <span className="text-xs font-bold text-teal uppercase tracking-wider">API Edge Gateway</span>
                    <span className="text-[10px] font-mono text-white/40 mt-1">Rate Limiting & Auth</span>
                  </div>

                  {/* Flow Arrow */}
                  <div className="flex-1 flex flex-col items-center relative hidden md:flex">
                    <div className="w-full h-px border-t border-dashed border-white/20 absolute top-1/2 -translate-y-1/2" />
                    <ArrowRight className="w-4 h-4 text-white/40 absolute top-1/2 -translate-y-1/2 right-1/2 translate-x-1/2" />
                    <span className="text-[10px] font-mono font-bold text-white/50 bg-ink px-2 py-0.5 rounded-full z-10 mb-6 border border-white/10">gRPC</span>
                  </div>
                  <div className="md:hidden w-px h-8 border-l border-dashed border-white/20" />

                  {/* Identity Engine */}
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 rounded-2xl bg-[#1A1924] border border-white/10 flex items-center justify-center mb-3 shadow-lg shadow-black/20">
                      <Database className="w-8 h-8 text-white/80" />
                    </div>
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Identity Graph</span>
                    <span className="text-[10px] font-mono text-white/40 mt-1">Distributed KV</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="border-l-2 border-teal pl-4">
                  <h4 className="font-bold text-white mb-2">1. Request Initiation</h4>
                  <p className="text-sm text-white/60">Your application makes a secure HTTPS request. Webhooks are dispatched asynchronously using Kafka topics to guarantee exactly-once delivery.</p>
                </div>
                <div className="border-l-2 border-teal pl-4">
                  <h4 className="font-bold text-white mb-2">2. Global Edge Routing</h4>
                  <p className="text-sm text-white/60">Anycast routes your request to the nearest zinbit point of presence (PoP), where authentication and rate-limiting are evaluated in Redis &lt;2ms.</p>
                </div>
                <div className="border-l-2 border-teal pl-4">
                  <h4 className="font-bold text-white mb-2">3. Graph Resolution</h4>
                  <p className="text-sm text-white/60">The internal gRPC request is resolved against our proprietary distributed identity graph, synthesizing billions of corporate nodes in real-time.</p>
                </div>
              </div>
            </section>

            {/* Authentication Section */}
            <section id="authentication" className="scroll-mt-32 space-y-8 mb-16">
              <div>
                <h2 className="text-3xl font-extrabold text-white tracking-tight mb-4">Authentication</h2>
                <p className="text-white/60 font-medium leading-relaxed mb-6 text-lg">
                  The zinbit API uses API keys to authenticate requests. You can view and manage your API keys in the <Link href="/console/keys" className="text-teal hover:underline font-bold">Dashboard</Link>.
                </p>
                <p className="text-white/60 font-medium leading-relaxed mb-6 text-lg">
                  Authentication to the API is performed via HTTP Bearer Auth. Provide your API key as the bearer token value in the <code className="bg-white/10 px-1.5 py-0.5 rounded border border-white/20 text-white">Authorization</code> header.
                </p>
              </div>

              <div className="bg-ink rounded-2xl shadow-xl border border-neutral-800 overflow-hidden font-mono text-sm selection:bg-teal selection:text-ink">
                <div className="px-4 py-3 border-b border-white/10 bg-white/5 flex gap-4 overflow-x-auto hide-scrollbar">
                  <button 
                    onClick={() => setAuthTab('curl')}
                    className={cn("px-3 py-1.5 rounded-lg font-bold text-xs transition-colors", authTab === 'curl' ? "bg-white/10 text-white" : "text-white/50 hover:text-white hover:bg-white/5")}
                  >
                    cURL
                  </button>
                  <button 
                    onClick={() => setAuthTab('node')}
                    className={cn("px-3 py-1.5 rounded-lg font-bold text-xs transition-colors", authTab === 'node' ? "bg-white/10 text-white" : "text-white/50 hover:text-white hover:bg-white/5")}
                  >
                    Node.js
                  </button>
                  <button 
                    onClick={() => setAuthTab('python')}
                    className={cn("px-3 py-1.5 rounded-lg font-bold text-xs transition-colors", authTab === 'python' ? "bg-white/10 text-white" : "text-white/50 hover:text-white hover:bg-white/5")}
                  >
                    Python
                  </button>
                </div>
                <div className="p-6 overflow-x-auto text-white/80 leading-relaxed whitespace-pre">
                  {authTab === 'curl' && (
`curl -X GET https://api.zinbit.zintlr.com/v1/people \\
  -H "Authorization: Bearer ${apiKey}" \\
  -d "email=demo@example.com"`
                  )}
                  {authTab === 'node' && (
`const response = await fetch('https://api.zinbit.zintlr.com/v1/people?email=demo@example.com', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer ${apiKey}'
  }
});

const data = await response.json();
console.log(data);`
                  )}
                  {authTab === 'python' && (
`import requests

url = "https://api.zinbit.zintlr.com/v1/people"
headers = {
    "Authorization": "Bearer ${apiKey}"
}
params = {
    "email": "demo@example.com"
}

response = requests.get(url, headers=headers, params=params)
print(response.json())`
                  )}
                </div>
              </div>
            </section>

            {/* SDKs Section */}
            <section id="sdks" className="scroll-mt-32 space-y-8 mb-16">
              <div>
                <h2 className="text-3xl font-extrabold text-white tracking-tight mb-4">Official SDKs</h2>
                <p className="text-white/60 font-medium leading-relaxed mb-6 text-lg">
                  We provide official client libraries for major programming languages to make integrating with zinbit as seamless as possible.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Node.js SDK */}
                <div className="glass-inner rounded-2xl p-6 border border-white/10 shadow-xl group hover:border-teal/50 transition-colors flex flex-col">
                  <div className="flex justify-between items-start mb-6">
                    <div className="w-12 h-12 rounded-xl bg-[#339933]/10 flex items-center justify-center border border-[#339933]/20 shadow-inner">
                      <span className="font-black text-[#339933] text-sm">Node</span>
                    </div>
                    <a href="https://github.com/zinbit" target="_blank" className="text-xs font-bold text-white/40 hover:text-white transition-colors">GitHub ↗</a>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">Node.js</h3>
                  <div className="bg-ink/80 p-3 rounded-xl border border-white/5 font-mono text-xs text-white/80 select-all mb-4 shadow-inner">
                    npm install @zinbit/node
                  </div>
                  <div className="mt-auto pt-2">
                    <a href="#endpoints" className="text-sm font-bold text-teal hover:text-teal-ice transition-colors flex items-center gap-1 group-hover:gap-2">
                      View Documentation <ChevronRight className="w-4 h-4" />
                    </a>
                  </div>
                </div>

                {/* Python SDK */}
                <div className="glass-inner rounded-2xl p-6 border border-white/10 shadow-xl group hover:border-teal/50 transition-colors flex flex-col">
                  <div className="flex justify-between items-start mb-6">
                    <div className="w-12 h-12 rounded-xl bg-[#3776AB]/10 flex items-center justify-center border border-[#3776AB]/20 shadow-inner">
                      <span className="font-black text-[#3776AB] text-sm">Py</span>
                    </div>
                    <a href="https://github.com/zinbit" target="_blank" className="text-xs font-bold text-white/40 hover:text-white transition-colors">GitHub ↗</a>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">Python</h3>
                  <div className="bg-ink/80 p-3 rounded-xl border border-white/5 font-mono text-xs text-white/80 select-all mb-4 shadow-inner">
                    pip install zinbit
                  </div>
                  <div className="mt-auto pt-2">
                    <a href="#endpoints" className="text-sm font-bold text-teal hover:text-teal-ice transition-colors flex items-center gap-1 group-hover:gap-2">
                      View Documentation <ChevronRight className="w-4 h-4" />
                    </a>
                  </div>
                </div>

                {/* Go SDK */}
                <div className="glass-inner rounded-2xl p-6 border border-white/10 shadow-xl group hover:border-teal/50 transition-colors flex flex-col">
                  <div className="flex justify-between items-start mb-6">
                    <div className="w-12 h-12 rounded-xl bg-[#00ADD8]/10 flex items-center justify-center border border-[#00ADD8]/20 shadow-inner">
                      <span className="font-black text-[#00ADD8] text-sm">Go</span>
                    </div>
                    <a href="https://github.com/zinbit" target="_blank" className="text-xs font-bold text-white/40 hover:text-white transition-colors">GitHub ↗</a>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">Go</h3>
                  <div className="bg-ink/80 p-3 rounded-xl border border-white/5 font-mono text-xs text-white/80 select-all mb-4 shadow-inner">
                    go get zintlr.com/go
                  </div>
                  <div className="mt-auto pt-2">
                    <a href="#endpoints" className="text-sm font-bold text-teal hover:text-teal-ice transition-colors flex items-center gap-1 group-hover:gap-2">
                      View Documentation <ChevronRight className="w-4 h-4" />
                    </a>
                  </div>
                </div>
                
                {/* Rust SDK */}
                <div className="glass-inner rounded-2xl p-6 border border-white/10 shadow-xl group hover:border-[#DEA584]/50 transition-colors flex flex-col">
                  <div className="flex justify-between items-start mb-6">
                    <div className="w-12 h-12 rounded-xl bg-[#DEA584]/10 flex items-center justify-center border border-[#DEA584]/20 shadow-inner">
                      <span className="font-black text-[#DEA584] text-sm">Rs</span>
                    </div>
                    <a href="https://github.com/zinbit" target="_blank" className="text-xs font-bold text-white/40 hover:text-white transition-colors">GitHub ↗</a>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">Rust</h3>
                  <div className="bg-ink/80 p-3 rounded-xl border border-white/5 font-mono text-xs text-white/80 select-all mb-4 shadow-inner">
                    cargo add zinbit
                  </div>
                  <div className="mt-auto pt-2">
                    <a href="#endpoints" className="text-sm font-bold text-[#DEA584] hover:text-[#DEA584]/80 transition-colors flex items-center gap-1 group-hover:gap-2">
                      View Documentation <ChevronRight className="w-4 h-4" />
                    </a>
                  </div>
                </div>

                {/* Java SDK */}
                <div className="glass-inner rounded-2xl p-6 border border-white/10 shadow-xl group hover:border-[#ED8B00]/50 transition-colors flex flex-col">
                  <div className="flex justify-between items-start mb-6">
                    <div className="w-12 h-12 rounded-xl bg-[#ED8B00]/10 flex items-center justify-center border border-[#ED8B00]/20 shadow-inner">
                      <span className="font-black text-[#ED8B00] text-sm">Java</span>
                    </div>
                    <a href="https://github.com/zinbit" target="_blank" className="text-xs font-bold text-white/40 hover:text-white transition-colors">GitHub ↗</a>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">Java</h3>
                  <div className="bg-ink/80 p-3 rounded-xl border border-white/5 font-mono text-[10px] text-white/80 select-all mb-4 shadow-inner overflow-x-auto whitespace-nowrap">
                    mvn dependency:get -Dartifact=com.zinbit:api-client
                  </div>
                  <div className="mt-auto pt-2">
                    <a href="#endpoints" className="text-sm font-bold text-[#ED8B00] hover:text-[#ED8B00]/80 transition-colors flex items-center gap-1 group-hover:gap-2">
                      View Documentation <ChevronRight className="w-4 h-4" />
                    </a>
                  </div>
                </div>

                {/* Ruby SDK */}
                <div className="glass-inner rounded-2xl p-6 border border-white/10 shadow-xl group hover:border-[#CC342D]/50 transition-colors flex flex-col">
                  <div className="flex justify-between items-start mb-6">
                    <div className="w-12 h-12 rounded-xl bg-[#CC342D]/10 flex items-center justify-center border border-[#CC342D]/20 shadow-inner">
                      <span className="font-black text-[#CC342D] text-sm">Ruby</span>
                    </div>
                    <a href="https://github.com/zinbit" target="_blank" className="text-xs font-bold text-white/40 hover:text-white transition-colors">GitHub ↗</a>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">Ruby</h3>
                  <div className="bg-ink/80 p-3 rounded-xl border border-white/5 font-mono text-xs text-white/80 select-all mb-4 shadow-inner">
                    gem install zinbit
                  </div>
                  <div className="mt-auto pt-2">
                    <a href="#endpoints" className="text-sm font-bold text-[#CC342D] hover:text-[#CC342D]/80 transition-colors flex items-center gap-1 group-hover:gap-2">
                      View Documentation <ChevronRight className="w-4 h-4" />
                    </a>
                  </div>
                </div>

              </div>
            </section>

            {/* Errors Section */}
            <section id="errors" className="scroll-mt-32 space-y-8 mb-16">
              <div>
                <h2 className="text-3xl font-extrabold text-white tracking-tight mb-4">Errors</h2>
                <p className="text-white/60 font-medium leading-relaxed mb-6 text-lg">
                  zinbit uses conventional HTTP response codes to indicate the success or failure of an API request. In general, codes in the <code className="bg-white/10 px-1.5 py-0.5 rounded border border-white/20 text-white">2xx</code> range indicate success, codes in the <code className="bg-white/10 px-1.5 py-0.5 rounded border border-white/20 text-white">4xx</code> range indicate an error that failed given the information provided, and codes in the <code className="bg-white/10 px-1.5 py-0.5 rounded border border-white/20 text-white">5xx</code> range indicate an error with zinbit&apos;s servers.
                </p>
              </div>

              <div className="glass-inner rounded-2xl shadow-sm overflow-hidden mb-8">
                <div className="px-6 py-4 border-b border-white/10 bg-white/5 backdrop-blur-sm">
                  <h3 className="text-xs font-black text-white/50 uppercase tracking-widest">HTTP Status Codes</h3>
                </div>
                <div className="divide-y divide-white/10">
                  <div className="p-4 flex flex-col md:flex-row md:items-center gap-4 hover:bg-white/5 transition-colors">
                    <div className="w-24 flex-shrink-0">
                      <span className="text-semantic-success font-mono font-bold bg-semantic-success/10 px-2 py-1 rounded shadow-sm border border-semantic-success/20">200 - OK</span>
                    </div>
                    <p className="text-sm text-white/60 font-medium">Everything worked as expected.</p>
                  </div>
                  <div className="p-4 flex flex-col md:flex-row md:items-center gap-4 hover:bg-white/5 transition-colors">
                    <div className="w-24 flex-shrink-0">
                      <span className="text-semantic-error font-mono font-bold bg-semantic-error/10 px-2 py-1 rounded shadow-sm border border-semantic-error/20">400</span>
                    </div>
                    <p className="text-sm text-white/60 font-medium"><span className="text-white font-bold">Bad Request</span> - The request was unacceptable, often due to missing a required parameter.</p>
                  </div>
                  <div className="p-4 flex flex-col md:flex-row md:items-center gap-4 hover:bg-white/5 transition-colors">
                    <div className="w-24 flex-shrink-0">
                      <span className="text-semantic-error font-mono font-bold bg-semantic-error/10 px-2 py-1 rounded shadow-sm border border-semantic-error/20">401</span>
                    </div>
                    <p className="text-sm text-white/60 font-medium"><span className="text-white font-bold">Unauthorized</span> - No valid API key provided.</p>
                  </div>
                  <div className="p-4 flex flex-col md:flex-row md:items-center gap-4 hover:bg-white/5 transition-colors">
                    <div className="w-24 flex-shrink-0">
                      <span className="text-semantic-error font-mono font-bold bg-semantic-error/10 px-2 py-1 rounded shadow-sm border border-semantic-error/20">403</span>
                    </div>
                    <p className="text-sm text-white/60 font-medium"><span className="text-white font-bold">Forbidden</span> - The API key doesn&apos;t have permissions to perform the request.</p>
                  </div>
                  <div className="p-4 flex flex-col md:flex-row md:items-center gap-4 hover:bg-white/5 transition-colors">
                    <div className="w-24 flex-shrink-0">
                      <span className="text-semantic-error font-mono font-bold bg-semantic-error/10 px-2 py-1 rounded shadow-sm border border-semantic-error/20">404</span>
                    </div>
                    <p className="text-sm text-white/60 font-medium"><span className="text-white font-bold">Not Found</span> - The requested resource doesn&apos;t exist.</p>
                  </div>
                  <div className="p-4 flex flex-col md:flex-row md:items-center gap-4 hover:bg-white/5 transition-colors">
                    <div className="w-24 flex-shrink-0">
                      <span className="text-semantic-error font-mono font-bold bg-semantic-error/10 px-2 py-1 rounded shadow-sm border border-semantic-error/20">429</span>
                    </div>
                    <p className="text-sm text-white/60 font-medium"><span className="text-white font-bold">Too Many Requests</span> - Too many requests hit the API too quickly. We recommend an exponential backoff of your requests.</p>
                  </div>
                  <div className="p-4 flex flex-col md:flex-row md:items-center gap-4 hover:bg-white/5 transition-colors">
                    <div className="w-24 flex-shrink-0">
                      <span className="text-semantic-error font-mono font-bold bg-semantic-error/10 px-2 py-1 rounded shadow-sm border border-semantic-error/20">500</span>
                    </div>
                    <p className="text-sm text-white/60 font-medium"><span className="text-white font-bold">Server Error</span> - Something went wrong on zinbit&apos;s end. (These are rare.)</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-bold text-white tracking-tight mb-4">Error Types</h3>
                <p className="text-white/60 font-medium leading-relaxed mb-6 text-sm">
                  When an API request fails, zinbit returns an error object in the response body. The <code className="bg-white/10 px-1 rounded text-white">type</code> attribute indicates the specific nature of the error.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="glass-inner rounded-xl p-5 border border-white/10 hover:border-white/20 transition-colors">
                    <h4 className="font-mono text-sm font-bold text-semantic-error mb-2">api_error</h4>
                    <p className="text-xs text-white/60">API errors cover any unexpected errors in our system. You should retry these requests after a brief delay.</p>
                  </div>
                  <div className="glass-inner rounded-xl p-5 border border-white/10 hover:border-white/20 transition-colors">
                    <h4 className="font-mono text-sm font-bold text-semantic-error mb-2">invalid_request_error</h4>
                    <p className="text-xs text-white/60">Invalid request errors arise when your request has invalid parameters. The message attribute will provide more details.</p>
                  </div>
                  <div className="glass-inner rounded-xl p-5 border border-white/10 hover:border-white/20 transition-colors">
                    <h4 className="font-mono text-sm font-bold text-semantic-error mb-2">authentication_error</h4>
                    <p className="text-xs text-white/60">Authentication errors occur when your API key is invalid or missing. Ensure you are passing the correct key.</p>
                  </div>
                  <div className="glass-inner rounded-xl p-5 border border-white/10 hover:border-white/20 transition-colors">
                    <h4 className="font-mono text-sm font-bold text-semantic-error mb-2">rate_limit_error</h4>
                    <p className="text-xs text-white/60">Rate limit errors occur when you hit your API&apos;s rate limits. Check the headers for limit details.</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Mock Data Section */}
            <section id="mock-data" className="scroll-mt-32 space-y-12 mb-16 border-t border-white/10 pt-16">
              <div>
                <h2 className="text-3xl font-extrabold text-white tracking-tight mb-4">Testing & Mock Data</h2>
                <p className="text-white/60 font-medium leading-relaxed mb-6 text-lg">
                  Building and testing an integration shouldn&apos;t cost you credits. You can trigger deterministic mock responses during development using specific test keys or email domains.
                </p>
              </div>

              <div className="glass-inner rounded-xl border border-white/10 p-6 space-y-6">
                <h3 className="text-xl font-bold text-white tracking-tight">Using the Test API Key</h3>
                <p className="text-sm text-white/60 leading-relaxed">
                  Every account is provisioned with a <code className="bg-white/10 px-1 py-0.5 rounded text-white font-mono text-xs">sk_test_...</code> key. All requests made with a test key bypass billing completely and always return static synthetic data, regardless of the search parameters.
                </p>
                <CodeBlock code={`curl -X GET 'https://api.zinbit.zintlr.com/v1/people?email=realperson@example.com' \\
  -H "Authorization: Bearer sk_test_ab12cd34ef56gh78"
  
# Returns synthetic John Doe profile (Credits charged: 0)`} />
              </div>

              <div className="glass-inner rounded-xl border border-white/10 p-6 space-y-6">
                <h3 className="text-xl font-bold text-white tracking-tight">Magic Domains (Live Mode Testing)</h3>
                <p className="text-sm text-white/60 leading-relaxed">
                  If you are using a live key (<code className="bg-white/10 px-1 py-0.5 rounded text-white font-mono text-xs">sk_live_...</code>) but still want to trigger mock behaviors (like forcing an error or testing edge cases), you can use our reserved magic domains. These requests will not deduct credits.
                </p>
                
                <div className="overflow-x-auto rounded-lg border border-white/10">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-[#09090b] border-b border-white/10 text-white/50 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="px-4 py-3 rounded-tl-lg">Magic Domain</th>
                        <th className="px-4 py-3">Expected API Behavior</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-white/80 bg-white/5">
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-teal">@zintlr-mock.com</td>
                        <td className="px-4 py-3 text-white/60">Returns a successful 200 OK with a synthetic, fully-populated profile.</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-semantic-warning">@zintlr-empty.com</td>
                        <td className="px-4 py-3 text-white/60">Returns a successful 200 OK but with null fields (simulating sparse data).</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-semantic-error">@zintlr-error.com</td>
                        <td className="px-4 py-3 text-white/60">Forces a 500 Server Error to test your client&apos;s retry/backoff logic.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* Rate Limits Section */}
            <section id="rate-limits" className="scroll-mt-32 space-y-12 mb-16">
              <div>
                <h2 className="text-3xl font-extrabold text-white tracking-tight mb-4">Rate Limits</h2>
                <p className="text-white/60 font-medium leading-relaxed mb-6 text-lg">
                  To ensure a high quality of service for all users, the zinbit API enforces rate limits on a per-account basis based on your active pricing tier. 
                  When you exceed your limit, the API will respond with a <code className="text-semantic-error bg-semantic-error/10 px-1 py-0.5 rounded">429 Too Many Requests</code> HTTP status code.
                </p>
              </div>

              <div className="glass-inner rounded-xl border border-white/10 p-6 space-y-6">
                <h3 className="text-xl font-bold text-white tracking-tight">Rate Limit Headers</h3>
                <p className="text-sm text-white/60 leading-relaxed">
                  Every API response includes headers detailing your current limit and remaining requests. We highly recommend monitoring these to avoid dropped requests.
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-[#09090b]/80 border-b border-white/10 text-white/50 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="px-4 py-3 rounded-tl-lg">Header</th>
                        <th className="px-4 py-3">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-white/80">
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-teal">X-RateLimit-Limit</td>
                        <td className="px-4 py-3 text-white/60">Your total request quota per minute based on your tier.</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-teal">X-RateLimit-Remaining</td>
                        <td className="px-4 py-3 text-white/60">The number of requests remaining in the current minute window.</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-teal">X-RateLimit-Reset</td>
                        <td className="px-4 py-3 text-white/60">The time (in UTC epoch seconds) when your limit will reset.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="bg-semantic-warning/10 border border-semantic-warning/20 p-4 rounded-lg flex items-start gap-3 mt-4">
                  <div className="text-semantic-warning text-sm font-bold">Pro Tip:</div>
                  <div className="text-white/70 text-sm">Implement an exponential backoff strategy in your HTTP clients to automatically retry requests that fail with a 429 status code. The official SDKs handle this out-of-the-box.</div>
                </div>
              </div>
            </section>

            {/* Pagination Section */}
            <section id="pagination" className="scroll-mt-32 space-y-12 mb-16">
              <div>
                <h2 className="text-3xl font-extrabold text-white tracking-tight mb-4">Pagination</h2>
                <p className="text-white/60 font-medium leading-relaxed mb-6 text-lg">
                  Endpoints that return lists of objects (such as searches or batch lookups) support cursor-based pagination. 
                  This provides faster, more reliable sorting across large datasets compared to traditional offset pagination.
                </p>
              </div>

              <div className="glass-inner rounded-xl border border-white/10 p-6 space-y-6">
                <h3 className="text-xl font-bold text-white tracking-tight">Using Cursors</h3>
                <p className="text-sm text-white/60 leading-relaxed">
                  When a response has more results available, the <code className="bg-white/10 px-1 py-0.5 rounded text-white font-mono">meta.next_cursor</code> field will contain a string token. 
                  To fetch the next page, pass this token in the <code className="bg-white/10 px-1 py-0.5 rounded text-white font-mono">cursor</code> query parameter of your next request.
                </p>

                <CodeBlock code={`// Example API Response
{
  "data": [ ... 50 objects ... ],
  "meta": {
    "total_results": 1420,
    "limit": 50,
    "next_cursor": "eyJpZCI6IjY0YWM5M2Y...",
    "has_more": true
  }
}

// Next Request
GET /v1/people?company=apple&limit=50&cursor=eyJpZCI6IjY0YWM5M2Y...`} />
              </div>
            </section>

            {/* Idempotency Section */}
            <section id="idempotency" className="scroll-mt-32 space-y-12 mb-16">
              <div>
                <h2 className="text-3xl font-extrabold text-white tracking-tight mb-4">Idempotency & Retries</h2>
                <p className="text-white/60 font-medium leading-relaxed mb-6 text-lg">
                  The API supports idempotency for safe retries of requests. This guarantees that no matter how many times you retry a request (due to a network timeout, for example), the underlying action will only be performed once.
                </p>
              </div>

              <div className="glass-inner rounded-xl border border-white/10 p-6 space-y-6">
                <h3 className="text-xl font-bold text-white tracking-tight">Idempotency Keys</h3>
                <p className="text-sm text-white/60 leading-relaxed">
                  To perform an idempotent request, attach an <code className="bg-white/10 px-1 py-0.5 rounded text-white font-mono">Idempotency-Key</code> header to your request. We recommend using V4 UUIDs. Keys expire after 24 hours.
                </p>

                <CodeBlock code={`// Safe Retry Example
curl -X POST https://api.zinbit.zintlr.com/v1/batch/companies/enrich \\
  -H "Authorization: Bearer sk_live_..." \\
  -H "Idempotency-Key: 9d214695-1f92-4913-91db-a3e20eec9502" \\
  -H "Content-Type: application/json" \\
  -d '{"domains": ["apple.com", "stripe.com"]}'`} />
                
                <div className="bg-semantic-success/10 border border-semantic-success/20 p-4 rounded-lg flex items-start gap-3 mt-4">
                  <div className="text-semantic-success text-sm font-bold">Safety Guarantee:</div>
                  <div className="text-white/70 text-sm">If your request is successfully executed, any subsequent requests with the same <code className="bg-white/10 px-1 py-0.5 rounded text-white font-mono text-xs">Idempotency-Key</code> will return the exact same cached HTTP response, without deducting additional credits from your balance.</div>
                </div>
              </div>
            </section>

            {/* Tutorials Section */}
            <section id="tutorials" className="scroll-mt-32 space-y-12 mb-16">
              <div>
                <h2 className="text-3xl font-extrabold text-white tracking-tight mb-4">Tutorials & Use Cases</h2>
                <p className="text-white/60 font-medium leading-relaxed mb-6 text-lg">
                  Learn how to integrate zinbit into your existing workflows. These step-by-step guides cover the most common enterprise use cases.
                </p>
              </div>

              {/* CRM Integration */}
              <div id="tutorial-crm" className="scroll-mt-32 glass-inner rounded-2xl shadow-sm border border-white/10 overflow-hidden">
                <div className="px-8 py-6 border-b border-white/10 bg-white/5 backdrop-blur-sm">
                  <h3 className="text-xl font-bold text-white mb-2">Automate CRM Lead Enrichment</h3>
                  <p className="text-sm text-white/60">Automatically enrich new inbound leads in HubSpot or Salesforce before they reach your sales team.</p>
                </div>
                <div className="p-8 space-y-6">
                  
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-teal/20 text-teal flex items-center justify-center font-bold text-sm shrink-0">1</div>
                      <div>
                        <h4 className="text-white font-bold mb-1">Listen for New Leads</h4>
                        <p className="text-sm text-white/60 leading-relaxed">Set up a webhook in your CRM to notify your server whenever a new lead is created with just an email address.</p>
                      </div>
                    </div>
                    
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-teal/20 text-teal flex items-center justify-center font-bold text-sm shrink-0">2</div>
                      <div>
                        <h4 className="text-white font-bold mb-1">Query the zinbit API</h4>
                        <p className="text-sm text-white/60 leading-relaxed">Pass the bare email address to the <code className="text-teal">/v1/people</code> endpoint to retrieve their full profile, company data, and direct-dial phone number.</p>
                        
                        <CodeBlock code={`const response = await fetch('https://api.zinbit.zintlr.com/v1/people?email=lead@example.com', {
  headers: {
    'Authorization': 'Bearer sk_live_YOUR_KEY'
  }
});
const enrichedData = await response.json();`} />
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-teal/20 text-teal flex items-center justify-center font-bold text-sm shrink-0">3</div>
                      <div>
                        <h4 className="text-white font-bold mb-1">Update the CRM Record</h4>
                        <p className="text-sm text-white/60 leading-relaxed">Push the enriched fields (Phone, LinkedIn URL, Job Title, Company Size) back to the CRM record using their API.</p>
                      </div>
                    </div>
                  </div>
                  
                </div>
              </div>

            </section>

            {/* Migration Guides */}
            <section id="migration-guides" className="space-y-12 mb-16">
              
              {/* Apollo / Clearbit Migration */}
              <div id="migration-apollo" className="scroll-mt-32">
                <h2 className="text-3xl font-extrabold text-white tracking-tight mb-4">Migrating from Apollo / Clearbit</h2>
                <p className="text-white/60 font-medium leading-relaxed mb-6 text-lg">
                  Transitioning from legacy enrichment providers to zinbit is a matter of updating endpoints and response mapping. zinbit provides a 1-to-1 data parity with Clearbit&apos;s Person and Company Enrichment APIs, but at 10x the speed and deterministic scale.
                </p>
                <div className="glass-inner rounded-xl border border-white/10 p-6 space-y-6">
                  <h3 className="text-xl font-bold text-white tracking-tight">Endpoint Mapping</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="bg-[#09090b]/80 border-b border-white/10 text-white/50 font-bold uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="px-4 py-3 rounded-tl-lg">Legacy Provider</th>
                          <th className="px-4 py-3">zinbit API (v1)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-white/80">
                        <tr className="hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3 font-mono text-white/40 line-through">GET person.clearbit.com/v2/people/find</td>
                          <td className="px-4 py-3 font-mono font-bold text-teal">GET /v1/people</td>
                        </tr>
                        <tr className="hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3 font-mono text-white/40 line-through">GET company.clearbit.com/v2/companies/find</td>
                          <td className="px-4 py-3 font-mono font-bold text-teal">GET /v1/company-search</td>
                        </tr>
                        <tr className="hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3 font-mono text-white/40 line-through">POST api.apollo.io/v1/people/match</td>
                          <td className="px-4 py-3 font-mono font-bold text-teal">POST /v1/people/batch</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* ZoomInfo Migration */}
              <div id="migration-zoominfo" className="scroll-mt-32">
                <h2 className="text-3xl font-extrabold text-white tracking-tight mb-4">Migrating from ZoomInfo</h2>
                <p className="text-white/60 font-medium leading-relaxed mb-6 text-lg">
                  Moving from ZoomInfo Enterprise API to zinbit simplifies your authentication flow (no more rotating JWTs) and switches your payload from complex XML/JSON SOAP structures to modern REST JSON.
                </p>
                <div className="glass-inner rounded-xl border border-white/10 p-6 space-y-6">
                  <h3 className="text-xl font-bold text-white tracking-tight">Key Differences</h3>
                  <ul className="space-y-4 text-white/70 text-sm">
                    <li className="flex gap-3">
                      <div className="w-5 h-5 rounded-full bg-teal/20 text-teal flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">1</div>
                      <span><strong>Authentication:</strong> ZoomInfo requires exchanging a username/password for a JWT token every 60 minutes. zinbit uses static Bearer tokens generated from your zinbit Console that never expire unless manually revoked.</span>
                    </li>
                    <li className="flex gap-3">
                      <div className="w-5 h-5 rounded-full bg-teal/20 text-teal flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">2</div>
                      <span><strong>Intent Data:</strong> ZoomInfo returns intent signals natively in the enterprise search endpoint. In zinbit, intent is managed exclusively through Real-time Webhooks (via Kafka) to ensure you aren&apos;t paying for stale intent data.</span>
                    </li>
                    <li className="flex gap-3">
                      <div className="w-5 h-5 rounded-full bg-teal/20 text-teal flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">3</div>
                      <span><strong>Pagination:</strong> ZoomInfo uses page/rpp (results per page). zinbit relies on cursor-based pagination for enterprise stability.</span>
                    </li>
                  </ul>
                </div>
              </div>

            </section>

            {ENDPOINTS.map((endpoint) => (
              <section key={endpoint.id} id={endpoint.id} className="scroll-mt-32 space-y-8">
                <div>
                  <div className="flex items-center gap-4 mb-4">
                    <h2 className="text-3xl font-extrabold text-white tracking-tight">{endpoint.name}</h2>
                    <MethodBadge method={endpoint.method} />
                    <div className="ml-auto flex-shrink-0">
                      <a 
                        href={`https://god.gw.postman.com/run-collection?url=${encodeURIComponent('https://api.zinbit.zintlr.com/api/docs/postman')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-bold text-[#FF6C37] px-3 py-1.5 rounded-lg border border-[#FF6C37]/20 bg-[#FF6C37]/10 hover:bg-[#FF6C37]/20 transition-colors flex items-center gap-2 shadow-sm"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                           <path d="M12.0001 0.380859C5.58984 0.380859 0.380859 5.58984 0.380859 12.0001C0.380859 18.4102 5.58984 23.6192 12.0001 23.6192C18.4102 23.6192 23.6192 18.4102 23.6192 12.0001C23.6192 5.58984 18.4102 0.380859 12.0001 0.380859ZM12.0001 21.6192C6.69043 21.6192 2.38086 17.3096 2.38086 12.0001C2.38086 6.69043 6.69043 2.38086 12.0001 2.38086C17.3096 2.38086 21.6192 6.69043 21.6192 12.0001C21.6192 17.3096 17.3096 21.6192 12.0001 21.6192ZM14.9317 12.0303L9.67383 15.1152C9.17383 15.4092 8.5 15.0508 8.5 14.4443V8.27246C8.5 7.66602 9.17383 7.30762 9.67383 7.60156L14.9317 10.6865C15.4219 10.9746 15.4219 11.7412 14.9317 12.0303Z"/>
                        </svg>
                        Run in Postman
                      </a>
                    </div>
                  </div>
                  <p className="text-white/60 font-medium leading-relaxed mb-6 text-lg">{endpoint.description}</p>
                  
                  <div className="flex items-center gap-3 bg-white/5 p-4 rounded-xl border border-white/10 font-mono text-sm shadow-inner overflow-x-auto">
                    <span className="text-white/40 select-none flex-shrink-0">https://api.zinbit.zintlr.com/v1</span>
                    <span className="text-white font-bold flex-shrink-0">{endpoint.path}</span>
                  </div>
                </div>

                <div className="glass-inner rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/10 bg-white/5 backdrop-blur-sm">
                    <h3 className="text-xs font-black text-white/50 uppercase tracking-widest">Parameters</h3>
                  </div>
                  <div className="divide-y divide-white/10">
                    {endpoint.parameters.map((param) => (
                      <div key={param.name} className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 hover:bg-white/5 transition-colors">
                        <div className="md:col-span-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-mono text-sm font-bold text-white">{param.name}</span>
                            {param.required && <span className="text-[10px] uppercase font-black text-semantic-error bg-semantic-error/10 px-2 py-0.5 rounded shadow-sm border border-semantic-error/20">Required</span>}
                          </div>
                          <span className="text-xs font-mono text-white/50 font-medium">{param.type}</span>
                        </div>
                        <div className="md:col-span-2 space-y-3">
                          <p className="text-sm text-white/60 font-medium">{param.description}</p>
                          <div className="text-xs text-white/50 font-mono bg-white/5 px-3 py-2 rounded-lg border border-white/10 inline-block shadow-inner">
                            Example: <span className="text-white font-bold">{param.example}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Embedded Sandbox */}
                <div className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-1.5 bg-teal/10 rounded-lg border border-teal/20 shadow-inner">
                      <Terminal className="w-4 h-4 text-teal" />
                    </div>
                    <h3 className="text-sm font-black text-white uppercase tracking-widest">Live Sandbox</h3>
                  </div>
                  <div className="dark glass-inner rounded-[20px] shadow-2xl p-2 border border-white/10 ring-1 ring-black/10">
                    <RequestBuilder 
                      key={`inline-${endpoint.id}`}
                      mode="full" 
                      preselectedEndpointId={endpoint.id} 
                      apiKey={apiKey} 
                    />
                  </div>
                </div>
              </section>
            ))}

            {/* Starter Kits & Boilerplates Section */}
            <section id="boilerplates" className="scroll-mt-32 space-y-12 mb-16 border-t border-white/10 pt-16">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-[#FF6C37]/10 rounded-xl border border-[#FF6C37]/20 shadow-inner">
                    <Cloud className="w-5 h-5 text-[#FF6C37]" />
                  </div>
                  <h2 className="text-3xl font-extrabold text-white tracking-tight">Starter Kits & Boilerplates</h2>
                </div>
                <p className="text-white/60 font-medium leading-relaxed mb-6 text-lg">
                  Hit the ground running with our official integration starter kits. Each boilerplate comes pre-configured with authentication, error handling, rate-limiting logic, and webhook receivers.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Next.js Starter */}
                <div className="glass-inner rounded-2xl p-6 border border-white/10 hover:border-teal/50 hover:bg-white/5 transition-all group flex flex-col h-full">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-lg">
                      <svg viewBox="0 0 128 128" className="w-6 h-6 text-black"><path fill="currentColor" d="M64 0C28.7 0 0 28.7 0 64s28.7 64 64 64c11.2 0 21.7-2.9 30.8-7.9L48.4 55.3v36.6h-6.8V41.8h6.8l50.5 75.8C116.4 106.2 128 86.5 128 64c0-35.3-28.7-64-64-64zm22.1 84.6l-7.4-11.2v-31.5h6.8v39.3c.2 1.2.4 2.3.6 3.4z"/></svg>
                    </div>
                    <span className="text-[10px] uppercase tracking-widest font-bold text-teal bg-teal/10 px-2 py-1 rounded-full border border-teal/20">React / Fullstack</span>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Next.js App Router</h3>
                  <p className="text-sm text-white/50 mb-6 flex-1">
                    A production-ready Next.js 14 template using App Router, TailwindCSS, and Server Actions for secure API key management.
                  </p>
                  <div className="space-y-3">
                    <div className="bg-ink p-3 rounded-lg border border-white/5 font-mono text-xs text-white/70 overflow-x-auto shadow-inner flex items-center justify-between group-hover:border-teal/30 transition-colors">
                      <span className="truncate">npx create-zinbit-app@latest --template nextjs</span>
                    </div>
                    <a href="https://github.com/zinbit/zinbit-nextjs-starter" target="_blank" rel="noreferrer" className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white font-medium text-sm transition-colors border border-white/10">
                      View on GitHub <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                {/* Express.js Starter */}
                <div className="glass-inner rounded-2xl p-6 border border-white/10 hover:border-green-500/50 hover:bg-white/5 transition-all group flex flex-col h-full">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-full bg-[#339933]/10 flex items-center justify-center border border-[#339933]/20 shadow-lg">
                      <Database className="w-5 h-5 text-[#339933]" />
                    </div>
                    <span className="text-[10px] uppercase tracking-widest font-bold text-[#339933] bg-[#339933]/10 px-2 py-1 rounded-full border border-[#339933]/20">Node.js</span>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Express.js Backend</h3>
                  <p className="text-sm text-white/50 mb-6 flex-1">
                    A robust Node.js/Express template with built-in Redis caching, rate limiting, and Stripe billing synchronization.
                  </p>
                  <div className="space-y-3">
                    <div className="bg-ink p-3 rounded-lg border border-white/5 font-mono text-xs text-white/70 overflow-x-auto shadow-inner flex items-center justify-between group-hover:border-[#339933]/30 transition-colors">
                      <span className="truncate">npx create-zinbit-app@latest --template express</span>
                    </div>
                    <a href="https://github.com/zinbit/zinbit-express-starter" target="_blank" rel="noreferrer" className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white font-medium text-sm transition-colors border border-white/10">
                      View on GitHub <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                {/* Django Starter */}
                <div className="glass-inner rounded-2xl p-6 border border-white/10 hover:border-[#092E20]/50 hover:bg-white/5 transition-all group flex flex-col h-full">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-full bg-[#092E20] flex items-center justify-center border border-white/10 shadow-lg">
                      <svg viewBox="0 0 100 100" className="w-5 h-5 text-white"><path fill="currentColor" d="M37.3 75.3v-5c-2.3 2-5 3.3-8 3.9-3 .6-6.1.9-9.1.9-4.8 0-9-.8-12.7-2.4-3.7-1.6-6.8-3.9-9.3-7-2.5-3-4.3-6.6-5.5-10.7-1.2-4.1-1.7-8.6-1.7-13.6 0-5.1.6-9.7 1.8-13.8 1.2-4.1 3-7.7 5.6-10.8 2.5-3.1 5.7-5.5 9.5-7.1 3.8-1.6 8-2.4 12.8-2.4 3 0 6.1.3 9.1 1 3 .6 5.8 2 8.3 4v-4.9h11.9v72.5h-12.7zm-11.4-18.7c3.4 0 6.2-1.3 8.3-4s3.2-6.6 3.2-11.8c0-5-.9-8.8-2.8-11.4-1.9-2.5-4.4-3.8-7.8-3.8s-6 1.3-7.8 4c-1.8 2.7-2.7 6.6-2.7 11.9 0 5.1 1 8.9 2.9 11.5 2 2.4 4.3 3.6 6.7 3.6zM69.8 17h12.5v7.2H69.8V17zm0 15.3h12.5v54.7H69.8V32.3z"/></svg>
                    </div>
                    <span className="text-[10px] uppercase tracking-widest font-bold text-[#44B78B] bg-[#44B78B]/10 px-2 py-1 rounded-full border border-[#44B78B]/20">Python</span>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Django Enterprise</h3>
                  <p className="text-sm text-white/50 mb-6 flex-1">
                    A Django starter kit featuring Celery background tasks for bulk enrichment, database models for identity resolution, and Kafka integration.
                  </p>
                  <div className="space-y-3">
                    <div className="bg-ink p-3 rounded-lg border border-white/5 font-mono text-xs text-white/70 overflow-x-auto shadow-inner flex items-center justify-between group-hover:border-[#44B78B]/30 transition-colors">
                      <span className="truncate">pip install zinbit-django-starter</span>
                    </div>
                    <a href="https://github.com/zinbit/zinbit-django-starter" target="_blank" rel="noreferrer" className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white font-medium text-sm transition-colors border border-white/10">
                      View on GitHub <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

              </div>
            </section>

            {/* Changelog Section */}
            <section id="changelog" className="scroll-mt-32 space-y-12 mb-16 border-t border-white/10 pt-16">
              <div>
                <h2 className="text-3xl font-extrabold text-white tracking-tight mb-4">Changelog & Version History</h2>
                <p className="text-white/60 font-medium leading-relaxed mb-6 text-lg">
                  Stay up to date with the latest features, deprecations, and API version updates. We follow semantic versioning.
                </p>
              </div>

              <div className="space-y-10 border-l-2 border-white/10 pl-8 relative">
                
                {/* v1.2.0 */}
                <div className="relative">
                  <div className="absolute -left-[41px] top-1 w-5 h-5 rounded-full bg-teal flex items-center justify-center ring-4 ring-[#09090b]">
                    <div className="w-2 h-2 bg-ink rounded-full" />
                  </div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-3">
                    v1.2.0
                    <span className="text-[10px] font-bold text-teal bg-teal/10 px-2 py-0.5 rounded-full uppercase tracking-wider">Latest</span>
                  </h3>
                  <p className="text-sm font-mono text-white/40 mt-1 mb-4">August 2026</p>
                  <ul className="space-y-3">
                    <li className="flex gap-3 text-sm text-white/70">
                      <span className="text-semantic-success font-bold mt-0.5">Added</span>
                      <span>Support for batch processing up to 10,000 records in <code className="text-white font-mono text-xs bg-white/10 px-1 py-0.5 rounded">/v1/people/batch</code>.</span>
                    </li>
                    <li className="flex gap-3 text-sm text-white/70">
                      <span className="text-semantic-success font-bold mt-0.5">Added</span>
                      <span>Real-time webhook notifications for CRM enrichment pipelines.</span>
                    </li>
                    <li className="flex gap-3 text-sm text-white/70">
                      <span className="text-teal font-bold mt-0.5">Changed</span>
                      <span>Reduced average latency for CIN resolution by 40%.</span>
                    </li>
                  </ul>
                </div>

                {/* v1.1.0 */}
                <div className="relative">
                  <div className="absolute -left-[41px] top-1 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center ring-4 ring-[#09090b]">
                    <div className="w-2 h-2 bg-white/40 rounded-full" />
                  </div>
                  <h3 className="text-xl font-bold text-white">v1.1.0</h3>
                  <p className="text-sm font-mono text-white/40 mt-1 mb-4">April 2026</p>
                  <ul className="space-y-3">
                    <li className="flex gap-3 text-sm text-white/70">
                      <span className="text-semantic-success font-bold mt-0.5">Added</span>
                      <span>Introduced <code className="text-white font-mono text-xs bg-white/10 px-1 py-0.5 rounded">/v1/din-to-phone</code> endpoint.</span>
                    </li>
                    <li className="flex gap-3 text-sm text-white/70">
                      <span className="text-semantic-error font-bold mt-0.5">Deprecated</span>
                      <span>The legacy <code className="text-white font-mono text-xs bg-white/10 px-1 py-0.5 rounded">/v0/contact</code> endpoint is now deprecated. It will be removed in v2.0.</span>
                    </li>
                  </ul>
                </div>

                {/* v1.0.0 */}
                <div className="relative">
                  <div className="absolute -left-[41px] top-1 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center ring-4 ring-[#09090b]">
                    <div className="w-2 h-2 bg-white/40 rounded-full" />
                  </div>
                  <h3 className="text-xl font-bold text-white">v1.0.0</h3>
                  <p className="text-sm font-mono text-white/40 mt-1 mb-4">January 2026</p>
                  <ul className="space-y-3">
                    <li className="flex gap-3 text-sm text-white/70">
                      <span className="text-white/60 font-bold mt-0.5">Release</span>
                      <span>Initial stable release of the zinbit by Zintlr B2B Identity API.</span>
                    </li>
                  </ul>
                </div>

              </div>
            </section>
        </main>
      </div>
    </div>
  );
}

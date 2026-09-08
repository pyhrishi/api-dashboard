'use client';

/**
 * Phase-1 Launch Center — the in-app entry point to the scoped launch prototype.
 * Frames the one loop, the scope collapse, and links into the scoped console + admin,
 * which re-render the real production pages behind a Phase-1-only navigation.
 */

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Rocket, ArrowRight, KeyRound, Compass, Sparkles, Activity, CreditCard,
  BookOpen, Building2, Wallet, CheckCheck, HeartPulse, ShieldCheck, Server,
  Check, ExternalLink, ScrollText, Boxes, Gauge, Target, Award, LayoutDashboard,
} from 'lucide-react';

const LOOP = [
  { k: '01', t: 'Sign up', d: 'Org auto-created. Land on Overview.' },
  { k: '02', t: 'Create a key', d: 'sk_test_ minted, revealed once.' },
  { k: '03', t: 'First call', d: 'Real /v1/enrich returns a record.' },
  { k: '04', t: 'Billed & logged', d: 'Credits drop. Lands in Logs.' },
  { k: '05', t: 'Go live', d: 'sk_live_ approved → masked PII.' },
];

const STATS = [
  { from: '95', to: '36', label: 'Console pages' },
  { from: '17', to: '6', label: 'Admin areas' },
  { from: '173', to: '6', label: 'API endpoints' },
  { from: '40+', to: '7', label: 'Gateway stages' },
];

// The 11 launch modules of the scoped console (~36 of 95 destinations, ≈38%).
const CONSOLE_NAV = [
  { icon: KeyRound, name: 'API Keys' }, { icon: Compass, name: 'Explore & Build' },
  { icon: Sparkles, name: 'Enrichment & Identity' }, { icon: Boxes, name: 'Jobs & Delivery' },
  { icon: Gauge, name: 'Traffic & Rate Limits' }, { icon: Target, name: 'Match & Coverage' },
  { icon: Award, name: 'Data Quality' }, { icon: ShieldCheck, name: 'Security & Compliance' },
  { icon: Activity, name: 'Operations' }, { icon: CreditCard, name: 'Business & Billing' },
  { icon: BookOpen, name: 'Resources' },
];
const ADMIN_NAV = [
  { icon: LayoutDashboard, name: 'Overview' }, { icon: Building2, name: 'Customers' },
  { icon: Wallet, name: 'Wallets' }, { icon: ScrollText, name: 'API Ledger' },
  { icon: CheckCheck, name: 'Approvals' }, { icon: HeartPulse, name: 'Account Health' },
];

const DEFERRED = [
  'Growth / journey / lifecycle / churn', 'Bulk jobs · webhooks · streaming',
  'Idempotency · coalescing · compression', 'Quality · benchmarks · golden records',
  'WAF · encryption · redaction console', 'GraphQL · gRPC · preview program',
  'Partners · data sharing · roadmap', 'Abuse · alerts · messaging · audit',
];

const PIPELINE = ['Auth', 'Rate limit', 'Meter', 'Route', 'Enrich', 'Mask', 'Log'];

const DAYS = [
  { d: 'Mon', t: 'Foundations' }, { d: 'Tue', t: 'Key + Call' }, { d: 'Wed', t: 'Truth + Money' },
  { d: 'Thu', t: 'Operate' }, { d: 'Fri', t: 'Seal + Ship' },
];

export default function Phase1LaunchCenter() {
  return (
    <div className="min-h-screen bg-surface text-fg">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-surface-2/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-3.5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal to-teal/70 grid place-items-center text-white font-black text-sm shadow-lg shadow-teal/20">Z</div>
          <div className="leading-tight">
            <div className="text-sm font-bold">Zinbit · Launch Center</div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-teal">Phase 1 prototype</div>
          </div>
          <div className="ml-auto flex items-center gap-4 text-xs font-semibold">
            <Link href="/docs/phase-1-plan.md" className="text-fg-muted hover:text-teal transition-colors hidden sm:inline">Launch plan</Link>
            <Link href="/console/overview" className="text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Full product <ExternalLink className="w-3 h-3" /></Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12 md:py-16">
        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal/10 border border-teal/30 mb-6">
            <Rocket className="w-3.5 h-3.5 text-teal" />
            <span className="text-[11px] font-mono font-semibold uppercase tracking-wide text-teal">5-day war room · 2 FE · 2 BE</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight max-w-3xl leading-[1.08]">
            Ship the one loop that makes Zinbit sellable.
          </h1>
          <p className="mt-5 text-lg text-fg-muted max-w-2xl">
            Phase 1 is not a slice of the finished product — it is the single closed loop underneath it:
            a developer self-serves a key and gets a <span className="text-fg font-semibold">verified, billed, logged</span> enrichment
            call in under ten minutes. This is that scope, running on the real gateway.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/phase-1/console/home" className="group inline-flex items-center gap-2.5 px-5 py-3 rounded-xl bg-teal text-white font-semibold text-sm shadow-lg shadow-teal/25 hover:shadow-teal/40 hover:-translate-y-0.5 transition-all">
              <KeyRound className="w-4 h-4" /> Open Phase 1 Console <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link href="/phase-1/admin/overview" className="group inline-flex items-center gap-2.5 px-5 py-3 rounded-xl bg-surface-2 border border-border text-fg font-semibold text-sm hover:border-teal/40 hover:-translate-y-0.5 transition-all">
              <ShieldCheck className="w-4 h-4 text-teal" /> Open Phase 1 Admin <ArrowRight className="w-4 h-4 opacity-60 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </motion.div>

        {/* The loop */}
        <div className="mt-14 bg-surface-2 border border-border rounded-2xl p-6 md:p-7 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-teal/[0.05] to-transparent pointer-events-none" />
          <div className="relative grid grid-cols-2 md:grid-cols-5 gap-5">
            {LOOP.map((s, i) => (
              <div key={s.k} className="relative">
                <div className="text-xs font-mono font-bold text-teal">{s.k}</div>
                <div className="mt-1.5 font-bold text-[15px]">{s.t}</div>
                <div className="mt-1 text-[13px] text-fg-muted leading-snug">{s.d}</div>
                {i < LOOP.length - 1 && <ArrowRight className="hidden md:block absolute top-0 -right-3 w-4 h-4 text-fg-subtle" />}
              </div>
            ))}
          </div>
        </div>

        {/* Scope collapse */}
        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
          {STATS.map((s) => (
            <div key={s.label} className="bg-surface-2 border border-border rounded-2xl p-5">
              <div className="flex items-baseline gap-2 font-extrabold text-3xl tabular-nums">
                <span className="text-fg-subtle">{s.from}</span>
                <ArrowRight className="w-4 h-4 text-teal" />
                <span className="text-teal">{s.to}</span>
              </div>
              <div className="mt-2 text-[11px] font-mono uppercase tracking-wider text-fg-subtle">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Two surfaces */}
        <div className="mt-8 grid md:grid-cols-2 gap-4">
          <Link href="/phase-1/console/home" className="group bg-surface-2 border border-border rounded-2xl p-6 hover:border-teal/40 transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs font-mono uppercase tracking-wider text-teal">Developer surface</div>
              <ArrowRight className="w-4 h-4 text-fg-subtle group-hover:text-teal group-hover:translate-x-0.5 transition-all" />
            </div>
            <div className="font-bold text-lg">Console · 36 surfaces</div>
            <div className="text-xs text-fg-subtle mt-0.5">11 modules · 33 nav entries · ≈38% of the product</div>
            <div className="mt-4 flex flex-wrap gap-2">
              {CONSOLE_NAV.map((n) => (
                <span key={n.name} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-glass border border-border text-[12px] font-medium text-fg-muted">
                  <n.icon className="w-3.5 h-3.5" /> {n.name}
                </span>
              ))}
            </div>
          </Link>
          <Link href="/phase-1/admin/overview" className="group bg-surface-2 border border-border rounded-2xl p-6 hover:border-teal/40 transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs font-mono uppercase tracking-wider text-teal">Operator surface</div>
              <ArrowRight className="w-4 h-4 text-fg-subtle group-hover:text-teal group-hover:translate-x-0.5 transition-all" />
            </div>
            <div className="font-bold text-lg">Admin · 6 areas</div>
            <div className="text-xs text-fg-subtle mt-0.5">Full AdminShell chrome · operator RBAC</div>
            <div className="mt-4 flex flex-wrap gap-2">
              {ADMIN_NAV.map((n) => (
                <span key={n.name} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-glass border border-border text-[12px] font-medium text-fg-muted">
                  <n.icon className="w-3.5 h-3.5" /> {n.name}
                </span>
              ))}
            </div>
          </Link>
        </div>

        {/* Pipeline + deferred */}
        <div className="mt-8 grid md:grid-cols-2 gap-4">
          <div className="bg-surface-2 border border-border rounded-2xl p-6">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-fg-subtle mb-4">
              <Server className="w-4 h-4 text-teal" /> Gateway pipeline · every request
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PIPELINE.map((p, i) => (
                <span key={p} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-mono font-medium ${p === 'Mask' ? 'bg-teal/10 text-teal border border-teal/30' : 'bg-glass border border-border text-fg-muted'}`}>
                  <span className="text-fg-subtle">{String(i + 1).padStart(2, '0')}</span> {p}
                </span>
              ))}
            </div>
            <p className="mt-4 text-[13px] text-fg-muted">Real <span className="font-mono text-fg">/api/v1</span> path. A console key authenticates, is rate-limited, metered, enriched, masked on live, and logged — the seam that proves Phase 1 is real.</p>
          </div>
          <div className="bg-surface-2 border border-border rounded-2xl p-6">
            <div className="text-xs font-mono uppercase tracking-wider text-fg-subtle mb-4">Deferred to Phase 2–4 · wraps the core, never reopens the seam</div>
            <div className="grid grid-cols-1 gap-2">
              {DEFERRED.map((d) => (
                <div key={d} className="text-[13px] text-fg-muted flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-fg-subtle flex-shrink-0" /> {d}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 5-day plan */}
        <div className="mt-8 bg-surface-2 border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
            <div className="font-bold text-lg">The 5-day war-room plan</div>
            <Link href="/docs/phase-1-plan.md" className="text-xs font-semibold text-teal hover:underline inline-flex items-center gap-1">Full plan & swimlanes <ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {DAYS.map((day, i) => (
              <div key={day.d} className="rounded-xl border border-border bg-glass p-4">
                <div className="font-bold text-sm">{day.d}</div>
                <div className="mt-0.5 text-[11px] font-mono uppercase tracking-wide text-teal">{day.t}</div>
                {i === 1 && <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-teal"><Check className="w-3 h-3" /> Seam closes</div>}
              </div>
            ))}
          </div>
        </div>

        <p className="mt-10 text-center text-[13px] text-fg-subtle font-mono">
          Scoped prototype · re-renders the real console &amp; admin pages behind a Phase-1 navigation · zero forked page logic.
        </p>
      </main>
    </div>
  );
}

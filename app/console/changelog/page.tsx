'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ENDPOINTS } from '@/src/data/endpoints';
import { GitBranch, Sparkles, Wrench, ArrowRight, AlertTriangle, Clock, Rocket } from 'lucide-react';
import { PageHeader, GlassCard, StatusBadge, type BadgeTone } from '@/components/ui';

type ReleaseKind = 'feature' | 'improvement' | 'fix';

interface Release {
  version: string;
  date: string;
  headline: string;
  changes: { kind: ReleaseKind; text: string }[];
}

const RELEASES: Release[] = [
  {
    version: 'v4.4', date: 'September 2026', headline: 'Email → Person Resolution with confidence & provenance',
    changes: [
      { kind: 'feature', text: 'Email → Person Resolution — turn a work email into a full verified profile (role, seniority, company, verified contacts, socials) with a confidence score and per-field provenance showing exactly which signal produced each field. Runs against the live gateway, bills like production, and keeps a tenant-scoped history you can re-run.' },
      { kind: 'improvement', text: 'People resolution is now deterministic — the same email always returns the same person across the Resolve console, Explorer, and CLI (a single email→person resolver replaces the old randomized mock).' },
      { kind: 'improvement', text: 'Live keys mask PII in the resolved profile; sandbox returns full synthetic data — the masking parity a compliance reviewer expects.' },
    ],
  },
  {
    version: 'v4.3', date: 'September 2026', headline: 'Bulk Enrichment Jobs & a global command palette',
    changes: [
      { kind: 'feature', text: 'Bulk Enrichment Jobs — upload a CSV (or paste a list), map columns to any GET endpoint, see the exact credit cost before you run, and watch rows enrich live through the gateway. Failed rows land in a retry queue; results download as CSV or JSON.' },
      { kind: 'feature', text: 'Command palette (⌘K) now works on every console route and searches the endpoint catalog, pages, recent requests, and actions.' },
      { kind: 'improvement', text: 'Organization settings: rename, set a primary domain and logo, choose a default environment, transfer ownership, or delete a workspace.' },
      { kind: 'improvement', text: 'Explorer deep links (?endpoint=<id>) preselect an endpoint; each endpoint offers "Run in bulk".' },
    ],
  },
  {
    version: 'v4.2', date: 'September 2026', headline: 'Identity Resolution GA & batch enrichment',
    changes: [
      { kind: 'feature', text: 'Universal Identity Resolution (/v1/identity/resolve) is now generally available — auto-detects email, phone, LinkedIn, or domain input.' },
      { kind: 'feature', text: 'Batch Company Enrich (/v1/batch/companies/enrich) accepts up to 50 domains per request with volume-scaled pricing.' },
      { kind: 'improvement', text: 'People AI Search relevance tuning — natural-language queries now return 18% more qualified matches.' },
    ],
  },
  {
    version: 'v4.1', date: 'July 2026', headline: 'Data Clean Room & Partner revenue-share',
    changes: [
      { kind: 'feature', text: 'Zero-copy Data Clean Room — provision Snowflake Secure Views and BigQuery Analytics Hub listings without moving data.' },
      { kind: 'feature', text: 'Partner revenue-share API (/v1/partner/*) — tiered commissions, referral attribution, and month-end payouts.' },
      { kind: 'improvement', text: 'Rate-limit headers now include X-RateLimit-Reset for precise client backoff.' },
    ],
  },
  {
    version: 'v4.0', date: 'May 2026', headline: 'Consolidated v1 namespace',
    changes: [
      { kind: 'improvement', text: 'People and Companies endpoints consolidated under /v1/people/* and /v1/companies/* for a consistent resource model.' },
      { kind: 'fix', text: 'Deprecated legacy LinkedIn-lookup paths in favor of the unified people endpoints (see the sunset schedule).' },
    ],
  },
  {
    version: 'v3.5', date: 'March 2026', headline: 'Webhook reliability',
    changes: [
      { kind: 'feature', text: 'Dead-Letter Queue and per-endpoint circuit breakers for webhook delivery.' },
      { kind: 'feature', text: 'Idempotency-Key support on all billed POST endpoints (24h replay window).' },
    ],
  },
  {
    version: 'v3.4', date: 'January 2026', headline: 'Compliance & residency',
    changes: [
      { kind: 'feature', text: 'DPDP / GDPR / CCPA automatic PII masking and end-to-end opt-out propagation on live keys.' },
      { kind: 'improvement', text: 'Data-residency routing — requests are served from the region matching your account (US / EU / IN).' },
    ],
  },
];

const KIND: Record<ReleaseKind, { label: string; tone: BadgeTone; icon: ReactNode }> = {
  feature: { label: 'New', tone: 'teal', icon: <Sparkles className="w-3 h-3" /> },
  improvement: { label: 'Improved', tone: 'info', icon: <Rocket className="w-3 h-3" /> },
  fix: { label: 'Fixed', tone: 'warning', icon: <Wrench className="w-3 h-3" /> },
};

export default function ChangelogPage() {
  const deprecated = ENDPOINTS.filter(e => e.isDeprecated);
  const byId = (id?: string) => ENDPOINTS.find(e => e.id === id);
  const daysUntil = (date?: string) => date ? Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000) : null;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-12">
      <PageHeader
        icon={<GitBranch />}
        title="API Changelog"
        description="Release notes, new endpoints, and the deprecation schedule for the Zinbit API. We ship backward-compatible changes continuously and give 90 days' notice before any endpoint is sunset."
      />

      {deprecated.length > 0 && (
        <GlassCard className="border-amber-500/30 bg-amber-500/5">
          <h3 className="text-sm font-black uppercase tracking-widest text-amber-300 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Deprecation Schedule
          </h3>
          <div className="space-y-3">
            {deprecated.map(ep => {
              const days = daysUntil(ep.sunsetDate);
              const replacement = byId(ep.replacementEndpointId);
              return (
                <div key={ep.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-glass border border-border-subtle rounded-xl px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-fg">{ep.path}</span>
                      <StatusBadge tone="warning">Deprecated</StatusBadge>
                    </div>
                    <div className="text-xs text-fg-muted mt-1 flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      {ep.sunsetDate
                        ? `Sunsets ${new Date(ep.sunsetDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}${days !== null && days > 0 ? ` · ${days} days left` : ''}`
                        : 'Sunset date to be announced'}
                    </div>
                  </div>
                  {replacement && (
                    <Link href="/console/explorer" className="flex items-center gap-1.5 text-xs font-bold text-teal hover:text-teal-ice transition-colors shrink-0">
                      Migrate to {replacement.path} <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

      <div className="relative pl-6">
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
        <div className="space-y-8">
          {RELEASES.map((rel, i) => (
            <motion.div key={rel.version} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="relative">
              <div className="absolute -left-6 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-teal bg-surface" />
              <div className="flex items-baseline gap-3 mb-3">
                <span className="text-lg font-extrabold text-fg">{rel.version}</span>
                <span className="text-xs text-fg-subtle">{rel.date}</span>
              </div>
              <p className="text-sm font-semibold text-fg-muted mb-3">{rel.headline}</p>
              <div className="space-y-2">
                {rel.changes.map((c, j) => {
                  const k = KIND[c.kind];
                  return (
                    <GlassCard key={j} padding="sm" className="flex items-start gap-3 rounded-xl">
                      <StatusBadge tone={k.tone} className="shrink-0 mt-0.5">{k.icon}{k.label}</StatusBadge>
                      <span className="text-sm text-fg-muted">{c.text}</span>
                    </GlassCard>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

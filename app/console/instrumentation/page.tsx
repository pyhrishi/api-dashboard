'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Radar, Activity, Eye, ShieldOff, Users, ArrowRight, Sparkles, BarChart3, Radio } from 'lucide-react';
import { track } from '@/lib/telemetry';
import RoleGuard from '@/components/RoleGuard';
import { PageHeader, KpiTile, GlassCard, StatusBadge, Skeleton, DataTable, type Column, type BadgeTone } from '@/components/ui';
import {
  SINKS, routeEvent, generateVisitorFeed, deAnonStats, sinkById,
  type DeAnonVisitor, type SinkId,
} from '@/lib/instrumentation';

const FEED_SEED = 'zinbit-deanon-2026';
const CONSENT_TONE: Record<DeAnonVisitor['consent'], BadgeTone> = {
  identified: 'success', consent_pending: 'warning', anonymous: 'info',
};
const CONSENT_LABEL: Record<DeAnonVisitor['consent'], string> = {
  identified: 'Identified', consent_pending: 'Consent-gated', anonymous: 'Anonymous',
};
// A few representative events to show the routing map.
const SAMPLE_EVENTS = ['lp_viewed', 'catalogue_api_opened', 'sandbox_fired_gated', 'signup_gate_shown', 'signup_completed'] as const;
const SINK_ACCENT: Record<SinkId, string> = { clarity: 'text-teal', ga: 'text-semantic-success', mixpanel: 'text-semantic-warning', rb2b: 'text-fg' };

function ago(t: number) {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
}

function InstrumentationInner() {
  const [now] = useState(() => Date.now());
  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');

  useEffect(() => {
    track('instrumentation_viewed', {});
    const t = setTimeout(() => setPhase('ready'), 240);
    return () => clearTimeout(t);
  }, []);

  const feed = useMemo(() => generateVisitorFeed(FEED_SEED, 60, now), [now]);
  const stats = useMemo(() => deAnonStats(feed), [feed]);

  const columns: Column<DeAnonVisitor>[] = [
    {
      key: 'company', header: 'Visitor', render: (v) => (
        <div className="min-w-0">
          <div className="text-[13px] text-fg font-semibold truncate">{v.company}</div>
          <div className="text-[11px] text-fg-subtle truncate">{v.person ?? '— (not identified)'} · {v.role}</div>
        </div>
      ),
    },
    { key: 'region', header: 'Region', render: (v) => <span className="text-[12px] text-fg-muted">{v.region} · {v.country}</span> },
    { key: 'intent', header: 'Intent signal', className: 'hidden md:table-cell', render: (v) => <span className="text-[12px] text-fg-muted">{v.intent}</span> },
    { key: 'consent', header: 'Status', render: (v) => <StatusBadge tone={CONSENT_TONE[v.consent]}>{CONSENT_LABEL[v.consent]}</StatusBadge> },
    { key: 'at', header: 'Seen', align: 'right', sortValue: (v) => v.at, render: (v) => <span className="text-[11px] text-fg-subtle">{ago(v.at)}</span> },
  ];

  return (
    <div className="max-w-[1100px] mx-auto pb-16">
      <PageHeader
        icon={<Radar />}
        title="Instrumentation"
        description="Every top-of-funnel signal is captured from day one. This is the operator view of where events flow — session replay, attribution, product analytics — and the de-anonymized visitor feed that pipes identified companies into retargeting and sales."
        actions={<Link href="/console/funnel"><StatusBadge tone="info"><Radio className="w-3.5 h-3.5" /> Funnel</StatusBadge></Link>}
      />

      {phase === 'loading' ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[92px] rounded-2xl" />)}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <KpiTile label="Sinks active" value={SINKS.length} icon={<Activity />} hint="Clarity · GA · Mixpanel · RB2B" />
            <KpiTile label="Identified" value={stats.identified} icon={<Eye />} hint={`${stats.identifyRatePct}% identify rate`} />
            <KpiTile label="Consent-gated" value={stats.consentGated} icon={<ShieldOff />} hint="EU/India privacy rules" />
            <KpiTile label="Visitors" value={stats.total} icon={<Users />} hint="last 72h" />
          </div>

          {/* Sinks */}
          <GlassCard className="p-5 mt-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-4 h-4 text-teal" />
              <h3 className="text-sm font-bold text-fg">Analytics sinks</h3>
              <StatusBadge tone="info">mandatory from day one</StatusBadge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {SINKS.map((s) => (
                <div key={s.id} className="rounded-xl border border-border bg-surface-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[13px] font-bold ${SINK_ACCENT[s.id]}`}>{s.name}</span>
                    <StatusBadge tone="success">active</StatusBadge>
                  </div>
                  <p className="text-[12px] text-fg-muted mt-0.5">{s.purpose}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {s.captures.map((c) => <span key={c} className="text-[10px] font-semibold text-fg-subtle bg-surface border border-border-subtle rounded px-1.5 py-0.5">{c}</span>)}
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Event routing */}
          <GlassCard className="p-5 mt-5">
            <h3 className="text-sm font-bold text-fg mb-3">Event routing</h3>
            <div className="space-y-1.5">
              {SAMPLE_EVENTS.map((ev) => (
                <div key={ev} className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface px-3 py-2 flex-wrap">
                  <code className="font-mono text-[11px] text-fg min-w-0 flex-1 truncate">{ev}</code>
                  <span className="text-fg-subtle text-[11px]">→</span>
                  <div className="flex gap-1.5">
                    {routeEvent(ev).map((sid) => <StatusBadge key={sid} tone="info">{sinkById(sid).name}</StatusBadge>)}
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* De-anon feed */}
          <div className="flex items-center justify-between mt-6 mb-3">
            <h3 className="text-sm font-bold text-fg flex items-center gap-2"><Eye className="w-4 h-4" /> De-anonymized visitors</h3>
            <StatusBadge tone="info">{stats.identifyRatePct}% identified · US strongest</StatusBadge>
          </div>
          <GlassCard className="p-0 overflow-hidden">
            <div className="p-2">
              <DataTable columns={columns} rows={feed} rowKey={(v) => v.id} pageSize={10} initialSort={{ key: 'at', dir: 'desc' }} onRowClick={(v) => track('deanon_visitor_inspected', { region: v.region, consent: v.consent })} />
            </div>
          </GlassCard>

          <p className="text-[11px] text-fg-subtle mt-4 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Identified US visitors pipe into retargeting + sales; EU (GDPR) and India (DPDP) traffic is consent-gated and shown de-identified until consent is captured.</p>
          <div className="mt-3 flex items-center gap-4">
            <Link href="/console/funnel" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Funnel <ArrowRight className="w-3.5 h-3.5" /></Link>
            <Link href="/console/growth" className="text-xs font-bold text-fg-muted hover:text-teal transition-colors inline-flex items-center gap-1">Growth <ArrowRight className="w-3.5 h-3.5" /></Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function InstrumentationPage() {
  return (
    <RoleGuard allowedRoles={['admin', 'billing']}>
      <InstrumentationInner />
    </RoleGuard>
  );
}

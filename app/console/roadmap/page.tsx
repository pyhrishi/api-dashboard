'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Map, Search, X, LayoutGrid, Rocket, Clock, Sparkles, ListOrdered, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { track } from '@/lib/telemetry';
import {
  ROADMAP_AREAS,
  ROADMAP_TOTAL,
  roadmapStageCounts,
  roadmapBuildOrder,
  roadmapBuildPhaseSummaries,
  BUILD_PHASES,
  isFeatureBuilt,
  ROADMAP_BUILT,
  type FeatureStage,
} from '@/lib/roadmap';
import {
  PageHeader,
  KpiTile,
  Input,
  StatusBadge,
  SegmentedControl,
  EmptyState,
  Skeleton,
  Button,
} from '@/components/ui';
import type { BadgeTone } from '@/components/ui';

type StageFilter = 'all' | FeatureStage;
type StatusFilter = 'all' | 'built' | 'planned';
type ViewMode = 'area' | 'build';

const STAGE_TONE: Record<FeatureStage, BadgeTone> = {
  Now: 'teal',
  Next: 'warning',
  Later: 'info',
};

const STAGE_META: Record<FeatureStage, { label: string; icon: React.ElementType; blurb: string }> = {
  Now: { label: 'Now', icon: Rocket, blurb: 'Table stakes — shipped or near-term' },
  Next: { label: 'Next', icon: Sparkles, blurb: 'The competitive middle we win on' },
  Later: { label: 'Later', icon: Clock, blurb: 'Enterprise, ecosystem, and moat' },
};

export default function RoadmapPage() {
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState<StageFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [view, setView] = useState<ViewMode>('area');
  const [activeArea, setActiveArea] = useState<string>(ROADMAP_AREAS[0]?.name ?? '');
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const counts = useMemo(() => roadmapStageCounts(), []);
  const buildOrder = useMemo(() => roadmapBuildOrder(), []);
  const phaseSummaries = useMemo(() => roadmapBuildPhaseSummaries(), []);

  useEffect(() => {
    track('roadmap_viewed', { total: ROADMAP_TOTAL, areas: ROADMAP_AREAS.length });
    const t = setTimeout(() => setLoading(false), 350);
    return () => clearTimeout(t);
  }, []);

  const changeView = (next: ViewMode) => {
    setView(next);
    track('roadmap_view_changed', { view: next });
  };

  const normalizedQuery = query.trim().toLowerCase();

  const matchesFilters = (id: string, name: string, description: string, area: string, s: FeatureStage) => {
    const matchesStage = stage === 'all' || s === stage;
    const built = isFeatureBuilt(id);
    const matchesStatus = status === 'all' || (status === 'built' ? built : !built);
    const matchesQuery =
      !normalizedQuery ||
      name.toLowerCase().includes(normalizedQuery) ||
      description.toLowerCase().includes(normalizedQuery) ||
      area.toLowerCase().includes(normalizedQuery);
    return matchesStage && matchesStatus && matchesQuery;
  };

  // ── Area view data ──────────────────────────────────────────────────────────
  const filteredAreas = useMemo(() => {
    return ROADMAP_AREAS.map((area) => ({
      ...area,
      features: area.features.filter((f) => matchesFilters(f.id, f.name, f.description, area.name, f.stage)),
    })).filter((area) => area.features.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedQuery, stage, status]);

  // ── Build view data ─────────────────────────────────────────────────────────
  const filteredBuild = useMemo(
    () => buildOrder.filter((o) => matchesFilters(o.feature.id, o.feature.name, o.feature.description, o.area, o.feature.stage)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildOrder, normalizedQuery, stage, status]
  );

  const buildByPhase = useMemo(() => {
    return BUILD_PHASES.map((_, phaseIndex) => filteredBuild.filter((o) => o.phaseIndex === phaseIndex))
      .map((items, phaseIndex) => ({ phaseIndex, items }))
      .filter((g) => g.items.length > 0);
  }, [filteredBuild]);

  const shownCount = view === 'area'
    ? filteredAreas.reduce((n, a) => n + a.features.length, 0)
    : filteredBuild.length;

  const isFiltering = normalizedQuery.length > 0 || stage !== 'all' || status !== 'all';

  // Scrollspy (area view only): highlight the area whose section is in view.
  useEffect(() => {
    if (loading || view !== 'area') return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const name = entry.target.getAttribute('data-area');
            if (name) setActiveArea(name);
          }
        });
      },
      { rootMargin: '-15% 0px -75% 0px', threshold: 0 }
    );
    Object.values(sectionRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [loading, view, filteredAreas.length]);

  const scrollToArea = (name: string) => {
    sectionRefs.current[name]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveArea(name);
  };

  const clearFilters = () => {
    setQuery('');
    setStage('all');
    setStatus('all');
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-8">
      <PageHeader
        icon={<Map />}
        title="Product Roadmap"
        description={`The full product surface for Zinbit — ${ROADMAP_TOTAL} features across ${ROADMAP_AREAS.length} areas, each staged Now, Next, or Later. Browse by area, or switch to the dependency-ordered build sequence.`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge tone="success">{ROADMAP_BUILT} built</StatusBadge>
            <StatusBadge tone="teal" dot pulse>{ROADMAP_TOTAL} features</StatusBadge>
          </div>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiTile
          label="Total features"
          value={ROADMAP_TOTAL}
          icon={<LayoutGrid />}
          hint={`${ROADMAP_AREAS.length} areas · ${BUILD_PHASES.length} build phases`}
          loading={loading}
        />
        <KpiTile
          label="Built"
          value={ROADMAP_BUILT}
          icon={<CheckCircle2 />}
          hint={`${Math.round((ROADMAP_BUILT / ROADMAP_TOTAL) * 100)}% shipped · ${ROADMAP_TOTAL - ROADMAP_BUILT} to go`}
          loading={loading}
        />
        {(['Now', 'Next', 'Later'] as FeatureStage[]).map((s) => {
          const Icon = STAGE_META[s].icon;
          return (
            <KpiTile
              key={s}
              label={STAGE_META[s].label}
              value={counts[s]}
              icon={<Icon />}
              hint={STAGE_META[s].blurb}
              loading={loading}
            />
          );
        })}
      </div>

      {/* Controls */}
      <div className="sticky top-0 z-20 -mx-4 md:-mx-8 px-4 md:px-8 py-3 bg-surface/80 backdrop-blur-xl border-y border-border">
        <div className="flex flex-col md:flex-row md:items-center gap-3 flex-wrap">
          <SegmentedControl<ViewMode>
            layoutId="roadmap-view"
            value={view}
            onChange={changeView}
            options={[
              { value: 'area', label: 'By area' },
              { value: 'build', label: 'Build order' },
            ]}
          />
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${ROADMAP_TOTAL} features — try 'webhook', 'SSO', 'match rate'…`}
              aria-label="Search features"
              className="pl-9"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-fg-subtle hover:text-fg rounded-md hover:bg-glass transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <SegmentedControl<StageFilter>
            layoutId="roadmap-stage"
            value={stage}
            onChange={setStage}
            options={[
              { value: 'all', label: 'All' },
              { value: 'Now', label: 'Now' },
              { value: 'Next', label: 'Next' },
              { value: 'Later', label: 'Later' },
            ]}
          />
          <SegmentedControl<StatusFilter>
            layoutId="roadmap-status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: 'Any' },
              { value: 'built', label: 'Built' },
              { value: 'planned', label: 'Planned' },
            ]}
          />
          <div className="text-xs font-bold text-fg-muted tabular-nums whitespace-nowrap md:ml-1">
            <span className="text-fg">{shownCount}</span> shown
          </div>
        </div>
      </div>

      {loading ? (
        <RoadmapSkeleton />
      ) : shownCount === 0 ? (
        <EmptyState
          icon={<Search className="w-8 h-8" />}
          title="No features match"
          description="Nothing lines up with that search and those filters. Try a broader term or clear the filters."
          action={<Button variant="secondary" onClick={clearFilters}>Clear filters</Button>}
        />
      ) : view === 'area' ? (
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8 items-start">
          {/* Area nav */}
          <nav className="hidden lg:block sticky top-24 self-start" aria-label="Product areas">
            <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3 px-2">
              Areas
            </div>
            <ul className="space-y-0.5 max-h-[calc(100vh-12rem)] overflow-y-auto pr-1">
              {filteredAreas.map((area, i) => {
                const isActive = area.name === activeArea;
                return (
                  <li key={area.name}>
                    <button
                      onClick={() => scrollToArea(area.name)}
                      className={cn(
                        'w-full flex items-baseline gap-2 text-left px-2 py-1.5 rounded-lg text-[13px] leading-tight transition-colors',
                        isActive
                          ? 'bg-teal/10 text-teal font-bold'
                          : 'text-fg-muted hover:text-fg hover:bg-glass'
                      )}
                    >
                      <span className="text-[10px] tabular-nums text-fg-subtle w-5 shrink-0">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="min-w-0 flex-1">{area.name}</span>
                      <span className="text-[10px] tabular-nums text-fg-subtle shrink-0">
                        {area.features.length}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Feature sections */}
          <div className="min-w-0 space-y-10">
            {filteredAreas.map((area, i) => (
              <motion.section
                key={area.name}
                data-area={area.name}
                ref={(el) => {
                  sectionRefs.current[area.name] = el;
                }}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="scroll-mt-24"
              >
                <div className="flex items-baseline gap-3 border-b-2 border-fg/90 pb-3 mb-1">
                  <span className="font-mono text-xs text-teal font-semibold">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="text-lg font-bold text-fg flex-1 min-w-0">{area.name}</h3>
                  <span className="text-xs text-fg-muted tabular-nums whitespace-nowrap">
                    {area.features.length} {isFiltering ? 'shown' : 'features'}
                  </span>
                </div>
                <p className="text-sm text-fg-muted mb-4 max-w-3xl">{area.blurb}</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border rounded-2xl overflow-hidden border border-border">
                  {area.features.map((f) => (
                    <div
                      key={f.id}
                      className="group bg-surface-2 hover:bg-glass transition-colors p-4 flex gap-3"
                    >
                      <span className="font-mono text-[10px] text-fg-subtle pt-0.5 tabular-nums shrink-0">
                        {f.id}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-sm font-bold text-fg leading-snug">{f.name}</h4>
                          <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                            {isFeatureBuilt(f.id) && (
                              <StatusBadge tone="success"><CheckCircle2 className="w-3 h-3" /> Built</StatusBadge>
                            )}
                            <StatusBadge tone={STAGE_TONE[f.stage]}>{f.stage}</StatusBadge>
                          </div>
                        </div>
                        <p className="text-xs text-fg-muted mt-1 leading-relaxed">
                          {f.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.section>
            ))}
          </div>
        </div>
      ) : (
        /* ── Build order view ── */
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-8 items-start">
          {/* Phase rail */}
          <aside className="hidden lg:block sticky top-24 self-start" aria-label="Build phases">
            <div className="text-[10px] font-black uppercase tracking-widest text-fg-subtle mb-3 px-2 flex items-center gap-1.5">
              <ListOrdered className="w-3 h-3" /> Build phases
            </div>
            <ol className="space-y-0.5">
              {phaseSummaries.map((p) => (
                <li key={p.index}>
                  <a
                    href={`#phase-${p.index}`}
                    className="w-full flex items-baseline gap-2 text-left px-2 py-1.5 rounded-lg text-[13px] leading-tight text-fg-muted hover:text-fg hover:bg-glass transition-colors"
                  >
                    <span className="text-[10px] tabular-nums text-teal font-bold w-4 shrink-0">
                      {p.index + 1}
                    </span>
                    <span className="min-w-0 flex-1">{p.title}</span>
                    <span className="text-[10px] tabular-nums text-fg-subtle shrink-0">
                      {p.count}
                    </span>
                  </a>
                </li>
              ))}
            </ol>
            <p className="text-[11px] text-fg-subtle leading-relaxed mt-4 px-2">
              Ordered by dependency: each phase only relies on earlier ones. Within a phase, Now
              before Next before Later.
            </p>
          </aside>

          {/* Sequenced phases */}
          <div className="min-w-0 space-y-10">
            {buildByPhase.map(({ phaseIndex, items }) => {
              const summary = phaseSummaries[phaseIndex];
              return (
                <motion.section
                  key={phaseIndex}
                  id={`phase-${phaseIndex}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="scroll-mt-24"
                >
                  <div className="flex items-start gap-3 border-b-2 border-fg/90 pb-3 mb-1">
                    <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-teal/10 text-teal font-black text-sm shrink-0">
                      {phaseIndex + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="text-lg font-bold text-fg min-w-0">{summary.title}</h3>
                        <span className="text-xs text-fg-muted tabular-nums whitespace-nowrap shrink-0">
                          {isFiltering ? `${items.length} shown` : `#${summary.startSeq}–${summary.endSeq}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        {(['Now', 'Next', 'Later'] as FeatureStage[]).map((s) =>
                          summary.stages[s] > 0 ? (
                            <StatusBadge key={s} tone={STAGE_TONE[s]}>
                              {summary.stages[s]} {s}
                            </StatusBadge>
                          ) : null
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-fg-muted mb-4 max-w-3xl">{BUILD_PHASES[phaseIndex].rationale}</p>

                  <ol className="rounded-2xl overflow-hidden border border-border divide-y divide-border">
                    {items.map((o) => (
                      <li
                        key={o.feature.id}
                        className="group bg-surface-2 hover:bg-glass transition-colors p-4 flex items-start gap-4"
                      >
                        <span className="font-mono text-sm font-black text-teal tabular-nums w-10 shrink-0 pt-0.5">
                          {String(o.seq).padStart(3, '0')}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-sm font-bold text-fg leading-snug">{o.feature.name}</h4>
                            <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                              {isFeatureBuilt(o.feature.id) && (
                                <StatusBadge tone="success"><CheckCircle2 className="w-3 h-3" /> Built</StatusBadge>
                              )}
                              <StatusBadge tone={STAGE_TONE[o.feature.stage]}>{o.feature.stage}</StatusBadge>
                            </div>
                          </div>
                          <p className="text-xs text-fg-muted mt-1 leading-relaxed">
                            {o.feature.description}
                          </p>
                          <div className="flex items-center gap-2 mt-2 text-[10px] font-semibold text-fg-subtle">
                            <span className="font-mono">{o.feature.id}</span>
                            <span aria-hidden>·</span>
                            <span className="truncate">{o.area}</span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </motion.section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function RoadmapSkeleton() {
  return (
    <div className="space-y-10">
      {[0, 1].map((s) => (
        <div key={s}>
          <div className="flex items-baseline gap-3 border-b-2 border-border pb-3 mb-4">
            <Skeleton className="h-4 w-6" />
            <Skeleton className="h-5 w-56" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-surface-2 border border-border rounded-2xl p-4 flex gap-3">
                <Skeleton className="h-3 w-10" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

'use client';

/**
 * Phase-0 TOFU conversion centerpiece (F-funnel M1): a VISUAL-ONLY sandbox on the
 * landing page. A non-logged-in visitor can browse the API catalogue, pick an
 * endpoint, fill inputs, and tap "Fire" — but NO data is ever returned pre-auth
 * (real or test). Firing triggers the sign-up gate, which is deliberately the
 * primary conversion CTA: no giveaway/farming, and the sandbox itself converts.
 * The functional test/live sandbox lives in-product post-signup.
 *
 * Marketing design system (bg-ink/text-ink/bg-teal/font-display), not console tokens.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Zap, ArrowRight, Play, Sparkles } from 'lucide-react';
import { API_CATALOG, CATEGORIES, type ApiCategory } from '@/lib/api-catalog';
import { ENDPOINTS } from '@/data/endpoints';
import { API_HOST } from '@/lib/api-config';
import { track } from '@/lib/telemetry';

function priceFor(id: string): number {
  return ENDPOINTS.find((e) => e.id === id)?.creditCost ?? 1;
}
function inputFor(id: string): { name: string; placeholder: string } {
  const ep = ENDPOINTS.find((e) => e.id === id);
  const p = ep?.parameters?.[0];
  return { name: p?.name ?? 'query', placeholder: p?.example ?? p?.placeholder ?? 'ceo@example.com' };
}

export function ApiSandboxSection() {
  const [category, setCategory] = useState<ApiCategory>('people');
  const [selectedId, setSelectedId] = useState<string>(API_CATALOG.find((e) => e.categoryId === 'people')?.id ?? API_CATALOG[0].id);
  const [value, setValue] = useState('');
  const [gated, setGated] = useState(false);

  const inCategory = useMemo(() => API_CATALOG.filter((e) => e.categoryId === category), [category]);
  const selected = useMemo(() => API_CATALOG.find((e) => e.id === selectedId) ?? API_CATALOG[0], [selectedId]);
  const price = priceFor(selected.id);
  const field = inputFor(selected.id);

  const selectEndpoint = (id: string) => {
    setSelectedId(id);
    setGated(false);
    track('catalogue_api_opened', { endpoint: id });
  };

  const fire = () => {
    setGated(true);
    track('sandbox_fired_gated', { endpoint: selected.id });
    track('signup_gate_shown', { source: 'sandbox', endpoint: selected.id });
  };

  return (
    <section id="sandbox" className="py-32 relative border-t border-black/5 dark:border-white/10">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/5 dark:border-white/12 bg-white dark:bg-white/5 px-4 py-2 text-[13px] font-bold tracking-widest text-teal mb-6 uppercase">
            <Play className="w-3.5 h-3.5" /> Live sandbox
          </div>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.02em] text-ink dark:text-white mb-4">
            Explore every endpoint. Fire when ready.
          </h2>
          <p className="text-[17px] text-ink/60 dark:text-white/60 leading-relaxed">
            Tap any API to see its purpose, sample schema, and per-call price. Try a request right here —
            then create a free account to get real data back.
          </p>
        </div>

        <div className="grid lg:grid-cols-[300px_1fr] gap-6 items-start">
          {/* Catalogue */}
          <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white dark:bg-white/[0.03] p-3">
            <div className="flex gap-1 p-1 mb-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.04]">
              {CATEGORIES.map((c) => (
                <button key={c.id} onClick={() => { setCategory(c.id); const first = API_CATALOG.find((e) => e.categoryId === c.id); if (first) selectEndpoint(first.id); }}
                  className={`flex-1 text-[11px] font-bold rounded-lg py-2 transition-colors ${category === c.id ? 'bg-teal text-ink' : 'text-ink/50 dark:text-white/50 hover:text-ink dark:hover:text-white'}`}>
                  {c.name.split(' ')[0]}
                </button>
              ))}
            </div>
            <div className="space-y-1">
              {inCategory.map((e) => (
                <button key={e.id} onClick={() => selectEndpoint(e.id)}
                  className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors ${selected.id === e.id ? 'bg-teal/10 text-ink dark:text-white ring-1 ring-teal/30' : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04] text-ink/70 dark:text-white/70'}`}>
                  <span className="text-teal shrink-0">{e.icon}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{e.name}</span>
                  <span className="text-[10px] font-bold text-ink/40 dark:text-white/40 shrink-0">{priceFor(e.id)} cr</span>
                </button>
              ))}
            </div>
          </div>

          {/* Sandbox panel */}
          <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-black/5 dark:border-white/10 flex-wrap">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-teal">{selected.icon}</span>
                <div className="min-w-0">
                  <div className="text-[15px] font-bold text-ink dark:text-white truncate">{selected.name}</div>
                  <div className="text-[12px] text-ink/50 dark:text-white/50 truncate">{selected.desc}</div>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal/10 text-teal px-3 py-1 text-[12px] font-bold shrink-0">
                <Zap className="w-3.5 h-3.5" /> {price} credit{price === 1 ? '' : 's'} / call
              </span>
            </div>

            <div className="p-5">
              <div className="font-mono text-[12px] text-ink/50 dark:text-white/40 mb-2">POST https://{API_HOST}/v1/…</div>
              <div className="flex gap-2 flex-col sm:flex-row">
                <div className="flex-1 rounded-xl border border-black/10 dark:border-white/15 bg-black/[0.02] dark:bg-black/20 px-3 py-2.5 flex items-center gap-2">
                  <span className="font-mono text-[12px] text-ink/40 dark:text-white/40">{field.name}:</span>
                  <input value={value} onChange={(e) => { setValue(e.target.value); setGated(false); }} placeholder={field.placeholder}
                    className="flex-1 bg-transparent outline-none font-mono text-[13px] text-ink dark:text-white placeholder:text-ink/30 dark:placeholder:text-white/25" />
                </div>
                <button onClick={fire}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal px-6 py-2.5 text-[14px] font-bold text-ink shadow-[0_10px_30px_-12px_rgba(70,189,198,0.7)] transition-all hover:bg-teal-ice hover:-translate-y-0.5">
                  <Play className="w-4 h-4" /> Fire
                </button>
              </div>

              {/* Response area — locked pre-auth */}
              <div className="relative mt-4">
                <pre className={`rounded-xl border border-black/5 dark:border-white/10 bg-black/[0.03] dark:bg-black/30 p-4 overflow-x-auto font-mono text-[12px] leading-relaxed text-ink/70 dark:text-white/60 ${gated ? 'blur-[3px] select-none' : ''}`}>{selected.response}</pre>
                <AnimatePresence>
                  {gated && (
                    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                      className="absolute inset-0 flex items-center justify-center p-4">
                      <div className="text-center rounded-2xl border border-teal/30 bg-white dark:bg-ink px-6 py-6 shadow-2xl max-w-sm">
                        <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-teal/15 text-teal mb-3"><Lock className="w-5 h-5" /></div>
                        <h3 className="text-[16px] font-bold text-ink dark:text-white">Sign up to get real data</h3>
                        <p className="text-[13px] text-ink/60 dark:text-white/60 mt-1.5">No data is served to anonymous requests — it keeps the sandbox honest. Create a free account and fire this exact call against the real gateway.</p>
                        <Link href="/signup" className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-teal px-6 py-3 text-[14px] font-bold text-ink transition-all hover:bg-teal-ice hover:-translate-y-0.5 w-full">
                          Create free account <ArrowRight className="w-4 h-4" />
                        </Link>
                        <p className="text-[11px] text-ink/45 dark:text-white/40 mt-2 flex items-center justify-center gap-1"><Sparkles className="w-3 h-3" /> 5,000 free credits · no card required</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {!gated && (
                <p className="text-[11px] text-ink/40 dark:text-white/35 mt-2 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Sample schema shown. Fire to unlock real data (free account).
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

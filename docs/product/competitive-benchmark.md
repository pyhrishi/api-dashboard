# Competitive Benchmark

"Best in market" means: **on the axes our ICP cares about, beat the strongest incumbent** — and match the developer-experience bar set by the best APIs anywhere (Stripe, Twilio), which is what developers actually compare us to.

## The field

| Player | Model | Strengths | Weaknesses we exploit |
|---|---|---|---|
| **Clearbit** (HubSpot) | Enrichment API, firmographics | Clean API, good docs, strong US firmographics | US-centric coverage, HubSpot-gravity, limited India/APAC registry data, weak compliance story outside US |
| **People Data Labs** | Person/company dataset API, usage-based | Massive person dataset, dev-friendly, flexible search | Coverage quality varies by region, minimal console/observability, thin compliance tooling |
| **Apollo** | Sales intelligence + sequencing, freemium PLG | Great PLG (free tier → team), all-in-one for SDRs | Not an API-first product; console built for sales reps, not engineers; enterprise governance shallow |
| **ZoomInfo** | Enterprise data + intent, sales-led | Deepest US B2B data, intent signals, enterprise trust | Expensive, sales-led (no self-serve), slow, legacy DX, heavy contracts |
| **Lusha** | Extension + API, SMB PLG | Frictionless SMB PLG, credits model | Shallow API depth, weak enterprise/compliance, limited registry data |
| **Stripe / Twilio** *(DX bar, not competitors)* | Developer platforms | Docs, sandbox, idempotency, precise errors, SDKs, status pages, changelogs | — this is the bar every Zinbit feature must meet |

## Where Zinbit wins (differentiators — lean into these in every feature)

1. **Dual-engine truth** — a 400M+ contact graph (*Lookup Engine*) **plus** deterministic government-registry identity (*IDS Engine*: MCA CIN/DIN, GST-adjacent) with registry-overrides-scraped precedence. No incumbent offers verified registry identity alongside contact enrichment.
2. **Compliance-native** — DPDP/GDPR/CCPA masking on live keys, data-residency routing, end-to-end opt-out propagation, immutable audit. Incumbents bolt compliance on; we ship it as default behavior.
3. **India-strong, globally credible** — the underserved market incumbents treat as an afterthought.
4. **Radical usage transparency** — credit cost per call in the docs, live billing headers, per-endpoint cost, forecasts and budgets. Developers hate opaque pricing; buyers hate surprise overages.
5. **Operator-grade console for developers** — replayable logs, trace waterfalls, webhook DLQ/retries, root-cause analysis, key scopes/JIT keys. Most enrichment APIs give you a key and a docs page.
6. **B2B2B economics built in** — partner attribution, revenue share, zero-copy data clean rooms. A channel product, not just an API.

## Table stakes (must have, no credit for having them)

Solid docs + sandbox · SDK snippets · clear rate limits & headers · idempotency · webhooks · key management · basic usage dashboard · status page · SOC2 posture.

## Per-feature benchmarking method

When building `<feature>`:
1. **Who does it best today?** Name the incumbent and what they do well (steal the good parts).
2. **Where do they fall short for our ICP?** (usually: enterprise governance, compliance, cost transparency, or DX depth).
3. **What's our differentiated angle?** Tie it to one of the six wins above — if you can't, the feature is table-stakes: ship it clean and fast, don't over-invest.
4. **DX bar check:** Would a Stripe engineer find this obvious, fast, and self-explanatory? If not, it's not done.

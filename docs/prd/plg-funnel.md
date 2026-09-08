# PRD: PLG Growth Funnel (M0 + M1 — foundation & Phase 0 TOFU)

> The end-to-end product-led growth funnel for Zinbit — from anonymous landing-page visitor through trial, activation, conversion, wallet health, and churn. This PRD covers the shipped foundation (funnel SSOT + operator board) and **Phase 0 (TOFU)**: the landing catalogue + mock-sandbox conversion gate, intent/dwell pop-ups, day-one instrumentation with visitor de-anonymization, and consent gating.

**Status:** Built — M0 + M1 (prototype is the spec) · **Program:** PLG Funnel (Phases 0–7) · **Branch:** `worktree-funnel-plg-engine` (isolated)
**Routes:** `/api` (landing), `/signup`, `/login`, `/console/funnel`, `/console/instrumentation`
**Owner:** Product · **Last updated:** 2026-09-08

> Reverse-engineered from the shipped prototype. Later phases (M2–M8) are specced in §10.

## 1. Context & Problem
Zinbit had a polished marketing landing and a deep console, but no **funnel** connecting them: no way to convert anonymous traffic, no instrumentation of the top of funnel, and no operator view of where accounts sit across their lifecycle. This program builds the full PLG funnel as a coherent lens over real product state — one stage model, one event taxonomy — so marketing, in-product nudges, and revenue ops can't disagree.

## 2. Goals & Non-Goals
**Goals (M0 + M1)**
- A **funnel SSOT** (`lib/funnel.ts`) — the 8-phase / 24-stage model (C0-a…C7-b) with deterministic predicates (trial phase, conversion window, lead class, wallet burn) driving every surface.
- An **operator funnel board** (`/console/funnel`) showing cohort distribution, the account's live position, and lead classification.
- **Phase 0 TOFU conversion:** a landing catalogue over **all** enrichment endpoints and a **visual-only mock sandbox** whose "Fire" serves *no data* pre-auth and raises the sign-up gate (the primary conversion CTA).
- **Intent + dwell pop-ups**, tailored per signal, capped so they never nag.
- **Day-one instrumentation**: an operator view of the analytics sinks (Clarity/GA/Mixpanel) + **RB2B de-anonymization** feed, with **EU/India consent gating**.

**Non-Goals / deferred** — the real trial-risk + OTP logic (needs "Section B"; M2), trial provisioning/activation/consumption (M3–M4), conversion/lead-ops/wallet-health/dunning (M5–M7), and real third-party pixels (sinks are first-party representations, deterministic and demo-safe). Not merged to `main`/deployed until M8.

## 3. Users & Personas
- **Anonymous visitor (TOFU):** explores the catalogue + sandbox; converts at the gate.
- **Developer (land):** the sign-up gate promises a real call in <10 min post-signup.
- **Growth/CSM operator (expand):** reads `/console/funnel` (pipeline) and `/console/instrumentation` (signal capture + de-anon).
- **RBAC:** `/console/funnel` and `/console/instrumentation` are `admin | billing`.

## 4. Differentiation
The funnel is a **lens over real state**, not a parallel mock: the landing price, the funnel board, and (later) billing all read the same SSOT + real catalog (`src/data/endpoints.ts`). The mock sandbox is a deliberate conversion device — **no data pre-auth** prevents farming and makes the sandbox itself the CTA. Instrumentation is modeled as an operator cockpit (sink routing + de-anon + consent), which most products never expose.

## 5. Data Model & Logic
- **`lib/funnel.ts`** — `FUNNEL_PHASES` (8), `FUNNEL_STAGES` (24, C0-a…C7-b), pure predicates `trialPhase`, `conversionWindowOpen`, `walletBurnBucket`, `classifyLead`, `currentStage`, a provisional `riskScore` **stub** (pending Section B), and `generateCohort` (internally-coherent: stage + lead derived from one input; funnel-narrowing). Deterministic (FNV, injected `now`).
- **`lib/landing-catalog.ts`** — the full customer-facing enrichment catalogue (48 endpoints) derived from `endpoints.ts`, categorized People/Company/Identity&Data, with request schema + per-call price + curated sample responses where available.
- **`lib/instrumentation.ts`** — the four day-one sinks, `routeEvent()` (event→sink), and a deterministic de-anon visitor feed (US identified; EU/India consent-gated).
- **`lib/consent.ts`** — GDPR/DPDP consent state (opt-out model); `marketingAllowed()` gates pop-ups + de-anon.

## 6. Surfaces / Integration
- **`/api` landing:** `ApiSandboxSection` (catalogue + fire→gate), `IntentPopups` (dwell/exit/premium/pricing), `ConsentBanner`; `lp_viewed` on mount.
- **`/console/funnel`:** cohort funnel board (phases + counts + click-to-inspect), the account's live stage, lead-class distribution.
- **`/console/instrumentation`:** sink cards, event-routing map, de-anon feed + KPIs.
- **`/signup`, `/login`:** `signup_page_viewed` / `login_page_viewed` (C0-b).
- Nav: "Funnel" + "Instrumentation" under Operations & Monitoring.

## 7. UI states
Console pages: loading skeletons, coherent empty/populated states, Framer Motion, console semantic tokens. Landing components: the marketing design system (`bg-ink`/`text-ink`/`bg-teal`/`font-display`), solid dark cards for gate/pop-up/consent contrast, dismissible, responsive. Light + dark.

## 8. Telemetry
`funnel_viewed/stage_inspected/phase_filtered`, `lp_viewed`, `catalogue_api_opened`, `sandbox_fired_gated`, `signup_gate_shown`, `dwell_popup_shown`, `exit_intent_popup_shown`, `intent_popup_premium_shown/pricing_shown/cta_clicked/dismissed`, `instrumentation_viewed`, `deanon_visitor_inspected`, `consent_banner_shown/granted/rejected`, `signup_page_viewed`, `login_page_viewed`.

## 9. Verification
`tsc` 0 · `lint` 0 · **jest** green (funnel SSOT 19 cases incl. internal-coherence; instrumentation 8 cases). Live-verified in the prototype (Playwright, 0 console errors): funnel board, catalogue "all 48 endpoints", fire→gate, premium/exit pop-ups, consent banner, instrumentation + de-anon feed. Coherence fixes made from the visible checks (stage/lead mismatch, inverted funnel, gate-card contrast).

## 10. Deferred — the rest of the program
- **M2 (Phase 1):** onboarding role/use-case + PM auto-key; "Avail trial" → **risk gate** (needs **Section B**) → instant credits or **OTP** (SMS→WhatsApp→call).
- **M3–M4 (Phase 2–3):** trial provisioning (Public-APIs-only, free-before-paid), first key, first-fire <10min, 10/25/50/75/100% consumption milestones.
- **M5 (Phase 4–5):** conversion window, lead classification (Dead/Funnel-Driven/Hot), win-back — the CSM cockpit.
- **M6–M7 (Phase 6–7):** wallet-health burn buckets + auto-reload; re-up + dunning (48h retry → revocation warning).
- **M8:** merge to `main` (reconcile telemetry/roadmap/changelog/nav with concurrent sessions; consume session 66's `growth-kpis` where it fits), coherence + ship-check, deploy.

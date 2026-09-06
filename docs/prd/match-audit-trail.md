# PRD: Match Audit Trail

> A tamper-evident decision ledger: the `/console/match-audit` console, assembled by `lib/match-audit.ts` from real decision records with a SHA-256 hash chain.

**Status:** Built (prototype is the spec) · **Roadmap:** F-038 (Next → shipped) · **Page:** `/console/match-audit` · **Source:** `lib/match-audit.ts`
**Owner:** Product · **Last updated:** 2026-09-06

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Enterprises resolving identities need to answer two questions under audit: *why is this record resolved the way it is?* and *can I prove the log wasn't altered?* A plain activity list answers neither well — it doesn't capture the rules and sources behind each decision, and it can be edited without trace. Match audit trail records the sources and rules behind every resolved record and makes the ledger cryptographically verifiable.

## 2. Goals & Non-Goals
**Goals**
- A chronological ledger of every match decision — coverage lookups and manual merge/unmerge — with verdict, confidence, the **rules applied**, the **sources consulted**, and the actor.
- **Tamper-evidence:** each entry chains the previous entry's hash, so any edit/insert/delete is detectable; the console verifies the whole chain.
- Filter by verdict and timeframe; expand any entry for its full evidence; export the trail as JSON.
- Derive from existing state — **no new store slice**.

**Non-Goals (this phase)** — a signed/notarized external anchor (the chain is local); server-side immutable storage (the trail is derived per session from `apiLogs` + `entityMerges`); per-field diff of a resolved record over time; a `/v1` audit export endpoint (deferred); retention policy configuration.

## 3. Users & Personas
- **Compliance / security (expand):** verifies the ledger's integrity and exports it for an audit.
- **Data engineer (land):** debugs *why* a specific lookup matched or missed — the rules and sources are on the entry.
- **Ops reviewer:** sees manual merge/unmerge decisions inline with automated ones.
- **RBAC:** `admin | developer | billing` view (read-only ledger; nothing to mutate).

## 4. Differentiation
The differentiated move is **verifiability**: not just "here's the log" but "here's the log, and here's cryptographic proof it wasn't altered." Each entry's SHA-256 chains the prior entry — the same primitive behind Hashed-email lookups (F-021) and the Zinbit ID (F-028) — so the ledger is tamper-evident, and every entry carries the rules and sources behind the decision, not just a bare action string. It caps the identity stack (fuzzy → dedup → ID → merge → thresholds) with the accountability layer.

## 5. Data Model & Logic
Single source of truth: **`lib/match-audit.ts`**.
- `buildMatchAuditTrail(logs, merges, opts)` merges two real decision sources into one time-ordered trail: coverage lookups (`apiLogs`, classified + verdicted by the insight-engine's `explainMatch`, with sources pulled from the response provenance) and manual merge/unmerge decisions (`entityMerges`, F-033, with the survivor name resolved via the entity map). Each entry gets a `seq`, a verdict, rules, sources, an actor, and a `hash` that **chains the previous entry's hash** via `sha256Hex` — **no `Math.random`, no wall-clock in the hash**.
- `verifyAuditIntegrity(entries)` re-derives the chain (order-independent — sorts by `seq`) and returns `{ valid, brokenAt, entries }`.
- Invariants (unit-tested, `src/lib/__tests__/matchAudit.test.ts`, 5 tests): assembles lookups + merges newest-first with a contiguous `seq`; deterministic; produces a valid, verifiable chain; **detects tampering** (a mutated entry reports the exact broken `seq`); emits a `reverted` entry for an unmerge.

## 6. API & Gateway
None this phase — the trail is derived client-side from state already present. A `/v1/audit/match` export endpoint is a natural follow-up (deferred).

## 7. UI
- **`/console/match-audit`** (`app/console/match-audit/page.tsx`, client component, `RoleGuard`):
  - **KPIs:** decisions, matched, missed, and a **Chain integrity** tile (Verified / Broken at #n).
  - **Integrity banner:** explains the hash chain and offers a one-click **Export** (copy the trail as JSON).
  - **Filters:** a timeframe control (24h/7d/30d/All) and a verdict control (All/Matched/Missed/Manual).
  - **Ledger:** one row per decision — seq, type icon, subject, verdict badge, endpoint, identifier, actor, relative time, confidence — expandable to show the rules applied, the sources consulted (as chips), and the entry's `prev`/`this` hash link.
  - Cross-link to raw request Logs and the Studio.
- Semantic tokens only; Framer Motion on row expansion. **States:** loading skeleton, a true empty state (no decisions in window), and the populated ledger — no layout shift.
- **Nav:** a role-filtered "Match Audit Trail" entry (ScrollText icon) beside Match Rate / Match Thresholds.

## 8. Telemetry
Typed events (`lib/telemetry.ts`): `match_audit_viewed` on mount, `match_audit_exported` (`{ entries }`) on export — so audit-review engagement lands in the events slice / Growth dashboard.

## 9. Verification
`tsc` clean · `lint` at baseline (0) · `jest` green (5 new tests, incl. tamper detection) · isolated `NEXT_DIST_DIR=.next-verify next build` green (`/console/match-audit` route emitted). Browser walkthrough: run lookups → they appear in the trail; the integrity tile reads Verified; export copies the JSON; filters narrow the ledger.

## 10. Deferred
A `/v1/audit/match` export endpoint; a signed/notarized external anchor for the chain; server-side immutable retention; per-field record-history diffs; retention-policy config; org-scoped audit exports (F-381).

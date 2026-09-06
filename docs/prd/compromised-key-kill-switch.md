# PRD: Compromised-Key Kill Switch

> Instantly revoke a leaked or compromised API key everywhere — the gateway blocks it across REST, GraphQL, and gRPC in the same moment, returning 401 KEY_REVOKED on the next call.

**Status:** Built (prototype is the spec) · **Roadmap:** F-119 · **Routes:** `GET/POST/DELETE /v1/keys/revoke`, enforcement on `/v1/*` + `/api/graphql` + `/api/grpc`, `/console/kill-switch`, `/console/keys`
**Owner:** Product · **Last updated:** 2026-09-07

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
When a key leaks — pushed to git, printed in logs, shipped in a client bundle — every second it stays live is exposure. "Revoke" must mean *dead now, everywhere*. Previously, revoking a key in the console only changed a status badge; the gateway kept serving it (auth is format-only + lazily provisions any well-formed key), so a compromised key still worked. The kill switch closes that seam: a killed key is rejected with `401 KEY_REVOKED` on the REST pipeline, the GraphQL gateway, and the gRPC channel — all from one shared block registry — the instant it's killed. This is core incident-response hygiene for an enterprise API.

## 2. Goals & Non-Goals
**Goals**
- **Real, instant revocation:** a killed key is blocked before auth/billing/scopes on every surface (`/v1/*`, `/api/graphql`, `/api/grpc`).
- **Everywhere at once:** one block registry shared by all three gateways — no per-surface drift.
- **Reasoned + audited:** kill with a reason (compromised / leaked / rotated / manual), by whom, when; recent kill/restore events retained.
- **Closed seam:** revoking or simulating a leak on a key in the console propagates the block to the gateway automatically.
- **Provable + reversible:** a live leak drill (200 → kill → 401) and a restore for false alarms.
- Backwards-compatible: unblocked keys behave exactly as before.

**Non-Goals (this phase)** — automatic leak *detection* (scanning git/logs) — the switch is operator-triggered (+ a simulate-leak drill); org-wide "kill all keys" panic button; time-boxed auto-expiry (that's F-117); notifying the key owner; distributed/cross-isolate propagation (per-isolate registry, like the other gateway modules); a store schema change (uses the existing `updateKey` + `MockKey.status`).

## 3. Users & Personas
- **Security / on-call (land):** sees a leak alert, hits **Kill**, and the key is dead everywhere in one click — the blocked-attempts counter confirms it.
- **Developer (expand):** rolls a key and kills the old one; the drill proves the old key can't be used.
- **Auditor:** the kill/restore event log documents who revoked what, when, and why.
- **RBAC:** the console is `admin | developer`; **killing/restoring is admin-only** (destructive). The `/v1/keys/revoke` registry is a free meta endpoint (keyless-billed), exempt from the block so operators can manage it.

## 4. Differentiation
Table-stakes security done with real depth, tied to **win #6 (enterprise-grade security)**. The differentiator is **"everywhere, provably, instantly"**: one shared registry enforced across all three protocols (most tools revoke only the REST key), plus a **live drill** that flips a real call 200→401 so anyone can verify the switch actually works — turning a checkbox into a demonstrable control.

## 5. Data Model & Logic
Single source of truth: **`src/lib/gateway/keyBlock.ts`** (in-memory, per-isolate, seeded; no `Math.random`).
- `blockKey(key, reason, by)` / `unblockKey(key, by)` / `isKeyBlocked(key)` (counts a blocked attempt) / `getBlock(key)` (no side effects) / `getKillSwitchSnapshot()` (masked keys + counters + recent events). `REVOCATION_REASONS` catalog. The demo `sk_test_compromised` is seeded blocked.

## 6. State / Integration
- **Enforcement (everywhere):** `app/api/v1/[...route]/route.ts` (gate #0, before DDoS/auth/billing, exempting `/v1/keys/revoke`), `app/api/graphql/route.ts` and `app/api/grpc/route.ts` (right after their auth check) → `401 KEY_REVOKED` + `X-Key-Revoked` header.
- **Sync endpoint:** `GET /v1/keys/revoke` (snapshot), `POST` (kill `{key, reason, by}`), `DELETE` (restore) — free meta path.
- **Console sync:** `app/console/keys/page.tsx` calls the endpoint on **revoke** (`manual`) and **simulate-leak** (`leaked`), so a killed key is blocked at the gateway, not just badged.
- **`/console/kill-switch`:** KPIs (live / killed keys, blocked attempts), a **leak drill** (live 200→401), per-key **Kill** (reason) / **Restore** (admin), and the recent kill-event log. No store slice (uses `updateKey` + `MockKey.status`).

## 7. UI states
Composed from `components/ui` (PageHeader, KpiTile, GlassCard, Button, EmptyState, Skeleton, StatusBadge). **Loading** — skeletons. **Ready** — drill + key list + event log. **Error** — registry load failed + retry. **Drill result** — animated before→after with a KEY_REVOKED badge. Destructive Kill is admin-gated + toned to error; Restore is secondary. Semantic tokens; Framer Motion; light + dark.

## 8. Telemetry
Via `lib/telemetry.ts`: `kill_switch_viewed`, `key_killed` (reason, environment), `key_restored`, `leak_drill_run` (before, after). Emitted from the console.

## 9. Verification
`tsc` clean · lint 0/0 · `jest` green (**10-case** suite: block/unblock/enforce, seeded compromised key, re-kill refresh, restore, empty-key guard, attempt counting, side-effect-free getBlock, masked snapshot + events, reasons catalog) · isolated `next build` green (`/console/kill-switch` present) · Playwright smoke (`e2e/kill-switch.spec.ts`) · live drill — a key returns 200, is killed, and the same key returns 401 KEY_REVOKED on `/v1/companies/enrich`, `/api/graphql`, and `/api/grpc`. 0 console errors.

## 10. Deferred
Automatic leak detection (secret scanning); an org-wide panic "kill all"; owner notification on kill; time-boxed auto-expiry (F-117); distributed propagation across isolates/regions; a kill-reason → follow-up-action workflow (auto-issue a replacement key).

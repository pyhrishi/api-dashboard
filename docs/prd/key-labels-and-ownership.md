# PRD: Key Labels & Ownership

> Assign an accountable owner and free-form labels to every API key — so a security review can answer "whose key is this and what is it for?" without guessing, and unowned keys stop being a governance blind spot.

**Status:** Built (prototype is the spec) · **Roadmap:** F-124 (Now → shipped) · **Console:** `/console/key-ownership` · **Source:** `lib/key-ownership.ts`
**Owner:** Product · **Last updated:** 2026-09-07

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Keys have a name, but a name doesn't say who's accountable for a key or what it's for. When a key needs rotating — or a security review asks "why does this live key exist?" — nobody can answer from the console. Growing teams accumulate keys whose purpose and owner are lost. Key Labels & Ownership adds two pieces of governance metadata — an accountable **owner** (a team member) and free-form **labels** (team / environment / purpose) — and surfaces the keys that have neither.

## 2. Goals & Non-Goals
**Goals**
- Assign an accountable owner (from the team roster) to any key, and clear it.
- Tag keys with normalized labels; filter the key list by owner and by label.
- Surface unowned keys as a governance gap, with a path to fix.

**Non-Goals (this phase)** — enforcing ownership at key creation; per-owner notification/rotation workflows; free-text key descriptions beyond labels; transferring ownership in bulk; ownership on non-key resources.

## 3. Users & Personas
- **Team lead / security (expand):** the enterprise control — see who owns what, tag by team, chase down unowned keys.
- **Developers (land):** label your keys by purpose so the list is legible.
- **RBAC:** page visible to `admin | developer | billing`; **only admins** assign owners or edit labels (gated in UI + store).
- **Multi-tenant:** operates on the tenant's `activeKeys` + `teamMembers` (both tenant-scoped).

## 4. Differentiation
Table-stakes governance for an operator-grade console (Win #5), shipped clean — most enrichment APIs give you a key list and nothing else. The coherence detail: labels and owner are optional fields on the existing key model (`MockKey.labels?` / `ownerId?` — non-breaking, so the Keys page and every other key surface keep working), the owner is a real `TeamMember` from the roster (a stale owner id resolves to "unassigned", never a dangling name), and every change is audit-logged like the rest of key management.

## 5. Data Model & Logic
- **State (Zustand):** `MockKey` gains optional `labels?: string[]` + `ownerId?: string` (persisted with `activeKeys`). Actions `setKeyLabels(id, labels)` (normalizes, dedupes, caps at 8) and `assignKeyOwner(id, ownerId|null)` (validates the member exists) — both **admin-only**, audit-logged (`key.labelled` / `key.owner_assigned`).
- **`lib/key-ownership.ts`** (SSOT) — `resolveOwner(key, members)` (null when unassigned or stale), `normalizeLabel` (lowercased, hyphenated, ≤24 chars), `allLabels`, `computeOwnership`, `summarizeOwnership` (owned/unowned/labelled + per-owner breakdown), `filterKeys({ownerId, label})`, `unownedKeys`. Pure, deterministic.
- Invariants (unit-tested, `src/lib/__tests__/keyOwnership.test.ts`, 6 tests): owner resolution + stale-id null; label normalization + cap; distinct labels + filter (incl. `unowned`); summary roll-up + busiest owner + unowned; store label normalize/dedupe/cap + owner assign/clear + unknown-owner throw + non-admin block.

## 6. API & Gateway
No gateway change — labels and ownership are console governance metadata over the existing key model.

## 7. UI
`/console/key-ownership` — composed from `components/ui`, semantic tokens only.
- **4 KpiTiles** (keys, owned, unowned, labels in use) + an **unowned-keys warning banner** with a one-click "show unowned" filter.
- **Filters:** an owner `Select` (All / Unowned / each team member) + label chips.
- **Per-key rows:** name, env badge, an "Unowned" badge when applicable; **editable label chips** (add via input+Enter, remove via ✕, admin-only) and an **owner `Select`** (Unassigned / team members). Non-admins see a read-only owner + labels.
- **States:** loading skeleton; a no-keys empty state (→ create a key); a filtered-to-nothing empty state; cross-links to Keys. Framer Motion on row entrances.

## 8. Telemetry
`key_ownership_viewed` (view), `key_owner_assigned {assigned}` (assign/clear), `key_labeled {count}` (label change) — via `lib/telemetry.ts`. **PLG hook:** assigning owners is an account-maturity/expansion signal.

## 9. Verification
`tsc` clean · `lint` at baseline · `jest` green (6 new tests) · `next build` green (new `/console/key-ownership`) · Playwright smoke (`e2e/key-ownership.spec.ts`) · assign an owner and it persists + shows on the key; unowned count drops.

## 10. Deferred
Ownership enforced at key creation; per-owner rotation reminders; bulk owner reassignment; free-text descriptions; ownership on webhooks/other resources; a saved label taxonomy.

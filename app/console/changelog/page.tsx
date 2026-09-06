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
    version: 'v4.50', date: 'September 2026', headline: 'Request replay & debug echo',
    changes: [
      { kind: 'feature', text: 'Debug echo — add X-Debug-Echo: true to any request and the gateway does NOT execute it; instead it returns exactly how it read the request: the parsed params, the redacted headers, which endpoint matched, the resolved region and node, your key type and environment, the privacy framework that would apply, what the call would cost, and which edge policies fired. A dry run for integration debugging — see the gateway’s interpretation before spending a credit.' },
      { kind: 'feature', text: 'Request Inspector (/console/debug) — compose a request and Inspect it (echo) or Run it live, then replay any recent request straight from your logs. Replays re-fire against the live gateway and diff the new status against the original, so you can reproduce a bug for real.' },
      { kind: 'improvement', text: 'Replay is now real everywhere: the Logs page’s “Replay” button used to just re-log the original response — it now genuinely re-fires the request against the gateway and records the actual result (removing a placeholder and its Math.random). Debug echo is single-sourced in src/lib/gateway/debugEcho.ts, redacts secrets, and is unit-tested.' },
    ],
  },
  {
    version: 'v4.49', date: 'September 2026', headline: 'Webhook-backed async results',
    changes: [
      { kind: 'feature', text: 'Webhook-backed async results — stop polling. Submit a long-running job (POST /v1/jobs) with a callback_url and Zinbit pushes the finished result to your endpoint as a signed webhook POST when it completes. Each delivery carries an X-Zinbit-Signature (HMAC-SHA256) you verify against your endpoint secret, so you can trust the payload came from us.' },
      { kind: 'feature', text: 'Delivery is operator-grade: a non-2xx response is retried with exponential backoff (0s · 30s · 2m · 10m), and a delivery that exhausts its retries lands in a dead-letter queue where you can replay it with one click. A new Result Delivery console (/console/webhook-deliveries) shows every delivery, its full attempt timeline, the signed payload, and a live success rate — submit a test job right from the page and watch it deliver.' },
      { kind: 'feature', text: 'A free GET /v1/deliveries reads the registry (delivered / retrying / dead-letter counts + recent attempts) and POST /v1/deliveries/{id}/replay re-drives a failed one. Deterministic and unit-tested.' },
    ],
  },
  {
    version: 'v4.48', date: 'September 2026', headline: 'Partial-result responses',
    changes: [
      { kind: 'feature', text: 'Partial-result responses — when one of the upstreams behind an enrichment is degraded, you now get back what resolved instead of an all-or-nothing failure. If, say, the carrier HLR that supplies direct phones has an open circuit, a person lookup still returns the name, title, company, location, and socials — just without the phone — as HTTP 206 with a `partial` metadata block naming exactly which fields were withheld and why (which upstream, X-Partial-Result / X-Partial-Missing headers).' },
      { kind: 'feature', text: 'You’re billed only for what resolved — a partial response is discounted in proportion to the sources that answered (X-Partial-Completeness), so a degraded upstream never means paying full price for a half-filled record. The Enrichment Studio shows it inline: a “Partial result — N% complete” banner lists each unavailable field and the degraded provider, linking straight to the Circuit Breakers console.' },
      { kind: 'improvement', text: 'Built on the per-upstream circuit breakers (F-066): the same upstream registry that isolates a failing provider now also decides which fields can still be served. A required (primary) upstream being down still returns 503; only optional secondary sources degrade to partial. Single-sourced in src/lib/gateway/partialResult.ts, deterministic, and unit-tested.' },
    ],
  },
  {
    version: 'v4.47', date: 'September 2026', headline: 'Circuit breaker per upstream',
    changes: [
      { kind: 'feature', text: 'Circuit breaker per upstream — every endpoint depends on a real data provider (SMTP verification, the MCA registry, a carrier HLR, the professional/company graphs, a funding database), and each now has its own circuit breaker. When one upstream starts failing, only its breaker trips: calls that depend on it return 503 with a Retry-After and an X-Upstream header, while every other endpoint keeps serving. One flaky provider no longer looks like — or causes — a total outage.' },
      { kind: 'feature', text: 'A tripped breaker recovers on its own (OPEN → HALF_OPEN probe after a cooldown → CLOSED on the next success). A new Circuit Breakers console (/console/circuits) shows each upstream’s live state, failure rate, trip count, cooldown countdown, and the endpoints it powers — with admin-only Force-open (drain) and Reset controls for game-day drills, backed by GET/POST /v1/circuits.' },
      { kind: 'improvement', text: 'The upstreams are the same named providers behind source attribution (F-043), so reliability and provenance tell one story. Single-sourced in src/lib/gateway/upstreams.ts + circuitBreaker.ts, deterministic, and unit-tested.' },
    ],
  },
  {
    version: 'v4.46', date: 'September 2026', headline: 'Field selection / sparse responses',
    changes: [
      { kind: 'feature', text: 'Field selection — ask for only the attributes you need. Add ?fields=phone,carrier (dotted paths like company.domain work too) to any enrichment call and the gateway returns just those fields. A typical response drops from ~15 fields to 3 — often a 90% smaller payload — with X-Fields-Selected, X-Fields-Omitted, X-Sparse-Response headers and a sparse{} metadata block reporting bytes before/after.' },
      { kind: 'feature', text: 'Sparse requests cost less — pay for what you pull. A request that names fewer than a full record’s worth of fields is discounted (up to 50% off, surfaced as X-Sparse-Discount-Pct and in the billing metadata), so trimming a response trims the bill. And because the gateway projects the payload after masking, you also pull less PII: field selection is data-minimization by default.' },
      { kind: 'feature', text: 'A new Field Selection playground (/console/field-selection) makes it tangible: pick an endpoint, analyze the full record, toggle fields off, and watch the payload size and credit cost shrink live against the real gateway — with a copyable request URL. Single-sourced in src/lib/gateway/fieldSelection.ts, deterministic, and unit-tested.' },
    ],
  },
  {
    version: 'v4.45', date: 'September 2026', headline: 'Idempotency keys',
    changes: [
      { kind: 'feature', text: 'Idempotency keys — retries are now safe. Send an `Idempotency-Key: <uuid>` header on a pipeline write (e.g. batch enrichment) and the first call runs normally while its response is stored for 24 hours; any retry with the same key replays that exact response, not re-processed and not re-charged (look for X-Idempotency-Replayed: true). A dropped connection or a nervous client retry can no longer double-charge — retrying a 500-domain batch replays the original instead of billing another 500 credits.' },
      { kind: 'feature', text: 'Reusing a key with a different request body now returns 409 IDEMPOTENCY_KEY_REUSED instead of silently replaying stale data — so an idempotency key can never mask a genuinely different request. A new Idempotency console (/console/idempotency) shows active keys, replays served, the credits those replays saved, and a live TTL countdown per key.' },
      { kind: 'improvement', text: 'A free GET /v1/idempotency reads the registry (active keys, replays, credits saved). Idempotency is single-sourced in src/lib/gateway/idempotency.ts and consulted before billing, so a replay is genuinely free. Deterministic and unit-tested.' },
    ],
  },
  {
    version: 'v4.44', date: 'September 2026', headline: 'Encoding & language normalization',
    changes: [
      { kind: 'feature', text: 'Encoding & language normalization — a new GET /v1/text/normalize (and a "Normalize text" Studio tool) enforces UTF-8 and cleans up messy real-world text. It repairs mojibake (JosÃ© → José, itâ€™s → it’s), composes to Unicode NFC, strips zero-width and control characters, and collapses whitespace — returning one canonical UTF-8 form plus the exact list of transformations it applied.' },
      { kind: 'feature', text: 'It also detects the script(s) present (Latin, Cyrillic, Greek, Han, Hiragana/Katakana, Hangul, Arabic, Hebrew, Devanagari, Thai) with a language hint, and returns an ASCII form — transliterated for Cyrillic/Greek (Пётр → Petr) or diacritic-folded for Latin (Müller → Muller) — so non-Latin and accented records become matchable. Deterministic: the same input always normalizes identically.' },
      { kind: 'improvement', text: 'Name canonicalization now runs this encoding repair upstream, so a mojibaked or decomposed name canonicalizes exactly like its clean form — matching and de-duplication no longer diverge over encoding. Single-sourced in lib/text-normalizer.ts.' },
    ],
  },
  {
    version: 'v4.43', date: 'September 2026', headline: 'Quality SLA dashboard',
    changes: [
      { kind: 'feature', text: 'Quality SLA dashboard — a new /console/quality-sla page puts every data-quality and platform metric against the target we commit to: match rate, field accuracy, coverage, data freshness, API uptime, and p95 latency. Each shows current vs target with a met / at-risk / breached status, a 30-day trend, and a plain-English description — plus an overall SLA-compliance figure and a breach log (open breaches first, then resolved history). This is the enterprise trust surface: “are you hitting the numbers you promised?”, answered honestly.' },
      { kind: 'improvement', text: 'The scorecard is single-sourced, so it can never contradict the rest of the console: match rate and coverage come from the regional coverage model and uptime from the platform health model. A metric that dips below target opens a breach and closes when it recovers. Deterministic (no wall-clock, no random), unit-tested, and read-only for the whole workspace.' },
    ],
  },
  {
    version: 'v4.42', date: 'September 2026', headline: 'Suppression list honoring',
    changes: [
      { kind: 'feature', text: 'Suppression list honoring — a customer do-not-contact list is now enforced at the gateway. Add an email or domain to your suppression list (POST /v1/suppression) and any enrichment lookup on that address — or any mailbox on a suppressed domain — returns “suppressed, details withheld” instead of the contact, at zero credits. The check runs before billing, so you can’t accidentally resolve, or be charged for, a contact you’re obligated not to reach: unsubscribes, GDPR erasures, competitor blocks, complaints.' },
      { kind: 'feature', text: 'Manage the registry programmatically: POST /v1/suppression adds an identifier (with a reason — unsubscribed / do_not_contact / gdpr_erasure / competitor / complaint / manual), a free GET /v1/suppression reads it (totals, a breakdown by kind and reason, recent additions), and DELETE /v1/suppression removes one so lookups resolve normally again. Suppressing a domain suppresses every mailbox on it; an exact-address match wins over a domain match. All keyless-billed (zero credits).' },
      { kind: 'improvement', text: 'A suppressed response carries an X-Suppressed header and X-Credits-Cost: 0, so a downstream pipeline can distinguish “withheld for compliance” from “not found”. Deterministic and unit-tested.' },
    ],
  },
  {
    version: 'v4.41', date: 'September 2026', headline: 'User-reported corrections',
    changes: [
      { kind: 'feature', text: 'User-reported corrections — spot a wrong value on any enrichment result and flag it right there in the Studio: hover a field, hit the flag, and tell us what it should be. Corrections are governed, not silent — each one gets an AI triage verdict (likely-valid / needs-review / suspect, scored on format validity, how material the change is, how specific the reason is, and reporter trust) and lands pending in a new Corrections review queue.' },
      { kind: 'feature', text: 'The loop closes: once a reviewer accepts a correction, that field comes back corrected on future lookups — overlaid on the result, badged “corrected”, and re-attributed to “Customer Correction” (a first-party source) in the Sources panel. Reviewers can accept, reject, or send a decision back to pending; every review is written to the audit log. Admin + developer only; billing can view but not review.' },
      { kind: 'feature', text: 'Report corrections programmatically too: a new POST /v1/feedback/correction lets your pipeline flag a wrong field (target, field, new_value, plus an optional reason that triages higher), and a free GET /v1/feedback/correction reads the registry — totals, pending count, and a breakdown by triage verdict. Both are keyless-billed (zero credits).' },
    ],
  },
  {
    version: 'v4.40', date: 'September 2026', headline: 'Catch-all domain detection',
    changes: [
      { kind: 'feature', text: 'Catch-all domain detection — a new GET /v1/email/catch-all tells you whether a domain is catch-all (accept-all): one that accepts mail for any local part, so an SMTP probe can never confirm a specific mailbox exists. It returns a decisive status (catch-all / not catch-all / unknown), a confidence, the MX provider, the random-mailbox probe result (RCPT TO a non-existent address → accepted means catch-all), per-signal evidence, and guidance on how to enrich safely against the domain. Shipped as a Studio preset with a status + evidence panel.' },
      { kind: 'improvement', text: 'Catch-all is now single-sourced: Verify Email Deliverability and this detector share the exact same catch-all decision (lib/catch-all-detector.ts), so a domain flagged catch-all here is flagged catch-all there — they can never disagree. For a catch-all domain the guidance points to pattern confidence and the bounce feedback loop; for a non-catch-all domain it confirms per-address verification is reliable. Deterministic.' },
    ],
  },
  {
    version: 'v4.39', date: 'September 2026', headline: 'Bounce feedback loop',
    changes: [
      { kind: 'feature', text: 'Bounce feedback loop — close the deliverability loop by feeding your bounces back to Zinbit. POST /v1/feedback/bounce reports an address that hard-bounced or was marked spam, and it\'s suppressed immediately (soft bounces suppress once they repeat) — so a subsequent Verify Email Deliverability call returns undeliverable with a “reported bounce” reason at the top of its checks. What you observe when you send now improves what Zinbit tells you next time.' },
      { kind: 'feature', text: 'A free GET /v1/feedback/bounce reports the registry — suppressed addresses, total reports, a breakdown by bounce type (hard / soft / complaint), and the most recent reports. Both endpoints are keyless-billed (zero credits).' },
      { kind: 'improvement', text: 'The loop is real and wired into the live gateway pipeline: a reported bounce genuinely changes the deliverability result for that address on the very next check. Suppression is deterministic and unit-tested.' },
    ],
  },
  {
    version: 'v4.38', date: 'September 2026', headline: 'Automated re-verification',
    changes: [
      { kind: 'feature', text: 'Automated re-verification — a new Re-verification console (/console/re-verification) keeps enriched data fresh by re-checking high-value fields (email, direct phone, employment) on a rolling, per-field-type schedule. Set the cadence for each field, see which records are past it, and run re-verification — every field that decayed (a bounced mailbox, a disconnected phone, a job change) or changed value surfaces with a plain-English explanation and the new value, so records self-heal instead of quietly going stale.' },
      { kind: 'improvement', text: 'Each run reports unchanged / updated / decayed counts with the actionable outcomes first, and keeps a run history. Deterministic (the same rolling cycle always produces the same outcomes) and RBAC-gated — the schedule and run action are read-only for the billing role. Builds on the field-level freshness model.' },
    ],
  },
  {
    version: 'v4.37', date: 'September 2026', headline: 'Source attribution',
    changes: [
      { kind: 'feature', text: 'Source attribution — every enrichment result now cites which data provider supplied each field. The result card gains a Sources panel that groups the fields by the named provider behind them (SMTP Verification, WHOIS Registry, Corporate Directory, Carrier HLR, Professional Graph, MCA Registry, and more), each with its category (first-party graph / government registry / partner feed / derived inference), a reliability rating, the license or lawful basis the data is used under, and the exact fields it produced — so buyers and compliance can see the sourcing behind every value.' },
      { kind: 'improvement', text: 'Attribution is a layer over the existing per-field provenance, not a separate dataset — so it can never disagree with the confidence and provenance already shown. It applies across every field-carrying lookup (person, company, phone, socials, funding, and more), and is deterministic: the same result always attributes the same providers.' },
    ],
  },
  {
    version: 'v4.36', date: 'September 2026', headline: 'Match audit trail',
    changes: [
      { kind: 'feature', text: 'Match audit trail — a new Match Audit Trail console (/console/match-audit) is a tamper-evident ledger of every match decision: each entry records the subject, the verdict (matched / missed / merged / reverted), the confidence, the rules applied (which engine, keyed on which identifier), the data sources consulted, and the actor. It is assembled from real decision records — coverage lookups and manual merge/unmerge decisions — with filters by verdict and timeframe and an expandable evidence view.' },
      { kind: 'feature', text: 'Every entry chains the previous entry’s SHA-256 hash, so any edit, insertion, or deletion breaks the chain and is flagged — the console verifies the whole ledger end to end and shows a Chain integrity status, with a one-click export of the trail as JSON. Answers “why is this record resolved this way, and can I prove the log wasn’t altered?” for compliance and debugging.' },
      { kind: 'improvement', text: 'The trail derives from existing state (no duplicated store) and reuses the same SHA-256 primitive as Hashed-email lookups and the Zinbit ID. Deterministic — the same decisions always produce the same verifiable chain.' },
    ],
  },
  {
    version: 'v4.35', date: 'September 2026', headline: 'Negative-match caching',
    changes: [
      { kind: 'feature', text: 'Negative-match caching — the gateway now remembers coverage misses (a lookup that resolved to no match) and serves an identical repeat from cache at zero credits. The positive edge cache speeds up repeat hits, but billing runs before it, so a repeated miss used to cost a credit every time; negative-match caching consults a short-TTL miss cache before billing, so re-querying an identifier you already know isn\'t in the dataset is free. Responses carry an X-Negative-Cache header (HIT / STORE / MISS) and a cached hit reports X-Credits-Cost: 0.' },
      { kind: 'improvement', text: 'A new free GET /v1/cache/negative endpoint reports how much the cache has saved — active cached negatives, hits served, total credits saved, hit rate, and the top entries. Misses expire after a short TTL, so a lookup that starts resolving as the dataset grows is never blocked by a stale negative. Deterministic and unit-tested.' },
    ],
  },
  {
    version: 'v4.34', date: 'September 2026', headline: 'Match threshold tuning',
    changes: [
      { kind: 'feature', text: 'Match threshold tuning — a new Match Thresholds console (/console/thresholds) lets teams set the confidence floor for each matching use case (contact matching, company de-dup, lead routing). Drag one slider and watch a labeled sample of record pairs split into accepted and rejected in real time, with live precision, recall, and F1 — plus a suggested F1-maximizing floor and a per-pair breakdown showing exactly which decisions the floor gets right or wrong. Floors persist per use case and are RBAC-gated (billing role is read-only).' },
      { kind: 'improvement', text: 'The tuner scores its sample with the exact same Jaro-Winkler engine (and name canonicalization) that governs real Fuzzy Matching and Entity De-duplication — so the floor you tune here is the floor that applies in production, never a divergent preview. Deterministic: the same threshold always yields the same precision and recall.' },
    ],
  },
  {
    version: 'v4.33', date: 'September 2026', headline: 'Merge & unmerge controls',
    changes: [
      { kind: 'feature', text: 'Merge & unmerge controls — a new Identity Resolution console (/console/identity) puts a human in the loop over entity resolution. Suspected-duplicate records (the same person entered across Salesforce, HubSpot, CSV imports, and the API) surface as groups; pick the surviving record, add a reason, and merge them into one canonical entity — collapsing their Zinbit IDs into a single golden ID.' },
      { kind: 'feature', text: 'Every merge is reversible: the full merge history shows who merged what, when, and why, and any decision can be unmerged in one click to split the records back into separate entities with their original IDs restored. Both actions are written to the audit log.' },
      { kind: 'improvement', text: 'Deterministic and RBAC-aware — the merge center opens in the same believable state every time, and the billing role is read-only (merge and unmerge are gated). Merge decisions persist across reloads.' },
    ],
  },
  {
    version: 'v4.32', date: 'September 2026', headline: 'Name canonicalization',
    changes: [
      { kind: 'feature', text: 'Name canonicalization — normalize any spelling, casing, ordering, or accenting of a personal name into one canonical form. New GET /v1/names/canonicalize returns the canonical "First Last", an ASCII-folded form, a formal form (with prefix + suffix), the parsed components (prefix / first / middle / last / suffix), and a log of exactly what changed — reordering "Last, First", expanding nicknames (Bob → Robert), fixing typos (Jhon → John), folding accents (José → Jose), and casing surnames (McDonald, O\'Brien, van der Berg). Shipped as a Studio preset with a parsed-components panel.' },
      { kind: 'improvement', text: 'Name canonicalization is now one source of truth: Probabilistic Fuzzy Matching (and, through it, Entity De-duplication) resolve nicknames and typos through this same normalizer, so the three features can never disagree about a name\'s canonical form. Deterministic — the same name always canonicalizes the same way.' },
    ],
  },
  {
    version: 'v4.31', date: 'September 2026', headline: 'Persistent Zinbit ID',
    changes: [
      { kind: 'feature', text: 'Persistent Zinbit ID — every resolved entity now has a stable canonical ID (zid_p_… for people, zid_c_… for companies) that is the same no matter which identifier you look them up by and that survives an email change, because it is derived from who the entity is — a frozen normalization of name @ company domain — not from the query. New GET /v1/identity/zid resolves any email or domain to its Zinbit ID, entity type, first-seen date, and the aliases (email, LinkedIn, hashed email, phone) that all unify to it. Key your records on it to join and dedupe across sources.' },
      { kind: 'improvement', text: 'The Zinbit ID now appears on every person and company enrichment result, so the same stable ID is visible everywhere you resolve an entity. The hashed-email alias is generated with the same SHA-256 used by Hashed-email lookups, so a Zinbit ID and a hashed-email lookup agree on the same person. Deterministic and frozen — an ID never changes once assigned.' },
    ],
  },
  {
    version: 'v4.30', date: 'September 2026', headline: 'Entity de-duplication',
    changes: [
      { kind: 'feature', text: 'Entity de-duplication — collapse a messy list of records into golden records. New GET /v1/records/dedupe takes a ";"-separated list of "Name, Company" rows (typos, nicknames, and company-vs-domain variants welcome) and clusters near-duplicates into one golden record each — returning the merged members, every member\'s similarity to the golden, and a per-cluster merge confidence, plus a dedup summary (input, golden, duplicates, rate). Dedupe an import before you enrich, so you pay once per real entity.' },
      { kind: 'improvement', text: 'De-duplication reuses the exact same Jaro-Winkler similarity engine as Probabilistic Fuzzy Matching, so the two features can never disagree about whether two records are the same entity. Shipped as a Studio preset with a golden-records panel — each cluster shows the merged variants and its confidence. Deterministic; a single record (nothing to dedupe) returns a clean 400.' },
    ],
  },
  {
    version: 'v4.29', date: 'September 2026', headline: 'Probabilistic fuzzy matching',
    changes: [
      { kind: 'feature', text: 'Probabilistic fuzzy matching — resolve a messy name + company (typos, nicknames, spelling variants) to the people it most likely refers to. New GET /v1/match/fuzzy takes a "Name, Company" query and returns ranked candidates, each with a match probability and the per-field name and company similarity behind it (real Jaro-Winkler), a canonical interpretation of your query, and a decisive verdict (strong / likely / weak / no match). Shipped as a Studio preset with a ranked-candidate panel.' },
      { kind: 'improvement', text: 'It corrects as it matches — "Jhon Smith, Stipe" is interpreted as "John Smith" at Stripe, "Bob" expands to "Robert" — and stays honest: a name it cannot reconcile to a real company drops to a weak or no-match verdict instead of a false positive. Deterministic — the same query always scores the same.' },
    ],
  },
  {
    version: 'v4.28', date: 'September 2026', headline: 'Hashed-email (SHA-256) lookups',
    changes: [
      { kind: 'feature', text: 'Hashed-email (SHA-256) lookups — enrich against a SHA-256 hash of an email instead of the raw address, so raw PII never leaves your system. New GET /v1/identity/hashed takes the hex digest of the lowercased, trimmed email and, if it matches an opted-in record, returns the full resolved person — name, title, company, and contact — without ever receiving the plaintext. Built for GDPR-conscious and adtech match workflows.' },
      { kind: 'feature', text: 'The Enrichment Studio ships a “Hashed-email lookup” preset that proves the model end to end: you type an email, your browser hashes it locally with SHA-256, and only the digest is put on the wire and into the request log — the result card shows the hash it matched and confirms the plaintext was never sent.' },
      { kind: 'improvement', text: 'Matches resolve through the same identity graph as every other lookup, so a hashed match equals the plaintext result exactly; a hash outside the opted-in dataset returns an honest 404 and an invalid digest a clean 400. Deterministic — the client and server hash with the same implementation, so they always agree.' },
    ],
  },
  {
    version: 'v4.27', date: 'September 2026', headline: 'Streaming inline enrichment',
    changes: [
      { kind: 'feature', text: 'Streaming inline enrichment — enrich a list over a single low-latency connection that streams each row back the moment it resolves, instead of waiting for the whole batch. New POST /v1/enrich/stream returns NDJSON: a start frame, one JSON line per input (status matched / missed / error, with the result and per-row latency), then an end summary. Process the first row while the last is still enriching — ideal for real-time pipelines.' },
      { kind: 'feature', text: 'A new Streaming console page runs the same endpoint live: paste a list, hit Start, and watch enriched rows materialize one by one with a running match count and throughput, plus a Stop button that aborts the stream. It sits alongside Async Jobs (very large batches) and the synchronous Batch endpoint.' },
      { kind: 'improvement', text: 'Streamed rows reuse the same resolvers as every other surface, so a streamed row equals its single-call result, and invalid rows come back as a per-row error without breaking the stream. Deterministic and billed one credit per input.' },
    ],
  },
  {
    version: 'v4.26', date: 'September 2026', headline: 'Multi-region coverage',
    changes: [
      { kind: 'feature', text: 'Multi-region coverage — a new Regional Coverage dashboard (/console/regions) shows where the Zinbit dataset is deep and where it is thin: coverage and match rate across North America, EMEA, APAC, and LATAM, broken down by data type (email, direct phone, firmographics, technographics, social) and by top country, with dataset size and median record freshness.' },
      { kind: 'feature', text: 'A coverage matrix heat-maps every region × data-type cell, a per-region detail view surfaces top countries and honest coverage notes (e.g. “direct dials thin outside Brazil & Mexico in LATAM”), and the numbers are contact-weighted when rolled up globally — so you can answer “do you cover my market?” before you buy.' },
      { kind: 'improvement', text: 'Coverage is a deterministic, stable snapshot of the dataset (the same region always reports the same figures) and links straight to the Studio to confirm coverage with a live lookup against your own market.' },
    ],
  },
  {
    version: 'v4.25', date: 'September 2026', headline: 'Company news & event feed',
    changes: [
      { kind: 'feature', text: 'Company news & event feed — turn a domain into a chronological feed of the company\'s trigger events: funding rounds, leadership changes, office expansions, product launches, M&A, partnerships, and hiring surges. Each event carries a type, date, headline, summary, source, sentiment, and a 0-100 importance score, so a rep can open a call knowing exactly what just happened. New GET /v1/companies/news endpoint (2 credits), shipped as a Studio preset with an event timeline and type filters.' },
      { kind: 'improvement', text: 'The feed is reconciled with the rest of the company graph — funding events come straight from the funding resolver, so a Series C in the news feed matches the same round in Funding Signals exactly. Deterministic per domain; personal-email domains return no company feed.' },
    ],
  },
  {
    version: 'v4.24', date: 'September 2026', headline: 'HQ & office geo-resolution',
    changes: [
      { kind: 'feature', text: 'HQ & office geo-resolution — GET /v1/companies/offices turns a domain into its headquarters (a full geocoded address: street, region, postal code, ISO country, latitude/longitude, IANA timezone, UTC offset) and its wider office footprint — every location by function (engineering, sales, support, remote hub) with headcount and coordinates.' },
      { kind: 'feature', text: 'Beyond the map, it derives reach signals: country and continent counts, follow-the-sun coverage, and the best UTC window to reach HQ during its business hours — so “where are they and when can I call them” is one call.' },
      { kind: 'improvement', text: 'Available as a one-input preset in the Enrichment Studio with a geo footprint panel — each office shows its live local time (open/closed) ticking in real time. Deterministic and coherent — anchored to the company dossier’s own HQ city, country, and timezone.' },
    ],
  },
  {
    version: 'v4.23', date: 'September 2026', headline: 'Funding & investment signals',
    changes: [
      { kind: 'feature', text: 'Funding & investment signals — turn a domain into a company\'s full funding story: a round-by-round history (Seed → Series E) with each round\'s date, amount, lead investor, participating investors, and post-money valuation, plus the deduplicated investor roster, total raised, and latest valuation. New GET /v1/companies/funding endpoint (2 credits), shipped as a Studio preset with a round-timeline panel.' },
      { kind: 'improvement', text: 'Funding is anchored to the company graph — the same domain\'s firmographic stage caps the round ladder and the totals sum to the rounds, so funding and firmographics never disagree. Deterministic per domain; bootstrapped, public-only, and personal domains return a clean no-funding result instead of an error.' },
    ],
  },
  {
    version: 'v4.22', date: 'September 2026', headline: 'Technographic detection',
    changes: [
      { kind: 'feature', text: 'Technographic detection — GET /v1/companies/technographics turns a domain into its technology stack, categorized (cloud & infrastructure, data & analytics, monitoring & security, CRM, payments, martech…). Every technology carries the method it was detected by (DNS record, HTTP header, JS fingerprint, job posting), a confidence, a vendor, and first/last-seen dates.' },
      { kind: 'feature', text: 'Beyond the raw stack, it derives buying & intent signals from the mix — “cloud data warehouse in production”, “Salesforce-led revenue motion”, “no observability detected (greenfield)” — plus a 0–100 stack-sophistication score and an estimated annual stack spend, so GTM teams get talking points, not just a tool list.' },
      { kind: 'improvement', text: 'Available as a one-input preset in the Enrichment Studio with a category-grouped stack view and a signals panel. Deterministic and coherent — it enriches the company dossier’s own tech stack rather than inventing a divergent one.' },
    ],
  },
  {
    version: 'v4.21', date: 'September 2026', headline: 'Health & status endpoint',
    changes: [
      { kind: 'feature', text: 'Health & status endpoint — a public, keyless GET /api/health now reports platform health programmatically: per-component status (API Gateway, Identity Engine, Company Graph, Billing, Webhook Dispatcher, Console), latency, a 60-day uptime history, an overall status, and a degraded flag — returning 200 when healthy and 503 when down, so any uptime monitor can consume it directly.' },
      { kind: 'improvement', text: 'The public /status page now renders from that same source, so the page and the API can never disagree. Health is deterministic (a stable snapshot, never a wall-clock read) and lives outside the /v1 auth + rate-limit path, as a status endpoint should.' },
    ],
  },
  {
    version: 'v4.20', date: 'September 2026', headline: 'Async job endpoints',
    changes: [
      { kind: 'feature', text: 'Async job endpoints — kick off a long enrichment as a background job instead of holding a connection open for thousands of rows. POST /v1/jobs with a list of identifiers returns immediately with a job id; GET /v1/jobs/{id} polls live status (queued / running / completed / cancelled), progress, matched/missed counts, and the per-row results once done. List recent jobs with GET /v1/jobs and stop one with POST /v1/jobs/{id}/cancel. Credits are charged up front for the batch.' },
      { kind: 'feature', text: 'A new Async Jobs console page runs the same API: start a job, watch its progress bar advance live, cancel it, and expand the results — every action is a real call to /v1/jobs. It sits alongside CSV Bulk Jobs (the upload path) and the synchronous Batch endpoint (small lists).' },
      { kind: 'improvement', text: 'Job progress is deterministic — derived from elapsed time on every poll, so a job advances predictably with no background worker — and results reuse the same resolvers as single lookups, so an async row returns exactly what the equivalent direct call would. The Endpoint Explorer now also substitutes {id}-style path parameters, so job endpoints are runnable there too.' },
    ],
  },
  {
    version: 'v4.19', date: 'September 2026', headline: 'Batch endpoint',
    changes: [
      { kind: 'feature', text: 'Batch endpoint — run one enrichment operation over many inputs in a single request instead of N calls. POST /v1/batch/enrich takes an operation (people, company, phone, or email-verify) and a comma- or newline-separated list (up to 50), and returns a per-item status (matched / missed) with the full result for each, plus a summary (total, matched, missed, match rate, credits). Only matched items are billed. Runnable from the Endpoint Explorer; for thousands of rows, Bulk Jobs remains the async path.' },
      { kind: 'improvement', text: 'Batch results are deterministic and reuse the single-lookup resolvers, so a batched item returns exactly what the equivalent single call would — and the input list is de-duplicated and capped at 50 per request.' },
    ],
  },
  {
    version: 'v4.18', date: 'September 2026', headline: 'Disposable email detection',
    changes: [
      { kind: 'feature', text: 'Disposable email detection — a new "Detect disposable" lookup flags throwaway, temporary, and anonymizing mailboxes before they reach signup. It returns a decisive verdict (disposable / suspected / trusted), the provider category, a confidence, and a plain-English reason — catching both known providers and unlisted domains that look disposable by pattern (e.g. a "tempmail" in the domain). A lightweight single-purpose check at 1 credit when you don\'t need full deliverability. New GET /v1/email/disposable endpoint, shipped as a Studio preset with a tone-coded verdict panel.' },
      { kind: 'improvement', text: 'Disposable detection is now one source of truth: the same detector powers both the new endpoint and the deliverability score\'s "Disposable" check, so a domain is classified identically everywhere. The list is larger and categorized, and heuristic detection now catches lookalike domains that are not on any list.' },
    ],
  },
  {
    version: 'v4.17', date: 'September 2026', headline: 'Completeness scoring',
    changes: [
      { kind: 'feature', text: 'Completeness scoring — every resolved record now shows a "record completeness" meter: what share of the record\'s expected attributes actually came back with a real value versus a blank. The Studio result card displays a 0-100 score, a complete / partial / sparse tier, and names exactly which fields are missing (e.g. "Missing: Phone, Location"), so you know how much of the record you got before you act on it. Applies to every field-bearing lookup — person, company, and identity records.' },
      { kind: 'improvement', text: 'Completeness is deterministic and computed from the resolved record itself — placeholders like "—" and "N/A" count as empty, so the score reflects real coverage of the record, not just whether the lookup succeeded.' },
    ],
  },
  {
    version: 'v4.16', date: 'September 2026', headline: 'Match-rate transparency',
    changes: [
      { kind: 'feature', text: 'Match-rate transparency — a new Match Rate dashboard answers the question every enrichment buyer asks: what is your real match rate? It reads your own request history and shows an honest match rate (matched ÷ matched-plus-missed), broken down by endpoint and by identifier type (email, domain, phone, LinkedIn, IP, CIN), plus a miss-reason breakdown and a recent-lookups list explaining why each request matched or missed. Find it at Match Rate in the console nav.' },
      { kind: 'feature', text: 'Every lookup in Developer Logs now carries a "why it matched or missed" explanation — matched on which identifier, or outside coverage with a recovery suggestion (try Reverse Enrichment, resolve by domain, and so on).' },
      { kind: 'improvement', text: 'The match rate is honest by construction: deterministic transforms (email verification, title normalization, domain auth) never inflate it, and invalid input, auth failures, and rate limits are errors, not coverage misses, so they are excluded from the denominator. The methodology is stated on the page and the number is fully deterministic — the same traffic always yields the same rate.' },
    ],
  },
  {
    version: 'v4.15', date: 'September 2026', headline: 'Cross-field validation',
    changes: [
      { kind: 'feature', text: 'Cross-field validation — a new "Validate a record" lookup runs consistency rules across a record\'s fields and catches impossible or improbable combinations that single-field checks miss: email vs company domain, title vs seniority (the classic "VP" title on a "Junior" record), phone vs HQ geography, and name vs email local-part. Returns a 0-100 integrity score, a decisive consistent / minor-issues / inconsistent verdict, and a per-rule breakdown with the reason for each. New GET /v1/records/validate endpoint (1 credit), shipped as a Studio preset.' },
      { kind: 'improvement', text: 'Validation is deterministic and reuses the person, company, phone, and title resolvers, so every rule reflects the real resolved record and the same email always validates the same way.' },
    ],
  },
  {
    version: 'v4.14', date: 'September 2026', headline: 'Field-level freshness timestamps',
    changes: [
      { kind: 'feature', text: 'Field-level freshness timestamps — every enrichment result now stamps each attribute with its own last-verified date and a fresh / aging / stale tier, not just one date for the whole record. The Studio result card shows a color-coded freshness chip on every field (e.g. "verified 12d ago"), so you know exactly which attributes to trust and which to re-verify before you act on them. Applies across every lookup — person, company, phone, socials, title, firmographics, deliverability, and domain auth.' },
      { kind: 'improvement', text: 'Freshness is deterministic per field — the same result always shows the same per-field dates across the Studio, Explorer, and CLI (a stable seed, never a wall-clock read).' },
    ],
  },
  {
    version: 'v4.13', date: 'September 2026', headline: 'Email domain authentication (SPF/DKIM/DMARC)',
    changes: [
      { kind: 'feature', text: "Email domain authentication — inspect any domain's SPF record and policy, DKIM selectors, and DMARC policy and coverage, then score how well it is protected against spoofing (0-100 with a Strong/Partial/Weak/None grade and a plain spoofable verdict). The domain-level complement to mailbox deliverability: F-011 answers \"can I reach this inbox,\" this answers \"is this domain authenticated to send, and can it be spoofed.\" New GET /v1/email/domain-auth endpoint (1 credit), shipped as a Studio preset." },
      { kind: 'improvement', text: 'Authentication posture is deterministic — the same domain always returns the same SPF/DKIM/DMARC findings and score across the Studio, Explorer, and CLI (a single domain-auth resolver). Accepts a bare domain or a full email address.' },
    ],
  },
  {
    version: 'v4.12', date: 'September 2026', headline: 'Email deliverability scoring',
    changes: [
      { kind: 'feature', text: 'Email deliverability scoring — verify any address before you send and get a 0-100 inbox-reachability score with a decisive verdict (deliverable / risky / undeliverable), decomposed into every check behind it: syntax, MX records, SMTP mailbox handshake, catch-all, disposable, role-based, and free-provider — each with its own result and provenance. Catches typo domains with a did-you-mean suggestion. New GET /v1/email/verify endpoint (1 credit), shipped as a Studio preset with an animated score ring and a full signal breakdown.' },
      { kind: 'improvement', text: 'Scoring is deterministic — the same address always returns the same verdict and breakdown across the Studio, Explorer, and CLI (a single email verifier). Syntax is checked for real; disposable, role-based, and free-provider lists back the reputation signals.' },
      { kind: 'improvement', text: 'Deliverability signals are infrastructure metadata, so live keys return the full score (only the email echo is masked) — verify production traffic without losing the result.' },
    ],
  },
  {
    version: 'v4.11', date: 'September 2026', headline: 'Firmographic append',
    changes: [
      { kind: 'feature', text: 'Firmographic append — turn a domain into CRM-ready firmographic codes: NAICS and SIC (with titles), employee and revenue bands, ownership (public / private / VC- or PE-backed / nonprofit / government), and entity type, each with provenance. The standardized segmentation layer that sits alongside the full company dossier. New GET /v1/companies/firmographics endpoint (1 credit), shipped as a Studio preset.' },
      { kind: 'improvement', text: 'Firmographic classification is deterministic and shares the company graph, so the same domain always maps to the same NAICS/SIC codes across the Studio, Explorer, and CLI.' },
    ],
  },
  {
    version: 'v4.10', date: 'September 2026', headline: 'Job title normalization',
    changes: [
      { kind: 'feature', text: 'Job title normalization — turn any messy title ("Sr. SWE II", "VP, Eng", "Head of Growth") into a canonical title plus a normalized seniority, function, department, and management level, with the lexicon tokens behind each classification and a decision-maker flag for lead routing and scoring. New GET /v1/titles/normalize endpoint (1 credit), shipped as a Studio preset.' },
      { kind: 'improvement', text: 'Seniority normalization shares one ladder (Individual Contributor → C-Suite) with person resolution, so titles line up across the whole product.' },
    ],
  },
  {
    version: 'v4.9', date: 'September 2026', headline: 'Social profile discovery',
    changes: [
      { kind: 'feature', text: 'Social profile discovery — turn an email into a person\'s whole professional social footprint: LinkedIn, GitHub, X, Stack Overflow, Medium, and personal sites, each with a handle, verification status, follower/reputation signal, and per-platform match confidence. New GET /v1/people/social endpoint (2 credits), shipped as a Studio preset with clickable profile links and cross-platform provenance.' },
      { kind: 'improvement', text: 'Social discovery is deterministic — the same email always fans out to the same profiles across the Studio, Explorer, and CLI (a single social resolver built on the person graph).' },
      { kind: 'improvement', text: 'The Studio now renders the footprint as a rich per-platform card grid — each account shows a platform icon, verification badge, follower/reputation signal, and its own confidence bar, with the strongest profile highlighted and one-click open-out.' },
    ],
  },
  {
    version: 'v4.8', date: 'September 2026', headline: 'Reverse IP → company',
    changes: [
      { kind: 'feature', text: 'Reverse IP → company — identify the company behind an anonymous website visitor from their IP, with a network classification that tells you whether it is a genuine corporate egress or datacenter / VPN / consumer / mobile noise. Returns ISP, ASN, org, hostname, and geo, plus the full company dossier for corporate IPs, each field with provenance. New GET /v1/enrichment/ip endpoint (2 credits), shipped as a Studio preset.' },
      { kind: 'improvement', text: 'IP intelligence is deterministic — the same IP always resolves to the same company and classification across the Studio, Explorer, and CLI (a single reverse-IP resolver).' },
    ],
  },
  {
    version: 'v4.7', date: 'September 2026', headline: 'Phone append & verification',
    changes: [
      { kind: 'feature', text: 'Phone append & verification — the Email → phone lookup now returns a fully verified number: line type (mobile / direct-dial / landline / VoIP), live-status verification, carrier, region, a reachability score, and Do-Not-Call (DNC) standing, each with per-field provenance (carrier HLR lookup, number intelligence, DNC registry check). Renders in the Enrichment Studio with a DNC-safe badge and confidence.' },
      { kind: 'improvement', text: 'Phone results are deterministic — the same email always appends the same number and verification across the Studio, Explorer, and CLI (a single email→phone verifier).' },
      { kind: 'improvement', text: 'Live keys mask the appended phone number; sandbox returns the full synthetic number — the same compliance parity as person resolution.' },
    ],
  },
  {
    version: 'v4.6', date: 'September 2026', headline: 'Enrichment Studio — one workspace for every lookup',
    changes: [
      { kind: 'feature', text: 'Enrichment Studio — a single, catalog-driven workspace for every enrichment lookup: resolve a person, enrich a company, email↔phone, LinkedIn, CIN, or auto-detect any identifier. Each result renders with a confidence score and per-field provenance, and every lookup shares one tenant-scoped history.' },
      { kind: 'improvement', text: 'Adding a new lookup is now a catalog entry, not a new page — future enrichment endpoints appear as Studio presets automatically.' },
      { kind: 'improvement', text: 'Resolve and Enrich are now Studio presets; /console/resolve and /console/enrich redirect there so existing links keep working.' },
    ],
  },
  {
    version: 'v4.5', date: 'September 2026', headline: 'Domain → Company Enrichment',
    changes: [
      { kind: 'feature', text: 'Domain → Company Enrichment — turn a bare domain into a full firmographic dossier (industry, headcount, revenue band, founded year, HQ, tech stack, and funding), each field tagged with its source and confidence. New GET /v1/companies/enrich endpoint (2 credits); results carry a "people at this company" bridge, a tenant-scoped re-runnable history, and copy-as-JSON/cURL.' },
      { kind: 'improvement', text: 'Company data is now deterministic — the same domain always returns the same dossier across the Enrich console, Explorer, Identity Resolution, and CLI (a single domain→company resolver).' },
    ],
  },
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

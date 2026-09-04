// Auto-generated product roadmap register.
// Mirrors the Zinbit Feature Register artifact. Keep entries typed and stable.

export type FeatureStage = 'Now' | 'Next' | 'Later';

export interface RoadmapFeature {
  id: string;
  name: string;
  description: string;
  stage: FeatureStage;
}

export interface RoadmapArea {
  name: string;
  blurb: string;
  features: RoadmapFeature[];
}

export const ROADMAP_AREAS: RoadmapArea[] = [
  {
    name: 'Data Enrichment Coverage',
    blurb: 'The enrichment core — what a raw identifier can be resolved into.',
    features: [
      { id: 'F-001', name: 'Email-to-person resolution', description: 'Turn a work email into a full verified person profile.', stage: 'Now' },
      { id: 'F-002', name: 'Domain-to-company enrichment', description: 'Firmographics, headcount, and description from a domain.', stage: 'Now' },
      { id: 'F-003', name: 'Phone append & verification', description: 'Attach verified mobile and direct-dial numbers to a record.', stage: 'Now' },
      { id: 'F-004', name: 'Reverse IP-to-company', description: 'Identify the company behind an anonymous website visitor\'s IP.', stage: 'Now' },
      { id: 'F-005', name: 'Job title normalization', description: 'Map raw titles to a canonical seniority + function taxonomy.', stage: 'Now' },
      { id: 'F-006', name: 'Technographic detection', description: 'Detect the software, vendors, and stack a company runs.', stage: 'Next' },
      { id: 'F-007', name: 'Social profile discovery', description: 'Link LinkedIn, GitHub, and X handles to a person.', stage: 'Now' },
      { id: 'F-008', name: 'Company hierarchy graph', description: 'Resolve parent, subsidiary, and branch relationships.', stage: 'Later' },
      { id: 'F-009', name: 'Funding & investment signals', description: 'Rounds, investors, and valuation history per company.', stage: 'Next' },
      { id: 'F-010', name: 'Firmographic append', description: 'Industry (NAICS/SIC), revenue band, and employee count.', stage: 'Now' },
      { id: 'F-011', name: 'Email deliverability scoring', description: 'Validate and score inbox reachability before send.', stage: 'Now' },
      { id: 'F-012', name: 'Buyer intent signals', description: 'Surface topics a company is actively researching.', stage: 'Later' },
      { id: 'F-013', name: 'HQ & office geo-resolution', description: 'Normalize addresses to geocoded HQ and office locations.', stage: 'Next' },
      { id: 'F-014', name: 'Person demographic append', description: 'Education, skills, and tenure signals for a contact.', stage: 'Later' },
      { id: 'F-015', name: 'Company news & event feed', description: 'M&A, leadership changes, and expansion events.', stage: 'Next' },
      { id: 'F-016', name: 'Job-posting growth signals', description: 'Roles a company is hiring for as expansion indicators.', stage: 'Later' },
      { id: 'F-017', name: 'Ecommerce merchant enrichment', description: 'Platform, GMV band, and product categories for a store.', stage: 'Later' },
      { id: 'F-018', name: 'Multi-region coverage', description: 'Enrichment tuned for EMEA, APAC, and LATAM records.', stage: 'Next' },
      { id: 'F-019', name: 'Bulk list enrichment', description: 'Upload a CSV and enrich thousands of rows in a job.', stage: 'Now' },
      { id: 'F-020', name: 'Streaming inline enrichment', description: 'Enrich records in-flight via a low-latency endpoint.', stage: 'Next' },
      { id: 'F-021', name: 'Hashed-email (SHA-256) lookups', description: 'Enrich against pre-hashed emails without sending raw PII.', stage: 'Next' },
      { id: 'F-022', name: 'Historical time-series attributes', description: 'Month-over-month trends like headcount growth.', stage: 'Later' },
    ],
  },
  {
    name: 'Identity Resolution & Matching',
    blurb: 'Deciding when two records are the same entity, and how confidently.',
    features: [
      { id: 'F-023', name: 'Deterministic match keys', description: 'Resolve identity on exact email, domain, or phone keys.', stage: 'Now' },
      { id: 'F-024', name: 'Probabilistic fuzzy matching', description: 'Score likely matches on name + company variants.', stage: 'Next' },
      { id: 'F-025', name: 'Confidence score on every field', description: 'Return a per-field certainty, not just a match/no-match.', stage: 'Now' },
      { id: 'F-026', name: 'Entity de-duplication', description: 'Collapse duplicate records into a single golden record.', stage: 'Next' },
      { id: 'F-027', name: 'Cross-source reconciliation', description: 'Merge conflicting values across providers by recency.', stage: 'Later' },
      { id: 'F-028', name: 'Persistent Zinbit ID', description: 'Assign a stable identifier that survives email changes.', stage: 'Next' },
      { id: 'F-029', name: 'Match-rate transparency', description: 'Show why a lookup matched or missed for each request.', stage: 'Now' },
      { id: 'F-030', name: 'Name canonicalization', description: 'Normalize nicknames, accents, and ordering to one form.', stage: 'Next' },
      { id: 'F-031', name: 'Company alias resolution', description: 'Map DBAs, legal names, and brand names to one entity.', stage: 'Later' },
      { id: 'F-032', name: 'Household & account grouping', description: 'Cluster contacts that belong to the same buying account.', stage: 'Later' },
      { id: 'F-033', name: 'Merge & unmerge controls', description: 'Manually confirm or split entity resolution decisions.', stage: 'Next' },
      { id: 'F-034', name: 'Match threshold tuning', description: 'Let teams set the confidence floor per use case.', stage: 'Next' },
      { id: 'F-035', name: 'Historical identity graph', description: 'Track how an identity\'s attributes changed over time.', stage: 'Later' },
      { id: 'F-036', name: 'Negative-match caching', description: 'Remember misses to save spend on repeat unresolved lookups.', stage: 'Next' },
      { id: 'F-037', name: 'Domain-to-employer linking', description: 'Attribute a personal-email contact to a likely employer.', stage: 'Later' },
      { id: 'F-038', name: 'Match audit trail', description: 'Log the sources and rules behind each resolved record.', stage: 'Next' },
      { id: 'F-039', name: 'Cross-reference ID mapping', description: 'Map internal IDs to public URLs and canonical entities.', stage: 'Later' },
    ],
  },
  {
    name: 'Data Quality & Accuracy',
    blurb: 'Keeping the data fresh, correct, and measurably trustworthy.',
    features: [
      { id: 'F-040', name: 'Field-level freshness timestamps', description: 'Show when each attribute was last verified.', stage: 'Now' },
      { id: 'F-041', name: 'Automated re-verification', description: 'Re-check high-value fields on a rolling schedule.', stage: 'Next' },
      { id: 'F-042', name: 'Data decay alerts', description: 'Flag records likely stale based on age and role.', stage: 'Later' },
      { id: 'F-043', name: 'Source attribution', description: 'Cite which provider supplied each returned field.', stage: 'Next' },
      { id: 'F-044', name: 'Accuracy benchmarking', description: 'Publish sampled precision/recall per data category.', stage: 'Later' },
      { id: 'F-045', name: 'Bounce feedback loop', description: 'Feed email bounces back to improve deliverability scores.', stage: 'Next' },
      { id: 'F-046', name: 'User-reported corrections', description: 'Let customers flag and correct wrong values inline.', stage: 'Next' },
      { id: 'F-047', name: 'Cross-field validation', description: 'Reject impossible combinations (e.g. title vs. seniority).', stage: 'Now' },
      { id: 'F-048', name: 'Completeness scoring', description: 'Rate how filled-out each returned record is.', stage: 'Now' },
      { id: 'F-049', name: 'Catch-all domain detection', description: 'Identify domains that accept any address.', stage: 'Next' },
      { id: 'F-050', name: 'Role-account flagging', description: 'Mark info@ / sales@ style non-personal mailboxes.', stage: 'Now' },
      { id: 'F-051', name: 'Disposable email detection', description: 'Flag throwaway and temporary mailboxes.', stage: 'Now' },
      { id: 'F-052', name: 'Suppression list honoring', description: 'Never return contacts on a customer suppression list.', stage: 'Next' },
      { id: 'F-053', name: 'Coverage gap reporting', description: 'Show where the dataset is thin by region or industry.', stage: 'Later' },
      { id: 'F-054', name: 'Golden-record snapshots', description: 'Version the canonical record for each entity.', stage: 'Later' },
      { id: 'F-055', name: 'Quality SLA dashboard', description: 'Track match rate and accuracy against committed targets.', stage: 'Next' },
      { id: 'F-056', name: 'Currency normalization', description: 'Convert financial fields to a common currency.', stage: 'Later' },
      { id: 'F-057', name: 'Encoding & language normalization', description: 'Enforce UTF-8 and normalize language variants.', stage: 'Next' },
    ],
  },
  {
    name: 'API Gateway & Endpoints',
    blurb: 'The real request pipeline — routing, contracts, and resilience.',
    features: [
      { id: 'F-058', name: 'RESTful resource endpoints', description: 'Clean /v1 resources for person, company, and email.', stage: 'Now' },
      { id: 'F-059', name: 'Batch endpoint', description: 'Submit many lookups in one request with per-item status.', stage: 'Now' },
      { id: 'F-060', name: 'Async job endpoints', description: 'Kick off long enrichment jobs and poll for results.', stage: 'Now' },
      { id: 'F-061', name: 'Idempotency keys', description: 'Safely retry writes without double-charging or duplicating.', stage: 'Next' },
      { id: 'F-062', name: 'Field selection / sparse responses', description: 'Request only the attributes you need to cut payload.', stage: 'Next' },
      { id: 'F-063', name: 'Response envelope standard', description: 'Consistent data/meta/error shape across every endpoint.', stage: 'Now' },
      { id: 'F-064', name: 'Cursor-based pagination', description: 'Stable pagination for large result sets.', stage: 'Now' },
      { id: 'F-065', name: 'GraphQL gateway', description: 'Query exactly the enrichment graph you need in one call.', stage: 'Later' },
      { id: 'F-066', name: 'Circuit breaker per upstream', description: 'Shed load from a failing data source gracefully.', stage: 'Next' },
      { id: 'F-067', name: 'Response caching layer', description: 'Serve repeat lookups from cache within a freshness window.', stage: 'Now' },
      { id: 'F-068', name: 'Request coalescing', description: 'Collapse identical in-flight lookups into one upstream call.', stage: 'Later' },
      { id: 'F-069', name: 'API versioning & deprecation', description: 'Version endpoints with a clear sunset policy.', stage: 'Now' },
      { id: 'F-070', name: 'Regional API endpoints', description: 'Route to the nearest region for latency and residency.', stage: 'Later' },
      { id: 'F-071', name: 'Partial-result responses', description: 'Return what resolved even when some sources time out.', stage: 'Next' },
      { id: 'F-072', name: 'Webhook-backed async results', description: 'Deliver finished job results via webhook, not polling.', stage: 'Next' },
      { id: 'F-073', name: 'Health & status endpoint', description: 'Programmatic uptime and degraded-mode reporting.', stage: 'Now' },
      { id: 'F-074', name: 'Request replay & debug echo', description: 'Echo the parsed request to debug integration issues.', stage: 'Next' },
      { id: 'F-075', name: 'Sandbox vs. live routing', description: 'Separate synthetic sandbox data from billed live calls.', stage: 'Now' },
      { id: 'F-076', name: 'Bulk export endpoint', description: 'Stream a filtered dataset out as NDJSON.', stage: 'Later' },
      { id: 'F-077', name: 'gRPC high-throughput channel', description: 'Binary streaming for enterprise-scale enrichment.', stage: 'Later' },
      { id: 'F-078', name: 'Query filtering & sorting', description: 'Filter and order result sets with query parameters.', stage: 'Next' },
      { id: 'F-079', name: 'Strict payload validation', description: 'Reject malformed request bodies with precise errors.', stage: 'Now' },
      { id: 'F-080', name: 'Payload compression (Gzip/Brotli)', description: 'Compress responses to cut bandwidth.', stage: 'Next' },
      { id: 'F-081', name: 'Dark-launch preview endpoints', description: 'Safely expose upcoming v2 routes to opt-in testers.', stage: 'Later' },
      { id: 'F-082', name: 'CORS configuration panel', description: 'Set allowed browser origins for front-end calls.', stage: 'Next' },
    ],
  },
  {
    name: 'Developer Experience & SDKs',
    blurb: 'Everything between an API key and a first successful call.',
    features: [
      { id: 'F-083', name: 'First-call quickstart', description: 'Copy-paste snippet that returns real data in under a minute.', stage: 'Now' },
      { id: 'F-084', name: 'Official JS/TS SDK', description: 'Typed client with retries and pagination built in.', stage: 'Now' },
      { id: 'F-085', name: 'Python SDK', description: 'Idiomatic client with async support.', stage: 'Now' },
      { id: 'F-086', name: 'Go SDK', description: 'Lightweight typed client for backend services.', stage: 'Next' },
      { id: 'F-087', name: 'Ruby & PHP SDKs', description: 'First-party clients for classic web stacks.', stage: 'Later' },
      { id: 'F-088', name: 'Interactive API explorer', description: 'Run live calls against your key from the docs.', stage: 'Now' },
      { id: 'F-089', name: 'Code sample generator', description: 'Auto-generate snippets in every SDK for any endpoint.', stage: 'Now' },
      { id: 'F-090', name: 'Postman collection', description: 'One-click importable collection kept in sync with the API.', stage: 'Now' },
      { id: 'F-091', name: 'OpenAPI spec', description: 'Machine-readable spec powering docs, SDKs, and mocks.', stage: 'Now' },
      { id: 'F-092', name: 'CLI tool', description: 'Enrich, manage keys, and tail logs from the terminal.', stage: 'Now' },
      { id: 'F-093', name: 'MCP server', description: 'Expose enrichment as tools to AI coding agents.', stage: 'Next' },
      { id: 'F-094', name: 'Local mock server', description: 'Run a fake gateway offline for CI and development.', stage: 'Later' },
      { id: 'F-095', name: 'Typed error catalog', description: 'Every error has a stable code, message, and doc link.', stage: 'Now' },
      { id: 'F-096', name: 'Request signing helpers', description: 'SDK helpers for HMAC-signed requests.', stage: 'Later' },
      { id: 'F-097', name: 'Auto-retry with backoff', description: 'SDKs retry transient failures with jittered backoff.', stage: 'Now' },
      { id: 'F-098', name: 'Webhook signature verifier', description: 'Drop-in helpers to verify inbound webhook signatures.', stage: 'Next' },
      { id: 'F-099', name: 'Framework starter kits', description: 'Next.js, Rails, and Django integration templates.', stage: 'Later' },
      { id: 'F-100', name: 'Changelog & migration guides', description: 'Versioned changelog with copy-paste migration diffs.', stage: 'Next' },
      { id: 'F-101', name: 'API status in-SDK', description: 'SDKs surface degraded-mode warnings to the developer.', stage: 'Later' },
      { id: 'F-102', name: 'Developer-first error pages', description: '404s and 401s that link straight to the fix.', stage: 'Next' },
      { id: 'F-103', name: 'Automated contract testing', description: 'Catch breaking API changes before they ship.', stage: 'Next' },
      { id: 'F-104', name: 'Rust & Java SDKs', description: 'First-party clients for systems and JVM stacks.', stage: 'Later' },
      { id: 'F-105', name: 'Sandbox latency simulation', description: 'Toggle injected delay to test integration resilience.', stage: 'Later' },
      { id: 'F-106', name: 'Deterministic sandbox test IDs', description: 'Special inputs that always return a chosen status.', stage: 'Next' },
      { id: 'F-107', name: 'Nested JSON visualizer', description: 'Explore deeply nested payloads visually.', stage: 'Later' },
      { id: 'F-108', name: 'Automated SDK generation pipeline', description: 'Regenerate SDKs from the OpenAPI spec on release.', stage: 'Later' },
      { id: 'F-109', name: 'Visual request builder', description: 'Compose a request in a form, copy the cURL.', stage: 'Now' },
      { id: 'F-110', name: 'Terraform provider', description: 'Manage keys and configuration as code.', stage: 'Later' },
      { id: 'F-111', name: 'Drop-in UI components', description: 'Embeddable front-end widgets, Plaid-style.', stage: 'Later' },
    ],
  },
  {
    name: 'API Keys & Authentication',
    blurb: 'How callers prove who they are and stay scoped.',
    features: [
      { id: 'F-112', name: 'Test & live key pairs', description: 'Separate sk_test and sk_live keys per environment.', stage: 'Now' },
      { id: 'F-113', name: 'Scoped key permissions', description: 'Restrict a key to specific endpoints and actions.', stage: 'Now' },
      { id: 'F-114', name: 'Key rotation without downtime', description: 'Roll a key with an overlap window for zero-downtime cutover.', stage: 'Next' },
      { id: 'F-115', name: 'One-time secret reveal', description: 'Show a full secret once, store only a fingerprint after.', stage: 'Now' },
      { id: 'F-116', name: 'IP allowlisting per key', description: 'Bind a key to a set of source IP ranges.', stage: 'Next' },
      { id: 'F-117', name: 'Key expiry & auto-retire', description: 'Set keys to expire and auto-disable on a date.', stage: 'Next' },
      { id: 'F-118', name: 'Last-used & usage per key', description: 'See when and how each key was last exercised.', stage: 'Now' },
      { id: 'F-119', name: 'Compromised-key kill switch', description: 'Instantly revoke a leaked key everywhere.', stage: 'Now' },
      { id: 'F-120', name: 'Secret-scanning partner alerts', description: 'Get notified when a key leaks to a public repo.', stage: 'Later' },
      { id: 'F-121', name: 'OAuth 2.0 for user apps', description: 'Authorize third-party apps on a user\'s behalf.', stage: 'Later' },
      { id: 'F-122', name: 'Machine-to-machine tokens', description: 'Short-lived JWTs for service-to-service auth.', stage: 'Next' },
      { id: 'F-123', name: 'Per-key rate & spend caps', description: 'Cap throughput and cost independently on each key.', stage: 'Next' },
      { id: 'F-124', name: 'Key labels & ownership', description: 'Name keys and assign an owner for accountability.', stage: 'Now' },
      { id: 'F-125', name: 'Environment binding', description: 'Tie a key to a named project/environment.', stage: 'Next' },
      { id: 'F-126', name: 'Signed request enforcement', description: 'Optionally require HMAC signatures on every call.', stage: 'Later' },
      { id: 'F-127', name: 'Key creation approval flow', description: 'Require admin approval for new production keys.', stage: 'Later' },
      { id: 'F-128', name: 'Publishable frontend keys', description: 'Domain-locked read-only keys safe for browser use.', stage: 'Next' },
    ],
  },
  {
    name: 'Rate Limiting & Quotas',
    blurb: 'Fair usage, protection, and predictable throughput.',
    features: [
      { id: 'F-129', name: 'Token-bucket rate limiting', description: 'Smooth per-key limits with burst allowance.', stage: 'Now' },
      { id: 'F-130', name: 'Standard rate-limit headers', description: 'Return limit, remaining, and reset on every response.', stage: 'Now' },
      { id: 'F-131', name: 'Tier-based throughput', description: 'Higher sustained RPS on higher plans.', stage: 'Now' },
      { id: 'F-132', name: 'Burst credit pooling', description: 'Bank unused capacity for short traffic spikes.', stage: 'Later' },
      { id: 'F-133', name: 'Per-endpoint limits', description: 'Different ceilings for cheap vs. expensive endpoints.', stage: 'Next' },
      { id: 'F-134', name: 'Graceful 429 with retry-after', description: 'Tell clients exactly when to retry.', stage: 'Now' },
      { id: 'F-135', name: 'Concurrency limits', description: 'Cap simultaneous in-flight requests per account.', stage: 'Next' },
      { id: 'F-136', name: 'Soft-limit warnings', description: 'Warn at 80% of quota before hard throttling.', stage: 'Next' },
      { id: 'F-137', name: 'Self-serve limit increase', description: 'Request and auto-approve higher limits in-console.', stage: 'Later' },
      { id: 'F-138', name: 'Priority lanes', description: 'Let production traffic jump ahead of batch jobs.', stage: 'Later' },
      { id: 'F-139', name: 'Quota reset scheduling', description: 'Align quota windows to a customer\'s billing day.', stage: 'Next' },
      { id: 'F-140', name: 'Abuse auto-throttle', description: 'Automatically slow suspected scraping patterns.', stage: 'Next' },
      { id: 'F-141', name: 'Rate-limit simulator', description: 'Preview how a limit behaves against sample traffic.', stage: 'Later' },
      { id: 'F-142', name: 'Grace overage buffer', description: 'Allow a small paid overage instead of a hard stop.', stage: 'Next' },
      { id: 'F-143', name: 'Weighted request costing', description: 'Count expensive calls as more than one unit.', stage: 'Next' },
      { id: 'F-144', name: 'Fair-share scheduling', description: 'Prevent one key from starving others on shared limits.', stage: 'Later' },
    ],
  },
  {
    name: 'Billing & Monetization',
    blurb: 'Turning usage into revenue, transparently.',
    features: [
      { id: 'F-145', name: 'Usage-based metering', description: 'Meter every billable call accurately to the credit.', stage: 'Now' },
      { id: 'F-146', name: 'Prepaid credit balance', description: 'Buy credits up front and draw down as you enrich.', stage: 'Now' },
      { id: 'F-147', name: 'Auto-recharge', description: 'Top up automatically when the balance runs low.', stage: 'Now' },
      { id: 'F-148', name: 'Live cost preview', description: 'Show the credit cost of a call before you run it.', stage: 'Now' },
      { id: 'F-149', name: 'Real-time balance & burn rate', description: 'Watch credits and daily burn update live.', stage: 'Now' },
      { id: 'F-150', name: 'Per-endpoint pricing', description: 'Charge different credit costs by enrichment type.', stage: 'Now' },
      { id: 'F-151', name: 'Invoicing & receipts', description: 'Generate itemized invoices and downloadable receipts.', stage: 'Now' },
      { id: 'F-152', name: 'Committed-use discounts', description: 'Discount rates for annual volume commitments.', stage: 'Next' },
      { id: 'F-153', name: 'Volume tier pricing', description: 'Automatic unit-price drops as usage grows.', stage: 'Now' },
      { id: 'F-154', name: 'Free monthly credits', description: 'Recurring free allotment to keep small teams active.', stage: 'Now' },
      { id: 'F-155', name: 'Only-charge-on-match billing', description: 'Bill for successful matches, not empty lookups.', stage: 'Next' },
      { id: 'F-156', name: 'Credit expiry policy', description: 'Configurable expiry on promotional vs. paid credits.', stage: 'Later' },
      { id: 'F-157', name: 'Multi-currency billing', description: 'Charge in USD, EUR, GBP, and INR.', stage: 'Next' },
      { id: 'F-158', name: 'Tax & VAT handling', description: 'Apply correct tax by jurisdiction on invoices.', stage: 'Next' },
      { id: 'F-159', name: 'Dunning & failed-payment recovery', description: 'Retry failed cards and nudge before suspension.', stage: 'Next' },
      { id: 'F-160', name: 'Chargeback & dispute handling', description: 'Track and respond to payment disputes.', stage: 'Later' },
      { id: 'F-161', name: 'Proration on plan change', description: 'Fairly prorate mid-cycle upgrades and downgrades.', stage: 'Next' },
      { id: 'F-162', name: 'Reseller / agency billing', description: 'Bill sub-accounts under one parent invoice.', stage: 'Later' },
      { id: 'F-163', name: 'Credit gifting & promo codes', description: 'Issue promotional credits and referral bonuses.', stage: 'Next' },
      { id: 'F-164', name: 'Revenue-share payouts', description: 'Pay partners a share of referred usage.', stage: 'Later' },
      { id: 'F-165', name: 'Stripe & enterprise payment gateways', description: 'Cards self-serve, wire/ACH for enterprise.', stage: 'Now' },
      { id: 'F-166', name: 'Post-paid enterprise invoicing', description: 'Bill monthly in arrears against a contract.', stage: 'Next' },
      { id: 'F-167', name: 'Cost-per-call response metadata', description: 'Return the credit cost inline on each response.', stage: 'Next' },
      { id: 'F-168', name: 'Hard spend caps & overage toggle', description: 'Stop or allow paid overage at a set ceiling.', stage: 'Next' },
      { id: 'F-169', name: 'One-off credit top-up links', description: 'Buy a bundle of credits via a shareable link.', stage: 'Next' },
    ],
  },
  {
    name: 'Pricing & Packaging',
    blurb: 'How value is bundled, communicated, and chosen.',
    features: [
      { id: 'F-170', name: 'Interactive pricing calculator', description: 'Estimate monthly cost from your expected volume.', stage: 'Now' },
      { id: 'F-171', name: 'Plan comparison matrix', description: 'Side-by-side feature and limit comparison.', stage: 'Now' },
      { id: 'F-172', name: 'Self-serve upgrade / downgrade', description: 'Change plans instantly without contacting sales.', stage: 'Now' },
      { id: 'F-173', name: 'Usage-to-plan recommender', description: 'Suggest the cheapest plan for actual usage.', stage: 'Next' },
      { id: 'F-174', name: 'Add-on modules', description: 'Buy premium data packs à la carte.', stage: 'Next' },
      { id: 'F-175', name: 'Seat-based team pricing', description: 'Price collaboration features per active seat.', stage: 'Later' },
      { id: 'F-176', name: 'Enterprise custom quotes', description: 'Request a tailored contract from the console.', stage: 'Next' },
      { id: 'F-177', name: 'Annual vs. monthly toggle', description: 'Show annual savings clearly at the decision point.', stage: 'Now' },
      { id: 'F-178', name: 'Startup & nonprofit programs', description: 'Discounted tiers with self-serve qualification.', stage: 'Later' },
      { id: 'F-179', name: 'Overage vs. upgrade nudges', description: 'Suggest upgrading when overages exceed a plan step.', stage: 'Next' },
      { id: 'F-180', name: 'Grandfathered plan protection', description: 'Preserve legacy pricing on plan restructures.', stage: 'Later' },
      { id: 'F-181', name: 'Bundle builder', description: 'Compose a custom package of endpoints and volume.', stage: 'Later' },
      { id: 'F-182', name: 'Transparent unit economics', description: 'Show cost-per-match plainly, no hidden multipliers.', stage: 'Now' },
      { id: 'F-183', name: 'Trial-to-paid conversion flow', description: 'Guided upgrade at the end of a trial.', stage: 'Next' },
      { id: 'F-184', name: 'Contract & order-form management', description: 'Store and reference signed terms in-console.', stage: 'Later' },
      { id: 'F-185', name: 'Price-change grace notices', description: 'Give ample warning before any rate change.', stage: 'Later' },
    ],
  },
  {
    name: 'Usage Analytics & Observability',
    blurb: 'Seeing what the API is doing and why.',
    features: [
      { id: 'F-186', name: 'Live request log stream', description: 'Tail real requests with status, latency, and cost.', stage: 'Now' },
      { id: 'F-187', name: 'Usage dashboard', description: 'Calls, match rate, spend, and errors over time.', stage: 'Now' },
      { id: 'F-188', name: 'Latency percentiles', description: 'p50/p95/p99 latency by endpoint and region.', stage: 'Next' },
      { id: 'F-189', name: 'Error-rate breakdown', description: 'Group failures by code, endpoint, and key.', stage: 'Now' },
      { id: 'F-190', name: 'Match-rate analytics', description: 'Trend resolution success by data category.', stage: 'Now' },
      { id: 'F-191', name: 'Per-key usage attribution', description: 'Break spend and volume down by API key.', stage: 'Now' },
      { id: 'F-192', name: 'Request inspector', description: 'Drill into a single request\'s full lifecycle.', stage: 'Now' },
      { id: 'F-193', name: 'Spend anomaly detection', description: 'Flag unusual cost spikes before the invoice.', stage: 'Next' },
      { id: 'F-194', name: 'Custom metric alerts', description: 'Alert on any metric crossing a threshold.', stage: 'Next' },
      { id: 'F-195', name: 'Endpoint popularity heatmap', description: 'See which endpoints drive the most value.', stage: 'Later' },
      { id: 'F-196', name: 'Geographic usage map', description: 'Where requests originate, at a glance.', stage: 'Later' },
      { id: 'F-197', name: 'Cost-per-outcome reporting', description: 'Tie spend to matched records and downstream value.', stage: 'Next' },
      { id: 'F-198', name: 'Retention of raw logs', description: 'Configurable log retention windows per plan.', stage: 'Next' },
      { id: 'F-199', name: 'Trace ID on every request', description: 'Correlate a request across your logs and ours.', stage: 'Now' },
      { id: 'F-200', name: 'Slow-query surfacing', description: 'Highlight the calls dragging your integration.', stage: 'Later' },
      { id: 'F-201', name: 'Usage export to warehouse', description: 'Pipe usage events to BigQuery/Snowflake.', stage: 'Later' },
      { id: 'F-202', name: 'Real-time SLO dashboard', description: 'Track availability and latency against your SLOs.', stage: 'Next' },
      { id: 'F-203', name: 'Grafana / Datadog exporters', description: 'Ship metrics to your existing observability stack.', stage: 'Later' },
      { id: 'F-204', name: 'Sampling & log search', description: 'Full-text search across sampled request logs.', stage: 'Next' },
      { id: 'F-205', name: 'Weekly usage digest', description: 'Emailed summary of volume, spend, and health.', stage: 'Next' },
      { id: 'F-206', name: 'Redacted payloads in logs', description: 'Store request/response logs with PII masked.', stage: 'Now' },
      { id: 'F-207', name: 'Rate-limit headroom gauges', description: 'Visual quota-remaining meters per key.', stage: 'Now' },
      { id: 'F-208', name: 'Distributed tracing (OpenTelemetry)', description: 'Export traces to your own observability stack.', stage: 'Next' },
    ],
  },
  {
    name: 'Search, Explorer & Discovery',
    blurb: 'Finding data and endpoints without reading docs.',
    features: [
      { id: 'F-209', name: 'Global command palette', description: 'Jump to any page, key, or record with one shortcut.', stage: 'Now' },
      { id: 'F-210', name: 'Endpoint explorer', description: 'Browse, filter, and run every endpoint live.', stage: 'Now' },
      { id: 'F-211', name: 'Prospecting search', description: 'Query the dataset by firmographic filters.', stage: 'Next' },
      { id: 'F-212', name: 'Saved searches & segments', description: 'Save filter sets and re-run them anytime.', stage: 'Next' },
      { id: 'F-213', name: 'Look-alike audience builder', description: 'Find companies similar to a seed list.', stage: 'Later' },
      { id: 'F-214', name: 'Natural-language query', description: 'Describe who you want in plain English.', stage: 'Later' },
      { id: 'F-215', name: 'Faceted filters', description: 'Refine by industry, size, geo, and tech.', stage: 'Next' },
      { id: 'F-216', name: 'Preview before purchase', description: 'See match count before spending credits.', stage: 'Now' },
      { id: 'F-217', name: 'Recent & pinned records', description: 'Quick access to what you looked at last.', stage: 'Now' },
      { id: 'F-218', name: 'Data dictionary browser', description: 'Search every returnable field with examples.', stage: 'Now' },
      { id: 'F-219', name: 'Sample record gallery', description: 'Realistic example responses per endpoint.', stage: 'Now' },
      { id: 'F-220', name: 'Coverage lookup', description: 'Check if an entity is in-dataset before you buy.', stage: 'Next' },
      { id: 'F-221', name: 'Autocomplete on companies', description: 'Type-ahead resolution as you enter a name.', stage: 'Next' },
      { id: 'F-222', name: 'Export search results', description: 'Push a result set to CSV or a project.', stage: 'Now' },
      { id: 'F-223', name: 'Search-to-pipeline handoff', description: 'Send a result set straight into an enrichment job.', stage: 'Next' },
      { id: 'F-224', name: 'Filter presets by use case', description: 'One-click filters tuned for sales, RevOps, or research.', stage: 'Later' },
      { id: 'F-225', name: 'Geo-radius querying', description: 'Find entities within a distance of a point.', stage: 'Later' },
    ],
  },
  {
    name: 'Webhooks & Events',
    blurb: 'Push, don\'t poll — the event backbone.',
    features: [
      { id: 'F-226', name: 'Webhook subscriptions', description: 'Subscribe endpoints to typed platform events.', stage: 'Now' },
      { id: 'F-227', name: 'Event catalog', description: 'Documented list of every event and its payload.', stage: 'Now' },
      { id: 'F-228', name: 'Signed webhook payloads', description: 'HMAC signatures so receivers can verify origin.', stage: 'Now' },
      { id: 'F-229', name: 'Delivery retries with backoff', description: 'Retry failed deliveries with exponential backoff.', stage: 'Now' },
      { id: 'F-230', name: 'Webhook delivery log', description: 'Inspect every attempt, status, and response.', stage: 'Now' },
      { id: 'F-231', name: 'Replay failed deliveries', description: 'Manually re-send a missed event.', stage: 'Next' },
      { id: 'F-232', name: 'Event filtering', description: 'Subscribe only to the events you care about.', stage: 'Next' },
      { id: 'F-233', name: 'Webhook test / ping', description: 'Send a sample event to validate an endpoint.', stage: 'Now' },
      { id: 'F-234', name: 'Enrichment-complete events', description: 'Fire when an async job finishes.', stage: 'Now' },
      { id: 'F-235', name: 'Change-signal events', description: 'Notify when a watched record\'s data changes.', stage: 'Later' },
      { id: 'F-236', name: 'Billing & quota events', description: 'Emit low-balance and limit-reached events.', stage: 'Next' },
      { id: 'F-237', name: 'Endpoint health monitoring', description: 'Auto-disable webhooks that keep failing.', stage: 'Next' },
      { id: 'F-238', name: 'Payload versioning', description: 'Version event schemas with backward compatibility.', stage: 'Later' },
      { id: 'F-239', name: 'Rate-limited fan-out', description: 'Throttle bursts so receivers aren\'t overwhelmed.', stage: 'Later' },
      { id: 'F-240', name: 'Webhook secret rotation', description: 'Roll signing secrets without missing deliveries.', stage: 'Next' },
      { id: 'F-241', name: 'Ordered delivery option', description: 'Guarantee in-order events for stateful consumers.', stage: 'Later' },
      { id: 'F-242', name: 'Webhook payload inspector', description: 'Replay and debug past webhook deliveries.', stage: 'Next' },
    ],
  },
  {
    name: 'Integrations & Connectors',
    blurb: 'Meeting customers in the tools they already use.',
    features: [
      { id: 'F-243', name: 'Salesforce enrichment', description: 'Enrich leads and accounts natively in Salesforce.', stage: 'Next' },
      { id: 'F-244', name: 'HubSpot connector', description: 'Auto-enrich contacts and companies in HubSpot.', stage: 'Next' },
      { id: 'F-245', name: 'Zapier app', description: 'Wire enrichment into 6,000+ apps no-code.', stage: 'Next' },
      { id: 'F-246', name: 'Make / n8n nodes', description: 'Native nodes for popular automation platforms.', stage: 'Later' },
      { id: 'F-247', name: 'Google Sheets add-on', description: 'Enrich a spreadsheet column with one formula.', stage: 'Now' },
      { id: 'F-248', name: 'Snowflake native app', description: 'Enrich data in-warehouse without moving it.', stage: 'Later' },
      { id: 'F-249', name: 'Segment / CDP destination', description: 'Enrich profiles flowing through your CDP.', stage: 'Later' },
      { id: 'F-250', name: 'Slack notifications app', description: 'Post signals and alerts into Slack channels.', stage: 'Next' },
      { id: 'F-251', name: 'Clay / spreadsheet tools', description: 'First-party integration with GTM data tools.', stage: 'Later' },
      { id: 'F-252', name: 'Outreach & Salesloft', description: 'Enrich sequences at the point of engagement.', stage: 'Later' },
      { id: 'F-253', name: 'Marketo & Pardot', description: 'Enrich MAP records for better routing and scoring.', stage: 'Later' },
      { id: 'F-254', name: 'Webhook-to-anywhere', description: 'Generic connector for custom destinations.', stage: 'Now' },
      { id: 'F-255', name: 'Reverse ETL sync', description: 'Push enriched fields back into source systems.', stage: 'Later' },
      { id: 'F-256', name: 'Chrome extension', description: 'Enrich a profile on any page you\'re viewing.', stage: 'Next' },
      { id: 'F-257', name: 'Integration marketplace', description: 'Browse and install connectors from the console.', stage: 'Next' },
      { id: 'F-258', name: 'OAuth app directory', description: 'Manage which third-party apps hold access.', stage: 'Later' },
      { id: 'F-259', name: 'Field-mapping UI', description: 'Map Zinbit fields to destination fields visually.', stage: 'Next' },
      { id: 'F-260', name: 'Sync health monitoring', description: 'Watch each integration\'s sync status and errors.', stage: 'Later' },
      { id: 'F-261', name: 'Zero-copy data sharing', description: 'Share data in-warehouse via clean rooms, no copy.', stage: 'Later' },
      { id: 'F-262', name: 'Salesforce AppExchange package', description: 'A managed package for native Salesforce install.', stage: 'Later' },
      { id: 'F-263', name: 'GitHub Actions / CI-CD plugin', description: 'Run contract tests and manage keys in CI.', stage: 'Later' },
      { id: 'F-264', name: 'Kafka / EventBridge connectors', description: 'Stream events into event-driven architectures.', stage: 'Later' },
      { id: 'F-265', name: 'BigQuery Analytics Hub listing', description: 'Subscribe to enrichment data inside BigQuery.', stage: 'Later' },
      { id: 'F-266', name: 'Databricks Delta Sharing', description: 'Share datasets to Databricks via Delta Sharing.', stage: 'Later' },
    ],
  },
  {
    name: 'Workflow Automation & Pipelines',
    blurb: 'Turning enrichment into repeatable, hands-off flows.',
    features: [
      { id: 'F-267', name: 'Enrichment pipelines', description: 'Chain lookups, filters, and outputs into a flow.', stage: 'Next' },
      { id: 'F-268', name: 'Scheduled recurring jobs', description: 'Run an enrichment batch on a cron schedule.', stage: 'Next' },
      { id: 'F-269', name: 'Trigger-based enrichment', description: 'Enrich automatically when a record enters a list.', stage: 'Later' },
      { id: 'F-270', name: 'Conditional routing', description: 'Branch a workflow on field values or scores.', stage: 'Later' },
      { id: 'F-271', name: 'Data transformation steps', description: 'Reshape and clean fields between stages.', stage: 'Later' },
      { id: 'F-272', name: 'Waterfall enrichment', description: 'Try providers in priority order until a match.', stage: 'Next' },
      { id: 'F-273', name: 'Dedup-before-enrich step', description: 'Collapse duplicates to save credits.', stage: 'Next' },
      { id: 'F-274', name: 'Approval gates', description: 'Require human sign-off before a costly step.', stage: 'Later' },
      { id: 'F-275', name: 'Workflow templates', description: 'Start from prebuilt GTM enrichment recipes.', stage: 'Later' },
      { id: 'F-276', name: 'Dry-run mode', description: 'Simulate a pipeline without spending credits.', stage: 'Next' },
      { id: 'F-277', name: 'Retry & dead-letter handling', description: 'Isolate and retry failed rows.', stage: 'Next' },
      { id: 'F-278', name: 'Pipeline versioning', description: 'Version and roll back workflow definitions.', stage: 'Later' },
      { id: 'F-279', name: 'Run history & audit', description: 'See every run, its cost, and its outcome.', stage: 'Next' },
      { id: 'F-280', name: 'Parallel batch fan-out', description: 'Split large jobs across workers for speed.', stage: 'Later' },
      { id: 'F-281', name: 'Output routing', description: 'Send results to a webhook, warehouse, or file.', stage: 'Next' },
      { id: 'F-282', name: 'Visual pipeline builder', description: 'Compose flows on a drag-and-drop canvas.', stage: 'Later' },
    ],
  },
  {
    name: 'AI & Intelligence',
    blurb: 'State-aware intelligence layered on the data — never random.',
    features: [
      { id: 'F-283', name: 'Root-cause analysis for errors', description: 'Explain why a spike in failures happened.', stage: 'Next' },
      { id: 'F-284', name: 'Anomaly triage assistant', description: 'Rank and explain unusual usage patterns.', stage: 'Next' },
      { id: 'F-285', name: 'Smart dedup suggestions', description: 'Propose merges with a reasoned confidence.', stage: 'Next' },
      { id: 'F-286', name: 'Natural-language data queries', description: 'Ask questions about your enrichment data.', stage: 'Later' },
      { id: 'F-287', name: 'Enrichment copilot', description: 'Chat assistant that runs and explains lookups.', stage: 'Later' },
      { id: 'F-288', name: 'Lead scoring model', description: 'Score fit and priority from enriched attributes.', stage: 'Later' },
      { id: 'F-289', name: 'Persona classification', description: 'Auto-assign contacts to buyer personas.', stage: 'Later' },
      { id: 'F-290', name: 'Company similarity embeddings', description: 'Vector search for look-alike accounts.', stage: 'Later' },
      { id: 'F-291', name: 'Predictive data decay', description: 'Predict which records will go stale next.', stage: 'Later' },
      { id: 'F-292', name: 'Auto-generated segments', description: 'Cluster your records into useful segments.', stage: 'Later' },
      { id: 'F-293', name: 'Intent summarization', description: 'Summarize what an account is signaling.', stage: 'Later' },
      { id: 'F-294', name: 'Email-copy suggestions', description: 'Draft outreach grounded in enriched context.', stage: 'Later' },
      { id: 'F-295', name: 'Data-gap recommendations', description: 'Suggest which fields to enrich for an outcome.', stage: 'Next' },
      { id: 'F-296', name: 'Spend-optimization advisor', description: 'Recommend cheaper paths to the same result.', stage: 'Next' },
      { id: 'F-297', name: 'Query cost estimation', description: 'Predict a job\'s cost and match rate up front.', stage: 'Next' },
      { id: 'F-298', name: 'Explainable match reasoning', description: 'Plain-language why-this-matched for each record.', stage: 'Next' },
      { id: 'F-299', name: 'Fraud-pattern detection', description: 'Spot abusive usage with learned patterns.', stage: 'Next' },
      { id: 'F-300', name: 'Support answer assistant', description: 'Answer product questions from the docs corpus.', stage: 'Later' },
      { id: 'F-301', name: 'Model-choice transparency', description: 'Show which model and inputs produced an insight.', stage: 'Later' },
      { id: 'F-302', name: 'Guardrailed AI actions', description: 'Keep AI suggestions state-aware and reversible.', stage: 'Next' },
    ],
  },
  {
    name: 'Security & Threat Protection',
    blurb: 'Keeping the gateway and accounts hard to abuse.',
    features: [
      { id: 'F-303', name: 'Web application firewall', description: 'Block injection and malformed-request attacks.', stage: 'Now' },
      { id: 'F-304', name: 'Bot & scraper detection', description: 'Distinguish automated abuse from real traffic.', stage: 'Next' },
      { id: 'F-305', name: 'DDoS mitigation', description: 'Absorb and shed volumetric attacks.', stage: 'Next' },
      { id: 'F-306', name: 'Brute-force login protection', description: 'Lock out credential-stuffing attempts.', stage: 'Now' },
      { id: 'F-307', name: 'Anomalous-usage detection', description: 'Flag sudden geographic or pattern shifts.', stage: 'Next' },
      { id: 'F-308', name: 'Secret leak detection', description: 'Scan for exposed keys and auto-alert.', stage: 'Next' },
      { id: 'F-309', name: 'MFA enforcement', description: 'Require multi-factor auth for console access.', stage: 'Now' },
      { id: 'F-310', name: 'Session management', description: 'View and revoke active sessions per user.', stage: 'Now' },
      { id: 'F-311', name: 'Device & location awareness', description: 'Alert on logins from new devices or regions.', stage: 'Next' },
      { id: 'F-312', name: 'Encryption in transit & at rest', description: 'TLS everywhere and encrypted storage.', stage: 'Now' },
      { id: 'F-313', name: 'Field-level PII masking', description: 'Mask sensitive fields for live keys by default.', stage: 'Now' },
      { id: 'F-314', name: 'Payload size & depth limits', description: 'Reject oversized or deeply nested requests.', stage: 'Now' },
      { id: 'F-315', name: 'Content-security policy', description: 'Harden the console against XSS.', stage: 'Now' },
      { id: 'F-316', name: 'Vulnerability disclosure program', description: 'A clear path for researchers to report bugs.', stage: 'Later' },
      { id: 'F-317', name: 'Penetration-test reports', description: 'Share summarized pentest results with buyers.', stage: 'Later' },
      { id: 'F-318', name: 'Security event feed', description: 'Stream security-relevant events to a SIEM.', stage: 'Later' },
      { id: 'F-319', name: 'Automated dependency scanning', description: 'Catch vulnerable packages before release.', stage: 'Next' },
      { id: 'F-320', name: 'IP reputation blocking', description: 'Block known-malicious source addresses.', stage: 'Next' },
      { id: 'F-321', name: 'API keys hashed at rest', description: 'Store only a hash, never the plaintext secret.', stage: 'Now' },
      { id: 'F-322', name: 'PII redaction in internal logs', description: 'Automatically strip PII from internal logging.', stage: 'Now' },
      { id: 'F-323', name: 'Public bug bounty program', description: 'A rewarded channel for researchers to report bugs.', stage: 'Next' },
    ],
  },
  {
    name: 'Privacy, Compliance & Governance',
    blurb: 'Enrichment done lawfully, auditable end to end.',
    features: [
      { id: 'F-324', name: 'GDPR data-subject requests', description: 'Handle access, deletion, and portability requests.', stage: 'Next' },
      { id: 'F-325', name: 'CCPA / CPRA compliance', description: 'Honor do-not-sell and California rights.', stage: 'Next' },
      { id: 'F-326', name: 'Consent & lawful-basis tracking', description: 'Record the legal basis for each data source.', stage: 'Later' },
      { id: 'F-327', name: 'Suppression & do-not-contact', description: 'Global suppression enforced across all outputs.', stage: 'Next' },
      { id: 'F-328', name: 'PII redaction controls', description: 'Configure which fields are ever returned.', stage: 'Now' },
      { id: 'F-329', name: 'Data residency options', description: 'Pin storage and processing to a region.', stage: 'Later' },
      { id: 'F-330', name: 'Right-to-be-forgotten API', description: 'Programmatically purge an individual on request.', stage: 'Next' },
      { id: 'F-331', name: 'Purpose limitation tags', description: 'Restrict how enriched data may be used.', stage: 'Later' },
      { id: 'F-332', name: 'Data processing agreements', description: 'Self-serve DPA generation and signing.', stage: 'Next' },
      { id: 'F-333', name: 'Sub-processor registry', description: 'Public list of who touches customer data.', stage: 'Next' },
      { id: 'F-334', name: 'Retention policy controls', description: 'Set and enforce data-retention windows.', stage: 'Next' },
      { id: 'F-335', name: 'Audit-ready access logs', description: 'Immutable logs of who accessed what data.', stage: 'Now' },
      { id: 'F-336', name: 'Compliance center', description: 'One place for certifications and policies.', stage: 'Next' },
      { id: 'F-337', name: 'SOC 2 / ISO evidence', description: 'Downloadable trust documentation.', stage: 'Later' },
      { id: 'F-338', name: 'Source lawfulness attestation', description: 'Certify each source\'s collection lawfulness.', stage: 'Later' },
      { id: 'F-339', name: 'Sensitive-data category controls', description: 'Extra gating on special-category attributes.', stage: 'Later' },
      { id: 'F-340', name: 'Cross-border transfer safeguards', description: 'SCC-backed transfers with documentation.', stage: 'Later' },
      { id: 'F-341', name: 'Privacy-by-default settings', description: 'Ship every account locked down, opt-in to expand.', stage: 'Now' },
      { id: 'F-342', name: 'DPDP (India) compliance', description: 'Honor India\'s Digital Personal Data Protection Act.', stage: 'Next' },
      { id: 'F-343', name: 'Opt-out propagation', description: 'Push a person\'s opt-out across all cached data end to end.', stage: 'Next' },
      { id: 'F-344', name: 'MSA tracking', description: 'Store and reference signed master service agreements.', stage: 'Later' },
      { id: 'F-345', name: 'Legal center', description: 'Terms, SLAs, and privacy policy in one canonical place.', stage: 'Next' },
      { id: 'F-346', name: 'Differential-privacy aggregates', description: 'Add noise so aggregate APIs can\'t leak individuals.', stage: 'Later' },
      { id: 'F-347', name: 'Self-serve mutual NDA', description: 'Sign a standard mutual NDA without back-and-forth.', stage: 'Later' },
      { id: 'F-348', name: 'Security questionnaire library', description: 'Download completed vendor security questionnaires.', stage: 'Next' },
      { id: 'F-349', name: 'Data IP-ownership terms', description: 'Document who owns the data the API generates.', stage: 'Later' },
      { id: 'F-350', name: 'Service sunset protocol', description: 'A published data-transition plan if the service ends.', stage: 'Later' },
    ],
  },
  {
    name: 'RBAC & Team Management',
    blurb: 'Who can do what, scoped to the organization.',
    features: [
      { id: 'F-351', name: 'Role-based access control', description: 'Admin, developer, and billing roles out of the box.', stage: 'Now' },
      { id: 'F-352', name: 'Custom roles & permissions', description: 'Compose granular permission sets.', stage: 'Later' },
      { id: 'F-353', name: 'Member invitations', description: 'Invite teammates by email with a role.', stage: 'Now' },
      { id: 'F-354', name: 'Pending-invite management', description: 'Track, resend, and revoke invitations.', stage: 'Now' },
      { id: 'F-355', name: 'Per-resource permissions', description: 'Scope access to specific projects or keys.', stage: 'Next' },
      { id: 'F-356', name: 'Approval workflows', description: 'Require sign-off for sensitive actions.', stage: 'Later' },
      { id: 'F-357', name: 'Just-in-time access', description: 'Grant temporary elevated access with expiry.', stage: 'Later' },
      { id: 'F-358', name: 'Activity attribution', description: 'Show who did what across the account.', stage: 'Now' },
      { id: 'F-359', name: 'Ownership transfer', description: 'Reassign account ownership safely.', stage: 'Next' },
      { id: 'F-360', name: 'Guest / limited access', description: 'Read-only access for external collaborators.', stage: 'Later' },
      { id: 'F-361', name: 'Bulk role assignment', description: 'Change many members\' roles at once.', stage: 'Later' },
      { id: 'F-362', name: 'Access review reminders', description: 'Prompt admins to re-certify access periodically.', stage: 'Later' },
      { id: 'F-363', name: 'Deactivate vs. delete member', description: 'Suspend access without losing history.', stage: 'Next' },
      { id: 'F-364', name: 'Least-privilege defaults', description: 'New members start with the minimum needed.', stage: 'Now' },
      { id: 'F-365', name: 'SSO group-to-role mapping', description: 'Auto-assign roles from your identity provider\'s groups.', stage: 'Later' },
      { id: 'F-366', name: 'Break-glass admin access', description: 'Emergency access with mandatory audit logging.', stage: 'Later' },
      { id: 'F-367', name: 'SAML / OIDC single sign-on', description: 'Enterprise SSO into the console.', stage: 'Next' },
    ],
  },
  {
    name: 'Multi-Tenancy & Organizations',
    blurb: 'Clean separation and easy movement between contexts.',
    features: [
      { id: 'F-368', name: 'Multiple organizations per user', description: 'Belong to many orgs, switch in one click.', stage: 'Now' },
      { id: 'F-369', name: 'Org context switcher', description: 'Everything re-scopes when you change orgs.', stage: 'Now' },
      { id: 'F-370', name: 'Isolated data per tenant', description: 'Hard boundaries between organizations\' data.', stage: 'Now' },
      { id: 'F-371', name: 'Sub-accounts / workspaces', description: 'Nest teams and projects under one org.', stage: 'Next' },
      { id: 'F-372', name: 'Per-org billing & limits', description: 'Independent plans and quotas per organization.', stage: 'Now' },
      { id: 'F-373', name: 'Org-level branding', description: 'Custom name and logo in the console.', stage: 'Later' },
      { id: 'F-374', name: 'Cross-org reporting', description: 'Roll up usage across owned organizations.', stage: 'Later' },
      { id: 'F-375', name: 'Tenant provisioning API', description: 'Create and configure orgs programmatically.', stage: 'Later' },
      { id: 'F-376', name: 'Org merge & split', description: 'Combine or separate organizations cleanly.', stage: 'Later' },
      { id: 'F-377', name: 'Default org preference', description: 'Land in your primary org on login.', stage: 'Now' },
      { id: 'F-378', name: 'Per-org data-residency', description: 'Choose a storage region per organization.', stage: 'Later' },
      { id: 'F-379', name: 'Org deletion & offboarding', description: 'Export then fully purge an organization.', stage: 'Next' },
      { id: 'F-380', name: 'Cross-org key isolation', description: 'Guarantee a key never reads another org\'s data.', stage: 'Now' },
      { id: 'F-381', name: 'Org-scoped audit exports', description: 'Export the audit trail for a single organization.', stage: 'Later' },
    ],
  },
  {
    name: 'Onboarding & Activation',
    blurb: 'From signup to a real integration, guided.',
    features: [
      { id: 'F-382', name: 'Guided setup checklist', description: 'A tracked path to first value.', stage: 'Now' },
      { id: 'F-383', name: 'First-call wizard', description: 'Hand-hold the very first successful API call.', stage: 'Now' },
      { id: 'F-384', name: 'Interactive product tour', description: 'Contextual walkthrough of the console.', stage: 'Now' },
      { id: 'F-385', name: 'Sample data playground', description: 'Explore realistic responses before integrating.', stage: 'Now' },
      { id: 'F-386', name: 'Use-case starting points', description: 'Pick a goal and get a tailored setup.', stage: 'Next' },
      { id: 'F-387', name: 'Progress-based nudges', description: 'Nudge toward the next unfinished step.', stage: 'Next' },
      { id: 'F-388', name: 'Environment setup helper', description: 'Generate keys and env vars for your stack.', stage: 'Now' },
      { id: 'F-389', name: 'Import-your-list onboarding', description: 'Start by enriching a file you already have.', stage: 'Now' },
      { id: 'F-390', name: 'Time-to-first-call tracking', description: 'Measure and shorten activation time.', stage: 'Next' },
      { id: 'F-391', name: 'Welcome email sequence', description: 'Staged emails that drive activation.', stage: 'Next' },
      { id: 'F-392', name: 'In-product empty states', description: 'Every empty screen suggests a next action.', stage: 'Now' },
      { id: 'F-393', name: 'Role-tailored onboarding', description: 'Different first steps for dev vs. billing.', stage: 'Later' },
      { id: 'F-394', name: 'Reactivation flows', description: 'Win back dormant accounts with context.', stage: 'Later' },
      { id: 'F-395', name: 'Onboarding analytics', description: 'See where new users drop off.', stage: 'Next' },
      { id: 'F-396', name: 'Sandbox-to-production graduation', description: 'A clear moment to flip on live keys.', stage: 'Next' },
      { id: 'F-397', name: 'Team invite prompt', description: 'Nudge to bring teammates in early.', stage: 'Next' },
    ],
  },
  {
    name: 'Documentation & Learning',
    blurb: 'Docs that answer the question at the point of need.',
    features: [
      { id: 'F-398', name: 'Versioned API reference', description: 'Auto-generated reference from the OpenAPI spec.', stage: 'Now' },
      { id: 'F-399', name: 'Guides & tutorials', description: 'Task-oriented how-tos for common jobs.', stage: 'Now' },
      { id: 'F-400', name: 'Runnable code examples', description: 'Every example executes against your key.', stage: 'Now' },
      { id: 'F-401', name: 'Searchable docs', description: 'Fast full-text search across all docs.', stage: 'Now' },
      { id: 'F-402', name: 'Recipes / cookbook', description: 'End-to-end solutions to real GTM problems.', stage: 'Next' },
      { id: 'F-403', name: 'Concept explainers', description: 'Match rates, waterfalls, and identity, explained.', stage: 'Next' },
      { id: 'F-404', name: 'Error reference', description: 'Every error code with cause and fix.', stage: 'Now' },
      { id: 'F-405', name: 'Changelog & release notes', description: 'What shipped, when, and how to adopt it.', stage: 'Now' },
      { id: 'F-406', name: 'API design principles', description: 'Document the contracts and guarantees.', stage: 'Later' },
      { id: 'F-407', name: 'Video walkthroughs', description: 'Short screencasts for key flows.', stage: 'Later' },
      { id: 'F-408', name: 'Community Q&A', description: 'Ask and answer integration questions.', stage: 'Later' },
      { id: 'F-409', name: 'Contextual help drawer', description: 'Docs surfaced inline where you\'re working.', stage: 'Next' },
      { id: 'F-410', name: 'Glossary & data dictionary', description: 'Define every term and field precisely.', stage: 'Now' },
      { id: 'F-411', name: 'Localized documentation', description: 'Docs in multiple languages.', stage: 'Later' },
      { id: 'F-412', name: 'Copy-as-cURL everywhere', description: 'Turn any console action into a runnable request.', stage: 'Next' },
      { id: 'F-413', name: 'Docs feedback & rating', description: 'Let readers flag unclear or outdated pages.', stage: 'Later' },
      { id: 'F-414', name: 'Copy-pasteable auth examples', description: 'Working auth snippets for every SDK and cURL.', stage: 'Now' },
      { id: 'F-415', name: 'Architecture & data-flow diagrams', description: 'Show how a request flows through the platform.', stage: 'Later' },
      { id: 'F-416', name: 'Competitor migration guides', description: 'Step-by-step moves from rival APIs.', stage: 'Next' },
      { id: 'F-417', name: 'Copy-to-clipboard code blocks', description: 'One-click copy on every snippet in the docs.', stage: 'Now' },
      { id: 'F-418', name: 'Run-in-Postman buttons', description: 'One-click import of any endpoint into Postman.', stage: 'Next' },
      { id: 'F-419', name: 'Null / empty / undefined semantics', description: 'Document exactly how absent fields behave.', stage: 'Next' },
    ],
  },
  {
    name: 'Console UX & Design System',
    blurb: 'A dense, fast, beautiful operator surface.',
    features: [
      { id: 'F-420', name: 'Semantic design tokens', description: 'One token system across light and dark.', stage: 'Now' },
      { id: 'F-421', name: 'Full dark mode', description: 'First-class dark theme, not an afterthought.', stage: 'Now' },
      { id: 'F-422', name: 'Skeleton loading states', description: 'No blank screens or layout shift, ever.', stage: 'Now' },
      { id: 'F-423', name: 'Empty-state design', description: 'Every empty view is helpful, not barren.', stage: 'Now' },
      { id: 'F-424', name: 'Error-state design', description: 'Clear, actionable failure screens.', stage: 'Now' },
      { id: 'F-425', name: 'Keyboard-first navigation', description: 'Drive the whole console without a mouse.', stage: 'Next' },
      { id: 'F-426', name: 'Command palette actions', description: 'Run actions, not just navigate, from ⌘K.', stage: 'Now' },
      { id: 'F-427', name: 'Responsive layouts', description: 'Works from wide monitors to laptops.', stage: 'Now' },
      { id: 'F-428', name: 'Micro-interactions', description: 'Interactive elements feel alive and responsive.', stage: 'Now' },
      { id: 'F-429', name: 'Reusable UI primitives', description: 'Cards, tables, drawers, and modals as a kit.', stage: 'Now' },
      { id: 'F-430', name: 'Data-dense tables', description: 'Sortable, filterable, virtualized grids.', stage: 'Next' },
      { id: 'F-431', name: 'Inline editing', description: 'Edit records and settings in place.', stage: 'Next' },
      { id: 'F-432', name: 'Toast & notification system', description: 'Consistent, non-blocking feedback.', stage: 'Now' },
      { id: 'F-433', name: 'Saved views & layouts', description: 'Persist how each user arranges their console.', stage: 'Later' },
      { id: 'F-434', name: 'Accessibility (WCAG AA)', description: 'Contrast, focus, and screen-reader support.', stage: 'Next' },
      { id: 'F-435', name: 'Density & theme preferences', description: 'Compact/comfortable and theme choices.', stage: 'Later' },
    ],
  },
  {
    name: 'Reliability & Infrastructure',
    blurb: 'Being fast and up when it matters.',
    features: [
      { id: 'F-436', name: 'Public status page', description: 'Real-time component health and incidents.', stage: 'Now' },
      { id: 'F-437', name: 'Uptime SLA', description: 'Committed availability with credits on breach.', stage: 'Next' },
      { id: 'F-438', name: 'Multi-region failover', description: 'Survive a regional outage transparently.', stage: 'Later' },
      { id: 'F-439', name: 'Graceful degradation', description: 'Serve cached/partial data when upstreams fail.', stage: 'Next' },
      { id: 'F-440', name: 'Autoscaling gateway', description: 'Scale to traffic spikes without manual ops.', stage: 'Next' },
      { id: 'F-441', name: 'Incident communication', description: 'Proactive, honest incident updates.', stage: 'Now' },
      { id: 'F-442', name: 'Maintenance windows', description: 'Scheduled, announced, low-impact maintenance.', stage: 'Next' },
      { id: 'F-443', name: 'Request timeout controls', description: 'Predictable timeouts with clear errors.', stage: 'Now' },
      { id: 'F-444', name: 'Backpressure handling', description: 'Shed load cleanly instead of collapsing.', stage: 'Next' },
      { id: 'F-445', name: 'Disaster recovery', description: 'Tested backups and recovery runbooks.', stage: 'Later' },
      { id: 'F-446', name: 'Edge caching', description: 'Serve hot data close to the caller.', stage: 'Next' },
      { id: 'F-447', name: 'Zero-downtime deploys', description: 'Ship without dropping requests.', stage: 'Next' },
      { id: 'F-448', name: 'Capacity forecasting', description: 'Predict and provision ahead of demand.', stage: 'Later' },
      { id: 'F-449', name: 'Chaos & failure testing', description: 'Regularly test failure modes in staging.', stage: 'Later' },
      { id: 'F-450', name: 'Latency budgets per endpoint', description: 'Enforce internal latency targets.', stage: 'Later' },
      { id: 'F-451', name: 'Postmortems shared publicly', description: 'Transparent root-cause writeups.', stage: 'Later' },
      { id: 'F-452', name: 'Regional data-residency infra', description: 'Physically isolated regional processing.', stage: 'Later' },
      { id: 'F-453', name: 'Real-time infra dashboard', description: 'Internal view of gateway health for on-call.', stage: 'Next' },
    ],
  },
  {
    name: 'Data Export & Portability',
    blurb: 'Your data leaves as easily as it arrives.',
    features: [
      { id: 'F-454', name: 'CSV & Excel export', description: 'Download any result set in a click.', stage: 'Now' },
      { id: 'F-455', name: 'JSON / NDJSON export', description: 'Machine-friendly bulk export formats.', stage: 'Now' },
      { id: 'F-456', name: 'Scheduled exports', description: 'Auto-deliver exports on a schedule.', stage: 'Next' },
      { id: 'F-457', name: 'Warehouse sync', description: 'Continuous sync to BigQuery/Snowflake/Redshift.', stage: 'Later' },
      { id: 'F-458', name: 'S3 / GCS delivery', description: 'Drop exports into your own bucket.', stage: 'Later' },
      { id: 'F-459', name: 'Full account data export', description: 'One archive of everything you own.', stage: 'Next' },
      { id: 'F-460', name: 'Selective field export', description: 'Choose exactly which columns to include.', stage: 'Now' },
      { id: 'F-461', name: 'Export history & re-download', description: 'Re-fetch any past export.', stage: 'Next' },
      { id: 'F-462', name: 'Streaming large exports', description: 'Export millions of rows without timeouts.', stage: 'Later' },
      { id: 'F-463', name: 'Export encryption', description: 'PGP-encrypt sensitive exports.', stage: 'Later' },
      { id: 'F-464', name: 'Enriched-file download', description: 'Get your uploaded file back, enriched.', stage: 'Now' },
      { id: 'F-465', name: 'Open-format guarantees', description: 'No proprietary lock-in on your data.', stage: 'Next' },
      { id: 'F-466', name: 'Column-mapping on export', description: 'Rename and reorder fields as you export.', stage: 'Next' },
      { id: 'F-467', name: 'Export audit log', description: 'Record who exported what and when.', stage: 'Later' },
    ],
  },
  {
    name: 'Support & Customer Success',
    blurb: 'Help that reaches the user where they are.',
    features: [
      { id: 'F-468', name: 'In-app support widget', description: 'Ask for help without leaving the console.', stage: 'Now' },
      { id: 'F-469', name: 'Ticketing & case history', description: 'Track every request to resolution.', stage: 'Now' },
      { id: 'F-470', name: 'Context-attached tickets', description: 'Attach the failing request to a ticket.', stage: 'Next' },
      { id: 'F-471', name: 'Priority support tiers', description: 'Faster response on higher plans.', stage: 'Next' },
      { id: 'F-472', name: 'Live chat', description: 'Real-time help during business hours.', stage: 'Later' },
      { id: 'F-473', name: 'Status-aware support', description: 'Suppress noise during known incidents.', stage: 'Next' },
      { id: 'F-474', name: 'Health-check / success reviews', description: 'Proactive account reviews for key customers.', stage: 'Later' },
      { id: 'F-475', name: 'In-product feedback capture', description: 'Collect feature signals inline.', stage: 'Now' },
      { id: 'F-476', name: 'Knowledge base', description: 'Self-serve answers to common issues.', stage: 'Now' },
      { id: 'F-477', name: 'SLA-backed response times', description: 'Committed first-response windows.', stage: 'Next' },
      { id: 'F-478', name: 'Escalation paths', description: 'Clear routes for urgent production issues.', stage: 'Next' },
      { id: 'F-479', name: 'Onboarding concierge', description: 'White-glove setup for enterprise.', stage: 'Later' },
      { id: 'F-480', name: 'CSAT & NPS capture', description: 'Measure satisfaction at the right moments.', stage: 'Next' },
      { id: 'F-481', name: 'Dedicated Slack Connect', description: 'Shared channel for enterprise accounts.', stage: 'Later' },
      { id: 'F-482', name: 'Public feature request board', description: 'Let developers post and vote on requests.', stage: 'Next' },
    ],
  },
  {
    name: 'Marketplace & Ecosystem',
    blurb: 'Growing value beyond what Zinbit ships itself.',
    features: [
      { id: 'F-483', name: 'Integration marketplace', description: 'Discover and install connectors.', stage: 'Next' },
      { id: 'F-484', name: 'Partner directory', description: 'Certified agencies and consultants.', stage: 'Later' },
      { id: 'F-485', name: 'Template gallery', description: 'Shareable pipelines and workflows.', stage: 'Later' },
      { id: 'F-486', name: 'Community-built connectors', description: 'Third parties publish integrations.', stage: 'Later' },
      { id: 'F-487', name: 'App submission & review', description: 'A path for partners to list apps.', stage: 'Later' },
      { id: 'F-488', name: 'Revenue-share for partners', description: 'Pay partners for referred usage.', stage: 'Later' },
      { id: 'F-489', name: 'Data-provider marketplace', description: 'Plug additional data sources in.', stage: 'Later' },
      { id: 'F-490', name: 'Certified badge program', description: 'Verify partner quality publicly.', stage: 'Later' },
      { id: 'F-491', name: 'OAuth app publishing', description: 'Publish an app that others can install.', stage: 'Later' },
      { id: 'F-492', name: 'Usage-based partner tiers', description: 'Reward high-volume partners.', stage: 'Later' },
      { id: 'F-493', name: 'Public API for the ecosystem', description: 'Let partners build on platform data.', stage: 'Later' },
      { id: 'F-494', name: 'Featured integrations', description: 'Curate and promote top connectors.', stage: 'Next' },
      { id: 'F-495', name: 'Sandbox for partners', description: 'A safe environment to build against.', stage: 'Later' },
      { id: 'F-496', name: 'Ecosystem changelog', description: 'Announce new marketplace additions.', stage: 'Later' },
      { id: 'F-497', name: 'White-labeled docs portals', description: 'Reseller-branded documentation sites.', stage: 'Later' },
      { id: 'F-498', name: 'Snowflake Marketplace listing', description: 'List enrichment data on Snowflake Marketplace.', stage: 'Later' },
      { id: 'F-499', name: 'AWS Data Exchange listing', description: 'Distribute datasets via AWS Data Exchange.', stage: 'Later' },
      { id: 'F-500', name: 'No-code embeddable widget builder', description: 'Generate embeddable HTML widgets in the UI.', stage: 'Later' },
      { id: 'F-501', name: 'Co-marketing asset library', description: 'Logos and brand guidelines for partners.', stage: 'Later' },
      { id: 'F-502', name: 'Developer certification program', description: 'Certify and badge developers on the platform.', stage: 'Later' },
    ],
  },
  {
    name: 'Growth, PLG & Virality',
    blurb: 'The product selling and expanding itself.',
    features: [
      { id: 'F-503', name: 'Free tier / trial', description: 'Real value before any credit card.', stage: 'Now' },
      { id: 'F-504', name: 'In-product upgrade prompts', description: 'Contextual nudges at the value moment.', stage: 'Now' },
      { id: 'F-505', name: 'Referral program', description: 'Reward users for bringing teammates and peers.', stage: 'Next' },
      { id: 'F-506', name: 'Usage-based expansion signals', description: 'Spot accounts ready to grow.', stage: 'Next' },
      { id: 'F-507', name: 'Shareable enrichment results', description: 'Share a lookup with a coworker.', stage: 'Later' },
      { id: 'F-508', name: 'Public data widgets', description: 'Embeddable enrichment demos.', stage: 'Later' },
      { id: 'F-509', name: 'Product-qualified lead scoring', description: 'Surface accounts sales should call.', stage: 'Next' },
      { id: 'F-510', name: 'Milestone celebrations', description: 'Celebrate first call, first 1k, etc.', stage: 'Next' },
      { id: 'F-511', name: 'Email lifecycle campaigns', description: 'Behavior-triggered nurture emails.', stage: 'Next' },
      { id: 'F-512', name: 'In-product changelog', description: 'Show users what\'s new where they work.', stage: 'Now' },
      { id: 'F-513', name: 'Waitlist & early access', description: 'Gate and drum up demand for betas.', stage: 'Later' },
      { id: 'F-514', name: 'Viral share loops', description: 'Enriched outputs that invite new users.', stage: 'Later' },
      { id: 'F-515', name: 'Reverse-trial mechanics', description: 'Start on premium, downgrade after trial.', stage: 'Later' },
      { id: 'F-516', name: 'Feature-gate teasers', description: 'Show locked premium features tastefully.', stage: 'Next' },
      { id: 'F-517', name: 'Growth experiment framework', description: 'Run and measure activation experiments.', stage: 'Later' },
      { id: 'F-518', name: 'Telemetry-driven personalization', description: 'Tailor the console to how you use it.', stage: 'Next' },
      { id: 'F-519', name: 'Partner UTM attribution', description: 'Track signups from partner-embedded widgets.', stage: 'Later' },
      { id: 'F-520', name: 'Year-in-review reports', description: 'Personalized annual usage recaps for accounts.', stage: 'Later' },
      { id: 'F-521', name: 'Automated AE handoff triggers', description: 'Route high-volume self-serve users to sales.', stage: 'Next' },
      { id: 'F-522', name: 'Hackathon access toolkit', description: 'Temporary high-tier keys for sponsored events.', stage: 'Later' },
      { id: 'F-523', name: 'Case-study submission portal', description: 'Let happy customers submit their story.', stage: 'Later' },
    ],
  },
  {
    name: 'Reporting & Business Intelligence',
    blurb: 'Decisions leadership can make from the data.',
    features: [
      { id: 'F-524', name: 'Executive summary dashboard', description: 'One screen of the numbers that matter.', stage: 'Next' },
      { id: 'F-525', name: 'Custom report builder', description: 'Compose reports from any metric.', stage: 'Later' },
      { id: 'F-526', name: 'Scheduled report delivery', description: 'Email or Slack reports on a cadence.', stage: 'Next' },
      { id: 'F-527', name: 'ROI & value reporting', description: 'Tie enrichment to pipeline and revenue.', stage: 'Later' },
      { id: 'F-528', name: 'Data-quality scorecards', description: 'Track accuracy and coverage over time.', stage: 'Next' },
      { id: 'F-529', name: 'Spend forecasting', description: 'Project future cost from usage trends.', stage: 'Next' },
      { id: 'F-530', name: 'Cohort analysis', description: 'Compare usage across account cohorts.', stage: 'Later' },
      { id: 'F-531', name: 'Benchmarking vs. peers', description: 'Anonymous comparison to similar teams.', stage: 'Later' },
      { id: 'F-532', name: 'Exportable board decks', description: 'Ready-to-present usage and value slides.', stage: 'Later' },
      { id: 'F-533', name: 'Match-rate by segment', description: 'Where enrichment works best for you.', stage: 'Next' },
      { id: 'F-534', name: 'Team-productivity metrics', description: 'Who\'s driving enrichment value.', stage: 'Later' },
      { id: 'F-535', name: 'Alert-driven reporting', description: 'Reports that fire on threshold breaches.', stage: 'Next' },
      { id: 'F-536', name: 'Warehouse-native BI', description: 'Query raw events in your own BI tool.', stage: 'Later' },
      { id: 'F-537', name: 'Goal tracking', description: 'Set and track usage and outcome goals.', stage: 'Later' },
    ],
  },
  {
    name: 'Collaboration & Sharing',
    blurb: 'Enrichment as a team sport.',
    features: [
      { id: 'F-538', name: 'Shared projects', description: 'Group keys, jobs, and lists by initiative.', stage: 'Next' },
      { id: 'F-539', name: 'Comments & annotations', description: 'Discuss a record or job in context.', stage: 'Later' },
      { id: 'F-540', name: 'Shared saved searches', description: 'Publish a segment for the whole team.', stage: 'Next' },
      { id: 'F-541', name: 'Shareable dashboards', description: 'Send a read-only view to a stakeholder.', stage: 'Later' },
      { id: 'F-542', name: 'Handoff & assignment', description: 'Assign a job or list to a teammate.', stage: 'Later' },
      { id: 'F-543', name: 'Activity feed', description: 'See what the team is doing across the org.', stage: 'Next' },
      { id: 'F-544', name: '@mentions & notifications', description: 'Pull a colleague into the right place.', stage: 'Later' },
      { id: 'F-545', name: 'Version history on lists', description: 'See and restore prior list states.', stage: 'Later' },
      { id: 'F-546', name: 'Templates library', description: 'Share reusable pipelines internally.', stage: 'Later' },
      { id: 'F-547', name: 'Export-with-note sharing', description: 'Share an export with context attached.', stage: 'Later' },
      { id: 'F-548', name: 'Read-only sharing links', description: 'Grant scoped view access via a link.', stage: 'Next' },
      { id: 'F-549', name: 'Real-time presence', description: 'See who else is viewing a resource.', stage: 'Later' },
      { id: 'F-550', name: 'Shared credit pools', description: 'Let teams draw from a common credit balance.', stage: 'Next' },
      { id: 'F-551', name: 'Cross-team request bookmarks', description: 'Save and share notable requests for review.', stage: 'Later' },
    ],
  },
  {
    name: 'Mobile, Notifications & Trust',
    blurb: 'Reaching users off-console, and earning their trust.',
    features: [
      { id: 'F-552', name: 'Notification center', description: 'One inbox for every platform alert.', stage: 'Now' },
      { id: 'F-553', name: 'Multi-channel delivery', description: 'Email, Slack, webhook, and in-app.', stage: 'Next' },
      { id: 'F-554', name: 'Notification preferences', description: 'Per-event, per-channel granularity.', stage: 'Next' },
      { id: 'F-555', name: 'Low-balance alerts', description: 'Warn before credits run out.', stage: 'Now' },
      { id: 'F-556', name: 'Quota & limit alerts', description: 'Notify before a hard throttle hits.', stage: 'Now' },
      { id: 'F-557', name: 'Incident & status alerts', description: 'Push status changes to subscribers.', stage: 'Next' },
      { id: 'F-558', name: 'Mobile-responsive console', description: 'Operate the essentials from a phone.', stage: 'Next' },
      { id: 'F-559', name: 'Native mobile app', description: 'On-the-go monitoring and approvals.', stage: 'Later' },
      { id: 'F-560', name: 'Digest vs. real-time modes', description: 'Batch low-priority alerts into digests.', stage: 'Next' },
      { id: 'F-561', name: 'Public trust center', description: 'Security, privacy, and uptime in one place.', stage: 'Next' },
      { id: 'F-562', name: 'Subprocessor change alerts', description: 'Notify customers of vendor changes.', stage: 'Later' },
      { id: 'F-563', name: 'Certification badges', description: 'Display SOC 2 / ISO / GDPR status.', stage: 'Later' },
      { id: 'F-564', name: 'Snooze & mute controls', description: 'Silence noisy alerts temporarily.', stage: 'Next' },
      { id: 'F-565', name: 'Escalation on critical alerts', description: 'Page the right person for outages.', stage: 'Later' },
      { id: 'F-566', name: 'Do-not-disturb schedules', description: 'Respect off-hours for non-urgent alerts.', stage: 'Later' },
      { id: 'F-567', name: 'Signed status attestations', description: 'Cryptographically verifiable uptime history.', stage: 'Later' },
    ],
  },
  {
    name: 'Marketing Site & Conversion',
    blurb: 'The public site\'s job: prove value fast and turn a visitor into a first call.',
    features: [
      { id: 'F-568', name: 'API value proposition above the fold', description: 'A sharp value promise and proof visible before any scroll.', stage: 'Now' },
      { id: 'F-569', name: 'Interactive hero terminal', description: 'Live cURL, Python, and Node snippets that run from the homepage.', stage: 'Now' },
      { id: 'F-570', name: 'Public interactive API playground', description: 'Try a real enrichment call before signing up.', stage: 'Now' },
      { id: 'F-571', name: 'Frictionless sandbox signup', description: 'Self-serve to a sandbox key with no sales gate.', stage: 'Now' },
      { id: 'F-572', name: 'Engineering blog', description: 'Deep technical posts that earn developer trust.', stage: 'Next' },
      { id: 'F-573', name: 'Community forum & Discord', description: 'A public place for developers to ask and answer.', stage: 'Next' },
      { id: 'F-574', name: 'Technical buyer FAQ', description: 'Answers the security, scale, and pricing questions buyers ask.', stage: 'Next' },
    ],
  },
  {
    name: 'Platform Operations & Admin Intelligence',
    blurb: 'The internal cockpit — running, pricing, and protecting the platform behind the scenes.',
    features: [
      { id: 'F-575', name: 'Super-admin account impersonation', description: 'Securely act as a partner account to debug issues.', stage: 'Next' },
      { id: 'F-576', name: 'Per-partner profitability dashboard', description: 'Track each account\'s data and compute cost against revenue.', stage: 'Next' },
      { id: 'F-577', name: 'Per-partner usage anomaly alerts', description: 'Flag sudden spikes or drops in an account\'s traffic.', stage: 'Next' },
      { id: 'F-578', name: 'Ghost-endpoint (404) tracking', description: 'Log guessed routes to learn what developers expect.', stage: 'Later' },
      { id: 'F-579', name: 'Feature-flag management', description: 'Roll new endpoints to beta cohorts safely.', stage: 'Next' },
      { id: 'F-580', name: 'Schema-drift detection', description: 'Alert when a response payload\'s shape changes unexpectedly.', stage: 'Later' },
      { id: 'F-581', name: 'VIP rate-limit overrides', description: 'Lift limits for enterprise accounts without a deploy.', stage: 'Next' },
      { id: 'F-582', name: 'Support credit & quota tooling', description: 'Let support issue temp credits or extend quotas instantly.', stage: 'Next' },
      { id: 'F-583', name: 'Billing reconciliation engine', description: 'Reconcile metered usage against invoices for finance.', stage: 'Next' },
      { id: 'F-584', name: 'Shadow-traffic deployment', description: 'Mirror live traffic to v2 without returning its response.', stage: 'Later' },
      { id: 'F-585', name: 'Source-data freshness monitoring', description: 'Watch how stale the underlying datasets are getting.', stage: 'Next' },
      { id: 'F-586', name: 'Internal engineering SLOs', description: 'Track and enforce internal targets for resolving errors.', stage: 'Later' },
      { id: 'F-587', name: 'Deprecation adoption tracking', description: 'See exactly which accounts still call v1 endpoints.', stage: 'Next' },
      { id: 'F-588', name: 'AI support-ticket clustering', description: 'Summarize the top integration hurdles from tickets.', stage: 'Later' },
      { id: 'F-589', name: 'Activation funnel analytics', description: 'Track signup to key to first call drop-off internally.', stage: 'Next' },
      { id: 'F-590', name: 'Internal Slack / PagerDuty alerting', description: 'Push platform alerts to on-call channels.', stage: 'Next' },
    ],
  },
];

export const ROADMAP_STAGES: FeatureStage[] = ['Now', 'Next', 'Later'];

export const ROADMAP_TOTAL = ROADMAP_AREAS.reduce((n, a) => n + a.features.length, 0);

export function roadmapStageCounts(): Record<FeatureStage, number> {
  const counts: Record<FeatureStage, number> = { Now: 0, Next: 0, Later: 0 };
  for (const area of ROADMAP_AREAS) {
    for (const f of area.features) counts[f.stage]++;
  }
  return counts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Logical build order
//
// The 32 areas above are grouped into dependency-ordered *phases*: each phase
// only relies on capabilities delivered by earlier phases. You cannot bill for
// the API before the gateway exists, cannot run a growth loop before onboarding,
// and so on. Within a phase, features are sequenced by product commitment
// (Now → Next → Later), then by area order, then by id — giving one deterministic
// 1..N sequence to build straight down.
// ─────────────────────────────────────────────────────────────────────────────

export interface BuildPhase {
  title: string;
  rationale: string;
  /** Area names (must match RoadmapArea.name) delivered in this phase, in build order. */
  areas: string[];
}

export const BUILD_PHASES: BuildPhase[] = [
  {
    title: 'Foundation — core data & gateway',
    rationale: 'The enrichment data and the request pipeline every other feature calls. Nothing works until this does.',
    areas: [
      'Data Enrichment Coverage',
      'Identity Resolution & Matching',
      'Data Quality & Accuracy',
      'API Gateway & Endpoints',
    ],
  },
  {
    title: 'Access, trust & safety',
    rationale: 'Authenticate, authorize, rate-limit, and protect the core before a single external request is allowed through.',
    areas: [
      'API Keys & Authentication',
      'Rate Limiting & Quotas',
      'Security & Threat Protection',
      'Privacy, Compliance & Governance',
    ],
  },
  {
    title: 'Monetization',
    rationale: 'Meter usage, price it, and charge for it — the business cannot run on an unmetered gateway.',
    areas: [
      'Billing & Monetization',
      'Pricing & Packaging',
      'Usage Analytics & Observability',
    ],
  },
  {
    title: 'Developer surface',
    rationale: 'How developers actually consume the metered, protected API: SDKs, an explorer, docs, and event delivery.',
    areas: [
      'Developer Experience & SDKs',
      'Search, Explorer & Discovery',
      'Documentation & Learning',
      'Webhooks & Events',
    ],
  },
  {
    title: 'Teams & tenancy',
    rationale: 'Turn a single-user key into an organization: roles, multi-tenant isolation, and the console shell they all live in.',
    areas: [
      'RBAC & Team Management',
      'Multi-Tenancy & Organizations',
      'Console UX & Design System',
    ],
  },
  {
    title: 'Extensibility & intelligence',
    rationale: 'Build on the public API and webhooks: connectors, automation pipelines, and the AI layer over the data.',
    areas: [
      'Integrations & Connectors',
      'Workflow Automation & Pipelines',
      'AI & Intelligence',
    ],
  },
  {
    title: 'Adoption & growth',
    rationale: 'With a complete, billable product in place, drive activation, virality, and top-of-funnel conversion.',
    areas: [
      'Onboarding & Activation',
      'Growth, PLG & Virality',
      'Marketing Site & Conversion',
    ],
  },
  {
    title: 'Scale & operate',
    rationale: 'Keep it reliable and supportable at volume: infrastructure, data portability, support, and reporting.',
    areas: [
      'Reliability & Infrastructure',
      'Data Export & Portability',
      'Support & Customer Success',
      'Reporting & Business Intelligence',
    ],
  },
  {
    title: 'Ecosystem & expansion',
    rationale: 'The moat: a marketplace, collaboration, mobile/trust surfaces, and internal admin intelligence.',
    areas: [
      'Marketplace & Ecosystem',
      'Collaboration & Sharing',
      'Mobile, Notifications & Trust',
      'Platform Operations & Admin Intelligence',
    ],
  },
];

const STAGE_RANK: Record<FeatureStage, number> = { Now: 0, Next: 1, Later: 2 };

export interface BuildOrderItem {
  seq: number;
  phaseIndex: number;
  phaseTitle: string;
  area: string;
  feature: RoadmapFeature;
}

/** The full 1..N build sequence: phase (dependency) → stage (commitment) → area → id. */
export function roadmapBuildOrder(): BuildOrderItem[] {
  // area name → { phaseIndex, areaRank within phase }
  const placement = new Map<string, { phaseIndex: number; areaRank: number }>();
  BUILD_PHASES.forEach((phase, phaseIndex) => {
    phase.areas.forEach((areaName, areaRank) => {
      placement.set(areaName, { phaseIndex, areaRank });
    });
  });

  const rows: Array<{
    phaseIndex: number;
    areaRank: number;
    stageRank: number;
    idNum: number;
    area: string;
    feature: RoadmapFeature;
  }> = [];

  ROADMAP_AREAS.forEach((area) => {
    // Areas not assigned to a phase sort to the very end, preserving determinism.
    const place = placement.get(area.name) ?? { phaseIndex: BUILD_PHASES.length, areaRank: 0 };
    area.features.forEach((feature) => {
      const idNum = parseInt(feature.id.replace(/\D/g, ''), 10) || 0;
      rows.push({
        phaseIndex: place.phaseIndex,
        areaRank: place.areaRank,
        stageRank: STAGE_RANK[feature.stage],
        idNum,
        area: area.name,
        feature,
      });
    });
  });

  rows.sort(
    (a, b) =>
      a.phaseIndex - b.phaseIndex ||
      a.stageRank - b.stageRank ||
      a.areaRank - b.areaRank ||
      a.idNum - b.idNum
  );

  return rows.map((r, i) => ({
    seq: i + 1,
    phaseIndex: r.phaseIndex,
    phaseTitle: BUILD_PHASES[r.phaseIndex]?.title ?? 'Unscheduled',
    area: r.area,
    feature: r.feature,
  }));
}

export interface BuildPhaseSummary {
  index: number;
  title: string;
  rationale: string;
  count: number;
  startSeq: number;
  endSeq: number;
  stages: Record<FeatureStage, number>;
}

/** Per-phase rollup: how many features, the sequence range, and the stage mix. */
export function roadmapBuildPhaseSummaries(): BuildPhaseSummary[] {
  const order = roadmapBuildOrder();
  return BUILD_PHASES.map((phase, index) => {
    const items = order.filter((o) => o.phaseIndex === index);
    const stages: Record<FeatureStage, number> = { Now: 0, Next: 0, Later: 0 };
    items.forEach((o) => stages[o.feature.stage]++);
    return {
      index,
      title: phase.title,
      rationale: phase.rationale,
      count: items.length,
      startSeq: items.length ? items[0].seq : 0,
      endSeq: items.length ? items[items.length - 1].seq : 0,
      stages,
    };
  });
}

# ICP & Personas

Zinbit's motion is **developer-first to land, enterprise governance to expand**. Every feature must delight the developer who signs up alone at 11pm *and* satisfy the enterprise buyer who inherits it six months later — without compromising either.

## The ICP

- **Company:** B2B SaaS / sales-tech / fintech / data teams that need identity & company enrichment at API scale. Sweet spot: Series A–D, 20–500 engineers, India-strong footprint with global ambitions.
- **Trigger:** building a product (lead scoring, CRM enrichment, KYB/onboarding, intent routing) that needs reliable email↔phone↔LinkedIn↔company resolution, or replacing an incumbent (Clearbit/PDL/ZoomInfo) that is too expensive, too US-centric, or too slow.
- **Buying pattern:** an engineer self-serves a sandbox key and proves value in an afternoon → usage grows → a lead formalizes a plan → security/finance/legal review → enterprise contract (SSO, DPA, residency, SLA).

## Personas — land (developer-first)

### 1. Integrating Developer  *(primary — the one who signs up)*
- **JTBD:** "Get a correct, enriched record back from one API call in under 10 minutes, then wire it into my app without surprises."
- **Pains:** vague docs, no sandbox, opaque credits/billing, PII/compliance ambiguity, flaky rate limits, poor error messages.
- **What "wow" looks like:** first successful call inside the console with real-looking data; copy-paste snippets in their language that just work; every error tells them exactly how to fix it; logs they can replay; a CLI.
- **Expects from any feature:** DX first — clear states, fast, keyboard-friendly, explains itself, never blocks them from the next step.

### 2. Engineering / Platform Lead
- **JTBD:** "Run this in production reliably and know when something is wrong before customers do."
- **Pains:** no observability, webhook reliability, silent quota exhaustion, key sprawl, no way to see cost per endpoint.
- **Wow:** live analytics with root-cause explanations, webhook DLQ/retry visibility, key scopes & rotation, infrastructure/status transparency, alerts that fire.
- **Expects:** operational depth — health, trends, alerting, audit, predictable cost.

## Personas — expand (enterprise)

### 3. RevOps / Data Leader  *(the economic buyer)*
- **JTBD:** "Prove enrichment ROI and control spend across teams."
- **Pains:** can't attribute cost to teams/use-cases, surprise overages, coverage/accuracy questions, procurement friction.
- **Wow:** usage-by-endpoint cost breakdown, forecasts, budgets/alerts, plan clarity, coverage & confidence metrics, exportable reports.

### 4. Security / Compliance Officer
- **JTBD:** "Approve this vendor without creating regulatory or breach risk."
- **Pains:** PII handling (DPDP/GDPR/CCPA), data residency, opt-out propagation, audit trails, key hygiene.
- **Wow:** compliance-native defaults (masking on live keys, residency routing, opt-out engine), immutable audit log with diffs, IP/geo firewalls, DPA/SLA/AUP center, SOC2/ISO posture.

### 5. Org Admin
- **JTBD:** "Onboard my team safely and keep the workspace governed."
- **Wow:** RBAC that's obvious, team invites that activate, multi-org switching, branding, SSO/SCIM when we grow.

### 6. Partner / Reseller  *(B2B2B channel)*
- **JTBD:** "Embed or resell Zinbit and get paid accurately."
- **Wow:** referral attribution that just works, transparent tiers/commissions, payout visibility, zero-copy data shares.

## How to use this when building a feature

For a feature name, answer: *Which personas touch it? What's the land-persona's 10-minute win? What does the expand-persona need to approve it (cost visibility, governance, compliance)?* Design for the developer's flow first, then layer the enterprise controls so they're present but never in the developer's way.

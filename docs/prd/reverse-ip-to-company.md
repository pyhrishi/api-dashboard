# PRD: Reverse IP → Company

**Status:** Built (prototype is the spec) · **Roadmap:** F-004 (Now) · **Route:** `/console/studio` (preset `reverse-ip`)
**Owner:** Product · **Last updated:** 2026-09-04

> Reverse-engineered from the shipped prototype for the engineering-to-scale handoff.

## 1. Context & Problem
Most B2B website traffic is anonymous. Reverse IP-to-company deanonymizes it — who is the company behind this visitor? — powering account-based marketing, sales alerts, and personalization. But naive reverse-IP is noisy: a huge share of IPs are datacenters, VPNs, or consumer ISPs that map to no real company. The extraordinary version doesn't just return "company X"; it classifies the network so you know whether to trust the mapping.

## 2. Goals & Non-Goals
**Goals**
- One IP in → the company behind it, plus network intelligence: ISP, ASN, org, hostname, geo.
- **Network classification** (corporate egress vs. datacenter / VPN / consumer / mobile) and an `is_corporate` flag — the differentiator that makes reverse-IP useful instead of misleading.
- Full company dossier (reusing the domain resolver) for corporate IPs; confidence + per-field provenance.
- Real gateway (`GET /v1/enrichment/ip`), production billing (2 credits), the spine (Logs/Analytics/Billing), deterministic results.
- Ships as a Studio preset — no new page.

**Non-Goals (this phase)** — CIDR/range lookups; bulk IP files (Bulk Jobs); live visitor streaming/webhooks (linked, not built); real GeoIP/ASN vendors (synthetic, deterministic).

## 3. Users & Personas
- **Integrating Developer (land):** sends a visitor IP, gets the company + a "is this real?" signal, wires it into their app.
- **RevOps / Marketing (expand):** deanonymize traffic for ABM; the classification filters out datacenter/VPN noise.
- **Security (expand):** confidence + provenance + network type; distinguishes corporate visitors from anonymizers.
- **RBAC:** admin + developer (consumes credits/keys).

## 4. Functional Requirements
- IP input (IPv4/IPv6) with validation; the Studio's `ip` input kind + example chips; auto-detection routes a bare IP to this preset via `detectInputKind`.
- Real `fetch('/api/v1/enrichment/ip?ip=…')`; logged via `logApiRequest`.
- Result (generic Studio card): identity (company or ISP), CORPORATE / not-a-company badges, network fields (IP, type, org, ISP, ASN, hostname, geo), company summary for corporate IPs, confidence meter + provenance.
- States, motion, history, copy JSON/cURL, cross-links — all inherited from the Studio.

## 5. Data Model
- `IpIntel` (`lib/ip-resolver.ts`): id, ip, ip_version, ip_type (`corporate|datacenter|vpn|consumer|mobile`), is_corporate, company (`EnrichedCompany | null`), isp, asn, organization, hostname, city, country, timezone, confidence, last_verified, sources[], provenance[].
- No new store slice — reuses the Studio's generic `enrichments` slice. Rendered via a new `ipToResult` branch in `toEnrichmentResult` (dispatched on an `ip_intel` key).

## 6. API
- `GET /v1/enrichment/ip?ip=<ip>` → `{ success, data: { ip_intel: IpIntel, confidence } }`; 2 credits; `x-request-id`.
- Determinism: `resolveCompanyFromIp(ip)` is pure (FNV-1a + mulberry32; no `Date.now`/`Math.random`) and reuses `resolveCompanyFromDomain` for the corporate company block. Weighted classification (~45% corporate, else datacenter/VPN/consumer/mobile), so most IPs realistically map to non-corporate.

## 7. Telemetry
Reuses the Studio's `enrichment_run` / `enrichment_failed` (preset `reverse-ip`); `upgrade_prompt_*` on 402; `first_call_made` on first success.

## 8. Verified
tsc 0 · lint 0 · no `any` · unit (ip-resolver determinism/validation + registry ip-detection) · browser-verified end-to-end on the live gateway (8.8.8.8 → corporate/Infosys/0.93; 52.38.104.17 → datacenter/Linode/0.31). Build green.

> Note: the jest-Playwright suite requires a clean dev server on :3111; during this build a stale server occupied that port (concurrent sessions), so the suite was verified by unit tests + a direct browser drive against :3003 instead. Re-run `npm run test:e2e` after trimming stray dev servers for the harness pass.

## 9. Open Questions
Expose CIDR/range enrichment? · Blend a real ASN/GeoIP dataset? · Auto-suppress non-corporate IPs in ABM exports by default?

## Changelog
- 2026-09-04 — Initial build: deterministic reverse-IP resolver, `ip-to-company` endpoint, `reverse-ip` Studio preset with network classification + provenance. Shipped as changelog v4.8.

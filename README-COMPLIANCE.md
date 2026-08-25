# Zintlr API Compliance & Implementation Notes

This document tracks placeholders, implemented features, legal blockers, and open compliance questions for the Zintlr B2B2B API prototype.

## 1. Placeholders & Mock Values Used
The current frontend prototype relies on the following placeholders and hardcoded mock values that must be replaced before production deployment:
* **API Hostname**: `https://b2b2b.zintlr.com` (as per the official docs, implemented in the Explorer).
* **API Keys**: `sk_test_1234567890abcdef` (used as the mock Secret-Key).
* **Rate Limits**: Hardcoded to `10000` (`X-RateLimit-Limit`) and `2450` (`X-RateLimit-Remaining`) in the Billing dashboard.
* **Error Codes**: `NOT_FOUND` (404) and `RATE_LIMIT` (429) used in the mock API logs.
* **Mock PII**: Completely synthetic payloads generated in `lib/mock-data.ts` (e.g., "Jane Doe", "+91-0000000000", CIN: U12345MH2024PTC000000).

## 2. Implemented Endpoints
Based on the official Zintlr API Documentation, the following **12** endpoints have been fully scaffolded in the UI (`lib/mock-data.ts`, Endpoint Explorer, and Landing Page):
1. Email to Phone
2. Phone to Email
3. LinkedIn URL to Profile Data
4. LinkedIn URL to Phone & Email
5. People Search
6. People AI Search
7. Domain to CIN
8. CIN to Company Data
9. Domain to LinkedIn URL
10. Contact to LinkedIn URL
11. Reverse Enrichment
12. DIN to Phone

> **Notice of Discrepancy Resolved**: Previous internal QA trackers noted 5 approved endpoints. This has been overridden by the official documentation injection, increasing the scope to 12.

## 3. Legal Blockers (DPDP Act)
There are specific legal and compliance blockers regarding the following two endpoints under the Digital Personal Data Protection (DPDP) Act:
* **Personality Intel** (Deprecated/Replaced by AI Search in official docs)
* **DIN to Phone** (Implemented)

**Status**: Currently under legal review.  
**Reason**: We must establish a clear "lawful basis for 3rd party processing" under the DPDP Act before offering these specific intelligence vectors to B2B2B API consumers. Direct extraction and downstream distribution of MCA director contact details carry elevated regulatory risk that must be mitigated.

## 4. Open Compliance Questions
* **Opt-out Propagation**: How exactly will end-user opt-out requests (Do Not Contact / Data Deletion) propagate downstream to the B2B2B API consumers who have already cached or stored the resolved identities? The technical mechanism, enforcement, and SLA for this propagation scope must be strictly defined in the API documentation to maintain compliance and avoid vicarious liability.

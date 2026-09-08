# PRD: Risk-based phone OTP at trial activation (shared auth)

> Never ask for a phone number at sign-up. Ask for a phone OTP only when a trial activation trips a risk condition, deliver it over SMS with automatic fallback to WhatsApp or a voice call, and reject temporary/virtual numbers. One implementation in the shared **auth repo**, consumed by every Zintlr product.

| | |
|---|---|
| **Status** | Built — prototyped here as a portable shared-auth module (the prototype is the spec); production home is the shared auth repo |
| **Owner** | Product (dev7@zintlr.com) |
| **Last updated** | 2026-09-08 |
| **Roadmap** | F-503 (Free tier / trial) |
| **Applies to** | All Zintlr products (Zinbit console, other Zintlr apps) via the shared auth service |
| **Prototype route(s)** | Activation banner + modal on every console route (`components/TrialActivationGate.tsx`) · `/console/trial-gate` (admin Trust & Safety console) · `/api/auth/trial/evaluate`, `/api/auth/phone/challenge|resend|verify|abandon|inspect|override`, `/api/auth/policy/:productId` (GET/PATCH), `/api/auth/challenges|overrides|rejections|events|directory|stats|personas|countries`, `/api/auth/demo/inbox/:challengeId` (sandbox) · phone-free `/signup` |
| **Source artifacts** | `lib/auth/trial-gate.ts` (conditions, policy, evaluation, directory seed, personas) · `lib/auth/phone-otp.ts` (E.164, temp-phone verifier, OTP, channels, delivery simulator) · `src/lib/auth/trial-gate-service.ts` (state, challenges, overrides, events, stats) · `app/api/auth/[...route]/route.ts` · `lib/store.ts` (`trialActivation`) · `components/TrialActivationGate.tsx` · `app/console/trial-gate/page.tsx` · `src/lib/__tests__/trialGate.test.ts` · `e2e/trial-gate.spec.ts` |
| **Reused detectors** | `lib/disposable-detector.ts`, `lib/email-domain-auth.ts`, `lib/company-resolver.ts` (domain → company + headcount), `lib/ip-resolver.ts` (country from IP), `docs/product/icp-and-personas.md` |

## 1. Context & Problem
Requiring a phone OTP at sign-up costs leads. In several of our geographies people are email-first and uncomfortable sharing a phone number with a vendor they have not tried yet; a mandatory OTP wall at sign-up turns intent into abandonment. At the same time, free trials attract abuse: throwaway accounts, duplicate sign-ups from the same company or IP, and tiny or unidentifiable "companies" farming credits.

The fix is to move the phone step **out of sign-up and into trial activation**, and to make it **conditional**: a clean, ICP-shaped sign-up never sees it; a risky one has to prove a real phone before credits are granted. Because every Zintlr product shares the same identity, the rule set, the OTP delivery and the number-quality check must live once, in the **auth repo**, not per product.

## 2. Goals & Non-Goals
**Goals**
- **Zero phone friction at sign-up.** Sign-up stays email + company + password (+ optional referral code). No phone field, no OTP.
- **Risk-based OTP at trial activation.** When a user activates a trial (first credits / first live key), the auth service evaluates the risk conditions below and requires a phone OTP only when at least one trips.
- **Phone quality gate.** Temporary, virtual (VoIP), and disposable numbers are rejected before an OTP is sent; a rejected number cannot be reused to pass the gate.
- **Resilient delivery.** SMS first; on SMS failure, regional carrier issues, or user request, fall back to **WhatsApp OTP**, then **voice-call OTP**. The user is never stuck because one channel is down in their region.
- **Shared implementation.** One service, one policy, one audit trail across Zintlr products; products call it, they do not re-implement it.
- **Measurable.** Every evaluation, prompt, send, fallback, success and abandonment is an event, so the lead-loss trade-off is visible per condition and per geo.

**Non-Goals (this phase)**
- Phone as a login factor (that is MFA, F-309) or as an account-recovery channel.
- KYC/identity verification beyond "this is a real, reachable phone".
- Blocking sign-up itself. Sign-up always succeeds; the gate is on trial activation only.
- Paid plans: a customer who pays is verified by payment, not OTP (see FR-12).

## 3. Users & Personas
- **Integrating developer (land):** signs up with a work email in under a minute, no phone asked. If flagged at activation, sees one clear screen explaining that a phone check is needed before free credits, with channel choice.
- **Growth / RevOps (buyer of the trade-off):** wants leads, not walls. Gets per-condition and per-geo dashboards showing how many activations were challenged, passed, fell back, or abandoned.
- **Security / Trust & Safety:** wants trial abuse stopped and a defensible audit trail (who was challenged, why, which number, which channel, outcome).
- **Support:** needs to see why a user was challenged and to override (allow-list) a false positive.
- **Other Zintlr product teams:** consume the same endpoint; they never own OTP code.

## 4. User Stories & Flows
1. **Clean ICP sign-up.** Work email at a resolvable company of 100+ people, good domain reputation, no duplicate domain or IP → trial activates immediately. No phone step ever shown.
2. **Flagged activation, happy path.** Free-mail or low-reputation domain → activation screen: "One quick check before we add your free credits" → enters phone → number passes quality check → SMS OTP → enters 6 digits → trial activates. Elapsed time target under 60 seconds.
3. **SMS never arrives.** After 30 s the screen offers "Resend by WhatsApp" and "Call me instead"; if the SMS provider returned a delivery failure or the country is on the SMS-degraded list, WhatsApp is offered immediately as the primary channel.
4. **Temporary number.** User enters a known VoIP / temp-SMS number → rejected inline before any send: "This looks like a temporary number. Use a mobile number you control." The rejected number is recorded against the account.
5. **Duplicate company.** Second person from `acme.com` signs up while an active `acme.com` account exists → flagged; after OTP passes, activation completes **and** the existing account's admin is notified with an "add them to your workspace" prompt (converts the duplicate into an expansion).
6. **Support override.** Support marks a challenged user as verified (with a reason) → activation completes without OTP; the override is in the audit log.
7. **Abandonment.** User closes the OTP screen → the account stays in `activation_pending`; a reminder email is sent after 24 h with a one-click return to the same screen; the `otp_abandoned` event carries the condition(s) that triggered the challenge.

## 5. Functional Requirements
**Sign-up**
- **FR-1** The sign-up flow MUST NOT collect a phone number or send an OTP. Sign-up completes with email verification only (existing behavior).

**Risk evaluation (at trial activation)**
- **FR-2** On trial activation the auth service MUST evaluate the account against the following conditions and require a phone OTP if **any** is true:
  - **C1 Non-ICP:** the sign-up does not match the ICP profile (free-mail / personal domain, or a resolved company outside the ICP industries and size band in `icp-and-personas.md`).
  - **C2 Low domain reputation:** the email domain is disposable (`isDisposableDomain`), newly registered (< 90 days), has no MX, fails SPF/DMARC posture, or is on an internal deny list.
  - **C3 Domain not mapped to a company:** the company resolver returns no company for the domain.
  - **C4 Small company:** the resolved company headcount is under 100.
  - **C5 Duplicate domain:** an **active** account (trial or paid, not churned) already exists for the same email domain. Public free-mail domains are excluded from this check (they trip C1 instead).
  - **C6 Duplicate IP:** any existing account (any state) was created from, or last activated from, the same public IP in the last 90 days. Known shared egress ranges (corporate NAT, mobile carriers) MUST be handled by a configurable allow-list to limit false positives.
- **FR-3** Evaluation MUST be deterministic, logged with the list of tripped conditions, and complete in under 500 ms (p95) using cached resolver results where possible.
- **FR-4** Conditions MUST be individually toggleable and thresholds (C4 headcount, C6 window, C2 domain age) configurable per product via the auth policy, with the shared default above. Products cannot weaken the gate below "C2 and C5 always on".
- **FR-5** An account that passed the phone gate once MUST NOT be re-challenged on later activations of the same account.

**Phone capture and quality gate**
- **FR-6** The phone step MUST accept E.164 input with a country selector defaulting to the country inferred from IP; the number MUST be normalized before any lookup.
- **FR-7** Before sending an OTP the service MUST run a **temp-phone verifier**: reject numbers whose line type is VoIP / virtual / non-fixed, numbers from known temporary-SMS providers, numbers already used to verify **another** account in the last 180 days, and numbers on an internal deny list. Line-type data comes from a carrier-lookup provider (e.g. number-intelligence API); the provider is abstracted behind an interface so it can be swapped.
- **FR-8** A rejected number MUST be stored (hashed) against the account with the rejection reason; three rejected numbers in 24 h MUST lock the phone step for that account for 24 h and raise a Trust & Safety flag.

**OTP delivery and fallback**
- **FR-9** OTP MUST be a 6-digit code, valid 10 minutes, single use, max 5 attempts per code, max 3 sends per number per hour. Codes are stored hashed.
- **FR-10** Delivery order MUST be **SMS → WhatsApp → voice call**. Fallback MUST trigger automatically on (a) provider delivery failure or undeliverable status, (b) the destination country being on the SMS-degraded list, or (c) no successful verification 30 s after send, at which point the UI offers the next channel. The user MAY also choose WhatsApp or call explicitly at any time. Each channel switch is a new code; the previous code is invalidated.
- **FR-11** WhatsApp OTP MUST use an approved authentication template; voice OTP MUST read the code twice with a repeat option. Both MUST be available in the product's supported languages.

**Completion, exemptions, overrides**
- **FR-12** A verified payment method or an enterprise contract on the account MUST exempt it from the phone gate (payment is the stronger identity signal).
- **FR-13** Support/T&S MUST be able to override a challenge (allow) or force one (deny) per account, with a mandatory reason; both are audit-logged.
- **FR-14** On success the account MUST record `phone_verified_at`, the hashed number, the channel used, and the tripped conditions; the trial then activates through the product's normal path.
- **FR-15** Duplicate-domain passes (C5) MUST notify the existing account's admin with an invite-to-workspace prompt (product-owned UI; the auth service emits the event).

**Observability**
- **FR-16** The service MUST emit: `otp_risk_evaluated` (conditions tripped, geo, product), `otp_challenge_shown`, `otp_phone_rejected` (reason), `otp_sent` (channel, attempt), `otp_fallback` (from → to, reason), `otp_verified` (channel, seconds since challenge), `otp_failed` (reason), `otp_abandoned` (conditions), `otp_override` (allow/deny, actor). Each product forwards them into its own growth layer (Zinbit: `lib/telemetry.ts`).

## 6. Data Model
| Entity | Fields | Notes |
|---|---|---|
| `TrialRiskEvaluation` | `accountId, productId, evaluatedAt, conditions: RiskCondition[] (tripped), inputs: { domain, companyId?, headcount?, domainAgeDays?, ip, ipMatches[] }, decision: 'allow' \| 'challenge', policyVersion` | Immutable; one per activation attempt |
| `RiskCondition` | `'non_icp' \| 'low_domain_reputation' \| 'domain_unmapped' \| 'small_company' \| 'duplicate_domain' \| 'duplicate_ip'` | C1–C6 |
| `PhoneChallenge` | `id, accountId, evaluationId, state: 'pending' \| 'verified' \| 'locked' \| 'abandoned' \| 'overridden', phoneHash?, phoneCountry?, lineType?, createdAt, verifiedAt?, channelUsed?` | One open challenge per account |
| `OtpSend` | `id, challengeId, channel: 'sms' \| 'whatsapp' \| 'voice', codeHash, sentAt, expiresAt, attempts, deliveryStatus, fallbackFrom?, fallbackReason?` | Max 3/hour per number |
| `PhoneRejection` | `accountId, phoneHash, reason: 'voip' \| 'temp_provider' \| 'reused' \| 'denylist', at` | Drives the 3-in-24h lock |
| `AuthPolicy` (per product) | `conditionsEnabled, smallCompanyThreshold (100), duplicateIpWindowDays (90), domainAgeMinDays (90), smsDegradedCountries[], sharedEgressAllowlist[], fallbackAfterSeconds (30)` | C2 + C5 cannot be disabled |
| `Override` | `accountId, action: 'allow' \| 'deny', actorId, reason, at` | Audit-logged |

Phone numbers are stored **hashed** (with a service pepper) everywhere except the transient send; the plaintext is never logged (the F-322 log-redaction rules apply to the auth service's logs too).

## 7. API Contracts (auth service, internal)
Auth: service-to-service token; user-facing calls carry the user session.

| Method & path | Body | 200 `data` | Errors |
|---|---|---|---|
| `POST /auth/trial/evaluate` | `{ accountId, productId, ip }` | `TrialRiskEvaluation` (`decision`, `conditions`) | 404 account |
| `POST /auth/phone/challenge` | `{ accountId, evaluationId, phone, country }` | `{ challengeId, state, send: OtpSend }` | 422 `PHONE_REJECTED { reason }`, 429 `PHONE_LOCKED`, 409 `ALREADY_VERIFIED` |
| `POST /auth/phone/resend` | `{ challengeId, channel?: 'sms' \| 'whatsapp' \| 'voice' }` | `OtpSend` (auto-selects the next channel when `channel` omitted) | 429 `SEND_LIMIT` |
| `POST /auth/phone/verify` | `{ challengeId, code }` | `{ state: 'verified', channelUsed }` | 400 `CODE_INVALID { attemptsLeft }`, 410 `CODE_EXPIRED`, 429 `ATTEMPTS_EXCEEDED` |
| `GET /auth/phone/challenge/:accountId` | — | current `PhoneChallenge` or `null` | — |
| `POST /auth/phone/override` | `{ accountId, action, reason }` | `Override` | 403 (support/T&S role only) |
| Webhooks → products | `otp.*` events above | — | — |

## 8. Non-Functional
- **Privacy:** phone hashed at rest, never logged in plaintext; number-intelligence lookups send only the number, retained by us only as hash + line type. DPDP/GDPR: phone is collected with a stated purpose (trial abuse prevention) and deletable with the account.
- **Security:** OTP codes hashed; rate limits per number, per account, per IP; constant-time compare; challenge IDs unguessable; overrides require role + reason.
- **Reliability:** provider abstraction with health checks per channel and per country; SMS-degraded country list updated from delivery metrics automatically (delivery rate < 85 % over 1 h → WhatsApp becomes primary for that country until recovery).
- **Performance:** evaluation p95 < 500 ms; OTP send p95 < 3 s; end-to-end median challenge-to-verified < 60 s.
- **Localization:** OTP templates in the product's supported languages; country selector and number formatting via libphonenumber.
- **Multi-product:** policy per `productId`, shared defaults, shared deny/allow lists, shared "already verified" state so a user verified in one Zintlr product is not re-challenged in another.

## 9. Dependencies & Integrations
Shared auth service · number-intelligence / carrier lookup provider · SMS provider · WhatsApp Business API (approved auth template) · voice provider · company resolver (domain → company, headcount) · domain reputation inputs (disposable list, WHOIS age, MX/SPF/DMARC) · IP geolocation + shared-egress allow-list · product growth layers (Zinbit `lib/telemetry.ts`) · Support tooling (override UI) · existing brute-force (F-306) and MFA (F-309) modules, which stay separate.

## 10. Milestones / Phasing
0. **Prototype (done, this repo):** engine + phone verifier + service + routes + activation UI + Trust & Safety console, with a deterministic delivery simulator and a sandbox inbox in place of real providers. The `simulate` flag on evaluate is the shadow-mode primitive.
1. **Production phase 1:** lift `lib/auth/*` and the service into the auth repo behind real providers (number intelligence, SMS, WhatsApp template, voice), durable storage, per-product flag; shadow mode first (evaluate and log, do not challenge) for two weeks to calibrate false-positive rates per condition.
2. **Enforce** for Zinbit trial activation; support override UI in the support tool; duplicate-domain invite prompt in the product.
3. Roll out to the other Zintlr products; per-geo tuning of the SMS-degraded list from delivery metrics; dashboards.

## 11. Success Metrics
Sign-up → activation conversion **unchanged or higher** than today (the whole point) · share of activations challenged (target < 25 % overall; near 0 % for ICP domains) · challenge → verified rate (target > 80 %) · fallback usage by country · temp-number rejection rate · trial-abuse incidents per 1,000 activations (down) · support overrides per week (false-positive proxy, down over time).

## 12. Open Questions
- Exact ICP test for C1: industry list + size band only, or also role/title from enrichment?
- C4 threshold of 100 employees may challenge many legitimate early-stage teams (our own sweet spot starts at ~20 engineers). Confirm 100, or use 100 for non-referral sign-ups and waive for partner/referral codes.
- Should a verified phone be reusable across accounts within the same company domain (team members) rather than blocked for 180 days?
- Which number-intelligence provider, and is line-type coverage acceptable for India + key EU markets?
- WhatsApp template approval lead time and per-country availability.

## 13. Out of Scope
Phone as MFA or recovery · KYC · paid-plan verification · blocking sign-up · per-product custom OTP UIs (products embed the shared component).

---

## Changelog
- **2026-09-08** — Authored from the product owner's requirements (no OTP at sign-up; risk-based OTP at trial activation with conditions C1–C6; shared auth repo; temp-phone verifier; SMS → WhatsApp → voice fallback). (dev7@zintlr.com)
- **2026-09-08** — Built as a portable shared-auth prototype in this repo (user decision: no auth repo exists yet). Added: referral code waives C4 (`referralWaivesSmallCompany`), `simulate` evaluate flag, sandbox inbox, landlines allowed via voice only, per-product policy versioning with `ignored[]` on PATCH. Status → Built. (dev7@zintlr.com)

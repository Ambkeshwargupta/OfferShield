# OfferShield — expanded product implementation plan

This document tracks the complete product scope requested for the India-first company, recruiter and job-offer verification platform. It distinguishes working foundations from integrations that require official access, contracts, credentials or a production identity layer.

## Implemented foundations in this release

- Evidence-led opportunity review: `POST /v1/verify-opportunity`.
- Ephemeral evidence relationship graph: `POST /v1/evidence-graph`.
- Independent company, recruiter, vacancy and offer dimensions.
- Company-name, recruiter-email-domain, vacancy-domain and offer-field consistency checks.
- Payment-request escalation finding.
- Explicit limitations: user-entered confirmation is not independent verification; registration is not recruiter authority; missing data is not proof of fraud.
- Existing MCA, UDYAM discovery, GST GSP adapter groundwork, document/AI review, DNS/RDAP, email-header parsing, public digital-footprint research and moderated community intelligence remain available.

### Opportunity review API

`POST /v1/verify-opportunity`

Example request:

```json
{
  "company": {
    "name": "Example Technologies Private Limited",
    "officialDomain": "example.com",
    "registryName": "Example Technologies Private Limited",
    "registrySource": "MCA OGD",
    "registryRetrievedAt": "2026-11-26"
  },
  "recruiter": {
    "name": "Recruitment Team",
    "email": "hr@example.com",
    "independentlyConfirmed": false
  },
  "vacancy": {
    "title": "Software Engineering Intern",
    "jobId": "INT-2026-04",
    "officialUrl": "https://example.com/careers"
  },
  "offer": {
    "companyName": "Example Technologies Private Limited",
    "recruiterEmail": "hr@example.com",
    "salaryOrStipend": "₹15,000/month",
    "location": "Remote",
    "paymentRequested": false
  }
}
```

The response includes `overallStatus`, four independent dimensions, field comparisons, evidence findings, next steps and limitations. The endpoint compares submitted evidence; it does not contact an employer or fetch arbitrary submitted URLs.

### Evidence graph API

`POST /v1/evidence-graph`

Returns a per-request graph of the company, supplied domain, recruiter, email, vacancy, vacancy URL and offer. It is deliberately ephemeral and does not create a cross-user graph or public allegation database.

## Complete product scope and implementation status

| Workstream | Scope | Status / dependency |
|---|---|---|
| Company intelligence | MCA company/LLP records, national search index, UDYAM discovery | Existing connectors; national imports still need a complete reviewed manifest and successful import/publish |
| GSTIN | Single GSTIN live taxpayer profile | Adapter groundwork only; needs a contracted GSTN-authorised GSP/ASP, sandbox schema, credentials and production approval |
| Exact UDYAM verification | Verify a specific UDYAM number/certificate | Not available in the current OGD resource; requires an authorised exact-number source or official manual verification |
| EPFO | Establishment lookup | Official manual lookup link; automated API access not assumed |
| Startup/DPIIT | Recognition status | Add only through a documented authorised/public source and permitted reuse terms |
| Trademark | Trademark proprietor/status cross-check | Add through official IP India search workflow or authorised data access; a name match is not proof of ownership |
| Company website | Official contact, careers and legal identity claims | Public source discovery; company-owned evidence must be labelled separately |
| Recruiter identity | Name, role, company association and authority | Consistency checks implemented; independent confirmation needs an employer-controlled channel or verified company response |
| Vacancy verification | Job ID, official careers listing, role and location | Evidence model implemented; independent confirmation requires official careers data or employer response |
| Offer review | Terms, payment requests, stages and document type | Existing AI/heuristic review; never certifies authenticity |
| Cross-evidence consistency | Compare company, recruiter, vacancy and offer claims | API foundation implemented |
| Fraud pattern intelligence | Repeated payment, impersonation and task-scam indicators | Existing curated corpus and deterministic rules; maintain dated sources and allegation language |
| Community intelligence | Structured reports, moderation, aggregate trends | Existing D1-based foundation; requires migration, moderator process, appeals and privacy safeguards |
| Trust report | Reusable investigation report with sources, mismatches and actions | API JSON report foundation; branded PDF/download UI remains to be built |
| Pattern graph | Relate entities and evidence | Ephemeral single-investigation graph implemented; persistent multi-report graph requires privacy/legal review, deduplication and moderation |
| Browser extension | Launch investigation from current job/recruitment page | Starter extension supplied in `browser-extension/`; store submission, privacy disclosures and deeper page extraction remain |
| User accounts | Secure login and per-user report history | Not implemented; choose an identity provider and enforce server-side authorisation before central storage |
| Secure document storage | Upload quarantine, access control, malware scanning and expiry | Not implemented; current app avoids persistent original uploads |
| Company response portal | Employer verifies recruiter/vacancy claims | Not implemented; requires domain ownership verification, authenticated company admins, signed audit trail and dispute process |
| Admin dashboard | Review community submissions and source quality | Moderation backend exists in part; authenticated admin UI and role-based access remain |
| Operations | Backups, monitoring, alerts, incident response and deletion workflow | Production launch requirement |

## Recommended implementation sequence

### Track 1 — Registry data completion
1. Validate the current official State/District manifest for the UDYAM dataset.
2. Run a one-page-per-district smoke test.
3. Run the complete resumable import and retain source metadata/checkpoints.
4. Publish immutable, dated UDYAM snapshot objects to R2 and a compact manifest/index.
5. Add a GST GSP/ASP only after written authorisation, pricing, permitted use, field mapping and sandbox tests are confirmed.
6. Show per-source freshness and exact coverage; do not present a missing record as a negative registry finding.

### Track 2 — Verification quality
1. Connect registry evidence to the opportunity review form.
2. Capture the provenance of each field: candidate-supplied, official dataset, company-published, third-party or independently confirmed.
3. Add vacancy/job-ID verification through permitted official sources.
4. Add employer response confirmation using independently sourced company contacts.
5. Add a report renderer with source citations, timestamps, mismatches, confidence/coverage explanations and a correction route.

### Track 3 — Safe production platform
1. Add authentication and server-side per-user authorisation.
2. Add private report storage only after access-control and retention tests.
3. Add upload malware scanning, file-type validation, encryption, deletion and retention enforcement.
4. Build authenticated moderation and company-admin dashboards.
5. Add audit logs, abuse detection, backups, monitoring, incident response and a privacy/legal review.
6. Publish the browser extension only after store policy and privacy disclosures are complete.

## Required secrets and external decisions

Never paste credentials into chat, commit them to Git, or expose them to frontend JavaScript.

- `DATA_GOV_API_KEY`: data.gov.in API key as a Cloudflare Worker secret.
- `GST_GSP_LOOKUP_URL`, `GST_GSP_API_KEY`, and provider-specific auth/adapter: only after a verified GSTN-authorised GSP/ASP contract and sandbox documentation.
- `TAVILY_API_KEY`: optional public-web search integration.
- User authentication provider: choose a provider and configure callback URLs, issuer/audience checks and server-side session validation.
- Company verification: independently sourced employer contact channel and a secure company-admin verification process.

## Non-negotiable evidence and safety rules

- A registered company is not proof of a genuine recruiter or vacancy.
- A matching company email domain is a consistency signal, not proof of recruiter authority.
- A company response is a company-provided statement; retain its channel, date and audit trail.
- Public allegations are not court findings. Attribute them, date them and offer correction/appeal routes.
- A missing database record is a coverage gap, not proof of fraud.
- Do not scrape restricted profiles, bypass CAPTCHA, or claim an official integration without authorised access.
- Do not expose candidate/recruiter personal data in community reports or public graphs.
- AI output is decision support, not a legal conclusion or a fraud probability.

## Current public site and API

- Website: https://ambkeshwargupta.github.io/OfferShield/
- Repository: https://github.com/Ambkeshwargupta/OfferShield
- Worker: https://offershield-intelligence.official-ambkeshwargupta.workers.dev

Before calling a feature live, check the Worker health/capabilities endpoint and the latest GitHub Actions deployment run.

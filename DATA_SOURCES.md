# OfferShield data sources

OfferShield distinguishes official government datasets, official company statements, third-party discovery sources and candidate-provided information. A source link is not the same as a live integration.

## Indian company and business registries

| Source | Intended use | Integration status |
|---|---|---|
| MCA Company Master Data via data.gov.in | CIN/LLPIN, legal name, status, class/category, registration date, state, RoC, capital and registered-office fields present in the published dataset | Cloudflare Worker connector; requires a free data.gov.in API key |
| MCA Corporate Data Management | Manual recheck against the official MCA portal | Official manual lookup |
| GST taxpayer search | GSTIN/legal taxpayer detail check | Official manual lookup; no automation in this release |
| Udyam registered units under UDYAM | Regional MSME unit listing by State and District | Cloudflare Worker connector; requires the same data.gov.in API key as MCA |
| Udyam verification portal | Exact Udyam certificate/number check | Official manual lookup; CAPTCHA may apply |
| EPFO establishment search | Employer establishment context | Official manual lookup |
| National Career Service | Employment guidance and recruitment notices | Official public portal |
| National Cyber Crime Reporting Portal | Cybercrime reporting | Official public portal |

### MCA / data.gov.in connector

- Dataset catalogue: https://www.data.gov.in/catalog/company-master-data
- API resource used by the Worker: `4dbe5667-7b6b-41d7-82af-211562424d9a`
- API root: `https://api.data.gov.in/resource/`
- Filter fields used: `CIN` and `CompanyName`
- Authentication: a user-owned API key stored as a Cloudflare Worker secret named `DATA_GOV_API_KEY`.
- Company-name lookup is exact-match only at the source; fuzzy matching is not delegated to the government API.
- Returned company records are labelled as periodic OGD/MCA dataset snapshots, not live MCA portal verification.
- Dataset does not establish who employs an individual recruiter or whether a given job offer was authorised.

The data.gov.in platform documents API key generation for registered users. See https://www.data.gov.in/help.

### Udyam registered-units dataset

- Resource title: List of MSME Registered Units under UDYAM
- Resource ID: `8b68ae56-84cf-4728-a0a6-1be11028dea7`
- Endpoint: `https://api.data.gov.in/resource/8b68ae56-84cf-4728-a0a6-1be11028dea7`
- Required filters: `filters[State]` and `filters[District]`
- Other request parameters: `api-key`, `format=json`, `limit`, `offset`
- Exposed fields: `LG_ST_Code`, `State`, `LG_DT_Code`, `District`, `Pincode`, `RegistrationDate`, `EnterpriseName`, `CommunicationAddress`, `Activities`.
- This dataset does **not** expose a Udyam Registration Number field. It supports regional enterprise discovery and name/location cross-checks; it cannot independently validate a specific Udyam number or certificate.
- An empty `records` array with `total: 0` from an unfiltered call does not prove there are no MSMEs. Supply the required State and District filters and use pagination.
- The same data.gov.in API key is used for both MCA and Udyam resources. Keep it as the Cloudflare Worker secret `DATA_GOV_API_KEY`; never paste it into browser code or GitHub.

## Third-party company discovery

**Wikidata** (https://www.wikidata.org/) is used for discovery when the curated company set or exact OGD match does not return a result. Wikidata entries are community-maintained and are displayed as third-party candidates, never as official registration proof.

## Domain and email intelligence

- Google Public DNS-over-HTTPS: https://developers.google.com/speed/public-dns/docs/doh
- RDAP public lookup: https://www.icann.org/en/contracted-parties/registry-operators/registration-data-access-protocol/information-for-rdap-users
- Domain registration data can be redacted or unavailable.
- DNS, MX, SPF, DMARC and RDAP describe technical/domain registration signals; they do not prove company ownership, mailbox control or recruiter authority.
- DKIM verification needs original message headers and the selector; the application does not claim a DKIM pass from a domain-only lookup.

## Company-owned sources currently seeded

- TCS India careers and recruitment fraud alert.
- Infosys careers and recruitment fraud alert.
- Wipro careers and fraud awareness.
- Reliance Industries careers and fraud alert.

These are source links and curated reference statements. Recheck the company source page before relying on a contact or policy.

## Sources intentionally not scraped

- LinkedIn member profiles and recruiter details.
- Restricted job portals.
- CAPTCHA-protected government portal pages.
- Private email accounts or mailboxes.
- Websites from arbitrary user URLs via the backend.

## Attribution

Where the MCA company master dataset is displayed, cite: “Contains Ministry of Corporate Affairs Company Master Data published through the Open Government Data Platform India under the Government Open Data License – India. MCA and the OGD Platform do not endorse OfferShield.”


## Internship and recruitment fraud research

The current curated source-linked retrieval corpus is in `workers/fraud-patterns.js` (snapshot: 12 November 2026). It distinguishes direct internship complaints from adjacent fresher-job, impersonation and task-job cases. Each entry records a public source and reporting status. Complaints, FIRs and arrests are not treated as convictions.

| Reported case / pattern | Source and date | What was reported |
|---|---|---|
| ThynkTech India, Pune | The Indian Express, 3–4 June 2026 | Laptop-deposit, stipend and equipment-return allegations; police case / arrest reported. |
| Algodealer.ai, Ahmedabad | The Times of India, 8 August 2026 | Student allegations about refundable internship deposits and unpaid stipend; students reportedly approached police. |
| Unnamed Bengaluru online internship campaigns | The Times of India, 19 June 2025 | Social-group funnels, small fees and unclear work reported by students. |
| Pune IT recruitment-fee cases | The Indian Express, 4 June 2026 | Adjacent job-recruitment allegations involving agents and unpaid dues. |
| Neogen Soft Tech Solutions, Hyderabad | Hyderabad Police, 17 February 2025 | Police-described fake-company, job-payment and false-offer case. |
| Prasar Bharati impersonation racket | Delhi Police EOW, 21 April 2023 | Fake recruitment emails / vacancy communications and candidate-payment allegations. |
| WhatsApp / Telegram task-job pattern | Directorate of Enforcement, 28 March 2024 | Official investigation release describing task-job approaches and money-transfer mechanics. |

Coverage is not exhaustive: the Ministry of Home Affairs told the Lok Sabha on 3 March 2020 that central data on websites advertising internship schemes was not maintained and police / public order are State subjects. A similar tactic does not mean that the company under review is involved in a named case. Exact legal-entity matching and independent evidence are required.


### Additional public reporting added on 12 November 2026

The source-linked additions are stored in `workers/fraud-patterns.js`. Adjacent job-recruitment reports are included because similar payment, fake-offer, impersonation and non-payment tactics also occur in internship offers. They are labelled as job cases rather than internship cases.

| Case / pattern | Source | How the product labels it |
|---|---|---|
| Flynaut SaaS Private Limited | The Free Press Journal (24 Aug 2025), The Indian Express (4 Jun 2026), Moneycontrol (31 Mar 2026) | Multiple FIR / arrest reporting and later public reporting; allegations, not a conviction. |
| Data Tech Labs | The Indian Express (4 Jun 2026), Moneycontrol (31 Mar 2026) | FIR and complainant allegations; later report described partial salary clearances and continuing dues. |
| Quantumsoft Technologies Private Limited | The Indian Express (4 Jun 2026), Moneycontrol (31 Mar 2026) | FIR and arrest reporting; alleged consultant payment and unpaid salary claims. |
| Accure Softech Private Limited | The Indian Express (4 Jun 2026) | FIR and directors' arrest reporting; alleged job fee and unpaid training stipend / salary. |
| Unidentified Indore data-entry recruitment operation | The Times of India (5 Jul 2026) | FIR reported after a student allegedly lost about ₹44,000 through repeated recruitment-process payments. Job case, not internship-specific. |
| Fake Indian Army internship email | The Times of India (15 Aug 2026) | Maharashtra cyber-police phishing warning about an impersonated internship offering ₹75,000/month; sender unidentified. |
| Additional firms named in FITE's representation | Hindustan Times (7 Jun 2026), Moneycontrol (June 2026) | Manual research lead only; not used for individual exact-name matches because separate case details were not supplied for every name. |

The research remains a source-linked sample, not an exhaustive national database. The Ministry of Home Affairs' 3 March 2020 Lok Sabha answer explicitly said that central data on websites advertising internship schemes was not maintained and that police / public order are State subjects.

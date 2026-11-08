# OfferShield data sources

OfferShield distinguishes official government datasets, official company statements, third-party discovery sources and candidate-provided information. A source link is not the same as a live integration.

## Indian company and business registries

| Source | Intended use | Integration status |
|---|---|---|
| MCA Company Master Data via data.gov.in | CIN/LLPIN, legal name, status, class/category, registration date, state, RoC, capital and registered-office fields present in the published dataset | Cloudflare Worker connector; requires a free data.gov.in API key |
| MCA Corporate Data Management | Manual recheck against the official MCA portal | Official manual lookup |
| GST taxpayer search | GSTIN/legal taxpayer detail check | Official manual lookup; no automation in this release |
| Udyam verification | MSME registration check | Official manual lookup; CAPTCHA may apply |
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

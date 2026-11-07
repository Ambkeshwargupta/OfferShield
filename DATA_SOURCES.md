# OfferShield data sources

OfferShield separates official records from third-party context and candidate-provided content. A link to an official lookup service is not the same as a live API integration or an automated verification.

## Indian government sources

| Source | Intended use | Current integration |
|---|---|---|
| MCA Corporate Data Management | Company and LLP master details | Manual lookup link; no API key configured |
| Data.gov.in company master data | Downloadable/API-backed company reference data | Connector not configured |
| GST taxpayer search | GSTIN and taxpayer status | Manual lookup link |
| Udyam verification | MSME registration | Manual lookup link; CAPTCHA may apply |
| EPFO establishment search | Employer establishment context | Manual lookup link |
| National Career Service | Employment guidance and employer-related notices | Public portal link |
| National Cyber Crime Reporting Portal | Report suspected cybercrime | Official reporting link |

## Company-owned sources currently seeded

- TCS India careers and recruitment fraud alert.
- Infosys careers and recruitment fraud alert.
- Wipro careers and fraud awareness.
- Reliance Industries careers and fraud alert.

Each company record in the demo points to company-owned pages. Contact details are displayed only where the company itself publishes them on its recruitment or fraud-awareness page. Sources should be revisited and rechecked before a real decision.

## Open-data company discovery fallback\n\nThe GitHub Pages edition queries the public Wikidata Action API without a key when a name is not found in its curated reference set. Wikidata is a community-maintained knowledge graph, not an official company registry. Search matches are discovery candidates only and may be missing, ambiguous or outdated. A website listed in Wikidata is not treated as an official-company-confirmed domain.\n\n## Important limitations

- A Wikidata result is not a government record and must be independently matched to the legal entity.\n- MCA registration confirms a legal entity record; it does not prove that a specific recruiter works for that entity.
- A company website or matching email domain does not authenticate a particular email. This app does not inspect raw email headers, DKIM, SPF, DMARC or mailbox provenance.
- LinkedIn and job boards are not scraped. Public profile links may be shown as navigation, but platform data is not imported.
- Do not treat missing data as evidence of fraud.
- Do not publish allegations about a company or individual based only on automated analysis.

# Privacy

OfferShield is designed to reduce the personal information needed for a recruitment due-diligence investigation.

## Candidate messages and documents

- Remove personal identifiers, addresses, signatures, PAN, Aadhaar, bank details, passwords and unrelated personal information before pasting message text or email headers.
- The static GitHub Pages edition performs pasted message and email-header analysis in the browser. Investigation summaries saved by this edition are stored in that visitor's browser localStorage.
- The Cloudflare Worker email-header endpoint processes the submitted header text to return a parsed result and does not intentionally persist the raw headers.
- Do not upload or send full offer letters to public sources. The current static app does not require original document uploads for its advanced header analysis.

## Company/domain queries

- Company name, CIN, LLPIN, GSTIN or domain queries are sent to the configured intelligence provider when the Worker is connected.
- OGD API keys are stored as Cloudflare Worker secrets, never sent to the browser.
- DNS and RDAP checks send the domain name to the public DNS/RDAP providers required to resolve the query.
- The Worker stores cached public-source results and hashed rate-limit keys in D1 when configured.

## Reports and retention

- The current GitHub Pages reports are stored locally in the browser; they are not centralised or synced across devices.
- The Node prototype stores limited extracted indicators and findings in a local JSON file.
- D1 cache expiry is set by the Worker; company source observations and contacts should have explicit review/expiry dates before production.
- Use browser clear/delete controls to remove local reports.

This is product privacy documentation, not legal advice or a complete statutory privacy notice. Review applicable Indian data-protection duties, consent, retention and grievance processes before opening the service to broad public use.

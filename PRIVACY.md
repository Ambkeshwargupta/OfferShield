# Privacy

OfferShield is designed to reduce the personal information needed for a recruitment due-diligence investigation.

## Candidate messages, screenshots and documents

- Remove or blur candidate personal phone numbers, home addresses, signatures, government IDs, PAN, Aadhaar, bank details, passwords and unrelated personal information before uploading evidence.
- The student-facing investigation form accepts pasted messages and up to five PDF, DOCX, ODT, HTML, XML, PNG, JPG/JPEG or WEBP files, with a 12 MB combined upload limit.
- When a Cloudflare Worker with Workers AI is connected, uploaded files are sent to that Worker. The Worker uses Cloudflare Workers AI Markdown Conversion to extract text and image descriptions, then sends the extracted evidence and relevant company/domain signals to a Workers AI model for the structured assessment.
- The OfferShield application does not write original file bytes or extracted offer/chat text into its D1 database, R2 company index or application report store. The Worker response contains the assessment, extracted indicators and uploaded-file metadata. The student can save that result summary in local browser storage.
- Cloudflare processes the data in order to provide the AI conversion and inference services. Review Cloudflare's current terms, product documentation, account settings and data processing terms before using real student documents at scale. AI model inference is usage-metered; some image conversion may also consume Workers AI allocation.
- The Node/static fallback without a connected AI Worker only supports the existing text-based heuristic analysis. It does not analyse uploaded documents.

## Company/domain queries

- Company name, CIN, LLPIN, GSTIN or domain queries are sent to the configured intelligence provider when the Worker is connected.
- OGD API keys are stored as Cloudflare Worker secrets, never sent to the browser.
- DNS and RDAP checks send the domain name to the public DNS/RDAP providers required to resolve the query.
- The Worker stores cached public-source results and hashed rate-limit keys in D1 when configured.
- The internship investigation checks at most one primary candidate-provided domain per request to limit external lookups. Other extracted domains and email addresses are displayed as indicators, not automatically verified.

## Reports and retention

- The current GitHub Pages reports are stored locally in the browser; they are not centralised or synced across devices.
- Original uploads are not included in saved report summaries.
- The Node prototype stores limited extracted indicators and findings in a local JSON file.
- D1 cache expiry is set by the Worker; company source observations and contacts should have explicit review/expiry dates before production.
- Use browser clear/delete controls to remove local reports.

This is product privacy documentation, not legal advice or a complete statutory privacy notice. Review applicable Indian data-protection duties, consent, retention, vendor terms and grievance processes before opening the service to broad public use.

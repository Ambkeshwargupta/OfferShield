# Privacy

OfferShield is designed to reduce the personal information needed for a recruitment due-diligence investigation.

## Candidate messages, screenshots and documents

- Remove or blur candidate personal phone numbers, home addresses, signatures, government IDs, PAN, Aadhaar, bank details, passwords and unrelated personal information before uploading evidence.
- The student-facing investigation form accepts pasted messages and up to five PDF, DOCX, XLS/XLSX, ODS/ODT, CSV, NUMBERS, HTML, XML, PNG, JPG/JPEG, WEBP, GIF, BMP or SVG files, with a 12 MB combined upload limit.
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


## Community Recruitment Intelligence

The community experience form accepts structured fields only: company name/domain, opportunity and role categories, broad work location, work mode, stipend/duration bands, recruitment-stage checkboxes, whether a payment request was reported, and the contribution outcome. It does not accept candidate names, recruiter names, email addresses, phone numbers, screenshots, chat contents or free-text allegations.

Contributions are stored in Cloudflare D1 with a moderation status of pending. They are not public and are not included in AI analysis until a moderator approves them. After approval, only aggregate counts are available, and only when at least three approved submissions for the matching company/domain exist within the last 12 months. Individual contributions are never returned by the public API. A network-derived hash is used for rate limiting; the raw connecting IP is not stored by the community feature.

Each submitter receives a one-time deletion token. Only its SHA-256 hash is stored. The user must keep the token to delete their contribution; OfferShield cannot recover it. The app does not provide user accounts or a lost-token recovery process in this release.

Approved aggregate community patterns are retrieved as context for the AI investigation. This is retrieval-based grounding, not fine-tuning or a change to the model's weights. These patterns are self-reported and moderator-reviewed, not employer-confirmed facts. The public result includes the sample count and time window and does not expose a report-level feed.

Do not submit information about another person, personal identifiers, confidential employer documents or anything you are not authorised to share. The company name/domain identifies the subject of the experience and is retained for aggregation. Review and publish a community-specific retention/deletion policy and moderation contact before broad public launch.

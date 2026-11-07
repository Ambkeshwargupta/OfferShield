# OfferShield

**Know who's behind the offer.**

OfferShield is an India-first company and recruitment due-diligence prototype. A candidate can receive an offer through any channel, then use OfferShield to investigate the company, open official registration and careers sources, review company-published recruitment guidance, and compare message details with the information available.

> OfferShield is an investigation aid, not a fraud verdict, legal opinion, background check or guarantee that an offer is genuine. Company registration, a professional profile, a convincing document or a matching email domain does not prove that a specific recruiter or vacancy is authorised.

## What is in this repository

- `index.html` — responsive single-page web application and browser UI.
- `server.js` — Node.js HTTP server, JSON API, reference company/source catalogue and report storage.
- `tests/analysis.test.js` — Node built-in test suite.
- `.github/workflows/ci.yml` — syntax and test checks on pushes and pull requests.
- `DATA_SOURCES.md`, `PRIVACY.md`, `SECURITY.md` — source, privacy and security notes.

The application has no third-party runtime dependencies. It is intentionally designed to run on a small Node hosting service without a paid AI API.

## Run locally

Requirements: Node.js 20 or later.

```bash
git clone https://github.com/Ambkeshwargupta/OfferShield.git
cd OfferShield
cp .env.example .env
npm run check
npm test
npm start
```

Open http://localhost:3000.

For live reload during development:

```bash
npm run dev
```

The server stores saved report metadata and extracted indicators in `.data/store.json`. The `.data/` directory is git-ignored. Back it up or use persistent disk storage when deploying.

## Current product functionality

- Search a small curated set of company reference profiles.
- Review published company websites, careers pages, LinkedIn company page links and recruitment fraud advisories.
- Browse official government and company-owned source links for MCA, Data.gov.in, GST, Udyam, EPFO, NCS and cybercrime reporting.
- Paste recruitment message / offer text and extract email addresses, URLs/domains, phone numbers, role clues, CIN/GSTIN patterns and payment-related phrases.
- Compare extracted domains with the selected company's published reference domains.
- Explain matches, warning signals and missing information without assigning a fabricated fraud probability.
- Save, reopen, print and delete an investigation report in the same browser session.
- Load a synthetic demonstration message using the reserved `.example` domain.

## Important limitations

- The company catalogue is a small curated reference set; it is not a complete registry of Indian companies.
- MCA, GST, Udyam and EPFO are linked as official manual verification sources. No live government API key or private data provider is configured.
- Company source links should be opened and rechecked at the time of use. A page being listed here is not proof that its content has not changed.
- The parser analyses pasted text. It does not inspect raw email headers, SPF/DKIM/DMARC results, mailbox ownership, file signatures, or sender infrastructure.
- Domain matching is a clue only; it does not authenticate the person sending a message.
- The app uses random browser-session ownership for saved reports, not registered user accounts. Shared-device use is not recommended.
- JSON-file storage is intended for a single-instance prototype. Use a managed database, account authentication, stronger session controls, backups and persistent storage before multi-user production deployment.
- No recruiter identity or telephone number is generated. Contacts appear only where a company-owned source explicitly publishes them.

## Deployment

Deploy the Node app to a host that supports persistent disk storage and an HTTP process. Set `NODE_ENV=production`, `PORT` if required by the host, and `DATA_DIR` to a persistent writable directory. GitHub Pages alone cannot run the API or persist reports.

## Project principle

**Evidence before conclusions.** Distinguish official-source information, third-party reports, user-provided content, unknown information and conflicting evidence. A missing match is a coverage gap, not evidence of fraud.

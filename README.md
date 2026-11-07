# OfferShield

**Know who's behind the offer.**

OfferShield is an India-first company and recruitment due-diligence application. Candidates can investigate public company information, review official source links, submit a recruitment message or offer text, compare sender details with available company reference domains, and save an evidence-led report.

> OfferShield is an investigation aid, not a fraud verdict, legal opinion, background check, or guarantee that an offer is genuine. A registered company, authentic-looking PDF, published domain, or LinkedIn page does not prove that a specific recruiter or vacancy is authorised.

## Source bundle

The complete runnable starter codebase is available in **[offershield-source.zip](./offershield-source.zip)**. Download and extract it, then open the `offershield/` directory.

## Included

- Premium responsive React + TypeScript UI.
- Company directory and conservative reference profiles for selected Indian employers.
- Source directory for MCA, Data.gov.in, GST, Udyam, EPFO, NCS and cybercrime reporting.
- Offer/message analysis for email addresses, URLs/domains, phone numbers, company names, role clues, CIN/GSTIN patterns and payment-related language.
- Domain comparison against a selected company's reference domains, with an explicit warning that a match is not sender authentication.
- Browser-side PDF, DOCX, TXT and EML text extraction. The original uploaded document is not sent to the server by the starter flow.
- Express API backed by SQLite.
- Saved investigation history scoped to a random HttpOnly browser-session cookie.
- API validation, basic rate limiting, security headers, unit tests and GitHub Actions workflow.

## Run locally

Requirements: Node.js 22.13+ and npm 10+.

```bash
unzip offershield-source.zip
cd offershield
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to the Express server on port 8787.

Production build and run:

```bash
npm run typecheck
npm test
npm run build
npm start
```

The Express server serves the compiled frontend and API from one origin.

## Important limitations

- No live MCA/GST/Udyam/EPFO API connection is configured.
- LinkedIn and job-board data are not scraped; restricted scraping is intentionally not implemented.
- Company coverage is a small reference set; a source link is not equivalent to a fresh verification.
- Analysis is deterministic and heuristic, not an AI fraud classifier.
- Saved reports use browser-session ownership, not registered user accounts.
- SQLite requires persistent storage on the hosting provider. GitHub Pages alone cannot run the Express API or preserve the database.

See `DATA_SOURCES.md`, `PRIVACY.md` and `SECURITY.md` inside the source bundle.

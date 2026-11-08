# Security notes

- GitHub Pages is public static hosting; do not publish secrets, personal files or raw offers in the repository.
- The Cloudflare Worker stores the data.gov.in API key only as an encrypted Worker secret. Never add API keys to browser JavaScript, HTML, public config or GitHub.
- The Worker accepts only valid public domain names for DNS/RDAP operations and does not fetch or execute arbitrary user-submitted URLs. This avoids turning the service into an SSRF proxy.
- Worker CORS allowlists the OfferShield GitHub Pages origin and local development origins. Review this allowlist before adding a custom domain.
- D1 rate limiting stores a SHA-256 hash of the Cloudflare connecting IP and endpoint bucket, not raw IPs.
- D1 caches company master-data responses and stores source/evidence observations; expire data according to source freshness.
- Request bodies are bounded and sanitised. Do not paste secrets, passwords, PAN, Aadhaar or bank data into email-header analysis.
- Pasted email header text can be manipulated; inspect original headers from the mailbox. Authentication results are informative but do not authenticate a recruiter or offer.
- No LinkedIn scraping, CAPTCHA bypass or restricted portal scraping is implemented.
- The Node prototype uses browser-session ownership and local JSON persistence, not account authentication. It is not suitable for shared-device or multi-user production use.
- GitHub Pages reports are stored in browser localStorage. Clearing browser data deletes that local report history.
- Before public production launch, add user authentication, per-user database access policies, abuse monitoring, backups, incident response and a privacy/legal review.

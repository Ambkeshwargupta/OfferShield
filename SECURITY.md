# Security notes

- The app uses Node's built-in HTTP server and same-origin API routes.
- Request bodies are size-limited and validated.
- Basic in-memory rate limiting is enabled for analysis and search routes.
- Session cookies are HttpOnly and SameSite=Lax; Secure is enabled in production.
- Original offer documents are not uploaded in this initial release. Paste relevant text only and redact personal identifiers.
- URL extraction is passive: the server does not fetch submitted URLs. This avoids turning the analysis endpoint into an SSRF proxy.
- Investigation history is scoped to a random browser session. This is not registered-account authentication and is not suitable for sensitive production use on shared devices.
- The initial JSON file store is single-instance storage. Use a managed database and user accounts before multi-instance public deployment.
- Never store API keys in browser code or commit secrets.

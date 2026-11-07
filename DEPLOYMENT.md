# Deployment notes

OfferShield is a single-origin Node.js application with a static frontend and JSON-backed API. It does not need a build step or runtime package installation beyond Node itself.

## Requirements

- Node.js 20+
- A host that can run a long-lived Node HTTP process
- Writable persistent storage for `DATA_DIR` if saved investigations must survive restarts

## Generic Node deployment

1. Connect this repository to a Node-compatible hosting provider.
2. Set the build command to empty / not required.
3. Set the start command to `npm start`.
4. Set `NODE_ENV=production`.
5. Set `DATA_DIR` to the provider's persistent writable volume path.
6. Ensure the service is configured to pass its assigned `PORT` environment variable.
7. Visit `/api/health` after deployment.

The app binds to `0.0.0.0` and uses `process.env.PORT`.

## Docker

Build:

```bash
docker build -t offershield .
```

Run with persistent local storage:

```bash
docker run --rm -p 3000:3000 -v offershield-data:/app/.data offershield
```

## Important

Do not deploy with an ephemeral filesystem if users expect reports to persist. The current prototype uses a JSON file and a browser-session cookie, and is intended for a single application instance. It is not production-grade multi-user authentication or multi-instance data storage. Upgrade to a managed database, per-user accounts, stronger session management, monitoring, backups and a privacy review before a broad public launch.

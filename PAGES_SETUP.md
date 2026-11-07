# Enable the public OfferShield site

GitHub Pages is the public static website host for this repository. The static edition lives in `docs/index.html`, so the Node/Express backend is not required for this Pages preview. The full-stack API remains in the repository for a later Node deployment.

## One-time repository setting

1. Open [OfferShield → Settings → Pages](https://github.com/Ambkeshwargupta/OfferShield/settings/pages).
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Save if GitHub shows a Save button.
4. Open [OfferShield → Actions](https://github.com/Ambkeshwargupta/OfferShield/actions).
5. Select **Deploy OfferShield to GitHub Pages** and choose **Run workflow** on `main` (or wait for the deployment workflow to run on the next `docs/**` push).

## Public URL

Once the deployment run succeeds, the project site URL will be:

`https://ambkeshwargupta.github.io/OfferShield/`

## What works in the Pages edition

- Company reference search and profiles.
- Company-published recruitment source links and official government registry links.
- Pasted offer/message extraction and comparison with the reference profiles.
- Saved investigation reports stored in the visitor's browser localStorage.
- Print / Save as PDF.

## What is not hosted by GitHub Pages

GitHub Pages is static hosting. It cannot run the Express API or the JSON-file report store. The Pages edition uses browser-side analysis and local browser report storage. For multi-device user accounts, central report storage and live government API connectors, deploy the Node backend separately to a Node-compatible host with persistent storage and a managed database.

The Pages workflow cannot create the initial Pages site configuration through the repository's current GitHub App permission. A repository owner must select **GitHub Actions** as the Pages source once in Settings.

# Publish OfferShield with GitHub Pages

The public static website is in `docs/`. Use GitHub's built-in **Deploy from a branch** publishing mode; no Actions deployment workflow or paid hosting is required.

## One-time setup

1. Open [OfferShield → Settings → Pages](https://github.com/Ambkeshwargupta/OfferShield/settings/pages).
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Under **Branch**, select `main`.
4. Under the folder selector, choose `/docs`.
5. Click **Save**.

GitHub will publish the files in `docs/` and automatically rebuild the site when that folder changes.

## Public website URL

`https://ambkeshwargupta.github.io/OfferShield/`

The URL becomes available once GitHub finishes the first Pages build. Open the Pages settings page to see the published URL and build status.

## What works in the static Pages edition

- Company reference search and profiles.
- Company-published recruitment source links and official government registry links.
- Pasted offer/message extraction and comparison with the reference profiles.
- Saved reports stored in the visitor's browser localStorage.
- Print / Save as PDF.

## What GitHub Pages does not host

GitHub Pages serves static files only. It cannot run the Express API or the JSON-file report store. The Pages edition uses browser-side analysis and browser-local report storage. For multi-device user accounts, central report storage and live government API integrations, deploy the Node backend separately to a Node-compatible host with persistent storage and a managed database.

## Data and accuracy

The Pages prototype currently contains a limited company reference directory and manual government lookup links. It does not claim live MCA, GST, Udyam or EPFO API verification. Missing information is not evidence of fraud.

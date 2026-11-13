#!/usr/bin/env node
/** Revoke the temporary, bucket-scoped R2 API token created for this workflow. */
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const bearer = process.env.CLOUDFLARE_API_TOKEN;
const tokenId = process.env.R2_TEMP_TOKEN_ID;
if (!account || !bearer || !tokenId) throw new Error("Cloudflare account, API token and temporary token ID are required.");
const response = await fetch(
  "https://api.cloudflare.com/client/v4/accounts/" + account + "/tokens/" + tokenId,
  {
    method:"DELETE",
    headers:{authorization:"Bearer " + bearer},
    signal:AbortSignal.timeout(20000)
  }
);
const payload = await response.json().catch(() => ({}));
if (!response.ok || payload.success !== true) {
  throw new Error("Temporary R2 token could not be revoked (HTTP " + response.status + "). It remains bucket-scoped and expires automatically.");
}
console.log("Temporary R2 token revoked.");

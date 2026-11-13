#!/usr/bin/env node
/**
 * Create an eight-hour R2 S3 token, scoped to one OfferShield bucket.
 * The Cloudflare API token used to run this script must have Account API
 * Tokens Read/Write permission. Credentials go only to GitHub runner env files.
 */
import { createHash } from "node:crypto";
import { appendFile } from "node:fs/promises";

const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const bearer = process.env.CLOUDFLARE_API_TOKEN;
const bucket = process.env.R2_BUCKET_NAME || "offershield-company-index";
if (!account || !bearer || !process.env.GITHUB_ENV || !process.env.GITHUB_OUTPUT) {
  throw new Error("Cloudflare account/API token and GitHub runner environment files are required.");
}
const base = "https://api.cloudflare.com/client/v4";
async function cloudflare(path, init = {}) {
  const response = await fetch(base + path, {
    ...init,
    headers: {
      authorization:"Bearer " + bearer,
      "content-type":"application/json",
      ...(init.headers || {})
    },
    signal:AbortSignal.timeout(20000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success !== true) {
    const message = (payload.errors || []).map(item => item.message).filter(Boolean).join("; ");
    throw new Error("Cloudflare API returned HTTP " + response.status +
      (message ? ": " + message : ".") +
      ". Grant Account API Tokens Read/Write to CLOUDFLARE_API_TOKEN, or add R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY repository secrets.");
  }
  return payload.result;
}

const groups = await cloudflare("/accounts/" + account + "/tokens/permission_groups");
const group = (groups || []).find(item =>
  item.name === "Workers R2 Storage Bucket Item Write" && item.is_selectable !== false
);
if (!group?.id) {
  throw new Error("The configured Cloudflare API token cannot select the bucket-scoped R2 object-write permission. Grant Account API Tokens Read/Write or configure R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.");
}
const expiresOn = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
const resource = "com.cloudflare.edge.r2.bucket." + account + "_default_" + bucket;
const created = await cloudflare("/accounts/" + account + "/tokens", {
  method:"POST",
  body:JSON.stringify({
    name:"OfferShield MCA R2 upload " + (process.env.GITHUB_RUN_ID || "workflow"),
    policies:[{
      effect:"allow",
      resources:{[resource]:"*"},
      permission_groups:[{id:group.id}]
    }],
    expires_on:expiresOn
  })
});
if (!created?.id || !created?.value) {
  throw new Error("Cloudflare did not return the one-time R2 API token values.");
}

const secretAccessKey = createHash("sha256").update(created.value,"utf8").digest("hex");
const envLines = [
  "AWS_ACCESS_KEY_ID=" + created.id,
  "AWS_SECRET_ACCESS_KEY=" + secretAccessKey,
  "AWS_DEFAULT_REGION=auto"
].join("\n") + "\n";
await appendFile(process.env.GITHUB_ENV,envLines);
await appendFile(process.env.GITHUB_OUTPUT,[
  "temporary=true",
  "token_id=" + created.id
].join("\n") + "\n");

console.log("Created an eight-hour R2 object-write token scoped only to the " + bucket + " bucket. Credentials were not printed.");

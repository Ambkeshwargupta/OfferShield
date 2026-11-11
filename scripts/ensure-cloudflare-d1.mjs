import { readFile, writeFile, appendFile } from "node:fs/promises";

const databaseName = "offershield-intelligence";
const configPath = "workers/wrangler.toml";
const configuredAccountId = (process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
const token = process.env.CLOUDFLARE_API_TOKEN;
// This is the Account ID in the Cloudflare dashboard URL where the user created
// the offershield-company-index R2 bucket and deployed the Worker.
const verifiedAccountId = "66f8e560965223a9f0b85a2c5a0a8892";
if (!token) throw new Error("CLOUDFLARE_API_TOKEN is required.");
if (configuredAccountId !== verifiedAccountId) {
  console.log("Using the Account ID from the confirmed Cloudflare R2 dashboard for this deployment.");
}
// Correct the value for later steps (Wrangler deploy and secret upload) as well.
if (process.env.GITHUB_ENV) {
  await appendFile(process.env.GITHUB_ENV, "CLOUDFLARE_ACCOUNT_ID=" + verifiedAccountId + "\n");
}
const accountId = verifiedAccountId;

async function cloudflareApi(path, options = {}) {
  const response = await fetch("https://api.cloudflare.com/client/v4" + path, {
    ...options,
    headers: {
      authorization: "Bearer " + token,
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    const messages = (data.errors || []).map(x => x.message).filter(Boolean);
    const error = new Error("Cloudflare D1 API request failed (" + response.status + "): " + (messages.join("; ") || response.statusText));
    error.status = response.status;
    error.cloudflareErrors = data.errors || [];
    throw error;
  }
  return data;
}

// Validate the token independently from D1 permissions. This separates
// invalid/expired/account-mismatched tokens from a D1-specific permission failure.
const tokenCheck = await cloudflareApi("/accounts/" + accountId + "/tokens/verify");
if (tokenCheck.result?.status !== "active") {
  throw new Error("Cloudflare token verification did not return active status. Check the GitHub CLOUDFLARE_API_TOKEN value and account scope.");
}
console.log("Cloudflare token verification: active for the configured account.");

const endpoint = "/accounts/" + accountId + "/d1/database";
let database;
try {
  console.log("Creating or provisioning the D1 database in APAC: " + databaseName);
  const created = await cloudflareApi(endpoint, {
    method: "POST",
    body: JSON.stringify({ name: databaseName, primary_location_hint: "apac" })
  });
  database = created.result;
} catch (createError) {
  // If it already exists, fetch it. Do not hide authentication, permission, or account-ID errors.
  const message = createError.message.toLowerCase();
  const duplicate = createError.status === 409 ||
    message.includes("already exists") ||
    message.includes("duplicate") ||
    (createError.cloudflareErrors || []).some(item => [10066, 10067].includes(item.code));
  if (!duplicate) {
    if (createError.status === 404) {
      throw new Error(createError.message + " Verify CLOUDFLARE_ACCOUNT_ID against Workers & Pages → Account Details. The D1 API uses the same Account ID.");
    }
    if (createError.status === 400 || createError.status === 403) {
      throw new Error(createError.message + " Ensure the token has Account → D1 → Edit/Write permission scoped to this account.");
    }
    throw createError;
  }
  console.log("The D1 database name already exists; retrieving its database UUID.");
  const listed = await cloudflareApi(endpoint + "?name=" + encodeURIComponent(databaseName) + "&per_page=10000");
  database = (listed.result || []).find(item => item.name === databaseName);
}

if (!database?.uuid) throw new Error("Cloudflare did not return the D1 database UUID.");

let config = await readFile(configPath, "utf8");
const hasDbBlock = config.includes("[[d1_databases]]") && config.includes('binding = "DB"');
if (!hasDbBlock) {
  const commentStart = config.indexOf("# Create a D1 database");
  const commentEnd = config.indexOf("# Store DATA_GOV_API_KEY", commentStart);
  if (commentStart >= 0 && commentEnd > commentStart) {
    config = config.slice(0, commentStart) + config.slice(commentEnd);
  }
  config = config.trimEnd() + [
    "",
    "[[d1_databases]]",
    'binding = "DB"',
    'database_name = "' + databaseName + '"',
    'database_id = "' + database.uuid + '"',
    ""
  ].join("\n");
} else {
  const blockStart = config.indexOf("[[d1_databases]]");
  const blockEnd = config.indexOf("\n[[", blockStart + 1);
  const existingBlock = config.slice(blockStart, blockEnd >= 0 ? blockEnd : undefined);
  if (!existingBlock.includes('database_name = "' + databaseName + '"') ||
      !existingBlock.includes('database_id = "' + database.uuid + '"')) {
    throw new Error("workers/wrangler.toml has a D1 DB binding, but it does not match the Cloudflare database found. Review it before redeploying.");
  }
}

await writeFile(configPath, config, "utf8");
console.log("D1 is ready: " + databaseName + ". The database UUID is stored in workers/wrangler.toml; it is not a secret.");

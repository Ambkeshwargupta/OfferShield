import { readFile, writeFile, appendFile } from "node:fs/promises";

const databaseName = "offershield-intelligence";
const configPath = "workers/wrangler.toml";
const configuredAccountId = (process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
const token = process.env.CLOUDFLARE_API_TOKEN;
// Confirmed from the Cloudflare dashboard URL shared in this conversation.
const accountId = "66f8e560965223a9f0b85a2c5a0a8895";

if (!token) throw new Error("CLOUDFLARE_API_TOKEN is required.");
if (!/^[a-f0-9]{32}$/i.test(accountId)) throw new Error("Internal Cloudflare Account ID configuration is invalid.");
if (configuredAccountId !== accountId) {
  console.log("The GitHub Account ID secret does not match the Cloudflare dashboard Account ID; using the confirmed dashboard ID.");
}
if (process.env.GITHUB_ENV) {
  await appendFile(process.env.GITHUB_ENV, "CLOUDFLARE_ACCOUNT_ID=" + accountId + "\n");
}
console.log("Using the Cloudflare dashboard Account ID for D1 provisioning.");

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
console.log("Cloudflare token ID (non-secret): " + (tokenCheck.result?.id || "not-returned"));

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
const lines = config.split(/\\r?\\n/);
const activeStart = lines.findIndex(line => /^\\s*\\[\\[d1_databases\\]\\]\\s*$/.test(line));

if (activeStart < 0) {
  // Remove the commented setup example only; do not mistake it for an active TOML table.
  config = config.replace(
    /^# Create a D1 database, then replace the placeholder database_id and uncomment:\\r?\\n# \\[\\[d1_databases\\]\\]\\r?\\n# binding = "DB"\\r?\\n# database_name = "offershield-intelligence"\\r?\\n# database_id = "REPLACE_WITH_D1_DATABASE_ID"\\r?\\n?/m,
    ""
  );
  config = config.trimEnd() + [
    "",
    "[[d1_databases]]",
    'binding = "DB"',
    'database_name = "' + databaseName + '"',
    'database_id = "' + database.uuid + '"',
    ""
  ].join("\\n");
} else {
  const nextTable = lines.findIndex((line, index) => index > activeStart && /^\\s*\\[\\[/.test(line));
  const blockLines = lines.slice(activeStart, nextTable < 0 ? lines.length : nextTable);
  const hasDbBinding = blockLines.some(line => /^\\s*binding\\s*=\\s*"DB"\\s*$/.test(line));
  if (!hasDbBinding) throw new Error("An active D1 table exists in workers/wrangler.toml but does not bind env.DB.");
  const blockText = blockLines.join("\\n");
  const nameMatch = blockText.match(/^\\s*database_name\\s*=\\s*"([^"]+)"/m);
  const idMatch = blockText.match(/^\\s*database_id\\s*=\\s*"([^"]+)"/m);
  if (nameMatch?.[1] !== databaseName || idMatch?.[1] !== database.uuid) {
    throw new Error("An active D1 DB binding exists but points to a different database. Review workers/wrangler.toml before replacing it.");
  }
}
await writeFile(configPath, config, "utf8");
console.log("D1 is ready: " + databaseName + ". The database UUID is stored in workers/wrangler.toml; it is not a secret.");

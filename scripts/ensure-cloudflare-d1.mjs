import { readFile, writeFile } from "node:fs/promises";

const databaseName = "offershield-intelligence";
const configPath = "workers/wrangler.toml";
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;

if (!accountId || !token) throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.");

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
    throw new Error("Cloudflare D1 API request failed (" + response.status + "): " + (messages.join("; ") || response.statusText));
  }
  return data;
}

const endpoint = "/accounts/" + encodeURIComponent(accountId) + "/d1/database";
const listed = await cloudflareApi(endpoint + "?name=" + encodeURIComponent(databaseName) + "&per_page=10000");
let database = (listed.result || []).find(item => item.name === databaseName);

if (!database) {
  console.log("Creating the remote D1 database in APAC: " + databaseName);
  const created = await cloudflareApi(endpoint, {
    method: "POST",
    body: JSON.stringify({ name: databaseName, primary_location_hint: "apac" })
  });
  database = created.result;
}
if (!database?.uuid) throw new Error("Cloudflare did not return a D1 database UUID.");

let config = await readFile(configPath, "utf8");
const bindingPattern = /^\\[\\[d1_databases\\]\\][\\s\\S]*?^binding\\s*=\\s*"DB"\\s*$/m;
if (!bindingPattern.test(config)) {
  config = config.replace(/\\s*# Create a D1 database[\\s\\S]*?(?=\\n# Store DATA_GOV_API_KEY)/, "");
  config = config.replace(/\\s*$/, "") + [
    "",
    "[[d1_databases]]",
    'binding = "DB"',
    'database_name = "' + databaseName + '"',
    'database_id = "' + database.uuid + '"',
    ""
  ].join("\\n");
} else {
  const existingBlock = config.match(/^\\[\\[d1_databases\\]\\]([\\s\\S]*?)(?=^\\[\\[|^\\[[^\\[]|$)/m)?.[1] || "";
  if (!existingBlock.includes('database_name = "' + databaseName + '"') ||
      !existingBlock.includes('database_id = "' + database.uuid + '"')) {
    throw new Error("workers/wrangler.toml has a D1 DB binding, but it does not match the Cloudflare database found. Review it before redeploying.");
  }
}

await writeFile(configPath, config, "utf8");
console.log("D1 is ready: " + databaseName + ". The database UUID is stored in workers/wrangler.toml; it is not a secret.");

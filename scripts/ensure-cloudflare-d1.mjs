import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const databaseName = "offershield-intelligence";
const configPath = "workers/wrangler.toml";

function parseJson(output, command) {
  const trimmed = output.replace(/^\uFEFF/, "").trim();
  try { return JSON.parse(trimmed); } catch {
    const starts = [trimmed.indexOf("["), trimmed.indexOf("{")].filter(x => x >= 0);
    if (!starts.length) throw new Error(command + " did not return JSON.");
    const start = Math.min(...starts);
    try { return JSON.parse(trimmed.slice(start)); } catch {
      throw new Error("Could not parse JSON from " + command + ".");
    }
  }
}

function findDatabase(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findDatabase(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  const name = value.name || value.database_name || value.databaseName;
  const id = value.uuid || value.database_id || value.databaseId || value.id;
  if (name === databaseName && typeof id === "string" && id.length > 10) return { name, id };
  for (const [key, nested] of Object.entries(value)) {
    if (["result", "databases", "items", "data"].includes(key)) {
      const found = findDatabase(nested);
      if (found) return found;
    }
  }
  return null;
}

function run(command, args) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

let config = await readFile(configPath, "utf8");
const d1ListOutput = run("wrangler", ["d1", "list", "--json", "--config", configPath]);
const d1List = parseJson(d1ListOutput, "wrangler d1 list");
let database = findDatabase(d1List);

if (!database) {
  console.log("Creating the remote D1 database in APAC: " + databaseName);
  run("wrangler", ["d1", "create", databaseName, "--location", "apac", "--binding", "DB", "--use-remote", "--update-config", "--config", configPath]);
  config = await readFile(configPath, "utf8");
} else {
  console.log("Found existing D1 database: " + databaseName);
  const activeBlock = /^\[\[d1_databases\]\][\s\S]*?(?=^\[\[|^\[[^\[]|\s*$)/m;
  const hasBinding = /^\[\[d1_databases\]\][\s\S]*?^binding\s*=\s*"DB"/m.test(config);
  if (!hasBinding) {
    const block = [
      "",
      "[[d1_databases]]",
      'binding = "DB"',
      'database_name = "' + databaseName + '"',
      'database_id = "' + database.id + '"',
      ""
    ].join("\n");
    config = config.replace(/\s*# Create a D1 database[\s\S]*?(?=\n# Store DATA_GOV_API_KEY)/, "");
    config = config.replace(/\s*$/, "") + block;
  } else if (!activeBlock.test(config)) {
    throw new Error("A D1 DB binding exists but could not be parsed. Review workers/wrangler.toml manually.");
  }
}

if (!/^\[\[d1_databases\]\][\s\S]*?^binding\s*=\s*"DB"/m.test(config)) {
  throw new Error("Could not configure the D1 DB binding in workers/wrangler.toml.");
}
await writeFile(configPath, config, "utf8");
console.log("D1 database is configured as env.DB. Database ID is stored in workers/wrangler.toml (not a secret).");

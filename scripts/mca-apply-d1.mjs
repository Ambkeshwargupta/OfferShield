#!/usr/bin/env node
/**
 * Apply generated MCA SQL shards to an already-created D1 database.
 * Requires Wrangler authentication and the 0002 company-index migration.
 * Run: node scripts/mca-apply-d1.mjs --database=offershield-intelligence
 */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

function args() {
  const out = {};
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    if (!raw[i].startsWith("--")) continue;
    const [key, inline] = raw[i].slice(2).split("=", 2);
    out[key] = inline ?? (raw[i + 1] && !raw[i + 1].startsWith("--") ? raw[++i] : true);
  }
  return out;
}
function run(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { stdio: "inherit", shell: process.platform === "win32" });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(command + " exited with code " + code)));
  });
}
async function main() {
  const options = args();
  const database = String(options.database || "offershield-intelligence");
  const directory = path.resolve(String(options.directory || ".data/mca/sql"));
  const remote = options.local ? "--local" : "--remote";
  const files = (await fs.readdir(directory)).filter(name => /^mca-\d{5}\.sql$/.test(name)).sort();
  if (!files.length) throw new Error("No SQL shards found in " + directory + ". Run mca-build-sql first.");
  if (!options.local && !options.remote && options.confirm !== "yes") {
    console.log("Prepared " + files.length + " SQL shards.");
    console.log("This will write the downloaded government dataset into D1 database '" + database + "'.");
    console.log("To proceed, re-run with --remote --confirm=yes");
    return;
  }
  console.log("Applying " + files.length + " shards to " + database + " (" + remote + ")...");
  for (let index = 0; index < files.length; index++) {
    const file = path.join(directory, files[index]);
    console.log("[" + (index + 1) + "/" + files.length + "] " + files[index]);
    await run(process.platform === "win32" ? "npx.cmd" : "npx", ["wrangler", "--config", "workers/wrangler.toml", "d1", "execute", database, remote, "--file=" + file]);
  }
  console.log("Import finished. Verify coverage with the SQL query in workers/README.md.");
}
main().catch(error => { console.error("D1 import failed:", error.message); process.exitCode = 1; });

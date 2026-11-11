#!/usr/bin/env node
/**
 * Convert the downloaded MCA NDJSON snapshot into bounded SQL files for D1.
 * Run: node scripts/mca-build-sql.mjs --input=.data/mca/company-master.ndjson
 */
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import readline from "node:readline";

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
function sql(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  return "'" + String(value).replace(/\0/g, "").replace(/'/g, "''") + "'";
}
function normaliseName(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
function rowValues(row) {
  const importedAt = new Date().toISOString();
  return [
    sql(row.cin?.toUpperCase()), sql(row.name), sql(normaliseName(row.name)),
    sql(row.status), sql(row.companyClass), sql(row.category), sql(row.subCategory),
    sql(row.registrationDate), sql(row.state), sql(row.roc),
    sql(row.authorizedCapital), sql(row.paidUpCapital), sql(row.registeredOffice),
    sql(row.listingStatus), sql(row.industrialClassification),
    sql(row.sourceUpdatedAt), sql(importedAt)
  ].join(",");
}
const columns = "cin,name,name_normalized,status,company_class,category,sub_category,registration_date,state,roc,authorized_capital,paid_up_capital,registered_office,listing_status,industrial_classification,source_updated_at,imported_at";
const upsert = values => "INSERT INTO companies (" + columns + ") VALUES " + values.map(v => "(" + v + ")").join(",") +
  " ON CONFLICT(cin) DO UPDATE SET name=excluded.name,name_normalized=excluded.name_normalized,status=excluded.status,company_class=excluded.company_class,category=excluded.category,sub_category=excluded.sub_category,registration_date=excluded.registration_date,state=excluded.state,roc=excluded.roc,authorized_capital=excluded.authorized_capital,paid_up_capital=excluded.paid_up_capital,registered_office=excluded.registered_office,listing_status=excluded.listing_status,industrial_classification=excluded.industrial_classification,source_updated_at=excluded.source_updated_at,imported_at=excluded.imported_at;";

async function main() {
  const options = args();
  const input = path.resolve(String(options.input || ".data/mca/company-master.ndjson"));
  const outputDir = path.resolve(String(options["output-dir"] || ".data/mca/sql"));
  const rowsPerFile = Math.max(100, Math.min(20000, Number(options["rows-per-file"]) || 5000));
  const rowsPerStatement = Math.max(1, Math.min(50, Number(options["rows-per-statement"]) || 10));
  await fs.access(input);
  await fs.mkdir(outputDir, { recursive: true });
  for (const name of await fs.readdir(outputDir)) if (/^mca-\d{5}\.sql$/.test(name)) await fs.rm(path.join(outputDir, name));

  const reader = readline.createInterface({ input: createReadStream(input), crlfDelay: Infinity });
  let sqlRows = [];
  let fileRows = 0;
  let totalRows = 0;
  let fileNo = 0;
  let fileParts = [];
  async function flushStatement() {
    if (sqlRows.length) {
      fileParts.push(upsert(sqlRows));
      sqlRows = [];
    }
  }
  async function flushFile() {
    await flushStatement();
    if (!fileRows) return;
    fileNo++;
    const target = path.join(outputDir, "mca-" + String(fileNo).padStart(5, "0") + ".sql");
    await fs.writeFile(target, "-- MCA import shard " + fileNo + "\n" + fileParts.join("\n") + "\n");
    console.log("Wrote " + target + " (" + fileRows.toLocaleString("en-IN") + " rows)");
    fileParts = [];
    fileRows = 0;
  }
  for await (const line of reader) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); }
    catch { throw new Error("Invalid NDJSON at record " + (totalRows + 1)); }
    if (!row.cin || !row.name) continue;
    sqlRows.push(rowValues(row));
    fileRows++;
    totalRows++;
    if (sqlRows.length >= rowsPerStatement) await flushStatement();
    if (fileRows >= rowsPerFile) await flushFile();
  }
  await flushFile();
  console.log("Prepared " + totalRows.toLocaleString("en-IN") + " rows in " + fileNo + " SQL files.");
  console.log("Next: npm run mca:apply -- --directory=" + path.relative(process.cwd(), outputDir));
}
main().catch(error => { console.error("SQL build failed:", error.message); process.exitCode = 1; });

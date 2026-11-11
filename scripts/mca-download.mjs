#!/usr/bin/env node
/**
 * Resumable downloader for the official MCA Company Master Data OGD resource.
 *
 * Required environment variable: DATA_GOV_API_KEY
 * Safe test: node scripts/mca-download.mjs --max-records=100
 * Full sync:  node scripts/mca-download.mjs --resume
 *
 * The API key is sent only to data.gov.in and is never written to disk or logs.
 */
import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";

const RESOURCE_ID = process.env.DATA_GOV_RESOURCE_ID || "4dbe5667-7b6b-41d7-82af-211562424d9a";
const API_BASE = "https://api.data.gov.in/resource/";
const DEFAULT_OUTPUT = ".data/mca/company-master.ndjson";
const DEFAULT_CHECKPOINT = ".data/mca/checkpoint.json";

function args() {
  const out = {};
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item.startsWith("--")) continue;
    const [key, inline] = item.slice(2).split("=", 2);
    out[key] = inline ?? (raw[i + 1] && !raw[i + 1].startsWith("--") ? raw[++i] : true);
  }
  return out;
}
function numberArg(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
function pick(record, ...keys) {
  for (const key of keys) {
    const value = record?.[key] ?? record?.[key.toLowerCase()];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  }
  return null;
}
function normalize(record, sourceUpdatedAt) {
  const cin = pick(record, "CIN", "cin")?.toUpperCase();
  const name = pick(record, "CompanyName", "company_name", "Company Name", "name");
  if (!cin || !name) return null;
  return {
    cin,
    name,
    status: pick(record, "CompanyStatus", "company_status", "Company Status", "status"),
    companyClass: pick(record, "CompanyClass", "company_class", "Company Class"),
    category: pick(record, "CompanyCategory", "company_category", "Company Category"),
    subCategory: pick(record, "CompanySubCategory", "company_sub_category", "Company Sub Category"),
    registrationDate: pick(record, "CompanyRegistrationdate_date", "DateOfRegistration", "date_of_registration", "RegistrationDate"),
    state: pick(record, "CompanyStateCode", "RegisteredState", "registered_state", "Company State"),
    roc: pick(record, "CompanyROCcode", "RegistrarOfCompanies", "registrar_of_companies"),
    authorizedCapital: pick(record, "AuthorizedCapital", "authorized_capital"),
    paidUpCapital: pick(record, "PaidupCapital", "PaidUpCapital", "paid_up_capital"),
    registeredOffice: pick(record, "Registered_Office_Address", "RegisteredOfficeAddress", "registered_office_address"),
    listingStatus: pick(record, "Listingstatus", "ListingStatus", "listing_status"),
    industrialClassification: pick(record, "CompanyIndustrialClassification", "industrial_classification", "nic_code"),
    sourceUpdatedAt: sourceUpdatedAt || null
  };
}
async function readCheckpoint(file) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
async function writeCheckpoint(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + ".tmp";
  await fs.writeFile(temp, JSON.stringify(data, null, 2) + "\n");
  await fs.rename(temp, file);
}
async function fetchPage(offset, limit, apiKey) {
  const url = new URL(RESOURCE_ID, API_BASE);
  url.searchParams.set("api-key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  for (let attempt = 0; attempt < 5; attempt++) {
    let response;
    try {
      response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(30000) });
    } catch (error) {
      if (attempt === 4) throw new Error("Could not reach data.gov.in after five attempts: " + error.message);
      await sleep(Math.min(30000, 1000 * (2 ** attempt)));
      continue;
    }
    if (response.ok) {
      const payload = await response.json();
      const records = payload.records || payload.data;
      if (!Array.isArray(records)) throw new Error("OGD response did not contain a records array. Check the resource ID and API key.");
      return { records, total: Number(payload.total || 0), updatedAt: payload.updated_date || payload.updated_on || null };
    }
    const body = await response.text().catch(() => "");
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 4) {
      throw new Error("data.gov.in returned HTTP " + response.status + ". " + body.slice(0, 300));
    }
    await sleep(Math.min(30000, 1500 * (2 ** attempt)));
  }
  throw new Error("Unable to retrieve OGD page.");
}

async function main() {
  const options = args();
  const apiKey = process.env.DATA_GOV_API_KEY;
  if (!apiKey) {
    console.error("Missing DATA_GOV_API_KEY. Set it in your local terminal environment; do not commit it or paste it into GitHub.");
    process.exitCode = 1;
    return;
  }
  if (!/^[a-f0-9-]{36}$/i.test(RESOURCE_ID)) throw new Error("DATA_GOV_RESOURCE_ID is not a valid UUID.");
  const output = path.resolve(String(options.output || DEFAULT_OUTPUT));
  const checkpointFile = path.resolve(String(options.checkpoint || DEFAULT_CHECKPOINT));
  const pageSize = numberArg(options["page-size"], 1000, 1, 10000);
  const maxRecords = options["max-records"] === undefined ? Infinity : numberArg(options["max-records"], 100, 1, 100000000);
  const maxPages = options["max-pages"] === undefined ? Infinity : numberArg(options["max-pages"], 1, 1, 10000000);
  const delayMs = numberArg(options["delay-ms"], 1100, 0, 60000);
  const resume = Boolean(options.resume);
  await fs.mkdir(path.dirname(output), { recursive: true });

  let checkpoint = resume ? await readCheckpoint(checkpointFile) : null;
  let offset = checkpoint?.nextOffset || 0;
  let downloaded = checkpoint?.downloaded || 0;
  let total = checkpoint?.total || 0;
  if (!resume) {
    await fs.writeFile(output, "");
    await fs.rm(checkpointFile, { force: true });
    downloaded = 0;
    offset = 0;
  }
  const stream = createWriteStream(output, { flags: "a" });
  let pages = 0;
  try {
    while (pages < maxPages && downloaded < maxRecords) {
      const limit = Math.min(pageSize, Number.isFinite(maxRecords) ? maxRecords - downloaded : pageSize);
      const page = await fetchPage(offset, limit, apiKey);
      if (!total && page.total) total = page.total;
      if (page.records.length === 0) break;
      const lines = page.records.map(row => normalize(row, page.updatedAt)).filter(Boolean);
      for (const row of lines) {
        if (!stream.write(JSON.stringify(row) + "\n")) await once(stream, "drain");
      }
      downloaded += page.records.length;
      offset += page.records.length;
      pages++;
      await writeCheckpoint(checkpointFile, {
        resourceId: RESOURCE_ID,
        nextOffset: offset,
        downloaded,
        total,
        pageSize,
        updatedAt: page.updatedAt,
        output: path.relative(process.cwd(), output),
        savedAt: new Date().toISOString()
      });
      console.log("Fetched " + downloaded.toLocaleString("en-IN") + (total ? " / " + total.toLocaleString("en-IN") : "") + " records; " + lines.length + " usable rows on last page.");
      if (page.records.length < limit && (!total || offset >= total)) break;
      if (delayMs) await sleep(delayMs);
    }
  } finally {
    stream.end();
    await once(stream, "close");
  }
  console.log("Saved: " + output);
  console.log("Checkpoint: " + checkpointFile);
  console.log("Resume with: node scripts/mca-download.mjs --resume");
  if (Number.isFinite(total) && total > downloaded) {
    console.log("More records remain. Re-run with --resume to continue from offset " + offset + ".");
  } else {
    console.log("Downloader stopped at offset " + offset + ". Verify the final API total before considering the snapshot complete.");
  }
}
main().catch(error => {
  console.error("MCA download failed:", error.message);
  process.exitCode = 1;
});

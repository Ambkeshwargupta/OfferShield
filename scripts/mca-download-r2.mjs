#!/usr/bin/env node
/**
 * Durable, page-by-page MCA downloader for OfferShield.
 *
 * Each normalized page is gzip-compressed and uploaded to R2 before the
 * checkpoint advances. If a runner stops, the next workflow run restores the
 * checkpoint and continues from the next offset without downloading old pages.
 *
 * Required environment:
 *   DATA_GOV_API_KEY, CLOUDFLARE_ACCOUNT_ID, R2_BUCKET_NAME
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";

const execFileAsync = promisify(execFile);
const RESOURCE_ID = process.env.DATA_GOV_RESOURCE_ID || "4dbe5667-7b6b-41d7-82af-211562424d9a";
const API_BASE = process.env.DATA_GOV_API_BASE_URL || "https://www.data.gov.in/backend/dataapi/v1/resource/";
const BUCKET = process.env.R2_BUCKET_NAME || "offershield-company-index";
const RAW_PREFIX = "ingestion/mca";
const CHECKPOINT_FILE = ".data/mca/r2-checkpoint.json";
const PAGE_DIR = ".data/mca/pages";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const parts = argv[i].slice(2).split("=", 2);
    out[parts[0]] = parts.length > 1 ? parts[1] : (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true);
  }
  return out;
}
function intArg(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
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
function awsEndpoint() {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!account) throw new Error("CLOUDFLARE_ACCOUNT_ID is required.");
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error("R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY GitHub Actions secrets are required.");
  }
  return "https://" + account + ".r2.cloudflarestorage.com";
}
async function uploadToR2(localPath, objectKey) {
  const destination = "s3://" + BUCKET + "/" + objectKey;
  try {
    await execFileAsync("aws", [
      "s3", "cp", localPath, destination,
      "--endpoint-url", awsEndpoint(),
      "--region", "auto",
      "--only-show-errors",
      "--no-progress"
    ], { timeout: 180000, maxBuffer: 1024 * 1024 });
  } catch (error) {
    // Never print command arguments: the data.gov.in key is not passed to AWS,
    // and suppressing raw stderr keeps operational logs concise.
    throw new Error("R2 upload failed for " + objectKey + ". Check the R2 bucket and S3 credentials. " + (error.code || "upload_error"));
  }
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
      response = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(45000)
      });
    } catch (error) {
      if (attempt === 4) throw new Error("Could not reach the official OGD endpoint after five attempts: " + (error.name || "network_error"));
      await sleep(Math.min(30000, 1000 * (2 ** attempt)));
      continue;
    }
    if (response.ok) {
      const payload = await response.json();
      const records = payload.records || payload.data;
      if (!Array.isArray(records)) throw new Error("OGD response did not contain a records array. Check the resource ID and API key.");
      return {
        records,
        total: Number(payload.total || payload.count || 0),
        updatedAt: payload.updated_date || payload.updated_on || null
      };
    }
    const status = response.status;
    await response.body?.cancel().catch(() => {});
    if (![429, 500, 502, 503, 504].includes(status) || attempt === 4) {
      throw new Error("The official OGD endpoint returned HTTP " + status + ".");
    }
    await sleep(Math.min(30000, 1500 * (2 ** attempt)));
  }
  throw new Error("Unable to retrieve OGD page.");
}
async function readCheckpoint(file) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + ".tmp";
  await fs.writeFile(temp, JSON.stringify(value, null, 2) + "\n");
  await fs.rename(temp, file);
}
function pageObjectKey(offset) {
  return RAW_PREFIX + "/pages/page-" + String(offset).padStart(10, "0") + ".ndjson.gz";
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const apiKey = process.env.DATA_GOV_API_KEY;
  if (!apiKey) throw new Error("DATA_GOV_API_KEY is not configured as a GitHub Actions secret.");
  if (!/^[a-f0-9-]{36}$/i.test(RESOURCE_ID)) throw new Error("DATA_GOV_RESOURCE_ID is not a valid UUID.");
  awsEndpoint();

  const pageSize = intArg(options["page-size"], 10000, 1, 10000);
  const maxRecordsArg = intArg(options["max-records"], 0, 0, 100000000);
  const maxRecords = maxRecordsArg === 0 ? Infinity : maxRecordsArg;
  const delayMs = intArg(options["delay-ms"], 1000, 0, 60000);
  const checkpoint = await readCheckpoint(CHECKPOINT_FILE);
  if (checkpoint && checkpoint.resourceId !== RESOURCE_ID) {
    throw new Error("The saved R2 checkpoint belongs to a different MCA resource. Do not reuse it.");
  }

  await fs.mkdir(PAGE_DIR, { recursive: true });
  let offset = Number(checkpoint?.nextOffset || 0);
  let downloaded = Number(checkpoint?.downloadedRecords || 0);
  let usable = Number(checkpoint?.usableRecords || 0);
  let total = Number(checkpoint?.totalRecords || 0);
  let sourceUpdatedAt = checkpoint?.sourceUpdatedAt || null;
  let pagesThisRun = 0;

  console.log("MCA import checkpoint: " + downloaded.toLocaleString("en-IN") + (total ? " / " + total.toLocaleString("en-IN") : " records") + "; next offset " + offset.toLocaleString("en-IN") + ".");
  while (downloaded < maxRecords && (!total || offset < total)) {
    const requested = Math.min(pageSize, Number.isFinite(maxRecords) ? maxRecords - downloaded : pageSize);
    const page = await fetchPage(offset, requested, apiKey);
    if (!total && page.total) total = page.total;
    if (!sourceUpdatedAt && page.updatedAt) sourceUpdatedAt = page.updatedAt;
    if (page.records.length === 0) break;

    const normalized = page.records.map(row => normalize(row, page.updatedAt || sourceUpdatedAt)).filter(Boolean);
    const payload = normalized.map(row => JSON.stringify(row)).join("\n") + (normalized.length ? "\n" : "");
    const pageName = "page-" + String(offset).padStart(10, "0") + ".ndjson.gz";
    const localPage = path.join(PAGE_DIR, pageName);
    await fs.writeFile(localPage, gzipSync(Buffer.from(payload), { level: 6 }));
    await uploadToR2(localPage, pageObjectKey(offset));

    offset += page.records.length;
    downloaded += page.records.length;
    usable += normalized.length;
    pagesThisRun++;
    const nextCheckpoint = {
      version: 1,
      resourceId: RESOURCE_ID,
      source: "MCA Company Master Data via data.gov.in",
      sourceUpdatedAt,
      totalRecords: total,
      downloadedRecords: downloaded,
      usableRecords: usable,
      nextOffset: offset,
      pageSize,
      lastPageObject: pageObjectKey(offset - page.records.length),
      updatedAt: new Date().toISOString()
    };
    await writeJsonAtomic(CHECKPOINT_FILE, nextCheckpoint);
    await uploadToR2(CHECKPOINT_FILE, RAW_PREFIX + "/checkpoint.json");

    console.log("Persisted " + downloaded.toLocaleString("en-IN") + (total ? " / " + total.toLocaleString("en-IN") : "") + " records; " + usable.toLocaleString("en-IN") + " usable company rows; page " + pagesThisRun + " this run.");
    if (delayMs && downloaded < maxRecords && (!total || offset < total)) await sleep(delayMs);
  }

  const finalCheckpoint = {
    version: 1,
    resourceId: RESOURCE_ID,
    source: "MCA Company Master Data via data.gov.in",
    sourceUpdatedAt,
    totalRecords: total,
    downloadedRecords: downloaded,
    usableRecords: usable,
    nextOffset: offset,
    pageSize,
    complete: Boolean(total && offset >= total),
    updatedAt: new Date().toISOString()
  };
  await writeJsonAtomic(CHECKPOINT_FILE, finalCheckpoint);
  await uploadToR2(CHECKPOINT_FILE, RAW_PREFIX + "/checkpoint.json");
  console.log(JSON.stringify({
    resourceId: RESOURCE_ID,
    downloadedRecords: downloaded,
    usableRecords: usable,
    totalRecords: total,
    nextOffset: offset,
    pagesThisRun,
    complete: finalCheckpoint.complete,
    checkpointObject: RAW_PREFIX + "/checkpoint.json",
    pagesObjectPrefix: RAW_PREFIX + "/pages/"
  }, null, 2));
  if (maxRecords === Infinity && total && offset < total) {
    throw new Error("The OGD source has more records, but the downloader stopped before reaching the reported total. Run again to continue from the persisted checkpoint.");
  }
}

main().catch(error => {
  console.error("MCA R2 import failed:", error.message);
  process.exitCode = 1;
});

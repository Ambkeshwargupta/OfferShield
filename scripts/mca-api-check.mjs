#!/usr/bin/env node
/**
 * Verify access to the official MCA Company Master Data OGD resource.
 * Prints metadata and field names only; never prints company records or API key.
 */
const apiKey = process.env.DATA_GOV_API_KEY;
if (!apiKey) {
  console.error("DATA_GOV_API_KEY is not configured.");
  process.exit(2);
}
const resourceId = process.env.DATA_GOV_RESOURCE_ID || "4dbe5667-7b6b-41d7-82af-211562424d9a";
const url = new URL(resourceId, "https://api.data.gov.in/resource/");
url.searchParams.set("api-key", apiKey);
url.searchParams.set("format", "json");
url.searchParams.set("limit", "5");
url.searchParams.set("offset", "0");
try {
  const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) {
    console.error("MCA OGD request failed with HTTP " + response.status + ".");
    if (response.status === 403) console.error("Check that the key is active and has access to this resource.");
    if (response.status === 429) console.error("The API key has reached a request limit. Wait and retry.");
    process.exit(1);
  }
  const payload = await response.json();
  const records = payload.records || payload.data;
  if (!Array.isArray(records)) throw new Error("The response did not contain a records array.");
  const fieldNames = records[0] ? Object.keys(records[0]) : [];
  console.log(JSON.stringify({
    connected: true,
    resourceId,
    totalRecordsReported: Number(payload.total || 0),
    recordsReturnedInSample: records.length,
    updatedDate: payload.updated_date || payload.updated_on || null,
    availableFields: fieldNames,
    nextStep: "API access confirmed. Check complete dataset size and storage strategy before a full import."
  }, null, 2));
} catch (error) {
  console.error("Could not verify MCA OGD access: " + error.message);
  process.exit(1);
}

#!/usr/bin/env node
/**
 * Diagnose the current official OGD MCA resource endpoint.
 * Never logs the API key, request URL, or company records.
 */
const apiKey = process.env.DATA_GOV_API_KEY;
if (!apiKey) {
  console.error("DATA_GOV_API_KEY is not configured.");
  process.exit(2);
}
const resourceId = process.env.DATA_GOV_RESOURCE_ID || "4dbe5667-7b6b-41d7-82af-211562424d9a";
const candidates = [
  { label:"OGD legacy API host", base:"https://api.data.gov.in/resource/" },
  { label:"OGD portal backend resource route", base:"https://www.data.gov.in/backend/dataapi/v1/resource/" },
  { label:"OGD portal backend resource route (non-www)", base:"https://data.gov.in/backend/dataapi/v1/resource/" }
];
let reachable = false;
const diagnostics = [];
for (const candidate of candidates) {
  const url = new URL(resourceId, candidate.base);
  url.searchParams.set("api-key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
  url.searchParams.set("offset", "0");
  try {
    const response = await fetch(url, {
      headers:{accept:"application/json"},
      signal:AbortSignal.timeout(15000),
      redirect:"follow"
    });
    const contentType = response.headers.get("content-type") || "";
    let payload = null;
    let responseText = "";
    if (contentType.includes("json")) {
      payload = await response.json();
    } else {
      responseText = (await response.text()).slice(0,160);
    }
    const records = payload?.records || payload?.data;
    const recordArray = Array.isArray(records) ? records : null;
    const result = {
      endpoint:candidate.label,
      httpStatus:response.status,
      contentType,
      jsonResponse:!!payload,
      statusMessage:payload?.status || payload?.message || null,
      totalRecordsReported:Number(payload?.total || 0),
      recordsReturnedInSample:recordArray?.length ?? 0,
      availableFields:recordArray?.[0] ? Object.keys(recordArray[0]) : [],
      responsePreview:!payload ? responseText.replace(/[^\\x20-\\x7E]/g," ").slice(0,120) : undefined
    };
    diagnostics.push(result);
    if (response.ok && recordArray) {
      reachable = true;
      console.log(JSON.stringify({
        connected:true,
        resourceId,
        ...result,
        nextStep:"Use the working endpoint as DATA_GOV_API_BASE_URL for the downloader and Worker."
      },null,2));
      break;
    }
  } catch (error) {
    diagnostics.push({
      endpoint:candidate.label,
      transportError:error.cause?.code || error.cause?.message || error.name || "network_error"
    });
  }
}
if (!reachable) {
  console.error(JSON.stringify({
    connected:false,
    resourceId,
    diagnostics,
    interpretation:"No tested endpoint returned JSON records. This check cannot determine whether the API key is valid when the host cannot be reached. Do not start a bulk import yet."
  },null,2));
  process.exit(1);
}

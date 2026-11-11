import {
  cleanText, normalizeDomain, classifyIdentifier, normalizeOgdRecord,
  resolveCompanyCandidates, parseEmailHeaders, compareDomains
} from "./intelligence-core.js";

const DEFAULT_OGD_RESOURCE = "4dbe5667-7b6b-41d7-82af-211562424d9a";
const ALLOWED_ORIGINS = new Set([
  "https://ambkeshwargupta.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);
const MAX_SEARCH = 120;
const DEFAULT_TTL = 86400;

function response(data, status = 200, origin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
      "vary": "Origin",
      "x-content-type-options": "nosniff"
    }
  });
}
function jsonError(message, status = 400, origin = "*", code = "bad_request") {
  return response({ error: { code, message } }, status, origin);
}
function corsOrigin(request, env = {}) {
  const origin = request.headers.get("Origin");
  if (!origin) return "*";
  const configured = String(env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
  const allowed = new Set([...ALLOWED_ORIGINS, ...configured]);
  return allowed.has(origin) ? origin : null;
}
function validPublicDomain(value) {
  const domain = normalizeDomain(value);
  if (!domain || domain === "localhost" || domain.endsWith(".local") || domain.endsWith(".internal")) return null;
  return domain;
}
async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function rateLimit(request, env) {
  if (!env.DB) return true;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = await sha256(ip + "|" + new URL(request.url).pathname);
  const bucket = Math.floor(Date.now() / 60000);
  await env.DB.prepare("INSERT INTO rate_limits (key, bucket, count) VALUES (?, ?, 1) ON CONFLICT(key,bucket) DO UPDATE SET count=count+1").bind(key, bucket).run();
  const row = await env.DB.prepare("SELECT count FROM rate_limits WHERE key=? AND bucket=?").bind(key, bucket).first();
  return (row?.count || 0) <= 30;
}
async function cachedGet(env, key) {
  if (!env.DB) return null;
  const row = await env.DB.prepare("SELECT payload, expires_at FROM api_cache WHERE cache_key=?").bind(key).first();
  if (!row || Number(row.expires_at) < Date.now()) return null;
  try { return JSON.parse(row.payload); } catch { return null; }
}
async function cachedPut(env, key, payload, ttl = DEFAULT_TTL) {
  if (!env.DB) return;
  await env.DB.prepare("INSERT INTO api_cache (cache_key,payload,expires_at,updated_at) VALUES (?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload, expires_at=excluded.expires_at, updated_at=excluded.updated_at")
    .bind(key, JSON.stringify(payload), Date.now() + ttl * 1000, Date.now()).run();
}
async function persistCompanyObservations(env, records, sourceUpdatedAt = null) {
  if (!env.DB || !records.length) return;
  const now = new Date().toISOString();
  const statements = [];
  const claims = ["name","status","class","category","subCategory","registrationDate","state","roc","authorizedCapital","paidUpCapital","registeredOffice","listingStatus","industrialClassification"];
  for (const record of records) {
    if (!record.identifier) continue;
    for (const claim of claims) {
      const value = record[claim];
      if (value === null || value === undefined || value === "") continue;
      statements.push(env.DB.prepare(
        "INSERT OR IGNORE INTO company_observations (entity_identifier,source_id,claim_type,claim_value,evidence_status,source_url,source_updated_at,retrieved_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)"
      ).bind(
        String(record.identifier), "mca-ogd", claim, String(value),
        "official_dataset_record", "https://www.data.gov.in/catalog/company-master-data",
        sourceUpdatedAt, now, Date.now() + DEFAULT_TTL * 1000
      ));
    }
  }
  if (statements.length) await env.DB.batch(statements);
}

async function ogdLookup(env, field, value, limit = 10) {
  if (!env.DATA_GOV_API_KEY) return { configured: false, records: [], message: "Configure DATA_GOV_API_KEY as a Cloudflare Worker secret to enable official OGD company-data lookup." };
  const safeField = field === "CIN" ? "CIN" : field === "CompanyName" ? "CompanyName" : null;
  if (!safeField) throw new Error("Unsupported OGD filter field.");
  const q = cleanText(value, 120).trim();
  if (!q) return { configured: true, records: [] };
  const cacheKey = "ogd:" + safeField + ":" + q.toUpperCase();
  const cached = await cachedGet(env, cacheKey);
  if (cached) return { configured: true, records: cached, cached: true };
  const resourceId = String(env.DATA_GOV_RESOURCE_ID || DEFAULT_OGD_RESOURCE).trim();
  if (!/^[a-f0-9-]{36}$/i.test(resourceId)) throw new Error("DATA_GOV_RESOURCE_ID must be a valid UUID.");
  const url = new URL("https://api.data.gov.in/resource/" + resourceId);
  url.searchParams.set("api-key", env.DATA_GOV_API_KEY);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(Math.max(1, Math.min(limit, 100))));
  url.searchParams.set("offset", "0");
  url.searchParams.set("filters[" + safeField + "]", safeField === "CompanyName" ? q.toUpperCase() : q.toUpperCase());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const upstream = await fetch(url, { signal: controller.signal, headers: { accept: "application/json" } });
    if (!upstream.ok) {
      const code = upstream.status === 429 ? "upstream_rate_limited" : "ogd_upstream_error";
      return { configured: true, records: [], error: { code, status: upstream.status, message: "The OGD API did not return a successful response. Retry later or use the official manual lookup." } };
    }
    const payload = await upstream.json();
    const rows = (payload.records || payload.data || []).map(normalizeOgdRecord).filter(x => x.identifier || x.name);
    await cachedPut(env, cacheKey, rows);
    await persistCompanyObservations(env, rows, payload.updated_date || null);
    return { configured: true, records: rows, source: "data.gov.in", sourceUrl: "https://www.data.gov.in/catalog/company-master-data", updatedDate: payload.updated_date || null, total: Number(payload.total || rows.length) };
  } catch (error) {
    return { configured: true, records: [], error: { code: "ogd_unavailable", message: error.name === "AbortError" ? "The OGD API request timed out." : "The OGD API could not be reached." } };
  } finally {
    clearTimeout(timer);
  }
}
const DEFAULT_UDYAM_RESOURCE = "8b68ae56-84cf-4728-a0a6-1be11028dea7";
const UDYAM_SOURCE_URL = "https://www.data.gov.in/resource/list-msme-registered-units-under-udyam";

function normalizeUdyamRecord(record = {}) {
  return {
    stateCode: record.LG_ST_Code ?? null,
    state: record.State ?? null,
    districtCode: record.LG_DT_Code ?? null,
    district: record.District ?? null,
    pincode: record.Pincode ?? null,
    registrationDate: record.RegistrationDate ?? null,
    enterpriseName: record.EnterpriseName ?? null,
    communicationAddress: record.CommunicationAddress ?? null,
    activities: record.Activities ?? null,
    evidenceStatus: "official_dataset_record",
    source: {
      publisher: "Ministry of Micro, Small and Medium Enterprises",
      platform: "Open Government Data Platform India",
      url: UDYAM_SOURCE_URL
    }
  };
}

async function udyamLookup(env, stateValue, districtValue, searchValue = "", limitValue = 50, offsetValue = 0) {
  const state = cleanText(stateValue, 100).trim();
  const district = cleanText(districtValue, 100).trim();
  if (!state || !district) {
    return { configured: !!env.DATA_GOV_API_KEY, records: [], error: { code:"state_district_required", message:"State and District are mandatory filters for this Udyam resource." } };
  }
  if (!env.DATA_GOV_API_KEY) {
    return { configured:false, records:[], error:{ code:"api_key_required", message:"Configure DATA_GOV_API_KEY as a Cloudflare Worker secret. The same key can be reused for the MCA and Udyam data.gov.in resources." } };
  }
  const limit = Math.max(1, Math.min(Number.parseInt(limitValue,10) || 50, 100));
  const offset = Math.max(0, Math.min(Number.parseInt(offsetValue,10) || 0, 10000000));
  const resourceId = String(env.DATA_GOV_UDYAM_RESOURCE_ID || DEFAULT_UDYAM_RESOURCE).trim();
  if (!/^[a-f0-9-]{36}$/i.test(resourceId)) {
    return { configured:true, records:[], error:{ code:"invalid_resource_id", message:"DATA_GOV_UDYAM_RESOURCE_ID must be a valid UUID." } };
  }
  const cacheKey = "udyam:" + [resourceId,state.toLowerCase(),district.toLowerCase(),limit,offset].join(":");
  const cached = await cachedGet(env, cacheKey);
  if (cached) {
    const rows = cached.records || [];
    const filtered = filterUdyamRows(rows, searchValue);
    return { ...cached, records:filtered, pageRecordCount:rows.length, matchedInPage:filtered.length, cached:true };
  }
  const url = new URL("https://api.data.gov.in/resource/" + resourceId);
  url.searchParams.set("api-key", env.DATA_GOV_API_KEY);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("filters[State]", state);
  url.searchParams.set("filters[District]", district);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const upstream = await fetch(url, { signal:controller.signal, headers:{accept:"application/json"} });
    if (!upstream.ok) {
      return {
        configured:true, records:[], error:{
          code:upstream.status === 429 ? "upstream_rate_limited" : "udyam_upstream_error",
          status:upstream.status,
          message:upstream.status === 403
            ? "data.gov.in denied this request. Confirm the API key is active and that it has access to this resource."
            : "The Udyam OGD API did not return a successful response. Check the State and District spelling and retry."
        }
      };
    }
    const payload = await upstream.json();
    const rawRows = (payload.records || payload.data || []).map(normalizeUdyamRecord)
      .filter(row => row.enterpriseName || row.pincode || row.registrationDate);
    const total = Number(payload.total ?? payload.count ?? rawRows.length);
    const responseData = {
      configured:true,
      records:rawRows,
      state,
      district,
      total,
      count:Number(payload.count ?? rawRows.length),
      limit,
      offset,
      updatedDate:payload.updated_date || payload.updated_on || null,
      source:"Ministry of Micro, Small and Medium Enterprises via data.gov.in",
      sourceUrl:UDYAM_SOURCE_URL,
      retrievedAt:new Date().toISOString(),
      availableFields:["LG_ST_Code","State","LG_DT_Code","District","Pincode","RegistrationDate","EnterpriseName","CommunicationAddress","Activities"],
      registrationNumberAvailable:false,
      limitations:[
        "The resource fields exposed in the catalogue do not include a Udyam Registration Number. This dataset cannot authenticate an individual Udyam number or certificate.",
        "State and District are mandatory filters. Enterprise-name matching is performed only against the page of records returned for those filters.",
        "A matching enterprise name is a dataset candidate, not proof that the person presenting an offer is authorised by that enterprise."
      ]
    };
    await cachedPut(env, cacheKey, responseData, 21600);
    const filtered = filterUdyamRows(rawRows, searchValue);
    return { ...responseData, records:filtered, pageRecordCount:rawRows.length, matchedInPage:filtered.length };
  } catch (error) {
    return { configured:true, records:[], error:{ code:"udyam_unavailable", message:error.name === "AbortError" ? "The Udyam OGD request timed out." : "The Udyam OGD API could not be reached." } };
  } finally {
    clearTimeout(timer);
  }
}

function filterUdyamRows(rows, query = "") {
  const q = cleanText(query,120).trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(row =>
    [row.enterpriseName,row.activities,row.pincode].some(value => String(value || "").toLowerCase().includes(q))
  );
}

async function wikidataSearch(query) {
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.search = new URLSearchParams({ action:"wbsearchentities", search:query, language:"en", uselang:"en", format:"json", limit:"8", origin:"*" }).toString();
  try {
    const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "OfferShield/1.0 (company due diligence; contact via GitHub repository)" } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.search || []).map(item => ({
      id: item.id, name: item.label || query, description: item.description || null,
      entityUrl: "https://www.wikidata.org/wiki/" + encodeURIComponent(item.id),
      source: "Wikidata", evidenceStatus: "third_party_candidate"
    }));
  } catch { return []; }
}
function companyIndexQuery(query) {
  const tokens = String(query || "").toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .match(/[a-z0-9]+/g) || [];
  return [...new Set(tokens)].filter(token => token.length >= 2).slice(0, 6);
}

async function searchNationalCompanyIndex(env, query, limit = 12) {
  if (!env.DB) return { configured:false, available:false, records:[], strategy:"d1_not_configured" };
  const identifier = classifyIdentifier(query);
  try {
    let result;
    let strategy;
    if (identifier.type === "CIN" || identifier.type === "LLPIN") {
      result = await env.DB.prepare(
        "SELECT cin,name,status,company_class,category,sub_category,registration_date,state,roc,authorized_capital,paid_up_capital,registered_office,listing_status,industrial_classification,source_updated_at FROM companies WHERE cin=? LIMIT ?"
      ).bind(identifier.value, limit).all();
      strategy = "exact_registration_identifier";
    } else {
      const tokens = companyIndexQuery(query);
      if (!tokens.length) return { configured:true, available:true, records:[], strategy:"no_searchable_tokens" };
      const match = tokens.map(token => '"' + token.replace(/"/g, '""') + '"*').join(" AND ");
      result = await env.DB.prepare(
        "SELECT c.cin,c.name,c.status,c.company_class,c.category,c.sub_category,c.registration_date,c.state,c.roc,c.authorized_capital,c.paid_up_capital,c.registered_office,c.listing_status,c.industrial_classification,c.source_updated_at FROM companies_fts JOIN companies c ON c.rowid=companies_fts.rowid WHERE companies_fts MATCH ? ORDER BY bm25(companies_fts), c.name LIMIT ?"
      ).bind(match, limit).all();
      strategy = "fts5_all_tokens_prefix";
      if (!(result.results || []).length) {
        const normalized = tokens.join(" ");
        result = await env.DB.prepare(
          "SELECT cin,name,status,company_class,category,sub_category,registration_date,state,roc,authorized_capital,paid_up_capital,registered_office,listing_status,industrial_classification,source_updated_at FROM companies WHERE name_normalized LIKE ? ORDER BY name_normalized LIMIT ?"
        ).bind(normalized + "%", limit).all();
        strategy = "normalized_name_prefix";
      }
    }
    const records = (result.results || []).map(row => ({
      identifier:row.cin, name:row.name, status:row.status, class:row.company_class,
      category:row.category, subCategory:row.sub_category, registrationDate:row.registration_date,
      state:row.state, roc:row.roc, authorizedCapital:row.authorized_capital,
      paidUpCapital:row.paid_up_capital, registeredOffice:row.registered_office,
      listingStatus:row.listing_status, industrialClassification:row.industrial_classification,
      sourceUpdatedAt:row.source_updated_at, source:"MCA Company Master Data (local indexed snapshot)",
      sourceUrl:"https://www.data.gov.in/catalog/company-master-data"
    }));
    return { configured:true, available:true, records, strategy };
  } catch (error) {
    // A database may already be bound while the new index migration has not
    // yet been applied. Keep the pre-existing exact API/Wikidata path usable.
    return {
      configured:true, available:false, records:[],
      strategy:"company_index_not_ready",
      message:"The national company index is not ready. Apply workers/migrations/0002_national_company_index.sql."
    };
  }
}

function companyResponse(record, evidenceStatus = "official_dataset_record") {
  return {
    ...record,
    evidenceStatus,
    evidenceNote: "This is a company master-data snapshot distributed by data.gov.in. It is not a live MCA portal transaction and does not verify a recruiter or individual job offer.",
    source: { name: "Ministry of Corporate Affairs via Open Government Data Platform", url: "https://www.data.gov.in/catalog/company-master-data", retrievedAt: new Date().toISOString() }
  };
}
async function resolveSearch(query, env) {
  const identifier = classifyIdentifier(query);
  if (identifier.type === "CIN") {
    const ogd = await ogdLookup(env, "CIN", identifier.value, 5);
    return { query, identifier, registry: ogd.records.map(r => companyResponse(r)), registryConfigured: ogd.configured, registryError: ogd.error || null, discovery: [], manualLookup: "https://www.mcacdm.nic.in/company-master-details" };
  }
  if (identifier.type === "LLPIN") {
    return { query, identifier, registry: [], registryConfigured: false, registryError: null, discovery: [], manualLookup: "https://www.mcacdm.nic.in/company-master-details", notes: ["This Worker connector is for the MCA company master-data resource keyed by CIN. LLPIN lookup remains an official manual MCA verification step; it is not incorrectly sent as a CIN filter."] };
  }
  if (identifier.type === "Udyam reference") {
    return { query, identifier, registry: [], registryConfigured: false, discovery: [], manualLookup: "https://udyamregistration.gov.in/Udyam_Verify.aspx", notes: ["The data.gov.in MSME registered-units dataset does not expose a Udyam Registration Number field, so it cannot confirm this exact number. Use the official Udyam verification portal for certificate/number checks."] };
  }
  const domain = validPublicDomain(query);
  if (domain) return { query, identifier, registry: [], registryConfigured: false, discovery: [], domain, manualLookup: "https://www.mcacdm.nic.in/company-master-details" };
  if (identifier.type === "Domain") {
    return { query, identifier, registry: [], registryConfigured: false, discovery: [], domain: identifier.value, manualLookup: "https://www.mcacdm.nic.in/company-master-details" };
  }
  if (identifier.type === "Company name") {
    const ogd = await ogdLookup(env, "CompanyName", identifier.value, 5);
    const discovery = await wikidataSearch(query);
    const candidates = resolveCompanyCandidates(query, discovery.map(x => ({ ...x, name:x.name, identifier:x.id })));
    return { query, identifier, registry: ogd.records.map(r => companyResponse(r)), registryConfigured: ogd.configured, registryError: ogd.error || null, discovery: candidates.slice(0, 8), manualLookup: "https://www.mcacdm.nic.in/company-master-details", notes: ["The OGD CompanyName filter is an exact match. Name variations and fuzzy matches are only discovery suggestions.", "Wikidata results are third-party candidates, not registry verification."] };
  }
  if (identifier.type === "GSTIN") {
    return { query, identifier, registry: [], registryConfigured: false, discovery: [], manualLookup: "https://services.gst.gov.in/services/searchtp", notes: ["GST public taxpayer lookup remains an official manual verification route in this release."] };
  }
  return { query, identifier, registry: [], registryConfigured: false, discovery: await wikidataSearch(query), manualLookup: "https://www.mcacdm.nic.in/company-master-details" };
}
async function dnsQuery(name, type) {
  const url = "https://dns.google/resolve?" + new URLSearchParams({ name, type, ct:"application/dns-json" }).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { accept: "application/dns-json" } });
    if (!res.ok) return { name, type, status: "unavailable", answers: [] };
    const data = await res.json();
    return { name, type, status: data.Status === 0 ? (data.Answer?.length ? "found" : "no_record") : "dns_error", answers: (data.Answer || []).map(a => ({ data:a.data, ttl:a.TTL })) };
  } catch {
    return { name, type, status: "unavailable", answers: [] };
  } finally { clearTimeout(timer); }
}
async function domainIntelligence(domainValue) {
  const domain = validPublicDomain(domainValue);
  if (!domain) return { error: "Enter a valid public domain or email address." };
  const checks = await Promise.all([
    dnsQuery(domain, "A"), dnsQuery(domain, "AAAA"), dnsQuery(domain, "MX"),
    dnsQuery(domain, "TXT"), dnsQuery(domain, "NS"), dnsQuery("_dmarc." + domain, "TXT")
  ]);
  const txt = checks.find(x => x.type === "TXT" && x.name === domain)?.answers || [];
  const mx = checks.find(x => x.type === "MX")?.answers || [];
  const spf = txt.find(x => /^"?(v=spf1\b)/i.test(x.data));
  const dmarc = checks.find(x => x.name === "_dmarc." + domain)?.answers?.find(x => /v=DMARC1/i.test(x.data)) || null;
  let rdap = null;
  try {
    const res = await fetch("https://rdap.org/domain/" + encodeURIComponent(domain), { headers: { accept:"application/rdap+json, application/json" } });
    if (res.ok) {
      const data = await res.json();
      rdap = { ldhName:data.ldhName || domain, status:data.status || [], events:(data.events||[]).filter(e=>["registration","expiration","last changed"].includes(e.eventAction)).map(e=>({action:e.eventAction,date:e.eventDate})), registrar:(data.entities||[]).find(e=>(e.roles||[]).includes("registrar"))?.vcardArray?.[1]?.find(x=>x[0]==="fn")?.[3] || null, source:"RDAP", note:"Public registration data may be redacted and can be unavailable for some TLDs." };
    } else rdap={ unavailable:true, status:res.status };
  } catch { rdap={ unavailable:true }; }
  return {
    domain,
    dns: checks,
    emailSecurity: { mxPresent:mx.length>0, spfPresent:!!spf, spfRecord:spf?.data || null, dmarcPresent:!!dmarc, dmarcRecord:dmarc?.data || null, dkim:"Requires a selector from the original email headers; this domain-only scan cannot infer it." },
    registration:rdap,
    limitations:[
      "DNS and RDAP records describe technical domain configuration and public registration data; they do not prove that the domain belongs to the claimed company.",
      "A missing SPF, DMARC or MX record is not proof of fraud. A legitimate company may use third-party mail services or different subdomains.",
      "This scan does not fetch or execute the submitted website and does not inspect private WHOIS fields."
    ],
    checkedAt:new Date().toISOString()
  };
}
function headerAnalysis(raw, expectedDomains = []) {
  const parsed = parseEmailHeaders(raw);
  const emailDomain = value => {
    const match = String(value || "").match(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/i);
    return match ? normalizeDomain(match[1]) : null;
  };
  const fromDomain = emailDomain(parsed.from);
  const replyDomain = emailDomain(parsed.replyTo);
  const returnDomain = emailDomain(parsed.returnPath);
  const comparison = fromDomain ? compareDomains(fromDomain, expectedDomains) : null;
  return {
    ...parsed,
    domains:{ from:fromDomain, replyTo:replyDomain, returnPath:returnDomain },
    replyToMismatch:!!(fromDomain && replyDomain && fromDomain !== replyDomain),
    returnPathMismatch:!!(fromDomain && returnDomain && fromDomain !== returnDomain),
    companyDomainComparison:comparison,
    limitations:"Authentication-Results are claims recorded by the receiving mail server. Pasted header text can be changed; inspect the original raw message from your mailbox. SPF/DKIM/DMARC pass does not establish recruiter employment or offer authority."
  };
}
async function route(request, env) {
  const origin = corsOrigin(request, env);
  if (origin === null) return jsonError("Origin not allowed.", 403, "null", "origin_not_allowed");
  if (request.method === "OPTIONS") return new Response(null, { status:204, headers:{"access-control-allow-origin":origin,"access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type","access-control-max-age":"86400","vary":"Origin"} });
  const url = new URL(request.url);
  if (url.pathname === "/health" || url.pathname === "/v1/health") return response({ ok:true, service:"OfferShield Intelligence API", version:"1.0.0", officialOgdConfigured:!!env.DATA_GOV_API_KEY, d1Configured:!!env.DB, checkedAt:new Date().toISOString() },200,origin);
  if (!url.pathname.startsWith("/v1/")) return jsonError("Route not found.",404,origin,"not_found");
  if (!await rateLimit(request,env)) return jsonError("Rate limit reached. Please retry in one minute.",429,origin,"rate_limited");
  if (request.method === "GET" && url.pathname === "/v1/search") {
    const query = cleanText(url.searchParams.get("q"),120).trim();
    if (query.length < 2) return jsonError("Enter at least two characters.",400,origin);
    const indexed = await searchNationalCompanyIndex(env, query, 12);
    const result = await resolveSearch(query,env);
    if (indexed.records.length) {
      const merged = new Map();
      for (const record of [...indexed.records.map(record => companyResponse(record)), ...(result.registry || [])]) {
        const key = String(record.identifier || record.name || "").toUpperCase();
        if (key && !merged.has(key)) merged.set(key, record);
      }
      result.registry = [...merged.values()];
    }
    // Keep the OGD API-key status separate from D1 index availability.
    // The frontend must not mistake a configured D1 binding for a live OGD key.
    result.nationalIndex = {
      configured:indexed.configured,
      available:indexed.available,
      indexedMatches:indexed.records.length,
      strategy:indexed.strategy,
      message:indexed.message || null
    };
    return response(result,200,origin);
  }
  if (request.method === "GET" && url.pathname === "/v1/udyam/search") {
    const state = cleanText(url.searchParams.get("state"),100).trim();
    const district = cleanText(url.searchParams.get("district"),100).trim();
    const search = cleanText(url.searchParams.get("q"),120).trim();
    const limit = url.searchParams.get("limit") || "50";
    const offset = url.searchParams.get("offset") || "0";
    if (!state || !district) return jsonError("State and District are mandatory Udyam dataset filters.",400,origin,"state_district_required");
    const result = await udyamLookup(env,state,district,search,limit,offset);
    if (result.error && result.error.code === "api_key_required") {
      return response(result,503,origin);
    }
    if (result.error && result.error.status) {
      return response(result,502,origin);
    }
    return response(result,200,origin);
  }
  if (request.method === "GET" && url.pathname.startsWith("/v1/company/")) {
    const identifier = decodeURIComponent(url.pathname.slice("/v1/company/".length));
    const parsed = classifyIdentifier(identifier);
    if (parsed.type !== "CIN") return jsonError("This endpoint currently supports CIN only. LLPIN records require the official MCA LLP lookup.",400,origin,"invalid_identifier");
    const ogd = await ogdLookup(env,"CIN",parsed.value,5);
    return response({ query:parsed.value, records:ogd.records.map(r=>companyResponse(r)), configured:ogd.configured, error:ogd.error||null, sourceUrl:"https://www.data.gov.in/catalog/company-master-data", manualLookup:"https://www.mcacdm.nic.in/company-master-details" },200,origin);
  }
  if (request.method === "GET" && url.pathname === "/v1/contacts") {
    const domain = validPublicDomain(url.searchParams.get("domain") || "");
    if (!domain) return jsonError("Enter a valid company email or website domain.",400,origin,"invalid_domain");
    if (!env.DB) return response({ domain, contacts:[], configured:false, note:"Contact directory requires the D1 source database. Use the company's own website/contact page as the independent verification channel." },200,origin);
    const rows = await env.DB.prepare("SELECT contact_type, contact_value, source_url, source_publisher, evidence_status, last_checked_at FROM public_contacts WHERE entity_identifier=? AND active=1 ORDER BY contact_type").bind(domain).all();
    return response({ domain, contacts:rows.results||[], configured:true, note:"These contacts are shown only when they have been entered into the source registry from a company-published page. Reopen the source to confirm the current details." },200,origin);
  }
  if (request.method === "GET" && url.pathname.startsWith("/v1/domain/")) {
    const value=decodeURIComponent(url.pathname.slice("/v1/domain/".length));
    const result=await domainIntelligence(value);
    if(result.error)return jsonError(result.error,400,origin,"invalid_domain");
    return response(result,200,origin);
  }
  if (request.method === "POST" && url.pathname === "/v1/email/headers") {
    let body;
    try { body=await request.json(); } catch { return jsonError("Send a JSON request body.",400,origin); }
    const raw=cleanText(body.headers,20000);
    if(raw.length<20)return jsonError("Paste the original email's raw headers.",400,origin);
    const expected=Array.isArray(body.expectedDomains)?body.expectedDomains.slice(0,20):[];
    return response(headerAnalysis(raw,expected),200,origin);
  }
  if (request.method === "GET" && url.pathname === "/v1/capabilities") {
    return response({
      capabilities:[
        {id:"mca_ogd",name:"MCA company master data via data.gov.in",configured:!!env.DATA_GOV_API_KEY,mode:env.DATA_GOV_API_KEY?"Live API connector":"Requires free data.gov.in API key",coverage:"Company/LLP master snapshot; not live MCA portal data"},
        {id:"mca_national_index",name:"National MCA full-text company index",configured:!!env.DB,mode:env.DB?"Requires 0002 migration and bulk data import":"Requires D1 binding, migration and bulk data import",coverage:"Searches imported MCA company master data locally using FTS5; coverage is limited to the snapshot actually imported"},
        {id:"udyam_ogd",name:"MSME registered units under UDYAM via data.gov.in",configured:!!env.DATA_GOV_API_KEY,mode:env.DATA_GOV_API_KEY?"Live API connector; State and District required":"Requires DATA_GOV_API_KEY secret",coverage:"EnterpriseName, State, District, Pincode, RegistrationDate, CommunicationAddress and Activities. Udyam Registration Number is not exposed by this resource."},
        {id:"wikidata",name:"Wikidata company discovery",configured:true,mode:"Public API",coverage:"Third-party discovery candidates only"},
        {id:"dns",name:"DNS email and domain checks",configured:true,mode:"Google Public DNS-over-HTTPS",coverage:"A, AAAA, MX, TXT, NS and DMARC TXT records"},
        {id:"rdap",name:"Domain registration lookup",configured:true,mode:"RDAP public lookup",coverage:"Public registration data; may be redacted or unavailable"},
        {id:"email_headers",name:"Raw email header analysis",configured:true,mode:"Local parsing in Worker",coverage:"Header fields and reported SPF/DKIM/DMARC results; original headers must be authentic"}
      ],
      limitations:["No LinkedIn scraping or private recruiter data access.","No inference of recruiter employment from a public profile.","GST verification remains an official manual lookup. The Udyam dataset search is a location-filtered enterprise list and does not expose Udyam Registration Numbers.","No automated vacancy/offer authenticity claim."]
    },200,origin);
  }
  return jsonError("Route not found.",404,origin,"not_found");
}

export default {
  async fetch(request, env) {
    try { return await route(request,env); }
    catch (error) {
      return jsonError("The intelligence service encountered an unexpected error. Please retry.",500,corsOrigin(request,env)||"*","internal_error");
    }
  },
  async scheduled(controller, env, ctx) {
    if (!env.DB) return;
    ctx.waitUntil((async () => {
      const minuteBucket = Math.floor(Date.now() / 60000);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM api_cache WHERE expires_at < ?").bind(Date.now()),
        env.DB.prepare("DELETE FROM company_observations WHERE expires_at IS NOT NULL AND expires_at < ?").bind(Date.now()),
        env.DB.prepare("DELETE FROM rate_limits WHERE bucket < ?").bind(minuteBucket - 2880)
      ]);
    })());
  }
};

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
    return { query, identifier, registry: [], registryConfigured: false, discovery: [], manualLookup: "https://udyamregistration.gov.in/Udyam_Verify.aspx", notes: ["Udyam verification remains a manual official-portal step in this release."] };
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
    const result = await resolveSearch(query,env);
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
        {id:"wikidata",name:"Wikidata company discovery",configured:true,mode:"Public API",coverage:"Third-party discovery candidates only"},
        {id:"dns",name:"DNS email and domain checks",configured:true,mode:"Google Public DNS-over-HTTPS",coverage:"A, AAAA, MX, TXT, NS and DMARC TXT records"},
        {id:"rdap",name:"Domain registration lookup",configured:true,mode:"RDAP public lookup",coverage:"Public registration data; may be redacted or unavailable"},
        {id:"email_headers",name:"Raw email header analysis",configured:true,mode:"Local parsing in Worker",coverage:"Header fields and reported SPF/DKIM/DMARC results; original headers must be authentic"}
      ],
      limitations:["No LinkedIn scraping or private recruiter data access.","No inference of recruiter employment from a public profile.","No automated GST or Udyam portal scraping; official manual lookup is linked.","No automated vacancy/offer authenticity claim."]
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
  }
};

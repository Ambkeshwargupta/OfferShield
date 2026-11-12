export function cleanText(value, max = 30000) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, "")
    .slice(0, max);
}


const INDIAN_STATE_ALIASES=new Map([
["mp","Madhya Pradesh"],["m p","Madhya Pradesh"],["madhya pradesh","Madhya Pradesh"],["mh","Maharashtra"],["maharashtra","Maharashtra"],["up","Uttar Pradesh"],["u p","Uttar Pradesh"],["uttar pradesh","Uttar Pradesh"],["rj","Rajasthan"],["gj","Gujarat"],["guj","Gujarat"],["ka","Karnataka"],["kar","Karnataka"],["ts","Telangana"],["tg","Telangana"],["ap","Andhra Pradesh"],["tn","Tamil Nadu"],["wb","West Bengal"],["br","Bihar"],["or","Odisha"],["od","Odisha"],["pb","Punjab"],["hr","Haryana"],["cg","Chhattisgarh"],["jh","Jharkhand"],["uk","Uttarakhand"],["ut","Uttarakhand"],["hp","Himachal Pradesh"],["ga","Goa"],["as","Assam"],["kl","Kerala"],["mn","Manipur"],["ml","Meghalaya"],["mz","Mizoram"],["nl","Nagaland"],["sk","Sikkim"],["tr","Tripura"],["ar","Arunachal Pradesh"],["dl","Delhi"],["nct","Delhi"],["jk","Jammu and Kashmir"],["j&k","Jammu and Kashmir"],["la","Ladakh"],["ch","Chandigarh"],["py","Puducherry"],["pondicherry","Puducherry"],["an","Andaman and Nicobar Islands"],["ld","Lakshadweep"]]);
export function normalizeIndianState(value){const raw=String(value??"").trim();if(!raw)return "";const key=raw.toLowerCase().replace(/[.]/g,"").replace(/\s+/g," ").trim();return INDIAN_STATE_ALIASES.get(key)||raw}
const INDIAN_DISTRICT_ALIASES=new Map([["bangalore","Bengaluru Urban"],["bengaluru","Bengaluru Urban"],["bangalore urban","Bengaluru Urban"],["gurgaon","Gurugram"],["allahabad","Prayagraj"],["poona","Pune"],["calcutta","Kolkata"],["trivandrum","Thiruvananthapuram"],["mysore","Mysuru"],["baroda","Vadodara"],["cochin","Ernakulam"],["bombay","Mumbai"],["new delhi","Delhi"]]);
export function normalizeIndianDistrict(value,state=""){const raw=String(value??"").trim();if(!raw)return "";const key=raw.toLowerCase().replace(/[.]/g,"").replace(/\s+/g," ").trim();return INDIAN_DISTRICT_ALIASES.get(key)||raw}

export function normalizeDomain(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  const candidate = raw.includes("@") ? raw.slice(raw.lastIndexOf("@") + 1) :
    raw.replace(/^https?:\/\//, "").split(/[/?#]/)[0].replace(/^www\./, "");
  if (!candidate || candidate.length > 253 || candidate.includes("..")) return null;
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(candidate)) return null;
  return candidate;
}

export function classifyIdentifier(value) {
  const v = String(value ?? "").trim().toUpperCase();
  if (/^[A-Z0-9]{21}$/.test(v) && /^[LU]/.test(v)) return { type: "CIN", value: v };
  if (/^[A-Z]{3}-\d{4}$/.test(v)) return { type: "LLPIN", value: v };
  if (/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v)) return { type: "GSTIN", value: v };
  if (/^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/.test(v)) return { type: "Udyam reference", value: v };
  if (normalizeDomain(v)) return { type: "Domain", value: normalizeDomain(v) };
  if (/^[A-Z0-9 .&'()-]{3,120}$/.test(v)) return { type: "Company name", value: v };
  return { type: "Unknown", value: v };
}

export function levenshtein(a, b) {
  const x = String(a ?? ""), y = String(b ?? "");
  if (!x.length) return y.length;
  if (!y.length) return x.length;
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const curr = [i];
    for (let j = 1; j <= y.length; j++) {
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = curr;
  }
  return prev[y.length];
}

export function similarity(a, b) {
  const x = String(a ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const y = String(b ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!x || !y) return 0;
  return Math.max(0, 1 - levenshtein(x, y) / Math.max(x.length, y.length));
}

export function normalizeOgdRecord(record = {}) {
  const pick = (...keys) => {
    for (const key of keys) {
      const value = record[key] ?? record[key.toLowerCase()];
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return null;
  };
  return {
    identifier: pick("CIN", "cin"),
    name: pick("CompanyName", "company_name", "Company Name", "name"),
    status: pick("CompanyStatus", "company_status", "Company Status", "status"),
    class: pick("CompanyClass", "company_class", "Company Class"),
    category: pick("CompanyCategory", "company_category", "Company Category"),
    subCategory: pick("CompanySubCategory", "company_sub_category", "Company Sub Category"),
    registrationDate: pick("CompanyRegistrationdate_date", "DateOfRegistration", "date_of_registration", "RegistrationDate"),
    state: pick("CompanyStateCode", "RegisteredState", "registered_state", "Company State"),
    roc: pick("CompanyROCcode", "RegistrarOfCompanies", "registrar_of_companies"),
    authorizedCapital: pick("AuthorizedCapital", "authorized_capital"),
    paidUpCapital: pick("PaidupCapital", "PaidUpCapital", "paid_up_capital"),
    registeredOffice: pick("Registered_Office_Address", "RegisteredOfficeAddress", "registered_office_address"),
    listingStatus: pick("Listingstatus", "ListingStatus", "listing_status"),
    industrialClassification: pick("CompanyIndustrialClassification", "industrial_classification", "nic_code"),
    source: "data.gov.in / Ministry of Corporate Affairs",
    sourceUrl: "https://www.data.gov.in/catalog/company-master-data"
  };
}

export function resolveCompanyCandidates(query, records = []) {
  const q = String(query ?? "").trim();
  const ident = classifyIdentifier(q);
  const normalized = q.toLowerCase().replace(/[^a-z0-9]/g, "");
  return records.map(record => {
    const name = record.name ?? record.CompanyName ?? "";
    const identifier = record.identifier ?? record.CIN ?? "";
    const nameScore = similarity(normalized, name);
    const idScore = String(identifier).toLowerCase() === q.toLowerCase() ? 1 : 0;
    return { ...record, matchScore: Math.max(nameScore, idScore), matchReason: idScore ? "Exact identifier match" : nameScore >= 0.92 ? "Strong name similarity" : "Possible name similarity" };
  }).filter(record => record.matchScore >= (ident.type === "Company name" ? 0.45 : 1)).sort((a, b) => b.matchScore - a.matchScore);
}

export function parseEmailHeaders(raw) {
  const text = cleanText(raw, 20000);
  const unfolded = text.replace(/\r?\n[ \t]+/g, " ");
  const get = name => {
    const match = unfolded.match(new RegExp("^" + name + ":\\s*(.+)$", "im"));
    return match?.[1]?.trim() ?? null;
  };
  const auth = [...unfolded.matchAll(/^Authentication-Results:\s*(.+)$/gim)].map(x => x[1].trim());
  const from = get("From");
  const replyTo = get("Reply-To");
  const returnPath = get("Return-Path");
  const dkim = [...unfolded.matchAll(/\bd=([^;\s]+)[^;]*;\s*s=([^;\s]+)/gi)].map(x => ({ domain: x[1].toLowerCase(), selector: x[2] }));
  const results = auth.join("; ").toLowerCase();
  const check = name => {
    const match = results.match(new RegExp("(?:^|[;\\s])" + name + "=([a-z]+)", "i"));
    return match?.[1] ?? "not reported in pasted headers";
  };
  return {
    from, replyTo, returnPath,
    authenticationResults: auth,
    spf: check("spf"),
    dkim: check("dkim"),
    dmarc: check("dmarc"),
    dkimSelectors: dkim,
    limitations: "Header text can be edited or forged before it is pasted. These results are only as trustworthy as the original message source and must be checked in the received email's original raw headers."
  };
}

export function compareDomains(observed, expected = []) {
  const domain = normalizeDomain(observed);
  if (!domain) return { state: "invalid", domain: null, detail: "The supplied value is not a valid public domain or email domain." };
  const safeExpected = expected.map(normalizeDomain).filter(Boolean);
  const match = safeExpected.find(item => domain === item || domain.endsWith("." + item));
  if (match) return { state: "consistent", domain, matchedDomain: match, detail: "The domain is consistent with a published reference domain. This does not authenticate the sender or message." };
  const close = safeExpected.map(item => ({ item, score: similarity(domain.split(".")[0], item.split(".")[0]) })).sort((a, b) => b.score - a.score)[0];
  if (close?.score >= 0.78) return { state: "lookalike_candidate", domain, similarTo: close.item, similarity: Number(close.score.toFixed(2)), detail: "This domain resembles a reference domain. Similarity is a review signal, not proof of impersonation." };
  return { state: safeExpected.length ? "not_in_reference_set" : "not_checked", domain, detail: safeExpected.length ? "The domain is not in the available reference set. Missing from the set does not prove fraud." : "No company reference domain was available for comparison." };
}

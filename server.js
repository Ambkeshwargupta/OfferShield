import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = join(ROOT, process.env.DATA_DIR || ".data");
const STORE_FILE = join(DATA_DIR, "store.json");
const MAX_BODY = 45_000;
const SESSION_DAYS = Math.max(1, Number(process.env.SESSION_DAYS || 30));

const sources = [
  { id:"mca", name:"Ministry of Corporate Affairs", kind:"Government registry", authority:"Official government", mode:"Manual lookup", url:"https://www.mcacdm.nic.in/company-master-details.php", note:"Company and LLP master details. A registry record proves a recorded legal entity, not the authority of a recruiter." },
  { id:"data-gov", name:"Data.gov.in — Company Master Data", kind:"Government data", authority:"Official government", mode:"API key / dataset access may be required", url:"https://www.data.gov.in/catalog/company-master-data", note:"Dataset catalogue. No API key is configured in this prototype." },
  { id:"gst", name:"GST taxpayer search", kind:"Government registry", authority:"Official government", mode:"Manual lookup", url:"https://services.gst.gov.in/services/searchtp", note:"Check a GSTIN and taxpayer details directly on the official portal." },
  { id:"udyam", name:"Udyam verification", kind:"Government registry", authority:"Official government", mode:"Manual lookup", url:"https://udyamregistration.gov.in/Udyam_Verify.aspx", note:"MSME registration verification; CAPTCHA or manual steps may be required." },
  { id:"epfo", name:"EPFO establishment search", kind:"Government registry", authority:"Official government", mode:"Manual lookup", url:"https://unifiedportal-emp.epfindia.gov.in/publicPortal/no-auth/misReport/home/loadEstSearchHome", note:"Employer establishment information; presence is not proof of an individual recruiter." },
  { id:"ncs", name:"National Career Service", kind:"Government employment portal", authority:"Official government", mode:"Public portal", url:"https://www.ncs.gov.in/", note:"Employment services and recruitment-related guidance." },
  { id:"cyber", name:"National Cyber Crime Reporting Portal", kind:"Reporting", authority:"Official government", mode:"Public portal", url:"https://cybercrime.gov.in/", note:"Official channel to report cybercrime. The national cybercrime helpline is 1930." },
  { id:"tcs-careers", name:"TCS India Careers", kind:"Company-owned", authority:"Official company", mode:"Public page", url:"https://www.tcs.com/careers/india", companyId:"tcs", note:"TCS India careers and entry-level opportunities." },
  { id:"tcs-fraud", name:"TCS Recruitment Fraud Alert", kind:"Company-owned recruitment notice", authority:"Official company", mode:"Public page", url:"https://www.tcs.com/careers/india/recruitment-fraud-alert", companyId:"tcs", note:"Publishes TCS recruitment fraud guidance, its @tcs.com domain guidance, and official contact details." },
  { id:"infosys-careers", name:"Infosys Careers", kind:"Company-owned", authority:"Official company", mode:"Public page", url:"https://www.infosys.com/careers/", companyId:"infosys", note:"Official Infosys careers portal." },
  { id:"infosys-fraud", name:"Infosys Recruitment Fraud Alert", kind:"Company-owned recruitment notice", authority:"Official company", mode:"Public page", url:"https://www.infosys.com/careers/apply/recruitment-fraud-alert.html", companyId:"infosys", note:"Publishes guidance about recruitment fees, interview stages and @infosys.com communication." },
  { id:"wipro-careers", name:"Wipro Careers", kind:"Company-owned", authority:"Official company", mode:"Public page", url:"https://careers.wipro.com/", companyId:"wipro", note:"Official Wipro careers and job search portal." },
  { id:"wipro-fraud", name:"Wipro Fraud Awareness", kind:"Company-owned recruitment notice", authority:"Official company", mode:"Public page", url:"https://careers.wipro.com/content/Fraud-Awareness/?locale=en_US", companyId:"wipro", note:"Publishes Wipro recruitment fraud guidance and helpdesk email." },
  { id:"ril-careers", name:"Reliance Industries Careers", kind:"Company-owned", authority:"Official company", mode:"Public page", url:"https://www.ril.com/careers", companyId:"reliance", note:"Official Reliance careers directory." },
  { id:"ril-fraud", name:"Reliance Industries Fraud Alert", kind:"Company-owned recruitment notice", authority:"Official company", mode:"Public page", url:"https://www.ril.com/careers/search-apply/fraud-alert", companyId:"reliance", note:"Publishes recruitment fraud guidance and @ril.com / @jiobp.com domain information." }
];

const companies = [
  {
    id:"tcs", name:"Tata Consultancy Services", legalName:"Tata Consultancy Services Limited", entityType:"Public company",
    website:"https://www.tcs.com/", careers:"https://www.tcs.com/careers/india", linkedin:"https://www.linkedin.com/company/tata-consultancy-services/",
    domains:["tcs.com"], sector:"IT services & consulting", label:"Official-source reference",
    summary:"TCS publishes India careers information and a dedicated recruitment fraud alert. The alert identifies @tcs.com as its hiring email domain and publishes a recruitment helpline and email.",
    contacts:[{type:"Recruitment helpline",value:"1800-209-3111",sourceId:"tcs-fraud",sourceLabel:"TCS Recruitment Fraud Alert"},{type:"Recruitment email",value:"careers@tcs.com",sourceId:"tcs-fraud",sourceLabel:"TCS Recruitment Fraud Alert"}],
    policies:[{title:"Published email domain",detail:"TCS states that hiring emails are sent from @tcs.com. Email-domain comparison is a clue only; it does not authenticate an individual sender.",sourceId:"tcs-fraud"},{title:"Offer verification",detail:"TCS describes an offer verification tool for IT hires.",sourceId:"tcs-fraud"},{title:"Careers channel",detail:"Official India careers and entry-level opportunities are listed on the TCS careers site.",sourceId:"tcs-careers"}]
  },
  {
    id:"infosys", name:"Infosys", legalName:"Infosys Limited", entityType:"Public company",
    website:"https://www.infosys.com/", careers:"https://www.infosys.com/careers/", linkedin:"https://www.linkedin.com/company/infosys/",
    domains:["infosys.com"], sector:"IT services & consulting", label:"Official-source reference",
    summary:"Infosys publishes a recruitment fraud advisory. It states that its recruitment team corresponds from @infosys.com addresses and describes its hiring process as involving at least one interview.",
    contacts:[],
    policies:[{title:"Published email domain",detail:"Infosys identifies @infosys.com as its recruitment email domain.",sourceId:"infosys-fraud"},{title:"Published process guidance",detail:"Infosys says its hiring process involves at least one interview, virtual or in person. This is published guidance, not a universal rule for every business unit or role.",sourceId:"infosys-fraud"},{title:"Careers channel",detail:"Official careers portal.",sourceId:"infosys-careers"}]
  },
  {
    id:"wipro", name:"Wipro", legalName:"Wipro Limited", entityType:"Public company",
    website:"https://www.wipro.com/", careers:"https://careers.wipro.com/", linkedin:"https://www.linkedin.com/company/wipro/",
    domains:["wipro.com"], sector:"IT services & consulting", label:"Official-source reference",
    summary:"Wipro publishes fraud-awareness guidance and a recruitment helpdesk email. Its published notice states that Wipro does not request payment for employment.",
    contacts:[{type:"Recruitment fraud helpdesk",value:"helpdesk.recruitment@wipro.com",sourceId:"wipro-fraud",sourceLabel:"Wipro Fraud Awareness"}],
    policies:[{title:"Published email domain",detail:"Wipro identifies @wipro.com as its recruitment domain.",sourceId:"wipro-fraud"},{title:"Published payment policy",detail:"Wipro states that it does not request payment from candidates for employment.",sourceId:"wipro-fraud"},{title:"Careers channel",detail:"Official Wipro careers portal and job search.",sourceId:"wipro-careers"}]
  },
  {
    id:"reliance", name:"Reliance Industries", legalName:"Reliance Industries Limited", entityType:"Public company",
    website:"https://www.ril.com/", careers:"https://www.ril.com/careers", linkedin:"https://www.linkedin.com/company/reliance-industries-limited/",
    domains:["ril.com","jiobp.com"], sector:"Energy, retail, telecom & services", label:"Official-source reference",
    summary:"Reliance publishes a careers directory and a recruitment fraud alert. Its notice identifies @ril.com and @jiobp.com as official employment communication domains.",
    contacts:[{type:"Recruitment fraud contact",value:"recruitment.fraud@ril.com",sourceId:"ril-fraud",sourceLabel:"Reliance Industries Fraud Alert"}],
    policies:[{title:"Published email domains",detail:"Reliance states that official employment communication uses @ril.com or @jiobp.com.",sourceId:"ril-fraud"},{title:"Authorised agencies",detail:"Reliance's notice says it does not appoint agents, agencies or individuals to make or issue employment offers on its behalf.",sourceId:"ril-fraud"},{title:"Careers channel",detail:"Official Reliance careers directory covering its businesses.",sourceId:"ril-careers"}]
  }
];

function ensureStore() {
  mkdirSync(DATA_DIR,{recursive:true});
  if (!existsSync(STORE_FILE)) writeFileSync(STORE_FILE, JSON.stringify({reports:[]},null,2));
}
function readStore() {
  ensureStore();
  try { return JSON.parse(readFileSync(STORE_FILE,"utf8")); }
  catch { return {reports:[]}; }
}
function writeStore(store) {
  ensureStore();
  writeFileSync(STORE_FILE,JSON.stringify(store,null,2),{mode:0o600});
}
function sha(value){return createHash("sha256").update(value).digest("hex");}
function parseCookies(header="") {
  return Object.fromEntries(header.split(";").map(part=>part.trim()).filter(Boolean).map(part=>{
    const i=part.indexOf("="); return i<0?[part,""]:[part.slice(0,i),decodeURIComponent(part.slice(i+1))];
  }));
}
function session(req,res) {
  const cookies=parseCookies(req.headers.cookie||"");
  let token=cookies.os_session;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    token=randomBytes(32).toString("hex");
    const secure=process.env.NODE_ENV==="production" ? "; Secure" : "";
    res.setHeader("Set-Cookie", "os_session="+encodeURIComponent(token)+"; Path=/; HttpOnly; SameSite=Lax; Max-Age="+(SESSION_DAYS*86400)+secure);
  }
  return sha(token);
}
function json(res,status,data) {
  const body=JSON.stringify(data);
  res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Content-Length":Buffer.byteLength(body)});
  res.end(body);
}
async function readBody(req) {
  const chunks=[]; let length=0;
  for await (const chunk of req) {
    length+=chunk.length;
    if(length>MAX_BODY) throw new Error("Request body exceeds the 45 KB limit.");
    chunks.push(chunk);
  }
  const raw=Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}
function cleanText(value,max=30000) {
  return String(value||"").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,"").replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g,"").slice(0,max);
}
function domainOf(value) {
  try {
    const raw=value.includes("@") ? "https://"+value.split("@").pop() : (value.startsWith("http")?value:"https://"+value);
    return new URL(raw).hostname.toLowerCase().replace(/^www\./,"");
  } catch { return null; }
}
function extract(text) {
  const t=cleanText(text);
  const unique=a=>[...new Set(a)];
  const emails=unique(t.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[]).map(x=>x.toLowerCase());
  const urls=unique((t.match(/\b(?:https?:\/\/|www\.)[^\s<>"'()]+/gi)||[]).map(x=>x.replace(/[.,;:!?]+$/,"")).map(x=>x.startsWith("www.")?"https://"+x:x));
  const phones=unique((t.match(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g)||[]).map(x=>x.replace(/\s+/g," ").trim()));
  const domains=unique([...emails.map(domainOf),...urls.map(domainOf)].filter(Boolean));
  const cins=unique(t.toUpperCase().match(/\b[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}\b/g)||[]);
  const gstins=unique(t.toUpperCase().match(/\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g)||[]);
  const payment=unique(t.split(/[.!?\n]+/).filter(s=>/(registration\s+(fee|charge)|security\s+deposit|processing\s+fee|verification\s+fee|refundable\s+deposit|pay.{0,35}(₹|rs\.?|inr|upi)|transfer.{0,35}(₹|rs\.?|inr|upi))/i.test(s)).map(s=>s.trim()).filter(Boolean));
  let role=null;
  const roleMatch=t.match(/(?:position|role|designation|job title)\s*(?:is|:|-|–)\s*([A-Z][A-Za-z0-9 &/+.-]{2,55})/i)||t.match(/\bas\s+(?:an?\s+)?([A-Z][A-Za-z0-9 &/+.-]{2,45}?(?:Engineer|Developer|Analyst|Intern|Associate|Executive|Manager|Consultant|Trainee|Specialist|Designer))\b/);
  if(roleMatch) role=roleMatch[1].trim();
  return {emails,urls,phones,domains,cins,gstins,paymentSignals:payment,role};
}
function analyse(text,companyId) {
  const fields=extract(text);
  const company=companies.find(c=>c.id===companyId)||null;
  const findings=[];
  if(!text.trim()) {
    findings.push({state:"unknown",title:"No message supplied",detail:"Search for a company to review its public information, or paste an offer/recruitment message to compare it."});
    return {company,fields,findings,summary:"Company information only. No offer or recruitment message was assessed.",status:"company_only"};
  }
  if(fields.domains.length) {
    if(company && company.domains.length) {
      const matched=fields.domains.filter(d=>company.domains.some(o=>d===o||d.endsWith("."+o)));
      if(matched.length) findings.push({state:"match",title:"Domain matches a company-published domain",detail:"At least one extracted domain matches a domain referenced by the company's published recruitment information ("+matched.join(", ")+"). This does not authenticate the sender, message headers, recruiter or offer."});
      const unmatched=fields.domains.filter(d=>!matched.includes(d));
      if(unmatched.length) findings.push({state:"warning",title:"Additional domain needs checking",detail:"Other extracted domain(s): "+unmatched.join(", ")+". Compare each link independently with the official company site before opening or submitting information."});
    } else {
      findings.push({state:"unknown",title:"Sender domain not cross-checked",detail:"No company-specific published domain record is available in this investigation."});
    }
  } else {
    findings.push({state:"unknown",title:"No sender email or URL found",detail:"The supplied text did not contain an email address or website URL to compare."});
  }
  if(fields.paymentSignals.length) findings.push({state:"warning",title:"Payment-related language found",detail:fields.paymentSignals.join(" · ")});
  else findings.push({state:"unknown",title:"No payment signal detected",detail:"No obvious payment request was extracted. This is not evidence that the offer is genuine."});
  if(fields.phones.length) {
    const known=company?.contacts.filter(c=>c.type.toLowerCase().includes("helpline")||c.type.toLowerCase().includes("contact")||c.type.toLowerCase().includes("fraud")).map(c=>c.value)||[];
    findings.push({state:"unknown",title:"Phone number extracted",detail:"Number(s): "+fields.phones.join(", ")+". The text scanner cannot establish ownership. "+(known.length?"Compare using the company's separately published contact(s): "+known.join(", "):"No official phone contact is recorded for this company profile.")});
  }
  if(fields.cins.length||fields.gstins.length) findings.push({state:"unknown",title:"Registration identifiers extracted",detail:"CIN: "+(fields.cins.join(", ")||"not found")+"; GSTIN: "+(fields.gstins.join(", ")||"not found")+". Open the relevant official registry and verify directly."});
  if(company) findings.push({state:"unknown",title:"Recruiter and offer authority not established",detail:"Public company information cannot confirm that the individual recruiter is authorised or that this particular vacancy/offer was issued by the company. Contact the employer through a separately sourced official channel."});
  else findings.push({state:"unknown",title:"Company not matched to a reference profile",detail:"No company-specific public-source reference profile was matched. This is a coverage gap, not proof of fraud."});
  const warning=findings.some(f=>f.state==="warning");
  const summary=warning?"One or more points need independent confirmation. Do not treat these signals as a fraud determination.":"The available information is insufficient to authenticate this offer. Review each source and independently contact the employer.";
  return {company,fields,findings,summary,status:warning?"review_required":"insufficient_data"};
}
const rate=new Map();
function rateLimit(req) {
  const ip=req.socket.remoteAddress||"unknown"; const now=Date.now(); const recent=(rate.get(ip)||[]).filter(t=>now-t<600000);
  if(recent.length>=40) return false; recent.push(now); rate.set(ip,recent); return true;
}
function pageHeaders(res) {
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Referrer-Policy","strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options","DENY");
  res.setHeader("Permissions-Policy","camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy","default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
}
function serveFile(req,res) {
  const pathname=new URL(req.url,"http://localhost").pathname;
  const requested=pathname==="/"?"/index.html":pathname;
  const resolved=normalize(join(ROOT,requested));
  if(!resolved.startsWith(ROOT)) return json(res,403,{error:"Forbidden"});
  try {
    const content=readFileSync(resolved);
    const ext=extname(resolved);
    const types={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".svg":"image/svg+xml"};
    res.writeHead(200,{"Content-Type":types[ext]||"application/octet-stream","Cache-Control":ext===".html"?"no-cache":"public, max-age=3600"});
    res.end(content);
  } catch { json(res,404,{error:"Not found"}); }
}
const server=createServer(async(req,res)=>{
  pageHeaders(res);
  const url=new URL(req.url,"http://localhost");
  const method=req.method||"GET";
  if(method==="GET"&&url.pathname==="/api/health") return json(res,200,{ok:true,app:"OfferShield",storage:"local JSON file; single instance",version:"1.0.0"});
  if(method==="GET"&&url.pathname==="/api/sources") return json(res,200,{sources});
  if(method==="GET"&&url.pathname==="/api/companies") {
    const q=(url.searchParams.get("q")||"").toLowerCase().trim();
    const result=companies.filter(c=>!q||[c.name,c.legalName,c.sector,...c.domains].join(" ").toLowerCase().includes(q)).map(({policies,contacts,...c})=>c);
    return json(res,200,{companies:result,total:result.length});
  }
  if(method==="GET"&&url.pathname.startsWith("/api/companies/")) {
    const id=url.pathname.split("/").pop(); const company=companies.find(c=>c.id===id);
    if(!company) return json(res,404,{error:"Company reference profile not found"});
    return json(res,200,{company,sources:sources.filter(s=>s.companyId===id)});
  }
  if(method==="POST"&&url.pathname==="/api/analyse") {
    if(!rateLimit(req)) return json(res,429,{error:"Too many analysis requests. Try again later."});
    try {
      const body=await readBody(req); const text=cleanText(body.text);
      const companyId=String(body.companyId||"");
      if(!text.trim()&&!companyId) return json(res,400,{error:"Paste message text or choose a company to investigate."});
      return json(res,200,analyse(text,companyId));
    } catch(e) { return json(res,400,{error:e.message||"Invalid request"}); }
  }
  if(method==="GET"&&url.pathname==="/api/reports") {
    const owner=session(req,res); const store=readStore();
    const reports=store.reports.filter(r=>r.owner===owner).map(({owner,...r})=>r);
    return json(res,200,{reports});
  }
  if(method==="POST"&&url.pathname==="/api/reports") {
    if(!rateLimit(req)) return json(res,429,{error:"Too many requests. Try again later."});
    const owner=session(req,res);
    try {
      const body=await readBody(req);
      const title=cleanText(body.title,120)||"Recruitment investigation";
      const companyId=String(body.companyId||"");
      const text=cleanText(body.text);
      const result=analyse(text,companyId);
      const report={id:randomBytes(12).toString("hex"),owner,title,companyId:result.company?.id||null,companyName:result.company?.name||"",fields:result.fields,findings:result.findings,summary:result.summary,status:result.status,createdAt:new Date().toISOString()};
      const store=readStore(); store.reports.unshift(report); store.reports=store.reports.slice(0,200); writeStore(store);
      const {owner:_,...safe}=report; return json(res,201,{report:safe});
    } catch(e) { return json(res,400,{error:e.message||"Invalid request"}); }
  }
  if(method==="DELETE"&&url.pathname.startsWith("/api/reports/")) {
    const owner=session(req,res); const id=url.pathname.split("/").pop(); const store=readStore();
    const before=store.reports.length;
    store.reports=store.reports.filter(r=>!(r.id===id&&r.owner===owner));
    writeStore(store);
    return json(res,store.reports.length<before?200:404,{deleted:store.reports.length<before});
  }
  if(method==="GET"&&url.pathname.startsWith("/api/reports/")) {
    const owner=session(req,res); const id=url.pathname.split("/").pop(); const store=readStore();
    const report=store.reports.find(r=>r.id===id&&r.owner===owner);
    if(!report) return json(res,404,{error:"Report not found in this browser session"});
    const {owner:_,...safe}=report; return json(res,200,{report:safe});
  }
  if(url.pathname.startsWith("/api/")) return json(res,404,{error:"API route not found"});
  if(method==="GET") return serveFile(req,res);
  return json(res,405,{error:"Method not allowed"});
});
server.listen(PORT,"0.0.0.0",()=>console.log("OfferShield listening on http://localhost:"+PORT));

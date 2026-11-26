#!/usr/bin/env node
/**
 * Resumable district-by-district downloader for the official UDYAM OGD resource.
 *
 * Input manifest JSON: [{ "state": "Madhya Pradesh", "district": "Rewa" }, ...]
 * Required: DATA_GOV_API_KEY
 * Test: node scripts/udyam-download.mjs --districts=data/udyam-districts.json --max-pages-per-district=1
 * Full run: node scripts/udyam-download.mjs --districts=data/udyam-districts.json --resume
 *
 * This resource requires State and District filters and does not expose Udyam Registration Numbers.
 * It is not a Udyam-number/certificate validator. Do not use CAPTCHA-protected portal scraping.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const RESOURCE_ID = process.env.DATA_GOV_UDYAM_RESOURCE_ID || "8b68ae56-84cf-4728-a0a6-1be11028dea7";
const API_BASE = process.env.DATA_GOV_API_BASE_URL || "https://www.data.gov.in/backend/dataapi/v1/resource/";
const DEFAULT_DIR = ".data/udyam";
function args() {
  const out = {};
  const raw = process.argv.slice(2);
  for (let i=0;i<raw.length;i++) {
    if (!raw[i].startsWith("--")) continue;
    const [key, inline] = raw[i].slice(2).split("=",2);
    out[key] = inline ?? (raw[i+1] && !raw[i+1].startsWith("--") ? raw[++i] : true);
  }
  return out;
}
function safePart(value) {
  return String(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,70) || "unknown";
}
async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file,"utf8")); }
  catch (e) { if(e.code==="ENOENT") return fallback; throw e; }
}
async function atomicJson(file, value) {
  await fs.mkdir(path.dirname(file),{recursive:true});
  const temp=file+".tmp";
  await fs.writeFile(temp,JSON.stringify(value,null,2)+"\n");
  await fs.rename(temp,file);
}
async function fetchPage(state,district,offset,limit,key) {
  const url=new URL(RESOURCE_ID,API_BASE);
  url.searchParams.set("api-key",key); url.searchParams.set("format","json");
  url.searchParams.set("limit",String(limit)); url.searchParams.set("offset",String(offset));
  url.searchParams.set("filters[State]",state); url.searchParams.set("filters[District]",district);
  for(let attempt=0;attempt<5;attempt++) {
    let res;
    try { res=await fetch(url,{headers:{accept:"application/json"},signal:AbortSignal.timeout(30000)}); }
    catch(e) { if(attempt===4) throw e; await sleep(Math.min(30000,1000*2**attempt)); continue; }
    if(res.ok) {
      const body=await res.json(), rows=body.records||body.data;
      if(!Array.isArray(rows)) throw new Error("OGD response has no records array; verify resource ID/API key.");
      return {rows,total:Number(body.total??body.totalRecords??body.total_records??0),updatedAt:body.updated_date||body.updated_on||null};
    }
    const detail=await res.text().catch(()=>"");
    if(![429,500,502,503,504].includes(res.status)||attempt===4) throw new Error("data.gov.in HTTP "+res.status+": "+detail.slice(0,250));
    await sleep(Math.min(30000,1500*2**attempt));
  }
  throw new Error("UDYAM request failed.");
}
async function main() {
  const opt=args(), key=process.env.DATA_GOV_API_KEY;
  if(!key) throw new Error("Set DATA_GOV_API_KEY in the environment; never commit it.");
  if(!/^[a-f0-9-]{36}$/i.test(RESOURCE_ID)) throw new Error("Invalid UDYAM resource UUID.");
  const manifestPath=path.resolve(String(opt.districts||""));
  if(!opt.districts) throw new Error("Pass --districts=path/to/official-state-district-manifest.json");
  const manifest=await readJson(manifestPath,null);
  if(!Array.isArray(manifest)||!manifest.length) throw new Error("District manifest must be a non-empty JSON array of {state,district} objects.");
  const pairs=manifest.map(x=>({state:String(x.state||"").trim(),district:String(x.district||"").trim()}));
  if(pairs.some(x=>!x.state||!x.district)) throw new Error("Every manifest row must contain state and district.");
  const outDir=path.resolve(String(opt.output||DEFAULT_DIR)), checkpointFile=path.join(outDir,"checkpoint.json");
  const pageSize=Math.max(1,Math.min(1000,Number(opt["page-size"]||1000)));
  const delay=Math.max(0,Math.min(60000,Number(opt["delay-ms"]??1100)));
  const maxPages=opt["max-pages-per-district"]===undefined?Infinity:Math.max(1,Number(opt["max-pages-per-district"]));
  const resume=!!opt.resume;
  await fs.mkdir(path.join(outDir,"pages"),{recursive:true});
  const checkpoint=resume?await readJson(checkpointFile,{resourceId:RESOURCE_ID,completed:{},districts:{}}):{resourceId:RESOURCE_ID,completed:{},districts:{}};
  if(checkpoint.resourceId!==RESOURCE_ID) throw new Error("Checkpoint resource differs; use a fresh output directory.");
  let totalRows=0, finished=0;
  for(const pair of pairs) {
    const id=safePart(pair.state)+"__"+safePart(pair.district);
    if(checkpoint.completed[id]) { finished++; continue; }
    let offset=Number(checkpoint.districts[id]?.nextOffset||0), pages=0;
    let expectedTotal=Number(checkpoint.districts[id]?.total||0);
    while(pages<maxPages) {
      const page=await fetchPage(pair.state,pair.district,offset,pageSize,key);
      if(expectedTotal&&page.total&&expectedTotal!==page.total) throw new Error("UDYAM total changed during "+pair.state+"/"+pair.district+"; stop and start a fresh snapshot.");
      if(!expectedTotal&&page.total) expectedTotal=page.total;
      if(!page.rows.length) break;
      const pageFile=path.join(outDir,"pages",id+"__"+String(offset).padStart(10,"0")+".ndjson");
      const normalized=page.rows.map(row=>({
        stateCode:row.LG_ST_Code??null,state:row.State??pair.state,
        districtCode:row.LG_DT_Code??null,district:row.District??pair.district,
        pincode:row.Pincode??null,registrationDate:row.RegistrationDate??null,
        enterpriseName:row.EnterpriseName??null,communicationAddress:row.CommunicationAddress??null,
        activities:row.Activities??null,sourceUpdatedAt:page.updatedAt||null,
        source:"Ministry of Micro, Small and Medium Enterprises via data.gov.in",
        sourceUrl:"https://www.data.gov.in/resource/list-msme-registered-units-under-udyam"
      })).filter(x=>x.enterpriseName);
      const tmp=pageFile+".tmp";
      await fs.writeFile(tmp,normalized.map(x=>JSON.stringify(x)).join("\n")+(normalized.length?"\n":""));
      await fs.rename(tmp,pageFile);
      offset+=page.rows.length; pages++; totalRows+=normalized.length;
      checkpoint.districts[id]={state:pair.state,district:pair.district,nextOffset:offset,total:expectedTotal,pages,lastPageRows:page.rows.length,updatedAt:page.updatedAt||null};
      await atomicJson(checkpointFile,{...checkpoint,resourceId:RESOURCE_ID,completed:checkpoint.completed,districts:checkpoint.districts,updatedAt:new Date().toISOString()});
      console.log(pair.state+" / "+pair.district+": "+offset+(expectedTotal?" / "+expectedTotal:"")+" source rows");
      if(page.rows.length<pageSize||(expectedTotal&&offset>=expectedTotal)) break;
      if(delay) await sleep(delay);
    }
    const state=checkpoint.districts[id];
    if(state && ((state.total&&state.nextOffset>=state.total)||state.lastPageRows<pageSize)) {
      checkpoint.completed[id]={state:pair.state,district:pair.district,sourceRows:state.nextOffset,completedAt:new Date().toISOString()};
      await atomicJson(checkpointFile,{...checkpoint,resourceId:RESOURCE_ID,completed:checkpoint.completed,districts:checkpoint.districts,updatedAt:new Date().toISOString()});
      finished++;
    } else {
      console.log("Paused "+pair.state+" / "+pair.district+"; rerun with --resume.");
    }
  }
  console.log("Finished districts: "+finished+" / "+pairs.length);
  console.log("Rows fetched this run: "+totalRows);
  console.log("Page files: "+path.join(outDir,"pages"));
  console.log("Checkpoint: "+checkpointFile);
  console.log("Important: this source has no Udyam registration-number field; it cannot authenticate individual certificates.");
}
main().catch(e=>{console.error("UDYAM download failed:",e.message);process.exitCode=1;});

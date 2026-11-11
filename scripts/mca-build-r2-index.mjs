#!/usr/bin/env node
/**
 * Build a compact, token-addressable R2 search index from the MCA NDJSON snapshot.
 *
 * Input:  .data/mca/company-master.ndjson
 * Output: mca/term/<token>/part-xxxxx.ndjson.gz plus manifest.json per token.
 *
 * The per-token manifest lets the Worker select the rarest search token and
 * read its complete posting set (within a guarded request budget), instead of
 * silently inspecting only the first couple of arbitrary shards.
 *
 * The script uses bounded-memory spool files so the full 3.7M-record dataset
 * does not need to be held in RAM.
 */
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { once } from "node:events";
import { gzipSync } from "node:zlib";

const STOP_WORDS = new Set([
  "private","limited","ltd","pvt","llp","opc","one","person","company","co",
  "the","and","of","for","at","by","in","on","a","an"
]);

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
function normaliseName(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
function tokensFor(name) {
  return [...new Set(normaliseName(name).split(" ").filter(token => token.length >= 3 && !STOP_WORDS.has(token)))];
}
function bucketFor(token, count) {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % count;
}
function compact(row) {
  return {
    i:row.cin,
    n:row.name,
    k:normaliseName(row.name),
    s:row.status || null,
    t:row.state || null,
    d:row.registrationDate || null,
    c:row.companyClass || null,
    r:row.roc || null,
    g:row.category || null,
    u:row.subCategory || null,
    a:row.authorizedCapital || null,
    p:row.paidUpCapital || null,
    o:row.registeredOffice || null,
    l:row.listingStatus || null,
    x:row.industrialClassification || null
  };
}
function shardName(partNo) {
  return "part-" + String(partNo).padStart(5, "0") + ".ndjson.gz";
}
async function writeChunk(outputDir, token, rows, partNo) {
  if (!rows.length) return 0;
  const directory = path.join(outputDir, "mca", "term", token);
  await fs.mkdir(directory, {recursive:true});
  const file = path.join(directory, shardName(partNo));
  const content = rows.map(row => JSON.stringify(row)).join("\n") + "\n";
  await fs.writeFile(file, gzipSync(Buffer.from(content), {level:6}));
  return 1;
}
async function main() {
  const options = args();
  const input = path.resolve(String(options.input || ".data/mca/company-master.ndjson"));
  const outputDir = path.resolve(String(options["output-dir"] || ".data/mca/r2-index"));
  const spoolDir = path.resolve(String(options["spool-dir"] || ".data/mca/r2-spool"));
  const spoolCount = Math.max(16, Math.min(256, Number(options["spool-count"]) || 64));
  const shardSize = Math.max(250, Math.min(10000, Number(options["shard-size"]) || 1000));
  await fs.access(input);
  await fs.rm(outputDir,{recursive:true,force:true});
  await fs.rm(spoolDir,{recursive:true,force:true});
  await fs.mkdir(spoolDir,{recursive:true});
  const streams = Array.from({length:spoolCount},(_,i)=>createWriteStream(path.join(spoolDir,"spool-"+String(i).padStart(3,"0")+".ndjson")));
  const reader = readline.createInterface({input:createReadStream(input),crlfDelay:Infinity});
  let companies=0, postings=0, skipped=0, sourceUpdatedAt=null;
  const tokenCounts = new Map();
  for await (const line of reader) {
    if (!line.trim()) continue;
    let row;
    try { row=JSON.parse(line); } catch { throw new Error("Invalid NDJSON after company record "+companies); }
    if (!row.cin || !row.name) { skipped++; continue; }
    sourceUpdatedAt = sourceUpdatedAt || row.sourceUpdatedAt || null;
    companies++;
    const posting=compact(row);
    for (const token of tokensFor(row.name)) {
      const index=bucketFor(token,spoolCount);
      if (!streams[index].write(JSON.stringify({token,posting})+"\n")) await once(streams[index],"drain");
      postings++;
      tokenCounts.set(token,(tokenCounts.get(token)||0)+1);
    }
  }
  for(const stream of streams) stream.end();
  await Promise.all(streams.map(stream=>once(stream,"close")));

  let shardCount=0, uniqueTokens=0, tokenManifestCount=0;
  for(let index=0;index<spoolCount;index++) {
    const spool=path.join(spoolDir,"spool-"+String(index).padStart(3,"0")+".ndjson");
    const stat=await fs.stat(spool);
    if(!stat.size) continue;
    const groups=new Map();
    const parts=new Map();
    const inputLines=readline.createInterface({input:createReadStream(spool),crlfDelay:Infinity});
    async function flush(token, rows) {
      if(!rows.length) return;
      const part=(parts.get(token)||0)+1;
      parts.set(token,part);
      shardCount+=await writeChunk(outputDir,token,rows,part);
      groups.set(token,[]);
    }
    for await(const line of inputLines) {
      if(!line) continue;
      const item=JSON.parse(line);
      let rows=groups.get(item.token);
      if(!rows) {
        rows=[];
        groups.set(item.token,rows);
        uniqueTokens++;
      }
      rows.push(item.posting);
      if(rows.length>=shardSize) await flush(item.token,rows);
    }
    for(const [token,rows] of groups) await flush(token,rows);

    // Each token is assigned to exactly one spool bucket. Write one compact
    // manifest listing every shard and its true posting count.
    for(const [token,partCount] of parts) {
      const directory=path.join(outputDir,"mca","term",token);
      const shards=Array.from({length:partCount},(_,i)=>"mca/term/"+token+"/"+shardName(i+1));
      const manifest={
        version:2,
        token,
        recordCount:tokenCounts.get(token)||0,
        shardCount:partCount,
        shards
      };
      await fs.writeFile(path.join(directory,"manifest.json"),JSON.stringify(manifest)+"\n");
      tokenManifestCount++;
    }
    await fs.rm(spool,{force:true});
    console.log("Processed spool "+(index+1)+"/"+spoolCount);
  }

  const manifest={
    version:2,
    resourceId:process.env.DATA_GOV_RESOURCE_ID || "4dbe5667-7b6b-41d7-82af-211562424d9a",
    source:"Ministry of Corporate Affairs via Open Government Data Platform India",
    sourceUrl:"https://www.data.gov.in/catalog/company-master-data",
    sourceUpdatedAt,
    importedCompanies:companies,
    skippedRows:skipped,
    tokenPostings:postings,
    uniqueTokens,
    shardSize,
    shardCount,
    tokenManifestCount,
    generatedAt:new Date().toISOString(),
    format:"gzip-compressed NDJSON postings with per-token shard manifests",
    objectPrefix:"index/mca/term/<token>/part-xxxxx.ndjson.gz",
    manifestPattern:"index/mca/term/<token>/manifest.json"
  };
  await fs.mkdir(outputDir,{recursive:true});
  await fs.writeFile(path.join(outputDir,"index-manifest.json"),JSON.stringify(manifest,null,2)+"\n");
  await fs.rm(spoolDir,{recursive:true,force:true});
  console.log(JSON.stringify(manifest,null,2));
}
main().catch(error=>{console.error("R2 index build failed:",error.message);process.exitCode=1;});

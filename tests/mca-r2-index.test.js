import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { gunzipSync } from "node:zlib";

async function filesRecursive(directory) {
  const output=[];
  for(const entry of await readdir(directory,{withFileTypes:true})) {
    const full=path.join(directory,entry.name);
    if(entry.isDirectory()) output.push(...await filesRecursive(full));
    else output.push(full);
  }
  return output;
}

test("MCA R2 index builder creates compact token-partitioned gzip postings",async()=>{
  const root=await mkdtemp(path.join(tmpdir(),"offershield-r2-index-"));
  const input=path.join(root,"companies.ndjson");
  const output=path.join(root,"index");
  const spool=path.join(root,"spool");
  const rows=[
    {cin:"U12345MH2020PTC123456",name:"ALPHA TECHNOLOGY PRIVATE LIMITED",status:"Active",companyClass:"Private",category:"Company limited by Shares",subCategory:"Non-government company",registrationDate:"2020-04-01",state:"Maharashtra",roc:"RoC Mumbai",authorizedCapital:"1000000",paidUpCapital:"100000",registeredOffice:"Mumbai",listingStatus:"Unlisted",industrialClassification:"62099",sourceUpdatedAt:"2026-10-13"},
    {cin:"U54321DL2021PTC654321",name:"BETA INDUSTRIES LIMITED",status:"Active",companyClass:"Public",category:"Company limited by Shares",subCategory:"Non-government company",registrationDate:"2021-04-01",state:"Delhi",roc:"RoC Delhi",authorizedCapital:"2000000",paidUpCapital:"200000",registeredOffice:"Delhi",listingStatus:"Unlisted",industrialClassification:"25999",sourceUpdatedAt:"2026-10-13"}
  ];
  await writeFile(input,rows.map(row=>JSON.stringify(row)).join("\n")+"\n");
  try {
    const result=spawnSync(process.execPath,[
      "scripts/mca-build-r2-index.mjs",
      "--input="+input,
      "--output-dir="+output,
      "--spool-dir="+spool,
      "--spool-count=16",
      "--shard-size=1"
    ],{encoding:"utf8"});
    assert.equal(result.status,0,result.stderr || result.stdout);
    const manifest=JSON.parse(await readFile(path.join(output,"index-manifest.json"),"utf8"));
    assert.equal(manifest.importedCompanies,2);
    assert.equal(manifest.tokenPostings,4);
    assert.ok(manifest.shardCount>=4);
    const shards=(await filesRecursive(output)).filter(file=>file.endsWith(".ndjson.gz"));
    assert.equal(shards.length,manifest.shardCount);
    const records=shards.flatMap(file=>gunzipSync(await readFile(file)).toString("utf8").trim().split(/\r?\n/).map(line=>JSON.parse(line)));
    assert.ok(records.some(row=>row.i===rows[0].cin && row.n===rows[0].name));
    assert.ok(records.some(row=>row.i===rows[1].cin && row.n===rows[1].name));
  } finally {
    await rm(root,{recursive:true,force:true});
  }
});

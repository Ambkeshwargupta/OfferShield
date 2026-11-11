import test from "node:test";
import assert from "node:assert/strict";
import worker from "../workers/api.js";
import { gzipSync } from "node:zlib";

function env(overrides={}) { return { ...overrides }; }
const ctx={waitUntil(){}};

test("health endpoint describes configuration without exposing secrets", async()=>{
  const response=await worker.fetch(new Request("https://api.example.workers.dev/v1/health"),env({DATA_GOV_API_KEY:"secret-value"}),ctx);
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.ok,true);
  assert.equal(body.officialOgdConfigured,true);
  assert.equal(JSON.stringify(body).includes("secret-value"),false);
});

test("rejects invalid company registration identifiers", async()=>{
  const response=await worker.fetch(new Request("https://api.example.workers.dev/v1/company/not-a-cin"),env(),ctx);
  assert.equal(response.status,400);
});

test("rejects localhost and malformed domains", async()=>{
  const response=await worker.fetch(new Request("https://api.example.workers.dev/v1/domain/localhost"),env(),ctx);
  assert.equal(response.status,400);
});

test("reports capabilities and manual fallbacks", async()=>{
  const response=await worker.fetch(new Request("https://api.example.workers.dev/v1/capabilities"),env(),ctx);
  const body=await response.json();
  assert.equal(response.status,200);
  assert.ok(body.capabilities.some(x=>x.id==="mca_ogd"));
  assert.ok(body.limitations.some(x=>x.includes("LinkedIn")));
});

test("blocks unapproved browser origins", async()=>{
  const request=new Request("https://api.example.workers.dev/v1/health",{headers:{Origin:"https://untrusted.example"}});
  const response=await worker.fetch(request,env(),ctx);
  assert.equal(response.status,403);
});

test("allows the OfferShield Pages origin", async()=>{
  const request=new Request("https://api.example.workers.dev/v1/health",{headers:{Origin:"https://ambkeshwargupta.github.io"}});
  const response=await worker.fetch(request,env(),ctx);
  assert.equal(response.status,200);
});

test("routes an email-domain search to domain intelligence, not company-name OGD", async()=>{
  const response=await worker.fetch(new Request("https://api.example.workers.dev/v1/search?q=recruiter%40careers.example.in"),env(),ctx);
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.domain,"careers.example.in");
  assert.equal(body.identifier.type,"Domain");
});

test("does not send an LLPIN into the CIN-only MCA OGD filter", async()=>{
  const response=await worker.fetch(new Request("https://api.example.workers.dev/v1/search?q=AAB-1234"),env({}),ctx);
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.identifier.type,"LLPIN");
  assert.equal(body.registryConfigured,false);
  assert.ok(body.notes[0].includes("not incorrectly sent as a CIN filter"));
});

test("scheduled cleanup removes expired cache, observations and old rate buckets", async()=>{
  const queries=[];
  const db={
    prepare(sql){return {sql,bind(...values){return {sql,values,run:async()=>{queries.push({sql,values});return {success:true}}}}}},
    batch:async statements=>{queries.push(...statements.map(s=>({sql:s.sql,values:s.values})));return {success:true}}
  };
  const ctx={waitUntil(promise){this.promise=promise}};
  await worker.scheduled({cron:"15 3 * * *"},env({DB:db}),ctx);
  await ctx.promise;
  assert.equal(queries.length,3);
  assert.ok(queries.some(q=>q.sql.includes("DELETE FROM api_cache")));
  assert.ok(queries.some(q=>q.sql.includes("DELETE FROM company_observations")));
  assert.ok(queries.some(q=>q.sql.includes("DELETE FROM rate_limits")));
});

test("Udyam route requires State and District filters", async()=>{
  const response=await worker.fetch(new Request("https://api.example.workers.dev/v1/udyam/search"),env({DATA_GOV_API_KEY:"test-key"}),ctx);
  const body=await response.json();
  assert.equal(response.status,400);
  assert.equal(body.error.code,"state_district_required");
});

test("Udyam route explains when the shared data.gov.in key is not configured", async()=>{
  const response=await worker.fetch(new Request("https://api.example.workers.dev/v1/udyam/search?state=Madhya%20Pradesh&district=Indore"),env(),ctx);
  const body=await response.json();
  assert.equal(response.status,503);
  assert.equal(body.error.code,"api_key_required");
  assert.match(body.error.message,/same key can be reused/i);
});

test("Udyam route calls the correct resource with mandatory filters and normalizes fields", async()=>{
  const originalFetch=globalThis.fetch;
  let requestedUrl=null;
  globalThis.fetch=async input=>{
    requestedUrl=new URL(input);
    return new Response(JSON.stringify({
      total:147,count:1,limit:"10",offset:"0",
      updated_date:"2026-11-10T07:30:44Z",
      records:[{
        LG_ST_Code:"23",State:"Madhya Pradesh",LG_DT_Code:"466",District:"Indore",
        Pincode:"452001",RegistrationDate:"2024-05-30",EnterpriseName:"EXAMPLE ENGINEERING",
        CommunicationAddress:"Industrial Area, Indore",Activities:"Manufacturing"
      }]
    }),{status:200,headers:{"content-type":"application/json"}});
  };
  try{
    const response=await worker.fetch(new Request("https://api.example.workers.dev/v1/udyam/search?state=Madhya%20Pradesh&district=Indore&q=engineering&limit=10&offset=0"),env({DATA_GOV_API_KEY:"test-key"}),ctx);
    const body=await response.json();
    assert.equal(response.status,200);
    assert.equal(requestedUrl.pathname,"/backend/dataapi/v1/resource/8b68ae56-84cf-4728-a0a6-1be11028dea7");
    assert.equal(requestedUrl.searchParams.get("format"),"json");
    assert.equal(requestedUrl.searchParams.get("filters[State]"),"Madhya Pradesh");
    assert.equal(requestedUrl.searchParams.get("filters[District]"),"Indore");
    assert.equal(requestedUrl.searchParams.get("limit"),"10");
    assert.equal(body.total,147);
    assert.equal(body.records[0].enterpriseName,"EXAMPLE ENGINEERING");
    assert.equal(body.records[0].state,"Madhya Pradesh");
    assert.equal(body.registrationNumberAvailable,false);
    assert.ok(body.availableFields.includes("EnterpriseName"));
    assert.equal(body.records[0].evidenceStatus,"official_dataset_record");
  }finally{globalThis.fetch=originalFetch}
});

test("Udyam page search only filters records already returned for that State/District page", async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({
    total:2,count:2,records:[
      {State:"Madhya Pradesh",District:"Indore",EnterpriseName:"ALPHA WORKS"},
      {State:"Madhya Pradesh",District:"Indore",EnterpriseName:"BETA INDUSTRIES"}
    ]
  }),{status:200,headers:{"content-type":"application/json"}});
  try{
    const response=await worker.fetch(new Request("https://api.example.workers.dev/v1/udyam/search?state=Madhya%20Pradesh&district=Indore&q=beta&limit=10"),env({DATA_GOV_API_KEY:"test-key"}),ctx);
    const body=await response.json();
    assert.equal(body.pageRecordCount,2);
    assert.equal(body.matchedInPage,1);
    assert.equal(body.records[0].enterpriseName,"BETA INDUSTRIES");
  }finally{globalThis.fetch=originalFetch}
});


test("company search uses the imported national D1 index for exact CIN matches",async()=>{
  const sample={
    cin:"U12345MH2020PTC123456",
    name:"EXAMPLE TECHNOLOGIES PRIVATE LIMITED",
    status:"Active",company_class:"Private",category:"Company limited by Shares",
    sub_category:"Non-government company",registration_date:"2020-04-01",
    state:"Maharashtra",roc:"RoC Mumbai",authorized_capital:"1000000",
    paid_up_capital:"100000",registered_office:"Mumbai, Maharashtra",
    listing_status:"Unlisted",industrial_classification:"62099",
    source_updated_at:"2026-10-13"
  };
  const db={
    prepare(sql){
      return {sql,bind(...values){
        return {
          run:async()=>({success:true}),
          first:async()=>({count:1}),
          all:async()=>({results:[sample]})
        };
      }};
    }
  };
  const response=await worker.fetch(
    new Request("https://api.example.workers.dev/v1/search?q=U12345MH2020PTC123456"),
    env({DB:db}),ctx
  );
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.nationalIndex.available,true);
  assert.equal(body.nationalIndex.strategy,"exact_registration_identifier");
  assert.equal(body.nationalIndex.indexedMatches,1);
  assert.equal(body.registry[0].identifier,sample.cin);
  assert.equal(body.registry[0].name,sample.name);
  assert.equal(body.registry[0].evidenceStatus,"official_dataset_record");
});

test("national company index reports not-ready state without breaking fallback search",async()=>{
  const db={
    prepare(sql){
      return {sql,bind(){
        return {
          run:async()=>({success:true}),
          first:async()=>({count:1}),
          all:async()=>{throw new Error("no such table: companies")}
        };
      }};
    }
  };
  const response=await worker.fetch(
    new Request("https://api.example.workers.dev/v1/search?q=U12345MH2020PTC123456"),
    env({DB:db}),ctx
  );
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.nationalIndex.available,false);
  assert.equal(body.nationalIndex.strategy,"company_index_not_ready");
  assert.match(body.nationalIndex.message,/Apply workers\/migrations/);
});


test("company name search uses the R2 national MCA token index",async()=>{
  const row={i:"U12345MH2020PTC123456",n:"EXAMPLE INDUSTRIES PRIVATE LIMITED",k:"example industries private limited",s:"Active",t:"Maharashtra",d:"2020-04-01",c:"Private",r:"RoC Mumbai"};
  const keys=[
    "mca/term/example/part-00001.ndjson.gz",
    "mca/term/industries/part-00001.ndjson.gz"
  ];
  const bucket={
    async list({prefix,limit}) {
      return {objects:keys.filter(key=>key.startsWith(prefix)).slice(0,limit).map(key=>({key})),truncated:false};
    },
    async get(key) {
      return {body:new Response(gzipSync(JSON.stringify(row)+"\n")).body};
    }
  };
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async input=>{
    const url=new URL(input);
    if(url.hostname==="dns.google") return new Response(JSON.stringify({Status:0,Answer:[]}),{status:200,headers:{"content-type":"application/json"}});
    if(url.hostname==="rdap.org") return new Response(JSON.stringify({ldhName:"example-startup.in",status:[],events:[],entities:[]}),{status:200,headers:{"content-type":"application/json"}});
    if(url.hostname==="www.data.gov.in") return new Response(JSON.stringify({
      total:1,count:1,records:[{
        LG_ST_Code:"23",State:"Madhya Pradesh",LG_DT_Code:"466",District:"Indore",
        Pincode:"452001",RegistrationDate:"2024-05-30",EnterpriseName:"EXAMPLE STARTUP",
        CommunicationAddress:"Indore, Madhya Pradesh",Activities:"Software development"
      }]
    }),{status:200,headers:{"content-type":"application/json"}});
    if(url.hostname==="www.wikidata.org") return new Response(JSON.stringify({
      search:[{id:"Q123",label:"Example Startup",description:"software company"}]
    }),{status:200,headers:{"content-type":"application/json"}});
    return new Response(JSON.stringify({search:[]}),{status:200,headers:{"content-type":"application/json"}});
  };
  try {
    const response=await worker.fetch(
      new Request("https://api.example.workers.dev/v1/search?q=Example%20Industries"),
      env({COMPANY_INDEX:bucket}),ctx
    );
    const body=await response.json();
    assert.equal(response.status,200);
    assert.equal(body.nationalIndex.strategy,"r2_token_prefix_postings");
    assert.equal(body.nationalIndex.indexedMatches,1);
    assert.equal(body.registry[0].name,row.n);
    assert.equal(body.registry[0].identifier,row.i);
    assert.equal(body.registry[0].evidenceStatus,"official_dataset_record");
  } finally {
    globalThis.fetch=originalFetch;
  }
});

test("company name search uses the R2 token manifest and scans the rarest token",async()=>{
  const row={i:"U12345MH2020PTC123456",n:"EXAMPLE INDUSTRIES PRIVATE LIMITED",k:"example industries private limited",s:"Active",t:"Maharashtra",d:"2020-04-01",c:"Private",r:"RoC Mumbai"};
  const manifests={
    example:{version:2,token:"example",recordCount:1,shardCount:1,shards:["mca/term/example/part-00001.ndjson.gz"]},
    industries:{version:2,token:"industries",recordCount:80,shardCount:1,shards:["mca/term/industries/part-00001.ndjson.gz"]}
  };
  const requested=[];
  const bucket={
    async get(key) {
      requested.push(key);
      const manifestToken=key.match(/^index\/mca\/term\/([^/]+)\/manifest\.json$/)?.[1];
      if(manifestToken) return {text:async()=>JSON.stringify(manifests[manifestToken]||null)};
      if(key==="index/mca/term/example/part-00001.ndjson.gz") {
        return {body:new Response(gzipSync(JSON.stringify(row)+"\n")).body};
      }
      return null;
    },
    async list() { return {objects:[],delimitedPrefixes:[],truncated:false}; }
  };
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({search:[]}),{status:200,headers:{"content-type":"application/json"}});
  try {
    const response=await worker.fetch(
      new Request("https://api.example.workers.dev/v1/search?q=Example%20Industries"),
      env({COMPANY_INDEX:bucket}),ctx
    );
    const body=await response.json();
    assert.equal(response.status,200);
    assert.equal(body.nationalIndex.strategy,"r2_token_manifest_postings");
    assert.equal(body.nationalIndex.indexedMatches,1);
    assert.equal(body.registry[0].name,row.n);
    assert.equal(body.registry[0].identifier,row.i);
    assert.equal(body.nationalIndex.partial,false);
    assert.equal(requested.includes("index/mca/term/example/part-00001.ndjson.gz"),true);
    assert.equal(body.registry[0].evidenceStatus,"official_dataset_record");
  } finally {
    globalThis.fetch=originalFetch;
  }
});



test("internship investigation requires Workers AI for document and offer analysis",async()=>{
  const form=new FormData();
  form.set("messageText","I received an internship offer and want to check it.");
  const response=await worker.fetch(
    new Request("https://api.example.workers.dev/v1/investigate",{method:"POST",body:form}),
    env(),ctx
  );
  const body=await response.json();
  assert.equal(response.status,503);
  assert.equal(body.error.code,"ai_not_enabled");
});

test("AI internship review parses uploaded files and separates claimed stages from confirmed company policy",async()=>{
  let convertedNames=[];
  let modelInput="";
  const ai={
    async toMarkdown(documents){
      convertedNames=documents.map(item=>item.name);
      return documents.map(item=>({
        name:item.name,
        format:"markdown",
        data:"Internship role: Frontend Developer Intern. Selection stages mentioned: coding task followed by two interviews. Stipend INR 12000 per month. Duration 3 months."
      }));
    },
    async run(model,input){
      assert.equal(model,"@cf/meta/llama-3.3-70b-instruct-fp8-fast");
      modelInput=input.messages.map(message=>message.content).join("\n");
      return {response:{
        verdict:"caution",
        riskLevel:"elevated",
        headline:"Confirm the recruiter and offer terms independently",
        summary:"The uploaded offer describes an internship and selection process, but the recruiter and vacancy have not been independently authenticated.",
        claimedCompany:"Example Startup",
        role:"Frontend Developer Intern",
        stipend:"INR 12,000 per month",
        duration:"3 months",
        workModeAndLocation:"Remote",
        explicitRecruitmentStages:["Coding task","Two interviews"],
        companyStagesConfirmed:true,
        typicalPossibleStages:["Application screening","Role interview","Written offer"],
        stageNote:"These stages were mentioned in the student-supplied offer letter.",
        redFlags:["Recruiter authority has not been independently verified."],
        consistencySignals:["The offer states a role, stipend and duration."],
        missingInformation:["No independently published recruiter contact was provided."],
        questionsToAsk:["Can the company confirm this vacancy using its official contact channel?"],
        nextSteps:["Contact the company using an independently sourced official contact."]
      }};
    }
  };
  const form=new FormData();
  form.set("companyName","Example Startup");
  form.set("recruiterName","Alex Recruiter");
  form.set("recruiterEmail","alex@example-startup.in");
  form.set("state","Madhya Pradesh");
  form.set("district","Indore");
  form.set("messageText","Please review this internship opportunity.");
  form.append("files",new File([Buffer.from("synthetic PDF fixture")],"internship-offer.pdf",{type:"application/pdf"}),"internship-offer.pdf");

  const originalFetch=globalThis.fetch;
  globalThis.fetch=async input=>{
    const url=new URL(input);
    if(url.hostname==="dns.google") return new Response(JSON.stringify({Status:0,Answer:[]}),{status:200,headers:{"content-type":"application/json"}});
    if(url.hostname==="rdap.org") return new Response(JSON.stringify({ldhName:"example-startup.in",status:[],events:[],entities:[]}),{status:200,headers:{"content-type":"application/json"}});
    return new Response(JSON.stringify({search:[]}),{status:200,headers:{"content-type":"application/json"}});
  };
  let response;
  try {
    response=await worker.fetch(
      new Request("https://api.example.workers.dev/v1/investigate",{method:"POST",body:form}),
      env({AI:ai,DATA_GOV_API_KEY:"test-data-gov-key"}),ctx
    );
  } finally {
    globalThis.fetch=originalFetch;
  }
  const body=await response.json();
  assert.equal(response.status,200);
  assert.deepEqual(convertedNames,["internship-offer.pdf"]);
  assert.match(modelInput,/Alex Recruiter/);
  assert.match(modelInput,/alex@example-startup\.in/);
  assert.equal(body.aiEnabled,true);
  assert.equal(body.verdict,"caution");
  assert.deepEqual(body.recruitmentStages.explicitStages,["Coding task","Two interviews"]);
  assert.equal(body.recruitmentStages.stagesFoundInProvidedEvidence,true);
  assert.equal(body.recruitmentStages.companyStagesConfirmed,false);
  assert.equal(body.recruiterProvided.name,"Alex Recruiter");
  assert.equal(body.recruiterProvided.email,"alex@example-startup.in");
  assert.equal(body.company.udyamMatches[0].enterpriseName,"EXAMPLE STARTUP");
  assert.equal(body.company.udyamSearch.pagesChecked,1);
  assert.equal(body.company.publicDiscovery[0].id,"Q123");
  assert.equal(body.uploadedEvidence.length,1);
  assert.equal(body.privacy.filesPersisted,false);
});

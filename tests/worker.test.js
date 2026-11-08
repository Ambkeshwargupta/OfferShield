import test from "node:test";
import assert from "node:assert/strict";
import worker from "../workers/api.js";

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

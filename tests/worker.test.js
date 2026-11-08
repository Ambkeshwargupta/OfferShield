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

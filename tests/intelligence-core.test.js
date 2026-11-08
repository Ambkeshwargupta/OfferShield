import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeDomain, classifyIdentifier, similarity, normalizeOgdRecord,
  parseEmailHeaders, compareDomains
} from "../workers/intelligence-core.js";

test("normalizes email domains and public website domains", () => {
  assert.equal(normalizeDomain("recruiter@careers.example.in"), "careers.example.in");
  assert.equal(normalizeDomain("https://www.example.in/jobs"), "example.in");
  assert.equal(normalizeDomain("localhost"), null);
  assert.equal(normalizeDomain("http://127.0.0.1"), null);
});

test("classifies CIN, LLPIN, GSTIN and company-name inputs", () => {
  assert.equal(classifyIdentifier("U72900KA2018PTC114387").type, "CIN");
  assert.equal(classifyIdentifier("AAB-1234").type, "LLPIN");
  assert.equal(classifyIdentifier("27AAPFU0939F1ZV").type, "GSTIN");
  assert.equal(classifyIdentifier("Infosys Limited").type, "Company name");
});

test("similarity detects likely spelling variants without exact identity claims", () => {
  assert.ok(similarity("Tata Consultancy Services", "Tata Consultancy Service") > 0.9);
  assert.ok(similarity("tcs.com", "infosys.com") < 0.5);
});

test("normalizes OGD company master-data fields", () => {
  const record=normalizeOgdRecord({CIN:"U12345MH2020PTC123456",CompanyName:"EXAMPLE PRIVATE LIMITED",CompanyStatus:"Active",AuthorizedCapital:"1000000"});
  assert.equal(record.identifier,"U12345MH2020PTC123456");
  assert.equal(record.name,"EXAMPLE PRIVATE LIMITED");
  assert.equal(record.status,"Active");
  assert.equal(record.authorizedCapital,"1000000");
});

test("parses email authentication and reply-to mismatch fields", () => {
  const parsed=parseEmailHeaders("From: Hiring Team <hr@example.com>\r\nReply-To: external@mail.example.net\r\nAuthentication-Results: mx.test; spf=pass; dkim=pass; dmarc=fail\r\nDKIM-Signature: v=1; d=example.com; s=selector1;");
  assert.match(parsed.from,/hr@example.com/);
  assert.equal(parsed.spf,"pass");
  assert.equal(parsed.dkim,"pass");
  assert.equal(parsed.dmarc,"fail");
  assert.equal(parsed.dkimSelectors[0].selector,"selector1");
});

test("distinguishes consistent, lookalike and unknown domains", () => {
  assert.equal(compareDomains("jobs.example.com",["example.com"]).state,"consistent");
  assert.equal(compareDomains("examp1e.com",["example.com"]).state,"lookalike_candidate");
  assert.equal(compareDomains("randomsite.in",["example.com"]).state,"not_in_reference_set");
});

test("recognises the published Udyam registration number structure", () => {
  assert.equal(classifyIdentifier("UDYAM-MH-19-0012345").type, "Udyam reference");
  assert.notEqual(classifyIdentifier("123456789012").type, "Udyam reference");
});

test("classifies email and website inputs as domains before company names", () => {
  assert.deepEqual(classifyIdentifier("recruiter@careers.example.in"), { type:"Domain", value:"careers.example.in" });
  assert.deepEqual(classifyIdentifier("https://www.example.in/jobs"), { type:"Domain", value:"example.in" });
});

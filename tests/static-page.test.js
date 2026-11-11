import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../docs/index.html", import.meta.url), "utf8");

test("GitHub Pages file includes the OfferShield product shell", () => {
  assert.match(html, /OfferShield/);
  assert.match(html, /Investigate an offer/);
  assert.match(html, /Source directory/);
  assert.doesNotMatch(html, /blank-app-v1\.svg/);
});

test("GitHub Pages app script parses as JavaScript", () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length > 0, "Expected inline application script");
  try { new vm.Script(scripts[scripts.length - 1][1]); } catch (error) { assert.fail(error.stack); }
});

test("static Pages edition stores reports in the browser and does not require server API fetches", () => {
  assert.match(html, /offershield_reports_v1/);
  assert.match(html, /function analyseStatic/);
  assert.match(html, /function DEMO_COMPANIES|const DEMO_COMPANIES/);
});

test("company search has an open-data fallback and manual path for unlisted companies", () => {
  assert.match(html, /searchOpenDataCompanies/);
  assert.match(html, /https:\/\/www\.wikidata\.org\/w\/api\.php\?action=wbsearchentities/);
  assert.match(html, /openManualCompanyFromSearch/);
  assert.match(html, /Investigate .* manually/);
  assert.match(html, /No result is not proof that a business is fake/);
});

test("third-party website matches are not labelled as verified company domains", () => {
  assert.match(html, /Domain matches a third-party listed website/);
  assert.match(html, /does not authenticate the sender/);
});

test("advanced intelligence UI exposes government, domain and email investigation", () => {
  assert.match(html, /Advanced search &amp; intelligence|Advanced search & intelligence/);
  assert.match(html, /advancedQuery/);
  assert.match(html, /domainCheckBtn/);
  assert.match(html, /rawEmailHeaders/);
  assert.match(html, /recruiterCheckBtn/);
  assert.match(html, /workerApiUrl/);
  assert.match(html, /offershield_worker_api/);
  assert.match(html, /\/v1\/search/);
  assert.match(html, /\/v1\/domain/);
  assert.match(html, /\/v1\/email\/headers/);
});

test("MCA records are visibly distinct from community discovery", () => {
  assert.match(html, /Official government dataset record/);
  assert.match(html, /Wikidata result — not registry verified/);
  assert.match(html, /not a live MCA portal query/);
});

test("overview shortcut is directly wired to Advanced Intelligence", () => {
  assert.match(html, /advancedNav\.onclick=\(\)=>go\("advanced"\)/);
});

test("advanced search recognises email and URL domain inputs without a Worker", () => {
  assert.match(html, /domainCandidate=query\.includes\("@"\)/);
  assert.match(html, /query\.replace\(\/\^https\?/);
});

test("advanced workspace exposes Udyam State/District search and pagination", () => {
  assert.match(html, /id="udyamState"/);
  assert.match(html, /id="udyamDistrict"/);
  assert.match(html, /id="udyamTextQuery"/);
  assert.match(html, /\/v1\/udyam\/search/);
  assert.match(html, /State \(required\)/);
  assert.match(html, /Udyam Registration Number/);
  assert.match(html, /udyamNextPage/);
});

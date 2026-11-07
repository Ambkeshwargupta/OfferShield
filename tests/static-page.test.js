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
  assert.doesNotThrow(() => new vm.Script(scripts[scripts.length - 1][1]));
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
  assert.match(html, /No open-data match was returned/);
});

test("third-party website matches are not labelled as verified company domains", () => {
  assert.match(html, /Domain matches a third-party listed website/);
  assert.match(html, /does not authenticate the sender/);
});

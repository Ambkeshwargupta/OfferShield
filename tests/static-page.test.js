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

test("internship investigation distinguishes past certificates from new offers", () => {
  assert.match(html, /id="reviewPurpose"/);
  assert.match(html, /value="past_internship"/);
  assert.match(html, /value="certificate_review"/);
  assert.match(html, /Document classification/);
  assert.match(html, /document classification/i);
});

test("public digital footprint report displays indexed LinkedIn, history, jobs and source links", () => {
  assert.match(html, /Public digital footprint research/);
  assert.match(html, /LinkedIn company page/);
  assert.match(html, /History and news/);
  assert.match(html, /Jobs and reviews/);
  assert.match(html, /footprint-source/);
  assert.match(html, /recruiterEmailEvidence/);
});

test("investigation results show three plain-language evidence layers", () => {
  assert.match(html, /At a glance · three separate checks/);
  assert.match(html, /Government identity/);
  assert.match(html, /Digital footprint/);
  assert.match(html, /Submitted evidence/);
});

test("public footprint section separates ecosystem partner signals from company history", () => {
  assert.match(html, /Partners and ecosystem network/);
  assert.match(html, /ecosystemNetworkResults/);
});

test("public search privacy notice excludes uploaded evidence and recruiter email from search provider", () => {
  assert.match(html, /uploaded files, chat text and recruiter email address are not sent to that search provider/);
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

test("GitHub Pages uses the deployed OfferShield Worker by default", () => {
  assert.match(html, /DEFAULT_WORKER_API="https:\/\/offershield-intelligence\.official-ambkeshwargupta\.workers\.dev"/);
  assert.match(html, /localStorage\.getItem\("offershield_worker_api"\)\|\|DEFAULT_WORKER_API/);
});

test("Community Recruitment Intelligence is available in the public navigation", () => {
  assert.match(html, /data-page="community"/);
  assert.match(html, /Community Recruitment Intelligence/);
  assert.match(html, /\/v1\/community\/reports/);
  assert.match(html, /\/v1\/community\/insights/);
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

test("navigation and hero actions have a capture-phase click fallback", () => {
  assert.match(html, /function installOfferShieldClickFallback\(\)/);
  assert.match(html, /addEventListener\("click",event=>\{/);
  assert.match(html, /event\.stopImmediatePropagation\(\);go\(target\.dataset\.page\)/);
  assert.match(html, /target\.id==="heroSearchBtn"/);
  assert.match(html, /window\.addEventListener\("error"/);
  const start = html.indexOf("function go(page){");
  const end = html.indexOf("function initials", start);
  const goSource = html.slice(start, end);
  assert.match(goSource, /\$\$\("\.page"\)\.forEach/);
  assert.match(goSource, /\$\$\("\.nav button"\)\.forEach/);
});

test("new-offer review requires key recruitment facts and actual offer evidence",()=>{
  for(const id of ["riskSourceChannel","riskContactChannel","riskPaymentAsked","riskSelectionProcess","riskWrittenOffer","riskOfferStage"]) assert.match(html,new RegExp('id="'+id+'" data-risk-required'));
  assert.match(html,/Complete the seven required risk questions/);
  assert.match(html,/Add the recruiter message, offer details or at least one screenshot\/document/);
});
test("new-offer results start with a visual warning-signal donut and category breakdown",()=>{
  assert.match(html,/riskDashboardHtml/);assert.match(html,/risk-donut/);assert.match(html,/risk-breakdown/);assert.match(html,/not a probability of fraud/i);
});
test("investigation page uses a visual hero, workflow stepper and progressive intake",()=>{
  assert.match(html,/verify-hero/);assert.match(html,/workflow-strip/);assert.match(html,/START A NEW REVIEW/);assert.match(html,/updateScreeningProgress/);
});

test("new-offer intake shows the actual-transfer question and personal payment destination",()=>{
  assert.match(html,/id="riskPaymentMade" data-risk-required/);
  assert.match(html,/id="riskPaymentRecipient"/);
  assert.match(html,/seven required risk questions/);
  assert.match(html,/paymentMade/);
});
test("investigation form is a visual three-step workflow",()=>{
  assert.match(html,/verify-hero/);
  assert.match(html,/workflow-strip/);
  assert.match(html,/companySectionHeading/);
  assert.match(html,/offerScreening/);
  assert.match(html,/evidenceSectionHeading/);
  assert.match(html,/START A NEW REVIEW/);
});
test("result summary starts with a donut warning-signal index and category bars",()=>{
  assert.match(html,/riskDashboardHtml/);
  assert.match(html,/risk-donut/);
  assert.match(html,/risk-breakdown/);
  assert.match(html,/decisionAtGlanceHtml/);
  assert.match(html,/not a probability of fraud/i);
});
test("past experience and background-only review modes hide new-offer questions",()=>{
  assert.match(html,/function toggleOfferScreening/);
  assert.match(html,/company_background/);
});

test("new-offer intake requires the actual-payment status in addition to payment request status",()=>{
  assert.match(html,/id="riskPaymentAsked" data-risk-required/);
  assert.match(html,/id="riskPaymentMade" data-risk-required/);
  assert.match(html,/id="riskPaymentRecipient"/);
  assert.match(html,/seven required risk questions/);
});
test("the application starts in new-offer mode but supports certificate and background-only modes",()=>{
  assert.match(html,/<option value="new_offer">A new offer or recruitment message/);
  assert.match(html,/function toggleOfferScreening/);
  assert.match(html,/value="certificate_review"/);
  assert.match(html,/value="company_background"/);
});

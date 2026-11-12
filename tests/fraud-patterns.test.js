import test from "node:test";
import assert from "node:assert/strict";
import {FRAUD_CASES,FRAUD_PATTERN_RULES,evaluateFraudPatterns} from "../workers/fraud-patterns.js";
test("public corpus is source-linked and reports allegation status",()=>{
 assert.ok(FRAUD_CASES.length>=6);assert.ok(FRAUD_PATTERN_RULES.length>=10);
 for(const item of FRAUD_CASES){assert.ok(item.status,item.name);assert.ok(item.sources.length,item.name);assert.ok(item.sources.every(source=>/^https:\/\//.test(source.url)),item.name)}
});
test("detects refundable internship deposit and unpaid stipend language",()=>{
 const result=evaluateFraudPatterns("I paid a refundable security deposit for this internship. The stipend was never paid after completion.","Example Startup");
 const ids=result.matchedPatterns.map(x=>x.id);
 assert.ok(ids.includes("upfront_payment_for_job"));assert.ok(ids.includes("refundable_security_deposit"));assert.ok(ids.includes("stipend_or_salary_nonpayment"));assert.ok(result.comparablePublicCases.length>0);
});
test("explicit no-fee language is not classified as a payment request",()=>{
 const result=evaluateFraudPatterns("There is no registration fee, no security deposit and no payment required for this internship.","Example Startup");
 assert.equal(result.matchedPatterns.some(x=>x.id==="upfront_payment_for_job"),false);
});
test("an exact name match is kept distinct from unrelated comparable cases",()=>{
 const result=evaluateFraudPatterns("Please investigate this company.","ThynkTech India OPC Pvt Ltd");
 assert.ok(result.companySpecificCases.some(x=>x.id==="thynktech-pune-2026"));
 assert.equal(result.comparablePublicCases.some(x=>x.id==="thynktech-pune-2026"),false);
});
test("task-rating signals require a recharge or wallet payment mechanic",()=>{
 const a=evaluateFraudPatterns("Rate five products and write a review.","");
 const b=evaluateFraudPatterns("Rate products on Telegram and recharge your wallet to withdraw earnings.","");
 assert.equal(a.matchedPatterns.some(x=>x.id==="task_recharge_or_deposit_escalation"),false);
 assert.equal(b.matchedPatterns.some(x=>x.id==="task_recharge_or_deposit_escalation"),true);
});

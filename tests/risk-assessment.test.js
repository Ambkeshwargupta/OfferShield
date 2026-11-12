import test from "node:test";
import assert from "node:assert/strict";
import {calculateRiskAssessment} from "../workers/risk-assessment.js";
const good={paymentAsked:"no",paymentMade:"no"};
test("does not invent a score without actual evidence",()=>{
 const r=calculateRiskAssessment({answers:good,evidence:""});
 assert.equal(r.available,false);assert.equal(r.score,null);assert.equal(r.band,"not_enough_info");
});
test("scores a clear placement-fee request, money transfer and suspicious payment destination",()=>{
 const r=calculateRiskAssessment({answers:{...good,paymentAsked:"yes",paymentMade:"yes",paymentType:"job_placement_fee",paymentRecipient:"personal_upi",paymentStage:"repeated",contactChannel:"whatsapp_only",selectionProcess:"direct_selection",writtenOffer:"no",offerStage:"selected",pressure:"yes"},evidence:"Pay another placement fee today to reserve your job slot.",matchedPatterns:[{id:"staged_refund_fee_escalation"}]});
 assert.ok(r.score>=65);assert.equal(r.band,"high_alert");assert.ok(r.breakdown.find(x=>x.id==="payment").points>0);
});
test("two quick no-payment answers and ordinary offer evidence do not create warning points",()=>{
 const r=calculateRiskAssessment({answers:good,evidence:"Digital marketing internship, three months, interview completed and written offer received."});
 assert.equal(r.score,0);assert.equal(r.band,"few_signals");assert.equal(r.required,2);
});
test("one answered question is enough when real evidence is present; unknown is not counted as a no",()=>{
 const r=calculateRiskAssessment({answers:{paymentAsked:"unknown",paymentMade:"yes"},evidence:"I transferred an amount to the recruiter."});
 assert.equal(r.available,true);assert.ok(r.score>0);assert.equal(r.answered,1);
 const unknown=calculateRiskAssessment({answers:{paymentAsked:"unknown",paymentMade:"unknown"},evidence:"Offer letter with a role, duration and joining date."});
 assert.equal(unknown.available,false);
});
test("a detected payment pattern can be scored even when the quick answers are unknown",()=>{
 const r=calculateRiskAssessment({answers:{paymentAsked:"unknown",paymentMade:"unknown"},evidence:"Please pay the registration fee before the interview.",matchedPatterns:[{id:"upfront_payment_for_job"}]});
 assert.equal(r.available,true);assert.ok(r.score>0);
});
test("past-experience certificates are not assigned a new-offer score",()=>{
 const r=calculateRiskAssessment({answers:good,evidence:"Internship completion certificate",reviewPurpose:"certificate_review",documentType:"internship_certificate"});
 assert.equal(r.available,false);assert.equal(r.band,"not_applicable");
});

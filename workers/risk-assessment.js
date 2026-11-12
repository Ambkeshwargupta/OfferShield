// Transparent warning-signal scoring, not a fraud probability or legal finding.
const UNKNOWN = new Set(["","unknown","not_sure","unsure","not_known"]);
export function calculateRiskAssessment({answers={},evidence="",hasFiles=false,reviewPurpose="auto",documentType="unclear",matchedPatterns=[]}={}) {
 const past=["past_internship","certificate_review","company_background"].includes(reviewPurpose)||["internship_certificate","experience_letter"].includes(documentType);
 if(past)return {available:false,score:null,band:"not_applicable",coverage:0,answered:0,required:6,breakdown:[],signals:[],note:"A new-offer risk score is not appropriate for a completed internship or company-background review."};
 const keys=["sourceChannel","contactChannel","paymentAsked","selectionProcess","writtenOffer","offerStage"];
 const answered=keys.filter(k=>!UNKNOWN.has(String(answers[k]||"").toLowerCase())).length;
 const evidenceProvided=String(evidence).trim().length>=8||hasFiles;
 const coverage=Math.min(100,Math.round(answered/keys.length*70+(evidenceProvided?30:0)));
 const canScore=evidenceProvided&&answered>=4;
 const groups=[
  {id:"payment",label:"Payment requests",points:0,max:55,details:[]},
  {id:"recruiter",label:"Recruiter channel",points:0,max:18,details:[]},
  {id:"selection",label:"Selection process",points:0,max:15,details:[]},
  {id:"offer",label:"Written offer",points:0,max:10,details:[]},
  {id:"pressure",label:"Pressure & scam patterns",points:0,max:20,details:[]}
 ];
 const add=(id,points,detail)=>{const g=groups.find(x=>x.id===id);g.points=Math.min(g.max,g.points+points);if(!g.details.includes(detail))g.details.push(detail)};
 const a=answers,pats=new Set((matchedPatterns||[]).map(x=>x.id));
 if(a.paymentAsked==="yes"){
  add("payment",35,"Money was requested to obtain or continue this opportunity.");
  if(["registration_fee","selection_fee","job_placement_fee","processing_fee"].includes(a.paymentType))add("payment",12,"A recruitment, selection, placement or processing fee was requested.");
  if(["security_deposit","refundable_deposit","equipment_deposit"].includes(a.paymentType))add("payment",12,"A security, refundable or equipment deposit was requested.");
  if(a.paymentType==="task_wallet_recharge")add("payment",18,"A wallet recharge or task deposit was requested.");
  if(a.paymentType==="training_fee")add("payment",6,"A training fee is tied to the opportunity; inspect its terms and placement promise.");
  if(a.paymentStage==="repeated")add("payment",10,"Repeated or escalating payment requests were reported.");
 }
 if(a.pressure==="yes")add("pressure",8,"Urgency, a limited slot or pressure to pay/decide quickly was reported.");
 if(a.contactChannel==="personal_email")add("recruiter",10,"The recruiter used a personal email account.");
 if(["whatsapp_only","telegram_only"].includes(a.contactChannel))add("recruiter",8,"Recruitment communication happened only through a messaging app.");
 if(["direct_selection","no_interaction"].includes(a.selectionProcess))add("selection",12,"Selection reportedly happened without an interview or meaningful assessment.");
 if(a.offerStage==="selected"&&["no","verbal_only"].includes(a.writtenOffer))add("offer",8,"Selection was reported without a written offer.");
 if(pats.has("upfront_payment_for_job")&&a.paymentAsked!=="yes")add("pressure",12,"The submitted message contains payment wording that conflicts with the questionnaire.");
 if(pats.has("task_recharge_or_deposit_escalation"))add("pressure",15,"The evidence resembles a task-wallet recharge or deposit escalation.");
 if(pats.has("staged_refund_fee_escalation"))add("pressure",15,"The evidence resembles staged fees with refund promises.");
 if(pats.has("government_employer_impersonation")||pats.has("recruiter_or_employer_impersonation"))add("pressure",14,"The evidence contains a possible recruiter or public-employer impersonation signal.");
 if(pats.has("fake_offer_or_recruitment_documents"))add("pressure",8,"The evidence contains wording that warrants checking a potentially fabricated recruitment document.");
 if(/\b(pay|transfer|deposit|recharge)\b.{0,50}\b(today|immediately|right now|to secure|to reserve)\b/i.test(evidence))add("pressure",8,"Payment language appears alongside urgency.");
 const score=canScore?Math.min(100,groups.reduce((sum,g)=>sum+g.points,0)):null;
 const band=score===null?"not_enough_info":score>=65?"high_alert":score>=40?"elevated":score>=20?"caution":"few_signals";
 return {available:score!==null,score,band,coverage,answered,required:keys.length,breakdown:groups,signals:groups.filter(g=>g.points>0),note:score===null?"Complete the required answers and add a message, screenshot or offer document. Unknown answers are not treated as reassuring.":"This is a transparent warning-signal index, not a probability of fraud, legal finding or proof that a company is unsafe."};
}
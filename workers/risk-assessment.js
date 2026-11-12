// Transparent warning-signal scoring. It is not a fraud probability or legal finding.
// Only explicit evidence/answers add points; missing registry or profile data never does.
const hasAnswer=value=>["yes","no"].includes(String(value??"").trim().toLowerCase());
const bandFor=score=>score>=65?"high_alert":score>=40?"elevated":score>=20?"caution":"few_signals";
export function calculateRiskAssessment({answers={},evidence="",hasFiles=false,reviewPurpose="auto",documentType="unclear",matchedPatterns=[]}={}){
 const past=["past_internship","certificate_review","company_background"].includes(reviewPurpose)||["internship_certificate","experience_letter"].includes(documentType);
 if(past)return{available:false,score:null,band:"not_applicable",coverage:0,answered:0,required:2,breakdown:[],signals:[],note:"This review is for past experience or company background. A new-offer warning score is not appropriate."};
 const keys=["paymentAsked","paymentMade"];
 const answered=keys.filter(k=>hasAnswer(answers[k])).length;
 const text=String(evidence||"").slice(0,48000);
 const evidenceProvided=text.trim().length>=8||hasFiles;
 const patterns=new Set((Array.isArray(matchedPatterns)?matchedPatterns:[]).map(x=>x&&x.id).filter(Boolean));
 const coverage=Math.min(100,(evidenceProvided?45:0)+Math.round(answered/2*55));
 const canScore=evidenceProvided&&(answered>=1||patterns.size>0);
 const groups=[
  {id:"payment",label:"Payment & money trail",points:0,max:50,details:[]},
  {id:"recruiter",label:"Recruiter contact",points:0,max:15,details:[]},
  {id:"selection",label:"Selection process",points:0,max:10,details:[]},
  {id:"offer",label:"Offer documentation",points:0,max:10,details:[]},
  {id:"pressure",label:"Pressure & scam patterns",points:0,max:15,details:[]}
 ];
 const add=(id,points,detail)=>{const group=groups.find(x=>x.id===id);group.points=Math.min(group.max,group.points+points);if(!group.details.includes(detail))group.details.push(detail)};
 const a=answers;
 if(a.paymentAsked==="yes")add("payment",25,"A payment request was reported in the recruitment process.");
 if(["registration_fee","selection_fee","job_placement_fee","processing_fee"].includes(a.paymentType))add("payment",12,"The request is described as a recruitment, selection or processing fee.");
 if(["security_deposit","refundable_deposit","equipment_deposit"].includes(a.paymentType))add("payment",10,"The request is described as a refundable, security or equipment deposit.");
 if(a.paymentType==="task_wallet_recharge")add("payment",15,"The request is linked to a task wallet, recharge or unlocking earnings.");
 if(a.paymentType==="training_fee")add("payment",6,"A training fee is connected to the opportunity; the training and placement terms need checking.");
 if(a.paymentMade==="yes")add("payment",12,"The candidate reports that money was actually transferred.");
 if(a.paymentRecipient==="personal_upi")add("payment",10,"The reported payment went to a personal UPI ID or individual account.");
 if(a.paymentStage==="repeated")add("payment",8,"Repeated or escalating payment requests were reported.");
 if(a.contactChannel==="personal_email")add("recruiter",9,"The recruiter used a personal email account.");
 if(["whatsapp_only","telegram_only"].includes(a.contactChannel))add("recruiter",7,"The recruiter communicated only through a messaging app.");
 if(["direct_selection","no_interaction"].includes(a.selectionProcess))add("selection",9,"Selection reportedly happened without an interview or meaningful assessment.");
 if(a.offerStage==="selected"&&["no","verbal_only"].includes(a.writtenOffer))add("offer",8,"The candidate reports selection without a written offer.");
 if(a.pressure==="yes")add("pressure",7,"Urgent deadlines or pressure to pay/decide were reported.");
 if(patterns.has("upfront_payment_for_job")&&a.paymentAsked!=="yes")add("pressure",10,"The submitted message contains payment wording that should be reconciled with the questionnaire.");
 if(patterns.has("staged_refund_fee_escalation"))add("pressure",15,"The text resembles staged payments accompanied by refund promises.");
 if(patterns.has("task_recharge_or_deposit_escalation"))add("pressure",15,"The text resembles a task or rating scheme that asks for a wallet recharge.");
 if(patterns.has("government_employer_impersonation")||patterns.has("recruiter_or_employer_impersonation"))add("pressure",12,"The evidence contains a possible recruiter or public-employer impersonation signal.");
 if(patterns.has("stipend_or_salary_nonpayment"))add("pressure",8,"The evidence mentions possible unpaid stipend or salary. Confirm the exact circumstances.");
 if(/\b(?:pay|transfer|deposit|recharge)\b.{0,55}\b(?:today|immediately|right now|to secure|to reserve)\b/i.test(text))add("pressure",7,"Payment wording appears alongside urgency.");
 const score=canScore?Math.min(100,groups.reduce((sum,g)=>sum+g.points,0)):null;
 const band=score===null?"not_enough_info":bandFor(score);
 return{available:score!==null,score,band,coverage,answered,required:2,breakdown:groups,signals:groups.filter(g=>g.points>0),note:score===null?"Add a message, screenshot or offer document and answer at least one quick check. The unknown option is not treated as a safe answer.":"This 0–100 index shows warning signals detected in the submitted evidence and answers. It is not a probability of fraud, a legal finding or proof of safety."};
}
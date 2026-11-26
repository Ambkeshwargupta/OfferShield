import { cleanText, normalizeDomain } from "./intelligence-core.js";

const pick = (value, max=240) => cleanText(value, max).trim();
const domainOf = value => normalizeDomain(value) || null;
const canonical = value => pick(value, 240).toLowerCase().replace(/[^a-z0-9]/g, "");

function addFinding(list, id, severity, title, detail, evidence=[]) {
  list.push({ id, severity, title, detail, evidence });
}

/**
 * Evidence-led assessment of a specific opportunity. It never treats a
 * company registry record or a matching email domain as proof of recruiter
 * authority or offer authenticity.
 */
export function assessOpportunity(input={}) {
  const company = {
    name: pick(input.company?.name, 180),
    officialDomain: domainOf(input.company?.officialDomain),
    registryName: pick(input.company?.registryName, 180),
    registrySource: pick(input.company?.registrySource, 120),
    registryRetrievedAt: pick(input.company?.registryRetrievedAt, 80)
  };
  const recruiter = {
    name: pick(input.recruiter?.name, 120),
    email: pick(input.recruiter?.email, 180).toLowerCase(),
    emailDomain: domainOf(input.recruiter?.email),
    profileUrl: pick(input.recruiter?.profileUrl, 500),
    independentlyConfirmed: input.recruiter?.independentlyConfirmed === true
  };
  const vacancy = {
    title: pick(input.vacancy?.title, 180),
    jobId: pick(input.vacancy?.jobId, 100),
    officialUrl: pick(input.vacancy?.officialUrl, 500),
    officialDomain: domainOf(input.vacancy?.officialUrl),
    confirmedByCompany: input.vacancy?.confirmedByCompany === true
  };
  const offer = {
    companyName: pick(input.offer?.companyName, 180),
    recruiterEmail: pick(input.offer?.recruiterEmail, 180).toLowerCase(),
    salaryOrStipend: pick(input.offer?.salaryOrStipend, 120),
    location: pick(input.offer?.location, 120),
    paymentRequested: input.offer?.paymentRequested === true
  };
  const findings = [];
  const comparisons = [];

  if (company.registryName && company.name) {
    const match = canonical(company.registryName) === canonical(company.name);
    comparisons.push({ field:"company_name", state:match?"consistent":"mismatch", supplied:company.name, registry:company.registryName });
    if (!match) addFinding(findings,"company_name_mismatch","high","Company name differs from registry evidence","The supplied company name does not exactly match the provided registry name. Check legal name, trade name and entity identity.",["candidate_input","registry_evidence"]);
  } else {
    comparisons.push({field:"company_name",state:"not_checked"});
  }

  if (company.officialDomain && recruiter.emailDomain) {
    const match = recruiter.emailDomain === company.officialDomain || recruiter.emailDomain.endsWith("."+company.officialDomain);
    comparisons.push({field:"recruiter_email_domain",state:match?"consistent":"mismatch",supplied:recruiter.emailDomain,official:company.officialDomain});
    if (!match) addFinding(findings,"recruiter_domain_mismatch","high","Recruiter email domain differs from the supplied company domain","The recruiter email uses a different domain. This is a reason to confirm through a contact independently obtained from the company's official website; it is not proof of impersonation.",["candidate_input"]);
  } else comparisons.push({field:"recruiter_email_domain",state:"not_checked"});

  if (vacancy.officialDomain && company.officialDomain) {
    const match = vacancy.officialDomain === company.officialDomain || vacancy.officialDomain.endsWith("."+company.officialDomain);
    comparisons.push({field:"vacancy_domain",state:match?"consistent":"mismatch",supplied:vacancy.officialDomain,official:company.officialDomain});
    if (!match) addFinding(findings,"vacancy_domain_mismatch","medium","Vacancy URL is outside the supplied company domain","Open the company's careers page independently and confirm that this vacancy is published there.",["candidate_input"]);
  } else comparisons.push({field:"vacancy_domain",state:"not_checked"});

  if (offer.companyName && company.name && canonical(offer.companyName)!==canonical(company.name)) {
    addFinding(findings,"offer_company_mismatch","high","Offer-letter company name conflicts with the investigation","The company name typed from the offer differs from the company being investigated.",["candidate_input"]);
  }
  if (offer.recruiterEmail && recruiter.email && offer.recruiterEmail!==recruiter.email) {
    addFinding(findings,"offer_recruiter_mismatch","medium","Offer and recruiter email addresses differ","Confirm whether the difference is expected and independently verify both addresses.",["candidate_input"]);
  }
  if (offer.paymentRequested) addFinding(findings,"payment_requested","critical","Payment was reportedly requested for the opportunity","Do not pay to secure an interview, job, internship, offer letter or placement. Verify directly with the employer and consider reporting suspected fraud.",["candidate_input"]);

  if (recruiter.independentlyConfirmed) {
    addFinding(findings,"recruiter_claimed_confirmed","info","Recruiter marked as independently confirmed","This is a user-provided confirmation flag. Retain the confirmation channel and date; OfferShield has not independently contacted the employer.",["candidate_input"]);
  } else if (recruiter.name || recruiter.email) {
    addFinding(findings,"recruiter_not_confirmed","medium","Recruiter authority has not been independently confirmed","A matching company email domain or public profile does not establish authority to recruit for this vacancy.",["candidate_input"]);
  }

  if (vacancy.confirmedByCompany) {
    addFinding(findings,"vacancy_claimed_confirmed","info","Vacancy marked as company-confirmed","This is a user-provided confirmation flag. Record the independently sourced company contact, date and response.",["candidate_input"]);
  } else if (vacancy.title || vacancy.officialUrl || vacancy.jobId) {
    addFinding(findings,"vacancy_not_confirmed","medium","Specific vacancy has not been independently confirmed","A real company can be impersonated. Confirm the job ID and role through the employer's independently sourced careers/contact channel.",["candidate_input"]);
  }

  const critical = findings.some(x=>x.severity==="critical");
  const high = findings.some(x=>x.severity==="high");
  const medium = findings.some(x=>x.severity==="medium");
  const companyStatus = company.registryName ? "registry_evidence_supplied" : "not_checked";
  const recruiterStatus = recruiter.independentlyConfirmed ? "user_marked_independently_confirmed" : (recruiter.name||recruiter.email ? "not_independently_confirmed" : "not_checked");
  const vacancyStatus = vacancy.confirmedByCompany ? "user_marked_company_confirmed" : (vacancy.title||vacancy.officialUrl||vacancy.jobId ? "not_independently_confirmed" : "not_checked");
  return {
    schemaVersion:"1.0",
    generatedAt:new Date().toISOString(),
    assessmentType:"evidence_consistency_review",
    overallStatus:critical?"urgent_review":high?"significant_mismatches":medium?"further_verification_needed":"insufficient_or_no_conflicting_evidence",
    dimensions:{company:{status:companyStatus},recruiter:{status:recruiterStatus},vacancy:{status:vacancyStatus},offer:{status:offer.paymentRequested?"payment_request_reported":"not_fully_verified"}},
    subject:{company,recruiter,vacancy,offer},
    comparisons,
    findings,
    nextSteps:[
      "Find the employer's contact details independently on its official website; do not rely only on contact details in the offer.",
      "Ask the employer to confirm the recruiter's name, role and authority for this exact vacancy.",
      "Confirm the job ID and role on the official careers page.",
      "Do not pay recruitment, interview, security, equipment or training fees without independently verified legal and contractual grounds.",
      "Retain original emails, full headers, documents and payment communications for any formal report."
    ],
    limitations:[
      "This endpoint compares information supplied in the request. It does not independently verify the recruiter, vacancy, company response or document authenticity.",
      "Registry registration does not prove recruiter authority or that a specific offer is genuine.",
      "Missing evidence is not proof of fraud or proof of safety.",
      "A user-provided confirmation flag is not an OfferShield verification."
    ]
  };
}

/** Create an ephemeral relationship graph from one submitted investigation. */
export function buildEvidenceGraph(input={}) {
  const report=assessOpportunity(input);
  const nodes=[];
  const edges=[];
  const addNode=(id,type,label,status="candidate_provided")=>{if(label)nodes.push({id,type,label,status});};
  addNode("company","company",report.subject.company.name,report.dimensions.company.status);
  addNode("domain","domain",report.subject.company.officialDomain);
  addNode("recruiter","recruiter",report.subject.recruiter.name);
  addNode("email","email",report.subject.recruiter.email);
  addNode("vacancy","vacancy",report.subject.vacancy.title);
  addNode("vacancy-url","domain",report.subject.vacancy.officialDomain);
  addNode("offer","offer",report.subject.offer.companyName);
  const link=(from,to,relationship)=>{if(nodes.some(n=>n.id===from)&&nodes.some(n=>n.id===to))edges.push({from,to,relationship});};
  link("company","domain","claimed_official_domain");
  link("recruiter","email","uses_email");
  link("recruiter","company","claims_association_with");
  link("vacancy","vacancy-url","published_at_claimed_url");
  link("vacancy","company","claims_company_vacancy");
  link("offer","company","names_company");
  return {schemaVersion:"1.0",generatedAt:new Date().toISOString(),persistence:"ephemeral_request_only",nodes,edges,findings:report.findings.map(({id,severity,title})=>({id,severity,title})),limitations:["This graph contains only the evidence supplied in this request.","A relationship edge means a submitted claim or observed consistency, not a verified real-world relationship.","No cross-user identity graph or public allegation graph is created."]};
}

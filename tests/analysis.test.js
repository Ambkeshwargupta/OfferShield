const test = require("node:test");
const assert = require("node:assert/strict");

function domainOf(value) {
  try {
    const input = value.includes("@") ? "https://" + value.split("@").pop() :
      (value.startsWith("http") ? value : "https://" + value);
    return new URL(input).hostname.toLowerCase().replace(/^www\./, "");
  } catch { return null; }
}

function extract(text) {
  const emails = [...new Set(text.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g) || [])];
  const urls = [...new Set((text.match(/https?:\/\/[^\s<>"')]+/g) || []).map(x => x.replace(/[.,;!?]+$/, "")))];
  const domains = [...new Set([...emails.map(domainOf), ...urls.map(domainOf)].filter(Boolean))];
  return { emails, urls, domains };
}

test("extracts email and URL domains", () => {
  const result = extract("Write to hr@example.com and visit https://careers.example.org/jobs");
  assert.deepEqual(result.domains.sort(), ["careers.example.org", "example.com"]);
});

test("normalises www and email domains", () => {
  assert.equal(domainOf("person@www.tcs.com"), "www.tcs.com");
  assert.equal(domainOf("https://www.tcs.com/careers"), "tcs.com");
});

test("does not infer company authenticity from a domain match", () => {
  const result = extract("Offer from recruiter@tcs.com");
  assert.ok(result.domains.includes("tcs.com"));
  // Domain matching is only a consistency clue; sender authentication is not available here.
});

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let child;
let base;
let cookie;
let dataDir;

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

before(async () => {
  const port = await freePort();
  dataDir = mkdtempSync(join(tmpdir(), "offershield-test-"));
  child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_ENV: "test" },
    stdio: "ignore"
  });
  base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(base + "/api/health");
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("OfferShield server did not become ready");
});

after(() => {
  child?.kill("SIGTERM");
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

test("health endpoint reports the app is running", async () => {
  const response = await fetch(base + "/api/health");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).app, "OfferShield");
});

test("company directory contains the reference profiles", async () => {
  const response = await fetch(base + "/api/companies");
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.ok(data.companies.some(company => company.id === "tcs"));
  assert.ok(data.companies.some(company => company.id === "infosys"));
});

test("analysis labels a domain match as a clue, not authentication", async () => {
  const response = await fetch(base + "/api/analyse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ companyId: "tcs", text: "Email recruiter@tcs.com about Software Intern." })
  });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.ok(data.findings.some(f => f.title.includes("Domain matches")));
  assert.ok(data.findings.some(f => f.title.includes("authority not established")));
});

test("saved reports are persisted for the browser session", async () => {
  const response = await fetch(base + "/api/reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Test report", companyId: "tcs", text: "Please contact recruiter@unknown.example" })
  });
  assert.equal(response.status, 201);
  cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  const list = await fetch(base + "/api/reports", { headers: { cookie } });
  const data = await list.json();
  assert.equal(data.reports.length, 1);
  assert.equal(data.reports[0].title, "Test report");
});

test("static hosting does not expose the JSON report store", async () => {
  const response = await fetch(base + "/.data/store.json", { headers: cookie ? { cookie } : {} });
  assert.equal(response.status, 404);
});

test("landing page is served from the same origin", async () => {
  const response = await fetch(base + "/");
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Know who's behind the offer/);
});

test("local Node homepage serves the current advanced OfferShield interface", async () => {
  const response = await fetch(base + "/");
  const body = await response.text();
  assert.match(body, /Advanced search &amp; intelligence|Advanced search & intelligence/);
  assert.match(body, /rawEmailHeaders/);
});

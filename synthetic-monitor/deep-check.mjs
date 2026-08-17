// Post-cleanup functional check: not "does the page render" (probe.mjs covers
// that) but "does the data behind it still load". Visits the screens that the
// dead-code sweep touched, and fails on any console error or any non-2xx
// PostgREST / RPC / edge-function response — which is what a query against a
// dropped table or routine would produce.
import { chromium } from "playwright";
import fs from "node:fs";

const app = JSON.parse(fs.readFileSync(new URL("./fleet.json", import.meta.url), "utf8"))
  .find((a) => a.name === "crm");
const EMAIL = process.env.SENTINEL_MONITOR_EMAIL;
const PASSWORD = process.env.SENTINEL_MONITOR_PASSWORD;

const PAGES = [
  ["/dashboard", /Revenue|Invoiced|GST/i],
  ["/clients", /Client/i],
  ["/accounting", /Ledger|Journal|Accounting|Outstanding/i],
  ["/billing-system", /Invoice|Proforma|Billing/i],
  ["/support-tickets", /Ticket/i],
  ["/marketing", /Marketing|Followers|Channel/i],
  ["/marketing/performance", /Performance|Followers|Engagement/i],
  ["/marketing/bd-outreach", /Firms|Drafts|Outreach|Review/i],
  ["/templates", /Template/i],
  ["/email-campaigns", /Campaign/i],
];

const IGNORE = /favicon|manifest|\.png|\.svg|\.woff|analytics|sw\.js/i;

const r = await fetch(`https://${app.ref}.supabase.co/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: app.pub, "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const session = await r.json();
if (!session.access_token) throw new Error("login failed: " + JSON.stringify(session).slice(0, 200));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(([ref, sess]) => {
  localStorage.setItem(`sb-${ref}-auth-token`, sess);
}, [app.ref, JSON.stringify(session)]);

const report = [];
for (const [path, expect] of PAGES) {
  const page = await ctx.newPage();
  const consoleErrors = [];
  const badResponses = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e).slice(0, 200)));
  page.on("response", (res) => {
    const u = res.url();
    if (IGNORE.test(u)) return;
    if (res.status() >= 400 && /supabase\.co|\/rest\/v1|\/rpc\/|\/functions\/v1/.test(u)) {
      badResponses.push(`${res.status()} ${u.replace(/https:\/\/[^/]+/, "").slice(0, 120)}`);
    }
  });

  await page.goto(app.url + path, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3500);
  const text = await page.evaluate(() => document.body.innerText).catch(() => "");
  await page.screenshot({ path: `shots/${path.replace(/\//g, "_") || "_root"}.png`, fullPage: false }).catch(() => {});
  await page.close();

  report.push({
    path,
    contentMatched: expect.test(text),
    chars: text.length,
    consoleErrors: [...new Set(consoleErrors)],
    badResponses: [...new Set(badResponses)],
  });
}
await browser.close();

let fails = 0;
for (const r of report) {
  const ok = r.contentMatched && r.consoleErrors.length === 0 && r.badResponses.length === 0;
  if (!ok) fails++;
  console.log(`${ok ? "🟢" : "🔴"} ${r.path}  (${r.chars} chars, content=${r.contentMatched ? "ok" : "MISSING"})`);
  r.badResponses.forEach((b) => console.log(`      HTTP  ${b}`));
  r.consoleErrors.forEach((c) => console.log(`      JS    ${c}`));
}
console.log(`\n${report.length - fails}/${report.length} screens clean`);

// Synthetic logged-in click-through probe — the Health Sentinel's "front of house".
//
// Every Sentinel check asserts the BACKEND heartbeat; this asserts what a real
// logged-in user actually sees. It logs in as the dedicated read-only monitor
// account, auto-discovers each app's nav routes, visits every one, and FAILS a
// route if the page throws / shows an error boundary / fails to load its code.
// This is the only thing that catches the fieldsync (blank boot) AND digicom
// (per-route render crash) classes — both returned a healthy 200 to every
// backend check.
//
// Usage: node probe.mjs [appName]   (no arg = whole fleet)
// Needs SENTINEL_MONITOR_EMAIL + SENTINEL_MONITOR_PASSWORD in env.

import { chromium } from "playwright";
import fs from "node:fs";

// Per-app config (name, ref, url, pub) comes from fleet.json, which provision.mjs
// generates and which is gitignored — run `node provision.mjs` first on a fresh
// clone. The publishable key it holds is browser-safe (already baked into each
// app's shipped bundle), but there's no reason to keep a stale copy in git.
export let FLEET = [];
try {
  const f = JSON.parse(fs.readFileSync(new URL("./fleet.json", import.meta.url), "utf8"));
  if (Array.isArray(f) && f.length) FLEET = f.filter((a) => a.pub);
} catch { /* handled in main() */ }

const EMAIL = process.env.SENTINEL_MONITOR_EMAIL;
const PASSWORD = process.env.SENTINEL_MONITOR_PASSWORD;
const ERROR_BOUNDARY = /something went wrong|we encountered an unexpected error|application error|this page (crashed|isn't working)/i;
const LOGIN_WALL = /(sign in|log ?in|continue with)/i;

async function mintSession(app) {
  const r = await fetch(`https://${app.ref}.supabase.co/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: app.pub, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`login failed (${r.status}): ${JSON.stringify(j).slice(0, 200)}`);
  return j; // shape matches what supabase-js persists
}

// Discover routes from the app's router definitions in the JS bundle — the
// source of truth, independent of how nav is rendered (button onClick vs <a>,
// collapsed sidebars, role-gated menus). This is what makes coverage real:
// scraping the DOM missed entire apps (globalcrm found 0 of its 24 modules).
async function bundleRoutes(url) {
  try {
    const html = await (await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 Chrome/124" } })).text();
    const origin = new URL(url).origin;
    const srcs = [...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((m) => m[1])
      .map((s) => { try { return new URL(s, url).href; } catch { return ""; } })
      .filter((u) => u && new URL(u).origin === origin && /\/assets\//.test(u));
    const paths = new Set();
    for (const b of srcs.slice(0, 4)) {
      const js = await (await fetch(b, { headers: { "User-Agent": "Mozilla/5.0 Chrome/124" } })).text();
      for (const m of js.matchAll(/\bpath:\s*"(\/[^"]*)"/g)) paths.add(m[1]);
      for (const m of js.matchAll(/\bto:\s*"(\/[^"]*)"/g)) paths.add(m[1]);
    }
    return [...paths];
  } catch { return []; }
}

async function probeApp(browser, app) {
  const session = await mintSession(app);
  const origin = new URL(app.url).origin;
  const ctx = await browser.newContext({
    viewport: { width: 1536, height: 900 }, // desktop, so responsive sidebars expand
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  });
  // Inject the supabase-js session into localStorage BEFORE any app code runs.
  await ctx.addInitScript(([ref, sess]) => {
    try { window.localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(sess)); } catch {}
  }, [app.ref, session]);

  const visit = async (path) => {
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(`uncaught: ${String(e).split("\n")[0]}`.slice(0, 200)));
    page.on("response", (res) => {
      const u = res.url();
      if (res.status() >= 400 && (u.endsWith(".js") || res.request().resourceType() === "document") && u.startsWith(origin))
        errors.push(`load ${res.status()} ${u.replace(origin, "")}`);
    });
    let landed = path;
    try {
      await page.goto(origin + path, { waitUntil: "networkidle", timeout: 30000 });
      await page.waitForTimeout(1400); // let the route render / data settle
      landed = new URL(page.url()).pathname;
      let body = (await page.locator("body").innerText().catch(() => "")) || "";
      let bad = ERROR_BOUNDARY.test(body) || errors.length;
      // One reload retry: a real bug persists; a session-init/hydration race
      // (which a real logged-in user never hits) clears on the second load.
      if (bad) {
        errors.length = 0;
        await page.reload({ waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(1600);
        body = (await page.locator("body").innerText().catch(() => "")) || "";
        bad = ERROR_BOUNDARY.test(body) || errors.length;
      }
      const boundary = ERROR_BOUNDARY.test(body);
      const status = bad ? "fail" : "ok";
      const detail = boundary ? "error boundary shown (after retry)" : (errors[0] || "rendered");
      await page.close();
      return { path, landed, status, detail, errorsAll: errors };
    } catch (e) {
      await page.close().catch(() => {});
      return { path, landed, status: "fail", detail: `nav error: ${String(e).split("\n")[0]}`.slice(0, 160), errorsAll: errors };
    }
  };

  // Land on the app root and confirm we're logged in (not bounced to a login wall).
  const home = await visit("/");
  const homePage = await ctx.newPage();
  await homePage.goto(app.url, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  await homePage.waitForTimeout(1200);
  const homeText = (await homePage.locator("body").innerText().catch(() => "")) || "";
  const loggedIn = !/\/login|\/sign-?in|\/auth/i.test(new URL(homePage.url()).pathname) && !ERROR_BOUNDARY.test(homeText);
  // Discover routes from BOTH the rendered DOM and the router definitions in the
  // bundle (the latter catches routes no menu link exposes).
  const hrefs = await homePage.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
  await homePage.close();
  const fromBundle = await bundleRoutes(app.url);
  const routes = [...new Set([...hrefs, ...fromBundle])]
    .filter((h) => h && h.startsWith("/") &&
      !/^\/(login|logout|sign|auth|reset|forgot|verify|invite|onboard)/i.test(h) &&
      !h.includes("#") && !h.includes(":") && !h.includes("*"))
    .sort();

  const results = [];
  for (const rt of routes) results.push(await visit(rt));
  await ctx.close();
  return { app: app.name, url: app.url, loggedIn, routeCount: routes.length, home, results };
}

async function main() {
  if (!EMAIL || !PASSWORD) { console.error("SENTINEL_MONITOR_EMAIL/PASSWORD not set"); process.exit(2); }
  if (!FLEET.length) { console.error("no fleet.json — run `node provision.mjs` first"); process.exit(2); }
  const only = process.argv[2];
  const apps = only ? FLEET.filter((a) => a.name === only) : FLEET;
  const browser = await chromium.launch({ headless: true });
  const report = [];
  for (const app of apps) {
    try { report.push(await probeApp(browser, app)); }
    catch (e) { report.push({ app: app.name, url: app.url, error: String(e).slice(0, 200) }); }
  }
  await browser.close();

  // Human summary
  for (const r of report) {
    if (r.error) { console.log(`\n■ ${r.app}: PROBE ERROR — ${r.error}`); continue; }
    const fails = (r.results || []).filter((x) => x.status === "fail");
    console.log(`\n■ ${r.app} (${r.url}) — loggedIn=${r.loggedIn}, ${r.routeCount} routes, ${fails.length} broken`);
    for (const x of (r.results || [])) console.log(`   ${x.status === "ok" ? "🟢" : "🔴"} ${x.path}${x.status === "ok" ? "" : "  — " + x.detail}`);
  }
  console.log("\n" + JSON.stringify(report.map((r) => ({ app: r.app, loggedIn: r.loggedIn, routes: r.routeCount, broken: (r.results || []).filter((x) => x.status === "fail").map((x) => ({ path: x.path, detail: x.detail })) })), null, 2));
}
main();

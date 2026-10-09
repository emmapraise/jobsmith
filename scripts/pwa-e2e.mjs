/**
 * Real-Chrome check of the PWA: install criteria, background saving, true offline reading, sign-out cleanup.
 * Needs a running PRODUCTION build (the worker only registers there), Google Chrome, and a valid session cookie:
 *
 *   npm run build && STORAGE_DRIVER=r2 npx next start -p 3100
 *   PWA_BASE=http://localhost:3100 PWA_SESSION=<authjs session-token value> npm run pwa:e2e
 *
 * Use https + PWA_COOKIE=__Secure-authjs.session-token against a deployed site. NOTE: it signs the session out
 * (that is one of the checks), so create a fresh session for each run.
 */
import { chromium } from "playwright-core";

const BASE = process.env.PWA_BASE ?? "http://localhost:3100";
const token = process.env.PWA_SESSION;
const cookieName = process.env.PWA_COOKIE ?? "authjs.session-token";
if (!token) throw new Error("Set PWA_SESSION to a valid session token");
let failed = 0;
const ok = (c, m) => { if (!c) failed++; console.log(`${c ? "PASS" : "FAIL"}  ${m}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies([{ name: cookieName, value: token, url: BASE }]);
await ctx.addInitScript(() => { navigator.serviceWorker?.addEventListener("message", (e) => { if (e.data?.type === "WARM_DONE") window.__warmDone = e.data.saved; }); });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

// 1. Worker registers and controls the page; Chrome accepts the manifest.
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
await page.waitForFunction(() => navigator.serviceWorker.getRegistration().then((r) => !!r?.active), null, { timeout: 15000 });
await page.reload({ waitUntil: "networkidle" });
ok(await page.evaluate(() => !!navigator.serviceWorker.controller), "service worker registered and controlling the page");
const cdp = await ctx.newCDPSession(page);
const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
ok(installabilityErrors.every((e) => e.errorId === "in-incognito"), `installability errors (ignoring the throwaway profile's incognito flag): ${installabilityErrors.map((e) => e.errorId).join(", ") || "none"}`);
const manifest = await cdp.send("Page.getAppManifest");
ok(!manifest.errors?.length, `manifest parses cleanly (name: ${JSON.parse(manifest.data).name})`);
await cdp.detach(); // a lingering CDP session can override the browser's online flag

// 2. Background saving finishes (the worker announces it).
for (let i = 0; i < 60; i++) { await sleep(1000); if (await page.evaluate(() => window.__warmDone !== undefined)) break; }
const listSaved = () => page.evaluate(async () => { const k = (await caches.keys()).find((x) => x.startsWith("jobsmith-pages-")); return k ? (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname) : []; });
const saved = await listSaved();
console.log("      saved:", saved.join(", "));
ok(["/dashboard", "/tracker", "/tailor", "/roles", "/resume"].every((p) => saved.includes(p)), "main pages saved in the background");
ok(!saved.some((p) => /settings|profile|api|sign-in|review|update/.test(p)), "no settings/profile/editor/auth pages saved");
const detail = saved.find((p) => p.startsWith("/tracker/"));

// 3. OFFLINE
await ctx.setOffline(true);
await page.goto(`${BASE}/tracker`, { waitUntil: "domcontentloaded" });
ok((await page.textContent("body")).includes("Your applications"), "OFFLINE: /tracker opens from the saved copy");
let banner = false;
for (let i = 0; i < 20 && !banner; i++) { await sleep(500); banner = await page.evaluate(() => [...document.querySelectorAll("[role=status]")].some((n) => /you.re offline/i.test(n.textContent ?? ""))).catch(() => false); }
ok(banner, "OFFLINE: banner says reading works, changes need a connection");
if (detail) { await page.goto(`${BASE}${detail}`, { waitUntil: "domcontentloaded" }); ok(/Notes|Timeline/.test(await page.textContent("body")), "OFFLINE: an application's detail page opens"); }
await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
const body = await page.textContent("body");
ok(body.includes("You’re offline") && !body.includes("Account & privacy"), "OFFLINE: unsaved page shows the offline screen, no private data");
await page.waitForSelector("main a[href='/tracker']", { timeout: 10000 }).then(() => ok(true, "OFFLINE: offline screen lists saved pages")).catch(() => ok(false, "OFFLINE: offline screen lists saved pages"));
await page.goto(`${BASE}/not-saved-anywhere-xyz`, { waitUntil: "domcontentloaded" }).catch(() => undefined);
ok((await page.textContent("body")).includes("offline"), "OFFLINE: unknown URL gets the offline screen, not a browser error");

// 4. Back online, sign out: saved private pages must be wiped.
await ctx.setOffline(false);
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
const before = (await listSaved()).length;
await page.getByRole("button", { name: "Sign out" }).first().click();
await page.waitForURL((u) => !u.pathname.startsWith("/dashboard"), { timeout: 15000 });
const after = (await listSaved()).length;
ok(before > 0 && after === 0, `sign-out cleared saved pages (${before} -> ${after})`);
await page.goto(`${BASE}/tracker`, { waitUntil: "domcontentloaded" });
ok(page.url().includes("/sign-in"), "after sign-out /tracker redirects to sign-in (no stale private copy)");

ok(errors.length === 0, `no uncaught page errors${errors.length ? ": " + errors.slice(0, 2).join(" | ") : ""}`);
await browser.close();
process.exit(failed ? 1 : 0);

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/* ── a tiny in-memory Cache API + fake worker scope, so the real public/sw.js runs unchanged ── */
type Listener = (e: unknown) => void;
const listeners: Record<string, Listener[]> = {};
const ORIGIN = "https://app.test";

class MemCache {
  entries = new Map<string, Response>();
  private k = (r: Request | string) => (typeof r === "string" ? new URL(r, ORIGIN).toString() : r.url);
  async match(r: Request | string) { const hit = this.entries.get(this.k(r)); return hit ? hit.clone() : undefined; }
  async put(r: Request | string, res: Response) { this.entries.delete(this.k(r)); this.entries.set(this.k(r), res); }
  async add(r: string) { const res = await fetch(new URL(r, ORIGIN).toString()); if (!res.ok) throw new Error("bad"); await this.put(r, res); }
  async delete(r: Request | string) { return this.entries.delete(this.k(r)); }
  async keys() { return [...this.entries.keys()].map((u) => new Request(u)); }
}
class MemCaches {
  store = new Map<string, MemCache>();
  async open(n: string) { if (!this.store.has(n)) this.store.set(n, new MemCache()); return this.store.get(n)!; }
  async keys() { return [...this.store.keys()]; }
  async delete(n: string) { return this.store.delete(n); }
}

let net: ReturnType<typeof vi.fn>;
let cachesMock: MemCaches;
const flush = () => new Promise((r) => setTimeout(r, 0));

const html = (title: string, extra = "") => new Response(`<html><head><title>${title}</title></head><body>${extra}</body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
const redirected = (res: Response) => { Object.defineProperty(res, "redirected", { value: true }); return res; };

type FakeEvent = { request?: unknown; data?: unknown; responded?: Promise<Response>; waits: Promise<unknown>[]; respondWith: (p: Promise<Response> | Response) => void; waitUntil: (p: Promise<unknown>) => void };
const event = (extra: Record<string, unknown> = {}): FakeEvent => {
  const e: FakeEvent = { waits: [], respondWith(p) { e.responded = Promise.resolve(p); }, waitUntil(p) { e.waits.push(p); }, ...extra };
  return e;
};
const req = (path: string, o: { method?: string; mode?: string; origin?: string } = {}) => ({ url: (o.origin ?? ORIGIN) + path, method: o.method ?? "GET", mode: o.mode ?? "navigate", headers: new Headers() });
async function fire(type: string, e: FakeEvent) { for (const l of listeners[type] ?? []) l(e); await Promise.all(e.waits); await flush(); return e; }
const navigate = async (path: string) => { const e = await fire("fetch", event({ request: req(path) })); return e.responded ? await e.responded : null; };

beforeAll(async () => {
  (globalThis as unknown as { self: unknown }).self = {
    location: { origin: ORIGIN },
    addEventListener: (t: string, l: Listener) => (listeners[t] ??= []).push(l),
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined), matchAll: vi.fn(async () => []) },
  };
  // @ts-expect-error plain classic script, no types
  await import("../../public/sw.js");
});

beforeEach(() => {
  cachesMock = new MemCaches();
  (globalThis as unknown as { caches: unknown }).caches = cachesMock;
  net = vi.fn(async () => html("Default"));
  vi.stubGlobal("fetch", net);
});
afterEach(() => vi.useRealTimers());

const T1 = "11111111-1111-1111-1111-111111111111";

describe("lifecycle", () => {
  it("precaches the offline page on install and removes only old jobsmith caches on activate", async () => {
    net.mockImplementation(async () => html("Offline"));
    await fire("install", event());
    const statics = await cachesMock.open("jobsmith-static-v1");
    expect((await statics.keys()).map((k) => new URL(k.url).pathname).sort()).toEqual(["/offline", "/pwa-icon/192"]);

    await cachesMock.open("jobsmith-static-v0");
    await cachesMock.open("jobsmith-pages-v0");
    await cachesMock.open("someone-elses-cache");
    await fire("activate", event());
    expect(await cachesMock.keys()).toEqual(expect.arrayContaining(["jobsmith-static-v1", "someone-elses-cache"]));
    expect(await cachesMock.keys()).not.toContain("jobsmith-static-v0");
    expect(await cachesMock.keys()).not.toContain("jobsmith-pages-v0");
  });
});

describe("what it must NOT touch", () => {
  it.each([
    ["POST (every change)", req("/tracker", { method: "POST" })],
    ["API routes", req("/api/health", { mode: "cors" })],
    ["auth routes", req("/api/auth/session", { mode: "cors" })],
    ["downloads", req("/api/files/exports/users/x/resume.pdf", { mode: "cors" })],
    ["cross-origin", req("/tracker", { origin: "https://evil.example" })],
    ["RSC/data fetches (non-navigation)", req("/tracker?_rsc=abc", { mode: "cors" })],
  ])("ignores %s", async (_n, request) => {
    const e = await fire("fetch", event({ request }));
    expect(e.responded).toBeUndefined();
    expect(net).not.toHaveBeenCalled();
  });

  it("never saves private pages that aren't on the allowlist, and shows the offline page instead when offline", async () => {
    net.mockImplementation(async () => html("Offline"));
    await fire("install", event());
    net.mockReset();
    net.mockImplementation(async () => html("Settings"));
    for (const p of ["/settings", "/profile", "/resume/review", "/resume/update", "/sign-in", "/tracker/not-a-uuid"]) {
      const r = await navigate(p);
      expect(r).not.toBeNull();
    }
    expect(await cachesMock.keys()).not.toContain("jobsmith-pages-v1");
    net.mockImplementation(async () => { throw new TypeError("offline"); });
    const r = await navigate("/settings");
    expect(await r!.text()).toContain("Offline");
  });
});

describe("saved pages (offline reading)", () => {
  it("saves a page after a successful load, with its title, and serves it when offline", async () => {
    net.mockImplementation(async () => html("Applications · Jobsmith", "<p>private tracker data</p>"));
    const online = await navigate("/tracker");
    expect(await online!.text()).toContain("private tracker data");

    const pages = await cachesMock.open("jobsmith-pages-v1");
    const saved = await pages.match(`${ORIGIN}/tracker`);
    expect(saved!.headers.get("x-jobsmith-title")).toBe("Applications · Jobsmith");
    expect(Number(saved!.headers.get("x-jobsmith-saved-at"))).toBeGreaterThan(0);

    net.mockImplementation(async () => { throw new TypeError("Failed to fetch"); });
    const offline = await navigate("/tracker");
    expect(await offline!.text()).toContain("private tracker data");
  });

  it("saves application and tailored detail pages (by id), once per page regardless of query string", async () => {
    net.mockImplementation(async () => html("Application"));
    await navigate(`/tracker/${T1}`);
    await navigate(`/tracker/${T1}?x=1`);
    const pages = await cachesMock.open("jobsmith-pages-v1");
    expect(await pages.keys()).toHaveLength(1);
    await navigate(`/tailor/${T1}`);
    expect(await pages.keys()).toHaveLength(2);
  });

  it("falls back to the offline page when offline and the page was never saved", async () => {
    net.mockImplementation(async () => html("Offline"));
    await fire("install", event());
    net.mockReset();
    net.mockImplementation(async () => { throw new TypeError("offline"); });
    expect(await (await navigate("/roles"))!.text()).toContain("Offline");
  });

  it("does not save error pages or non-HTML, and drops a saved copy once the session is gone (redirect to sign-in)", async () => {
    net.mockImplementation(async () => html("Home"));
    await navigate("/dashboard");
    const pages = await cachesMock.open("jobsmith-pages-v1");
    expect(await pages.keys()).toHaveLength(1);

    net.mockImplementation(async () => redirected(html("Sign in")));
    await navigate("/dashboard");
    expect(await pages.keys()).toHaveLength(0);

    net.mockImplementation(async () => new Response("boom", { status: 500, headers: { "content-type": "text/html" } }));
    await navigate("/roles");
    net.mockImplementation(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
    await navigate("/resume");
    expect(await pages.keys()).toHaveLength(0);
  });

  it("serves the saved copy when the network is slower than the timeout, and refreshes it afterwards", async () => {
    net.mockImplementation(async () => html("Old", "<p>old</p>"));
    await navigate("/tracker");
    vi.useFakeTimers();
    net.mockImplementation(() => new Promise<Response>((resolve) => setTimeout(() => resolve(html("New", "<p>new</p>")), 20_000)));
    const e = event({ request: req("/tracker") });
    for (const l of listeners.fetch) l(e);
    await vi.advanceTimersByTimeAsync(4100);
    expect(await (await e.responded!).text()).toContain("old");
    await vi.advanceTimersByTimeAsync(20_000);
    await Promise.all(e.waits);
    vi.useRealTimers();
    const fresh = await (await cachesMock.open("jobsmith-pages-v1")).match(`${ORIGIN}/tracker`);
    expect(await fresh!.text()).toContain("new");
  });

  it("keeps at most 40 saved pages, dropping the oldest", async () => {
    net.mockImplementation(async () => html("Detail"));
    const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
    for (let i = 0; i < 45; i++) await navigate(`/tracker/${id(i)}`);
    const pages = await cachesMock.open("jobsmith-pages-v1");
    const paths = (await pages.keys()).map((k) => new URL(k.url).pathname);
    expect(paths).toHaveLength(40);
    expect(paths).not.toContain(`/tracker/${id(0)}`);
    expect(paths).toContain(`/tracker/${id(44)}`);
  });
});

describe("static assets", () => {
  it("is cache-first for hashed build files", async () => {
    net.mockImplementation(async () => new Response("console.log(1)", { status: 200, headers: { "content-type": "text/javascript" } }));
    const r = () => fire("fetch", event({ request: req("/_next/static/chunks/app-abc123.js", { mode: "no-cors" }) })).then((e) => e.responded!);
    expect(await (await r()).text()).toBe("console.log(1)");
    expect(net).toHaveBeenCalledTimes(1);
    expect(await (await r()).text()).toBe("console.log(1)");
    expect(net).toHaveBeenCalledTimes(1); // second time came from the cache
  });
});

describe("messages", () => {
  const send = (data: unknown) => fire("message", event({ data }));

  it("WARM saves only allowed same-origin pages, plus the build files they need", async () => {
    const page = (title: string) => html(title, `<script src="/_next/static/chunks/page-1.js"></script><link href="/_next/static/css/app.css">`);
    net.mockImplementation(async (u: string | Request) => {
      const url = typeof u === "string" ? u : u.url;
      if (url.includes("/_next/static/")) return new Response("asset", { status: 200 });
      return page("Warm");
    });
    await send({ type: "WARM", urls: ["/tracker", `/tracker/${T1}`, "/settings", "/api/health", "https://evil.example/tracker", "/profile"] });
    const pages = await cachesMock.open("jobsmith-pages-v1");
    expect((await pages.keys()).map((k) => new URL(k.url).pathname).sort()).toEqual([`/tracker`, `/tracker/${T1}`].sort());
    const statics = await cachesMock.open("jobsmith-static-v1");
    expect((await statics.keys()).map((k) => new URL(k.url).pathname).sort()).toEqual(["/_next/static/chunks/page-1.js", "/_next/static/css/app.css"]);
    expect(net.mock.calls.map((c) => String(c[0]))).not.toEqual(expect.arrayContaining([expect.stringContaining("/settings")]));
  });

  it("WARM saves each page's scripts right after the page (so a dropped connection never leaves a page without its code)", async () => {
    const order: string[] = [];
    net.mockImplementation(async (u: string | Request) => {
      const url = typeof u === "string" ? u : u.url;
      order.push(new URL(url, ORIGIN).pathname);
      if (url.includes("/_next/static/")) return new Response("asset", { status: 200 });
      return html("P", `<script src="/_next/static/chunks/${url.includes("tracker") ? "t" : "r"}.js"></script>`);
    });
    await send({ type: "WARM", urls: ["/tracker", "/roles"] });
    expect(order).toEqual(["/tracker", "/_next/static/chunks/t.js", "/roles", "/_next/static/chunks/r.js"]);
  });

  it("install also saves the offline page's own scripts", async () => {
    net.mockImplementation(async (u: string | Request) => {
      const url = typeof u === "string" ? u : u.url;
      if (url.includes("/_next/static/")) return new Response("asset", { status: 200 });
      return html("Offline", `<script src="/_next/static/chunks/offline-ui.js"></script>`);
    });
    await fire("install", event());
    const statics = await cachesMock.open("jobsmith-static-v1");
    expect((await statics.keys()).map((k) => new URL(k.url).pathname)).toContain("/_next/static/chunks/offline-ui.js");
  });

  it("WARM skips pages that redirect to sign-in", async () => {
    net.mockImplementation(async () => redirected(html("Sign in")));
    await send({ type: "WARM", urls: ["/tracker"] });
    expect((await (await cachesMock.open("jobsmith-pages-v1")).keys())).toHaveLength(0);
  });

  it("CLEAR removes every saved page but keeps the app shell", async () => {
    net.mockImplementation(async () => html("Home"));
    await navigate("/dashboard");
    await (await cachesMock.open("jobsmith-static-v1")).put("/offline", html("Offline"));
    expect(await cachesMock.keys()).toContain("jobsmith-pages-v1");
    await send({ type: "CLEAR" });
    expect(await cachesMock.keys()).not.toContain("jobsmith-pages-v1");
    expect(await cachesMock.keys()).toContain("jobsmith-static-v1");
  });
});

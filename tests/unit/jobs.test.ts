import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractJob, htmlToText } from "@/lib/jobs/extract";
import { ingestPastedText, ingestUrl, IngestError } from "@/lib/jobs/ingest";
import { FetchBlockedError, isForbiddenSite, isPrivateAddress, parseSafeUrl, robotsAllows, safeFetchText } from "@/lib/jobs/net";

describe("SSRF guard", () => {
  it.each([
    "127.0.0.1", "127.1.2.3", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1",
    "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:169.254.169.254", "64:ff9b::a00:1", "not-an-ip",
  ])("blocks %s", (ip) => expect(isPrivateAddress(ip)).toBe(true));

  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("allows public %s", (ip) =>
    expect(isPrivateAddress(ip)).toBe(false));

  const code = (u: string) => {
    try {
      parseSafeUrl(u);
    } catch (e) {
      return (e as FetchBlockedError).code;
    }
    return "ok";
  };
  it("rejects bad schemes, credentials, odd ports, localhost and private literals", () => {
    expect(code("file:///etc/passwd")).toBe("invalid_url");
    expect(code("ftp://x.com/a")).toBe("invalid_url");
    expect(code("javascript:alert(1)")).toBe("invalid_url");
    expect(code("https://user:pw@example.com/")).toBe("invalid_url");
    expect(code("https://example.com:8080/")).toBe("blocked_host");
    expect(code("http://localhost/")).toBe("blocked_host");
    expect(code("http://foo.localhost/")).toBe("blocked_host");
    expect(code("http://metadata.internal/")).toBe("blocked_host");
    expect(code("http://127.0.0.1/")).toBe("blocked_host");
    expect(code("http://[::1]/")).toBe("blocked_host");
    expect(code("http://169.254.169.254/latest/meta-data")).toBe("blocked_host");
    expect(code("http://2130706433/")).toBe("blocked_host"); // decimal 127.0.0.1, normalised by URL
    expect(code("https://boards.greenhouse.io/acme/jobs/1")).toBe("ok");
  });

  it("refuses sites whose terms forbid automated access", () => {
    expect(code("https://www.linkedin.com/jobs/view/123")).toBe("site_blocked");
    expect(code("https://uk.indeed.com/viewjob?jk=1")).toBe("site_blocked");
    expect(isForbiddenSite("notlinkedin.com")).toBe(false);
  });

  it("blocks a hostname that resolves to a private address (checked at connect time)", async () => {
    await expect(safeFetchText("http://localtest.me/")).rejects.toMatchObject({ code: expect.stringMatching(/blocked_host|network/) });
  });
});

describe("robots.txt", () => {
  const robots = `User-agent: *\nDisallow: /private/\nAllow: /private/public\nDisallow: /search?\n\nUser-agent: badbot\nDisallow: /`;
  it("applies longest-match Allow/Disallow for the wildcard group", () => {
    expect(robotsAllows(robots, "/jobs/1")).toBe(true);
    expect(robotsAllows(robots, "/private/x")).toBe(false);
    expect(robotsAllows(robots, "/private/public")).toBe(true);
    expect(robotsAllows(robots, "/search?q=1")).toBe(false);
  });
  it("prefers a group naming us, ignores empty disallow, treats missing file as allowed", () => {
    expect(robotsAllows("User-agent: JobsmithBot\nDisallow: /\n\nUser-agent: *\nAllow: /", "/jobs")).toBe(false);
    expect(robotsAllows("User-agent: *\nDisallow:", "/jobs")).toBe(true);
    expect(robotsAllows("", "/jobs")).toBe(true);
  });
});

describe("extraction", () => {
  const ld = (o: object) => `<html><head><title>x</title><script type="application/ld+json">${JSON.stringify(o)}</script></head><body><nav>Menu</nav><main>ignored</main></body></html>`;
  it("prefers schema.org JobPosting and keeps structure", () => {
    const r = extractJob(ld({ "@context": "https://schema.org", "@type": "JobPosting", title: "Backend Engineer", description: "<p>Build APIs.</p><ul><li>Node.js</li><li>Postgres</li></ul>",
      hiringOrganization: { name: "Globex" }, jobLocation: { address: { addressLocality: "London", addressCountry: "UK" } }, jobLocationType: "TELECOMMUTE" }));
    expect(r.structured).toBe(true);
    expect(r.hints).toMatchObject({ title: "Backend Engineer", company: "Globex", location: "London, UK", remote: true });
    expect(r.text).toContain("Company: Globex");
    expect(r.text).toMatch(/- Node\.js\n- Postgres/);
    expect(r.text).not.toContain("ignored");
  });
  it("finds JobPosting inside @graph arrays", () => {
    const r = extractJob(ld({ "@graph": [{ "@type": "WebSite" }, { "@type": "JobPosting", title: "SRE", description: "Keep it up." }] }));
    expect(r.structured).toBe(true);
    expect(r.hints.title).toBe("SRE");
  });
  it("falls back to main text and strips scripts, nav and footer", () => {
    const r = extractJob(`<html><head><title>Role</title></head><body><nav>Home Jobs</nav><main><h1>Platform Engineer</h1><p>You will run Kubernetes.</p><script>evil()</script></main><footer>© Corp</footer></body></html>`);
    expect(r.structured).toBe(false);
    expect(r.text).toContain("Platform Engineer");
    expect(r.text).toContain("Kubernetes");
    expect(r.text).not.toMatch(/evil|Home Jobs|© Corp/);
  });
  it("htmlToText keeps line breaks", () => {
    expect(htmlToText("<p>A</p><p>B<br>C</p>")).toBe("A\nB\nC");
  });
});

describe("pasted text", () => {
  it("rejects empty and too-short input without the paste fallback loop, and caps length", () => {
    expect(() => ingestPastedText("   ")).toThrow(IngestError);
    expect(() => ingestPastedText("short")).toThrow(/too short/);
    expect(ingestPastedText("x".repeat(40_000)).text).toHaveLength(30_000);
    expect(ingestPastedText("Senior engineer. ".repeat(30)).source).toBe("pasted_text");
  });
});

describe("safeFetchText against a real local server (private guard lifted for the test only)", () => {
  let server: http.Server;
  let base: string;
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/big") { res.setHeader("content-type", "text/html"); res.end("a".repeat(2_000_000)); }
      else if (req.url === "/redir") { res.statusCode = 302; res.setHeader("location", "/ok"); res.end(); }
      else if (req.url === "/to-private") { res.statusCode = 302; res.setHeader("location", "http://169.254.169.254/"); res.end(); }
      else if (req.url === "/img") { res.setHeader("content-type", "image/png"); res.end("x"); }
      else if (req.url === "/404") { res.statusCode = 404; res.setHeader("content-type", "text/html"); res.end("no"); }
      else if (req.url === "/slow") { /* never responds */ }
      else { res.setHeader("content-type", "text/html"); res.end("<html>ok</html>"); }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => { server.closeAllConnections(); server.close(); });

  const o = { allowPrivateForTests: true };
  it("fetches, follows redirects, caps size, rejects non-HTML, errors, and times out", async () => {
    expect((await safeFetchText(`${base}/ok`, o)).body).toContain("ok");
    expect((await safeFetchText(`${base}/redir`, o)).finalUrl).toBe(`${base}/ok`);
    await expect(safeFetchText(`${base}/big`, o)).rejects.toMatchObject({ code: "too_large" });
    await expect(safeFetchText(`${base}/img`, o)).rejects.toMatchObject({ code: "not_html" });
    await expect(safeFetchText(`${base}/404`, o)).rejects.toMatchObject({ code: "http_error" });
    await expect(safeFetchText(`${base}/slow`, { ...o, timeoutMs: 300 })).rejects.toMatchObject({ code: "timeout" });
  });

  it("is blocked from the same local server without the test override (redirect hops use the same validation)", async () => {
    await expect(safeFetchText(`${base}/ok`)).rejects.toMatchObject({ code: "blocked_host" });
    await expect(ingestUrl(`${base}/ok`)).rejects.toBeInstanceOf(IngestError);
  });
});

import "server-only";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

/**
 * Fetching a URL the user typed is an SSRF risk: it must never reach localhost, private networks or cloud
 * metadata. We validate the scheme/port/host, and validate the *resolved* address inside the socket lookup
 * (so DNS rebinding can't swap in a private IP after the check). Redirects are followed manually and
 * re-validated at every hop.
 */

export class FetchBlockedError extends Error {
  constructor(
    public readonly code: "invalid_url" | "blocked_host" | "site_blocked" | "robots" | "too_large" | "timeout" | "http_error" | "not_html" | "network",
    message: string,
  ) {
    super(message);
    this.name = "FetchBlockedError";
  }
}

const blocked = new net.BlockList();
for (const [net4, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(net4, prefix, "ipv4");
for (const [net6, prefix] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["2001:db8::", 32], ["100::", 64]] as const) {
  blocked.addSubnet(net6, prefix, "ipv6");
}

/** True for loopback, private, link-local, multicast, reserved and metadata addresses (v4, v6, mapped, NAT64). */
export function isPrivateAddress(raw: string): boolean {
  const ip = raw.replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
  const family = net.isIP(ip);
  if (family === 0) return true; // not an IP: treat as unsafe
  if (family === 4) return blocked.check(ip, "ipv4");
  const mapped = ip.match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return blocked.check(mapped[1], "ipv4");
  const hexMapped = ip.match(/^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const hi = parseInt(hexMapped[1], 16);
    const lo = parseInt(hexMapped[2], 16);
    return blocked.check(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`, "ipv4");
  }
  return blocked.check(ip, "ipv6");
}

/** Sites whose terms forbid automated access. We ask the user to paste the description instead. */
const FORBIDDEN_SITES = ["linkedin.com", "indeed.com", "glassdoor.com", "glassdoor.co.uk", "ziprecruiter.com"];

export function isForbiddenSite(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return FORBIDDEN_SITES.some((d) => h === d || h.endsWith(`.${d}`));
}

export function parseSafeUrl(input: string): URL {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    throw new FetchBlockedError("invalid_url", "That doesn't look like a valid link.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new FetchBlockedError("invalid_url", "Only http and https links are supported.");
  if (u.username || u.password) throw new FetchBlockedError("invalid_url", "Links with embedded credentials aren't supported.");
  const port = u.port || (u.protocol === "https:" ? "443" : "80");
  if (port !== "80" && port !== "443") throw new FetchBlockedError("blocked_host", "That link uses an unsupported port.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new FetchBlockedError("blocked_host", "That link points to a private address.");
  }
  if (net.isIP(host) && isPrivateAddress(host)) throw new FetchBlockedError("blocked_host", "That link points to a private address.");
  if (isForbiddenSite(host)) {
    throw new FetchBlockedError("site_blocked", "That site doesn't allow automated access. Open the job in your browser, copy the description, and paste it here.");
  }
  return u;
}

export type FetchResult = { finalUrl: string; status: number; contentType: string; body: string };

type Options = { maxBytes?: number; timeoutMs?: number; maxRedirects?: number; accept?: string; allowPrivateForTests?: boolean };

const UA = "JobsmithBot/1.0 (+user-initiated fetch of one job page)";

export async function safeFetchText(url: string, opts: Options = {}): Promise<FetchResult> {
  const maxRedirects = opts.maxRedirects ?? 4;
  let current = opts.allowPrivateForTests ? new URL(url) : parseSafeUrl(url);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await once(current, opts);
    if ([301, 302, 303, 307, 308].includes(res.status) && res.location) {
      const next = new URL(res.location, current);
      current = opts.allowPrivateForTests ? next : parseSafeUrl(next.toString());
      continue;
    }
    if (res.status >= 400) throw new FetchBlockedError("http_error", `The site returned an error (${res.status}).`);
    return { finalUrl: current.toString(), status: res.status, contentType: res.contentType, body: res.body };
  }
  throw new FetchBlockedError("http_error", "Too many redirects.");
}

function once(u: URL, opts: Options): Promise<{ status: number; contentType: string; body: string; location?: string }> {
  const maxBytes = opts.maxBytes ?? 1_500_000;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const mod = u.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = mod.request(
      u,
      {
        method: "GET",
        headers: { "User-Agent": UA, Accept: opts.accept ?? "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "Accept-Encoding": "identity", "Accept-Language": "en" },
        // Validate the address the socket will actually connect to.
        lookup: (hostname, options, cb) => {
          dns.lookup(hostname, { all: true, family: 0 }, (err, addrs) => {
            if (err) return cb(err, "", 4);
            const list = addrs as dns.LookupAddress[];
            if (!opts.allowPrivateForTests && (list.length === 0 || list.some((a) => isPrivateAddress(a.address)))) {
              return cb(new FetchBlockedError("blocked_host", "That link points to a private address.") as unknown as NodeJS.ErrnoException, "", 4);
            }
            if ((options as { all?: boolean }).all) return (cb as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
            cb(null, list[0].address, list[0].family);
          });
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        const contentType = String(res.headers["content-type"] ?? "").toLowerCase();
        if (status >= 300 && status < 400 && location) {
          res.resume();
          return resolve({ status, contentType, body: "", location });
        }
        if (status < 400 && !/text\/(html|plain)|application\/(xhtml\+xml|json)/.test(contentType)) {
          res.destroy();
          return reject(new FetchBlockedError("not_html", "That link isn't a web page we can read."));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            res.destroy();
            reject(new FetchBlockedError("too_large", "That page is too large to read."));
          } else chunks.push(c);
        });
        res.on("end", () => resolve({ status, contentType, body: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", () => reject(new FetchBlockedError("network", "We couldn't download that page.")));
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new FetchBlockedError("timeout", "That site took too long to respond."));
    });
    req.on("error", (e) => reject(e instanceof FetchBlockedError ? e : (e as { cause?: unknown }).cause instanceof FetchBlockedError ? (e as { cause: unknown }).cause : new FetchBlockedError("network", "We couldn't reach that site.")));
    req.end();
  });
}

/* ───────────── robots.txt (best effort, fail-open) ───────────── */

export function robotsAllows(robotsTxt: string, path: string): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && cur) {
      cur.rules.push({ allow: key === "allow", path: val });
      lastWasAgent = false;
    } else lastWasAgent = false;
  }
  const mine = groups.filter((g) => g.agents.some((a) => a === "jobsmithbot"));
  const applicable = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  let best: { allow: boolean; len: number } | null = null;
  for (const g of applicable) {
    for (const r of g.rules) {
      if (!r.path) continue; // empty Disallow = allow all
      const pattern = r.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$");
      if (new RegExp(`^${pattern}`).test(path) && (!best || r.path.length > best.len || (r.path.length === best.len && r.allow))) {
        best = { allow: r.allow, len: r.path.length };
      }
    }
  }
  return best ? best.allow : true;
}

export async function checkRobots(u: URL, opts: Pick<Options, "allowPrivateForTests"> = {}): Promise<void> {
  try {
    const r = await safeFetchText(new URL("/robots.txt", u).toString(), { maxBytes: 200_000, timeoutMs: 4000, accept: "text/plain,*/*;q=0.5", ...opts });
    if (!robotsAllows(r.body, u.pathname + u.search)) {
      throw new FetchBlockedError("robots", "That site asks automated tools not to read this page. Copy the job description and paste it here instead.");
    }
  } catch (e) {
    if (e instanceof FetchBlockedError && e.code === "robots") throw e;
    // robots.txt missing/unreadable: allowed
  }
}

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { assertValidKey } from "./keys";
import { clampTtl, type Bucket, type ObjectStorage, type SignedUrlOptions } from "./types";

/**
 * DEV ONLY filesystem driver (STORAGE_DRIVER=local). Mirrors the R2 contract:
 * private storage, short-lived signed URLs served by /api/files. Refused in production by env().
 */
const ROOT = path.join(process.cwd(), ".data", "storage");

const secret = () => env().STORAGE_SIGNING_SECRET ?? env().AUTH_SECRET;

function filePath(bucket: Bucket, key: string): string {
  const full = path.resolve(ROOT, bucket, assertValidKey(key));
  if (!full.startsWith(path.resolve(ROOT, bucket) + path.sep)) throw new Error("Invalid object key");
  return full;
}

function sign(bucket: Bucket, key: string, exp: number, name: string): string {
  return createHmac("sha256", secret()).update(`${bucket}\n${key}\n${exp}\n${name}`).digest("base64url");
}

/** Used by the /api/files route to authorise a request. */
export function verifyLocalSignature(bucket: Bucket, key: string, exp: number, name: string, sig: string): boolean {
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  const expected = Buffer.from(sign(bucket, key, exp, name));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function createLocalStorage(): ObjectStorage {
  return {
    async put(bucket, key, body) {
      const p = filePath(bucket, key);
      await mkdir(path.dirname(p), { recursive: true });
      await writeFile(p, body);
    },
    async get(bucket, key) {
      try {
        return new Uint8Array(await readFile(filePath(bucket, key)));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
    async exists(bucket, key) {
      try {
        await stat(filePath(bucket, key));
        return true;
      } catch {
        return false;
      }
    },
    async getSignedUrl(bucket, key, opts: SignedUrlOptions = {}) {
      assertValidKey(key);
      const exp = Math.floor(Date.now() / 1000) + clampTtl(opts.expiresInSeconds);
      const name = opts.downloadName?.replace(/[^\w.\- ]/g, "_") ?? "";
      const q = new URLSearchParams({ exp: String(exp), sig: sign(bucket, key, exp, name) });
      if (name) q.set("name", name);
      return `/api/files/${bucket}/${key}?${q.toString()}`;
    },
    async delete(bucket, key) {
      await rm(filePath(bucket, key), { force: true });
    },
    async deletePrefix(bucket, prefix) {
      assertValidKey(prefix);
      const dir = path.resolve(ROOT, bucket, prefix);
      if (!dir.startsWith(path.resolve(ROOT, bucket) + path.sep)) throw new Error("Invalid prefix");
      const count = await countFiles(dir);
      await rm(dir, { recursive: true, force: true });
      return count;
    },
  };
}

async function countFiles(dir: string): Promise<number> {
  const { readdir } = await import("node:fs/promises");
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    let n = 0;
    for (const e of entries) n += e.isDirectory() ? await countFiles(path.join(dir, e.name)) : 1;
    return n;
  } catch {
    return 0;
  }
}

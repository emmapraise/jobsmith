export type Bucket = "uploads" | "exports";

export type SignedUrlOptions = {
  /** Default 300s (5 min). Hard cap 3600s. */
  expiresInSeconds?: number;
  /** Suggests a filename to the browser (Content-Disposition: attachment). */
  downloadName?: string;
};

/**
 * Small storage interface. Everything outside src/lib/storage talks to this,
 * never to S3/R2 or the filesystem directly. All buckets are private; the only
 * way to hand a file to a browser is a short-lived signed URL.
 */
export interface ObjectStorage {
  put(bucket: Bucket, key: string, body: Uint8Array, opts: { contentType: string }): Promise<void>;
  get(bucket: Bucket, key: string): Promise<Uint8Array | null>;
  exists(bucket: Bucket, key: string): Promise<boolean>;
  getSignedUrl(bucket: Bucket, key: string, opts?: SignedUrlOptions): Promise<string>;
  delete(bucket: Bucket, key: string): Promise<void>;
  /** Deletes every object whose key starts with `prefix`. Returns the number deleted. */
  deletePrefix(bucket: Bucket, prefix: string): Promise<number>;
}

export const DEFAULT_URL_TTL_SECONDS = 300;
export const MAX_URL_TTL_SECONDS = 3600;

export function clampTtl(s?: number): number {
  return Math.min(Math.max(Math.floor(s ?? DEFAULT_URL_TTL_SECONDS), 10), MAX_URL_TTL_SECONDS);
}

/** Storage is selected but not configured (e.g. R2 credentials missing). Everything else keeps working. */
export class StorageNotConfiguredError extends Error {
  constructor() {
    super("File storage isn't configured on this server yet.");
    this.name = "StorageNotConfiguredError";
  }
}

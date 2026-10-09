import "server-only";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";
import { assertValidKey } from "./keys";
import { clampTtl, type Bucket, type ObjectStorage, type SignedUrlOptions } from "./types";

/** Cloudflare R2 through the S3 API. */
export function createR2Storage(): ObjectStorage {
  const e = env();
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: e.R2_ACCESS_KEY_ID!, secretAccessKey: e.R2_SECRET_ACCESS_KEY! },
  });
  const bucketName = (b: Bucket) => (b === "uploads" ? e.R2_UPLOADS_BUCKET : e.R2_EXPORTS_BUCKET);

  return {
    async put(bucket, key, body, { contentType }) {
      await client.send(
        new PutObjectCommand({ Bucket: bucketName(bucket), Key: assertValidKey(key), Body: body, ContentType: contentType }),
      );
    },

    async get(bucket, key) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: bucketName(bucket), Key: assertValidKey(key) }));
        return res.Body ? await res.Body.transformToByteArray() : null;
      } catch (err) {
        if ((err as { name?: string }).name === "NoSuchKey") return null;
        throw err;
      }
    },

    async exists(bucket, key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucketName(bucket), Key: assertValidKey(key) }));
        return true;
      } catch (err) {
        const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (status === 404) return false;
        throw err;
      }
    },

    async getSignedUrl(bucket, key, opts: SignedUrlOptions = {}) {
      const safeName = opts.downloadName?.replace(/[^\w.\- ]/g, "_");
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: bucketName(bucket),
          Key: assertValidKey(key),
          ResponseContentDisposition: safeName ? `attachment; filename="${safeName}"` : undefined,
        }),
        { expiresIn: clampTtl(opts.expiresInSeconds) },
      );
    },

    async delete(bucket, key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucketName(bucket), Key: assertValidKey(key) }));
    },

    async deletePrefix(bucket, prefix) {
      assertValidKey(prefix);
      let deleted = 0;
      let token: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({ Bucket: bucketName(bucket), Prefix: prefix, ContinuationToken: token }),
        );
        const keys = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
        if (keys.length) {
          const res = await client.send(
            new DeleteObjectsCommand({ Bucket: bucketName(bucket), Delete: { Objects: keys, Quiet: true } }),
          );
          if (res.Errors?.length) throw new Error(`Failed to delete ${res.Errors.length} object(s) under prefix`);
          deleted += keys.length;
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return deleted;
    },
  };
}

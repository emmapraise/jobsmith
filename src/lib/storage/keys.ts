/**
 * Object keys: users/{userId}/resumes/{resumeId}/...
 * Every key a user owns lives under users/{userId}/ so account deletion is a prefix delete.
 */
const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

function seg(value: string, label: string): string {
  if (!SAFE_SEGMENT.test(value)) throw new Error(`Unsafe ${label} for object key`);
  return value;
}

export const userPrefix = (userId: string) => `users/${seg(userId, "userId")}/`;

export const resumePrefix = (userId: string, resumeId: string) =>
  `${userPrefix(userId)}resumes/${seg(resumeId, "resumeId")}/`;

/** Original uploaded resume. */
export function originalResumeKey(userId: string, resumeId: string, versionId: string, ext: "pdf" | "docx") {
  return `${resumePrefix(userId, resumeId)}original-${seg(versionId, "versionId")}.${ext}`;
}

/** Generated export, cached by content hash (M2): same content + template => same key. */
export function exportKey(userId: string, resumeId: string, contentHash: string, ext: "pdf" | "docx") {
  return `${resumePrefix(userId, resumeId)}export-${seg(contentHash, "contentHash")}.${ext}`;
}

/** Validate a key coming from a URL before touching storage. */
export function assertValidKey(key: string): string {
  if (key.includes("..") || key.startsWith("/") || key.includes("\\") || key.includes("\0") || !key.startsWith("users/")) {
    throw new Error("Invalid object key");
  }
  return key;
}

/**
 * Optional sign-in allowlist (ALLOWED_EMAILS). Empty/unset = anyone may sign in.
 * Entries are comma-separated: exact addresses ("me@x.com") or whole domains ("@x.com" or "*@x.com").
 * Matching is case-insensitive. Use it to keep a personal deployment (and its AI keys) private.
 */
export function isAllowedEmail(email: string | null | undefined, list: string | undefined): boolean {
  const entries = (list ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (entries.length === 0) return true;
  const e = (email ?? "").trim().toLowerCase();
  if (!e || !e.includes("@")) return false;
  const domain = e.slice(e.lastIndexOf("@"));
  return entries.some((x) => x === e || ((x.startsWith("@") || x.startsWith("*@")) && x.replace(/^\*/, "") === domain));
}

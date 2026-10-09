import "server-only";
import { env } from "@/lib/env";
import { log } from "@/lib/log";

export type Mail = { to: string; subject: string; text: string; html: string };

/** Sends through Resend. Without AUTH_RESEND_KEY (local dev) nothing is sent. Returns whether a send was attempted. */
export async function sendEmail(m: Mail): Promise<boolean> {
  const e = env();
  if (!e.AUTH_RESEND_KEY) {
    log.info("email.skipped", { reason: "no_resend_key" });
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${e.AUTH_RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: e.EMAIL_FROM, to: m.to, subject: m.subject, text: m.text, html: m.html }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}`);
  return true;
}

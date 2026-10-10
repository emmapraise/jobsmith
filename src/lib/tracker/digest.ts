import type { Stage } from "./stages";
import { STAGE_LABEL } from "./stages";

export type DigestItem = { id: string; company: string; title: string; status: Stage; followUpDue: boolean; promptDue: boolean; daysInStage: number };

import { emailButton, emailLayout, esc } from "@/lib/email-template";

const reason = (i: DigestItem) =>
  [i.followUpDue && "time to follow up", i.promptDue && (i.status === "saved" ? `saved ${i.daysInStage} days ago, still planning to apply?` : `no update for ${i.daysInStage} days, any news?`)].filter(Boolean).join("; ");

/** The reminder email. Contains only job titles and companies the user entered; never resume content. */
export function buildDigest(items: DigestItem[], appUrl: string): { subject: string; text: string; html: string } {
  const n = items.length;
  const subject = n === 1 ? "1 application needs your attention" : `${n} applications need your attention`;
  const link = (id: string) => `${appUrl.replace(/\/$/, "")}/tracker/${id}`;
  const text = [
    "Here's what needs a look in your Jobsmith tracker:",
    "",
    ...items.map((i) => `- ${i.title} at ${i.company} (${STAGE_LABEL[i.status]}): ${reason(i)}\n  ${link(i.id)}`),
    "",
    `Open your tracker: ${appUrl.replace(/\/$/, "")}/tracker`,
    "",
    "You get at most one of these a day, and only when something needs attention. Turn them off in Settings.",
  ].join("\n");
  const root = appUrl.replace(/\/$/, "");
  const rows = items
    .map((i) => `<tr><td style="padding:12px 0;border-top:1px solid #eee"><a href="${esc(link(i.id))}" style="color:#0b5c5a;font-weight:600;text-decoration:none">${esc(i.title)}</a><br><span style="color:#6b7280">${esc(i.company)} · ${esc(STAGE_LABEL[i.status])}</span><br><span style="font-size:14px">${esc(reason(i))}</span></td></tr>`)
    .join("");
  const html = emailLayout({
    preheader: subject,
    heading: subject,
    body: `<p style="margin:0 0 8px">Here's what needs a look in your tracker:</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table>${emailButton("Open your tracker", `${root}/tracker`)}`,
    footer: `You get at most one of these a day, and only when something needs attention. Turn them off in <a href="${esc(root)}/settings" style="color:#6b7280">Settings</a>.`,
  });
  return { subject, text, html };
}

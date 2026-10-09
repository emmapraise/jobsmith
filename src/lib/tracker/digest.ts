import type { Stage } from "./stages";
import { STAGE_LABEL } from "./stages";

export type DigestItem = { id: string; company: string; title: string; status: Stage; followUpDue: boolean; promptDue: boolean; daysInStage: number };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

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
  const html = `<p>Here's what needs a look in your Jobsmith tracker:</p><ul>${items
    .map((i) => `<li><a href="${esc(link(i.id))}"><strong>${esc(i.title)}</strong> at ${esc(i.company)}</a> (${esc(STAGE_LABEL[i.status])}): ${esc(reason(i))}</li>`)
    .join("")}</ul><p><a href="${esc(appUrl.replace(/\/$/, ""))}/tracker">Open your tracker</a></p><p style="color:#666;font-size:12px">You get at most one of these a day, and only when something needs attention. Turn them off in Settings.</p>`;
  return { subject, text, html };
}

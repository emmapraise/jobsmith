/** One branded, mobile-friendly layout for every email (table + inline styles: the only thing mail clients reliably render). */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const BRAND = "#0b5c5a";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

export const emailButton = (label: string, url: string) =>
  `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0"><tr><td style="background:${BRAND};border-radius:8px"><a href="${esc(url)}" style="display:inline-block;padding:13px 26px;font:600 16px ${FONT};color:#ffffff;text-decoration:none">${esc(label)}</a></td></tr></table>`;

/** `body` is trusted HTML: escape any user text with `esc` before it goes in. */
export function emailLayout(o: { preheader: string; heading: string; body: string; footer: string }): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(o.heading)}</title></head>
<body style="margin:0;padding:0;background:#f4f1ea">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(o.preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1ea"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px">
<tr><td style="padding:0 4px 16px;font:700 22px Georgia,'Times New Roman',serif;color:${BRAND}">Jobsmith</td></tr>
<tr><td style="background:#ffffff;border:1px solid #e6e0d4;border-radius:14px;padding:32px 28px;font:16px/1.55 ${FONT};color:#1f2933">
<h1 style="margin:0 0 14px;font:600 22px/1.3 Georgia,'Times New Roman',serif;color:#1f2933">${esc(o.heading)}</h1>
${o.body}
</td></tr>
<tr><td style="padding:18px 8px 0;font:12px/1.5 ${FONT};color:#6b7280">${o.footer}</td></tr>
</table></td></tr></table></body></html>`;
}

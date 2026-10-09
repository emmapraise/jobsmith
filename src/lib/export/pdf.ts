import "server-only";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { DocModel } from "./model";

/**
 * ATS-friendly PDF: real selectable text in reading order, one column, standard headings.
 * Helvetica (a PDF standard font) for ordinary Latin text; DejaVu Sans, embedded, when the text contains
 * characters Helvetica can't draw (e.g. Yoruba ọ/ẹ, Polish ł, Turkish ş).
 */
const WIN_ANSI_EXTRA = new Set([..."€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ"]);
export function needsUnicodeFont(text: string): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c > 0xff && !WIN_ANSI_EXTRA.has(ch)) return true;
  }
  return false;
}

const FONT_DIR = path.join(process.cwd(), "node_modules", "dejavu-fonts-ttf", "ttf");

const SIZES = { A4: [595.28, 841.89], LETTER: [612, 792] } as const;

function allText(m: DocModel): string {
  return [m.name, m.headline, ...m.contact, ...m.blocks.flatMap((b) => (b.t === "section" ? [b.title] : b.t === "paragraph" ? [b.text] : b.t === "kv" ? [b.label, b.text] : [b.heading, b.sub, b.dates, ...b.bullets]))].join("\n");
}

export function renderPdf(model: DocModel): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const [w, h] = SIZES[model.page];
    const margin = 50;
    const doc = new PDFDocument({ size: [w, h], margins: { top: 46, bottom: 46, left: margin, right: margin }, info: { Title: `${model.name} ${model.docTitle}`.trim(), Author: model.name, Producer: "Jobsmith" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const unicode = needsUnicodeFont(allText(model));
    let REG = "Helvetica", BOLD = "Helvetica-Bold", ITALIC = "Helvetica-Oblique";
    if (unicode) {
      doc.registerFont("DV", path.join(FONT_DIR, "DejaVuSans.ttf"));
      doc.registerFont("DV-B", path.join(FONT_DIR, "DejaVuSans-Bold.ttf"));
      doc.registerFont("DV-I", path.join(FONT_DIR, "DejaVuSans-Oblique.ttf"));
      [REG, BOLD, ITALIC] = ["DV", "DV-B", "DV-I"];
    }
    const BODY = unicode ? 9 : 10;
    const INK = "#111111";
    const MUTED = "#444444";
    const width = w - margin * 2;
    const bottom = () => h - 46;
    const ensure = (needed: number) => { if (doc.y + needed > bottom()) doc.addPage(); };

    // Header
    doc.fillColor(INK).font(BOLD).fontSize(20).text(model.name || model.docTitle, { align: "left" });
    if (model.headline) doc.font(REG).fontSize(11).fillColor(MUTED).text(model.headline);
    if (model.contact.length) doc.moveDown(0.3).font(REG).fontSize(BODY).fillColor(MUTED).text(model.contact.join("  |  "), { width });
    doc.moveDown(0.6);

    for (const b of model.blocks) {
      if (b.t === "section") {
        ensure(60);
        doc.y += 8;
        doc.font(BOLD).fontSize(11).fillColor(INK).text(b.title.toUpperCase(), { characterSpacing: 0.6 });
        const y = doc.y + 1;
        doc.moveTo(margin, y).lineTo(w - margin, y).lineWidth(0.6).strokeColor("#888888").stroke();
        doc.moveDown(0.35);
      } else if (b.t === "paragraph") {
        doc.font(REG).fontSize(BODY).fillColor(INK).text(b.text, { width, lineGap: 1.5 });
      } else if (b.t === "kv") {
        doc.font(REG).fontSize(BODY).fillColor(INK);
        if (b.label) doc.font(BOLD).text(`${b.label}: `, { continued: true, width }).font(REG).text(b.text, { lineGap: 1.5 });
        else doc.text(b.text, { width, lineGap: 1.5 });
      } else {
        ensure(52);
        const top = doc.y;
        doc.font(BOLD).fontSize(BODY + 0.5).fillColor(INK);
        const datesW = b.dates ? doc.font(REG).fontSize(BODY).widthOfString(b.dates) + 12 : 0;
        doc.font(BOLD).fontSize(BODY + 0.5).text(b.heading, margin, top, { width: width - datesW, lineGap: 1 });
        const afterHeading = doc.y;
        if (b.dates) doc.font(REG).fontSize(BODY).fillColor(MUTED).text(b.dates, margin, top, { width, align: "right" });
        doc.y = afterHeading;
        if (b.sub) doc.font(ITALIC).fontSize(BODY).fillColor(MUTED).text(b.sub, margin, doc.y, { width });
        doc.moveDown(0.15);
        for (const bullet of b.bullets) {
          ensure(26);
          const y0 = doc.y;
          doc.font(REG).fontSize(BODY).fillColor(INK).text("•", margin + 4, y0, { width: 10 });
          doc.text(bullet, margin + 16, y0, { width: width - 16, lineGap: 1.5 });
        }
        doc.moveDown(0.5);
        doc.x = margin;
      }
    }
    doc.end();
  });
}

import "server-only";
import { AlignmentType, BorderStyle, Document, LevelFormat, Packer, Paragraph, TabStopType, TextRun, convertMillimetersToTwip } from "docx";
import type { DocModel } from "./model";

/** ATS-friendly DOCX: real heading styles, native bullet list, right-aligned dates via tab stop, no tables. */
const PAGE = { A4: { w: 11906, h: 16838 }, LETTER: { w: 12240, h: 15840 } } as const;

export async function renderDocx(model: DocModel): Promise<Buffer> {
  const page = PAGE[model.page];
  const margin = convertMillimetersToTwip(18);
  const contentWidth = page.w - margin * 2;
  const FONT = "Calibri";

  const children: Paragraph[] = [];
  children.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: model.name || model.docTitle, bold: true, size: 40, font: FONT })] }));
  if (model.headline) children.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: model.headline, size: 22, color: "444444", font: FONT })] }));
  if (model.contact.length) children.push(new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: model.contact.join("  |  "), size: 19, color: "444444", font: FONT })] }));

  for (const b of model.blocks) {
    if (b.t === "section") {
      children.push(new Paragraph({
        heading: "Heading1",
        spacing: { before: 240, after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "888888", space: 1 } },
        children: [new TextRun({ text: b.title.toUpperCase(), bold: true, size: 22, font: FONT, characterSpacing: 12 })],
      }));
    } else if (b.t === "paragraph") {
      children.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: b.text, size: 21, font: FONT })] }));
    } else if (b.t === "kv") {
      children.push(new Paragraph({
        spacing: { after: 40 },
        children: [...(b.label ? [new TextRun({ text: `${b.label}: `, bold: true, size: 21, font: FONT })] : []), new TextRun({ text: b.text, size: 21, font: FONT })],
      }));
    } else {
      children.push(new Paragraph({
        keepNext: true,
        spacing: { before: 100, after: 20 },
        tabStops: [{ type: TabStopType.RIGHT, position: contentWidth }],
        children: [
          new TextRun({ text: b.heading, bold: true, size: 22, font: FONT }),
          ...(b.dates ? [new TextRun({ text: `\t${b.dates}`, size: 20, color: "444444", font: FONT })] : []),
        ],
      }));
      if (b.sub) children.push(new Paragraph({ keepNext: b.bullets.length > 0, spacing: { after: 30 }, children: [new TextRun({ text: b.sub, italics: true, size: 20, color: "444444", font: FONT })] }));
      for (const bullet of b.bullets) {
        children.push(new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 30 }, children: [new TextRun({ text: bullet, size: 21, font: FONT })] }));
      }
    }
  }

  const doc = new Document({
    creator: "Jobsmith",
    title: `${model.name} ${model.docTitle}`.trim(),
    styles: { default: { document: { run: { font: FONT, size: 21 } } } },
    numbering: {
      config: [{
        reference: "bullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } } } }],
      }],
    },
    sections: [{ properties: { page: { size: { width: page.w, height: page.h }, margin: { top: margin, bottom: margin, left: margin, right: margin } } }, children }],
  });
  return Packer.toBuffer(doc);
}

/** DEV: full tailoring pipeline against the real LLM + local storage, for the dev user.
 *  npm run tailor:e2e [-- you@example.com]   (seed first: npm run db:seed-dev) */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("dev only");
  const email = process.argv[2] ?? "dev@jobsmith.test";
  const { readFileSync } = await import("node:fs");
  const { eq } = await import("drizzle-orm");
  const { db, tables } = await import("../src/lib/db");
  const { getMasterResume } = await import("../src/lib/resume/repo");
  const { ingestPastedText } = await import("../src/lib/jobs/ingest");
  const { parseJob } = await import("../src/lib/jobs/parse");
  const { generateTailoring } = await import("../src/lib/tailor/engine");
  const { createTailored, getTailored, mutateWorking, freezeCurrent } = await import("../src/lib/tailor/repo");
  const { applyTailorChange, changeState } = await import("../src/lib/tailor/changes");
  const { resolveLlm } = await import("../src/lib/llm/user-config");
  const { exportToUrl } = await import("../src/lib/export/service");
  const { extractText, getDocumentProxy } = await import("unpdf");
  const mammoth = (await import("mammoth")).default;

  const [user] = await db().select().from(tables.users).where(eq(tables.users.email, email));
  if (!user) throw new Error("no such user");
  const master = (await getMasterResume(user.id))!;
  const llm = await resolveLlm(user.id);
  console.log(`using ${llm.provider}/${llm.model}`);

  const job = ingestPastedText(readFileSync("tests/fixtures/sample-job.txt", "utf8"));
  const parsed = await parseJob(job.text, llm);
  const t0 = Date.now();
  const r = await generateTailoring(master.content, parsed, llm);
  console.log(`tailored in ${((Date.now() - t0) / 1000).toFixed(1)}s: score=${r.score} changes=${r.changes.length} dropped=${r.dropped.length} gaps=${r.gaps.length}`);
  for (const d of r.dropped) console.log(`  dropped ${d.op}: ${d.why}`);

  const id = await createTailored({ userId: user.id, masterResumeId: master.id, masterVersion: master.version, variant: "uk_eu", job: { source: "pasted_text", url: null, text: job.text, parsed }, content: master.content, changes: r.changes, gaps: r.gaps, analysis: r.analysis, matchScore: r.score });

  if (process.env.NOACCEPT) { console.log(`created ${id} with ${r.changes.length} pending suggestions`); process.exit(0); }
  // Accept every suggestion the way the action does
  await mutateWorking(user.id, id, (w) => {
    let content = w.content;
    const changes = w.changes.map((c) => {
      if (changeState(content, c) === "unapplied") content = applyTailorChange(content, c);
      return { ...c, decision: "accepted" as const };
    });
    return { ...w, content, changes };
  });
  const view = (await getTailored(user.id, id))!;
  await freezeCurrent(user.id, id);
  console.log(`accepted ${view.changes.filter((c) => c.decision === "accepted").length}; tailored id=${id}`);

  for (const format of ["pdf", "docx"] as const) {
    const out = await exportToUrl({ userId: user.id, ownerId: id, content: view.content, variant: view.variant, format, company: parsed.company });
    const again = await exportToUrl({ userId: user.id, ownerId: id, content: view.content, variant: view.variant, format, company: parsed.company });
    const url = new URL(out.url, "http://localhost:3000");
    const bytes = Buffer.from(await (await import("../src/lib/storage")).storage().get("exports", decodeURIComponent(url.pathname.replace("/api/files/exports/", "")))  as Uint8Array);
    let text = "";
    if (format === "pdf") { const p = await getDocumentProxy(new Uint8Array(bytes)); const t = (await extractText(p, { mergePages: true })).text; text = Array.isArray(t) ? t.join("\n") : t; }
    else text = (await mammoth.extractRawText({ buffer: bytes })).value;
    console.log(`${format}: ${out.fileName} ${bytes.length}B cached-on-second=${again.cached} contains-name=${text.includes(master.content.contact.fullName)} contains-company=${text.includes("Paystack-like")}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e instanceof Error ? `${e.name}: ${e.message}` : e); process.exit(1); });

/** Dev check: runs the real parser against the sample fixture with env-configured provider(s).
 *  npm run llm:check -- [model ...]   (models apply to LLM_PROVIDER) */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { readFileSync } = await import("node:fs");
  const { extractResumeText } = await import("../src/lib/resume/upload");
  const { parseResumeText } = await import("../src/lib/resume/parse");
  const { PROVIDER_INFO } = await import("../src/lib/llm/catalog");
  const { env } = await import("../src/lib/env");

  const e = env();
  const apiKey = e[PROVIDER_INFO[e.LLM_PROVIDER].envVar as keyof typeof e] as string | undefined;
  if (!apiKey) throw new Error(`No key for ${e.LLM_PROVIDER}`);
  const models = process.argv.slice(2).length ? process.argv.slice(2) : [e.LLM_MODEL ?? PROVIDER_INFO[e.LLM_PROVIDER].defaultModel];
  const text = await extractResumeText(new Uint8Array(readFileSync("tests/fixtures/sample-resume.pdf")), "pdf");

  if (process.env.TAILOR) {
    const { parseJob } = await import("../src/lib/jobs/parse");
    const { generateTailoring } = await import("../src/lib/tailor/engine");
    const cfg = { provider: e.LLM_PROVIDER, model: models[0], apiKey };
    const content = await parseResumeText(text, cfg);
    const jobText = readFileSync("tests/fixtures/sample-job.txt", "utf8");
    let t = Date.now();
    const job = await parseJob(jobText, cfg);
    console.log(`JOB (${((Date.now() - t) / 1000).toFixed(1)}s): ${job.title} @ ${job.company}, ${job.location}, ${job.workMode}, visa=${job.visaSponsorship}`);
    console.log("  requirements:", job.requirements.map((r) => `${r.id}[${r.importance}] ${r.text}`).join(" | "));
    console.log("  keywords:", job.keywords.join(", "));
    t = Date.now();
    const r = await generateTailoring(content, job, cfg);
    console.log(`TAILORING (${((Date.now() - t) / 1000).toFixed(1)}s): score=${r.score} kept=${r.changes.length} dropped=${r.dropped.length}`);
    for (const c of r.changes) console.log(`  + ${c.kind}: ${"after" in c ? JSON.stringify(c.after) : JSON.stringify((c as { items?: string[] }).items)} — ${c.reason}`);
    for (const d of r.dropped) console.log(`  - DROPPED ${d.op}: ${d.why}`);
    console.log("COVERAGE:", r.analysis.coverage.map((c) => `${c.requirementId}:${c.status}`).join(" "));
    console.log("KEYWORDS missing in master:", r.analysis.keywords.missing.join(", "));
    for (const g of r.gaps) console.log(`  ? [${g.importance}] ${g.requirement} → ${g.question}`);
    process.exit(0);
  }
  if (process.env.FULL) {
    const { generateQuestions, proposeChanges } = await import("../src/lib/resume/qa");
    const cfg = { provider: e.LLM_PROVIDER, model: models[0], apiKey };
    const content = await parseResumeText(text, cfg);
    const qs = await generateQuestions(content, cfg);
    console.log(`QUESTIONS (${qs.length}):`);
    for (const q of qs) console.log(`  [${q.kind}] ${q.question}  — why: ${q.why}`);
    const answers = qs.slice(0, 2).map((q, i) => ({ questionId: q.id, skipped: false, answer: i === 0 ? "Yes, still there. Also I now run the on-call rota for 6 engineers." : "The migration had zero downtime and queries became about 2x faster." }));
    const ch = await proposeChanges(content, qs, answers, cfg);
    console.log(`CHANGES (${ch.length}):`);
    for (const c of ch) console.log(`  ${c.description} | ${JSON.stringify((c.patch as { text?: string; items?: string[] }).text ?? (c.patch as { items?: string[] }).items)} | why: ${c.reason}`);
    process.exit(0);
  }
  for (const model of models) {
    const t0 = Date.now();
    try {
      const r = await parseResumeText(text, { provider: e.LLM_PROVIDER, model, apiKey });
      console.log(`✓ ${e.LLM_PROVIDER}/${model} ${((Date.now() - t0) / 1000).toFixed(1)}s`, JSON.stringify({
        name: r.contact.fullName, email: r.contact.email, roles: r.experience.map((x) => `${x.title}@${x.company} ${x.start}→${x.current ? "now" : x.end}`),
        bullets: r.experience.map((x) => x.bullets.length), skills: r.skills.map((s) => `${s.name}:${s.items.length}`), edu: r.education.length,
      }));
    } catch (err) {
      console.log(`✗ ${e.LLM_PROVIDER}/${model}: ${err instanceof Error ? err.name + " – " + err.message : err}`);
    }
  }
  process.exit(0);
}
main();

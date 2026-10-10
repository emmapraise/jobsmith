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

  if (process.env.ANSWERS) {
    const { parseJob } = await import("../src/lib/jobs/parse");
    const { draftAnswers } = await import("../src/lib/jobs/answers");
    const { emptyProfile } = await import("../src/lib/profile/schema");
    const cfg = { provider: e.LLM_PROVIDER, model: models[0], apiKey };
    const resume = await parseResumeText(text, cfg);
    const jobText = readFileSync("tests/fixtures/sample-job.txt", "utf8") + "\n\nApplication form questions:\n- Why do you want to work at Globex Financial?\n- Describe a technical challenge you solved and how.\n- What is your notice period?\n- Do you require visa sponsorship to work in the UK?\n- Tell us about your Kafka experience.";
    const job = await parseJob(jobText, cfg);
    console.log("QUESTIONS:", job.applicationQuestions);
    const profile = { ...emptyProfile(), seniority: "senior" as const, needsVisaSponsorship: true, salaryMin: 70000, salaryCurrency: "GBP", salaryPeriod: "year" as const };
    for (const a of await draftAnswers(job.applicationQuestions ?? [], resume, profile, job, cfg)) console.log(`\nQ: ${a.question}\nA: ${a.answer || "(withheld)"}`);
    return;
  }

  if (process.env.PREP) {
    const { parseJob } = await import("../src/lib/jobs/parse");
    const { generatePrep, evaluateAnswer } = await import("../src/lib/prep/engine");
    const { emptyProfile } = await import("../src/lib/profile/schema");
    const cfg = { provider: e.LLM_PROVIDER, model: models[0], apiKey };
    const resume = await parseResumeText(text, cfg);
    const jobText = readFileSync("tests/fixtures/sample-job.txt", "utf8");
    const job = await parseJob(jobText, cfg);
    const profile = { ...emptyProfile(), seniority: "senior" as const, needsVisaSponsorship: true, workModes: ["remote" as const], salaryMin: 70000, salaryCurrency: "GBP", salaryPeriod: "year" as const };
    let t = Date.now();
    const { questions, brief } = await generatePrep({ job, jobText, resume, profile, llm: cfg });
    console.log(`PREP generated in ${((Date.now() - t) / 1000).toFixed(1)}s: ${questions.length} questions`, JSON.stringify(Object.fromEntries(["technical", "behavioural", "system_design", "gap"].map((c) => [c, questions.filter((q) => q.category === c).length]))));
    for (const q of questions) console.log(`  [${q.category}/${q.difficulty}] ${q.question}\n      why: ${q.why} | points: ${q.keyPoints.length} | refs: ${q.resumeRefs.map((id) => resume.experience.find((x) => x.id === id)?.company ?? resume.projects.find((x) => x.id === id)?.name).join(",") || "-"}`);
    console.log("BRIEF:", brief.summary); console.log("  does:", brief.whatTheyDo.join(" | ")); console.log("  tech:", brief.techAndTools.join(", ")); console.log("  culture:", brief.cultureSignals.join(" | "));
    console.log("  clarify:", brief.clarifyEarly.join(" | ")); console.log("  ask:", brief.questionsToAsk.slice(0, 3).join(" | ")); console.log("  research:", brief.researchChecklist.slice(0, 3).join(" | "));
    const beh = questions.find((q) => q.category === "behavioural")!;
    const strong = "At DataWorks I owned our nightly ETL pipeline in Python and Airflow, which processed 2TB a day. When it started missing its SLA I traced it to unpartitioned joins, rewrote the slow stages and added alerting. The pipeline stopped missing its window, and I wrote the runbook so on-call engineers could fix similar issues without me. What I learned is to add monitoring before optimising.";
    const weak = "Yeah I've dealt with that kind of thing before, we just worked together and it got sorted out in the end. It was fine.";
    for (const [label, answer] of [["STRONG", strong], ["WEAK", weak]] as const) {
      t = Date.now();
      const f = await evaluateAnswer({ question: beh, answer, resume, llm: cfg });
      console.log(`FEEDBACK ${label} (${((Date.now() - t) / 1000).toFixed(1)}s): overall=${f?.overall} scores=${JSON.stringify(f?.scores)}\n   verdict: ${f?.verdict}\n   improve: ${f?.improvements.slice(0, 2).join(" | ")}\n   resumeTips: ${f?.resumeTips.join(" | ") || "-"}`);
    }
    process.exit(0);
  }
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

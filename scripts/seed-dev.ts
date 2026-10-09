/**
 * DEV ONLY: fills a user's account with realistic sample data so every screen can be viewed without an LLM key.
 *   npm run db:seed-dev -- you@example.com
 * Refuses to run when NODE_ENV=production.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production");
  const email = process.argv[2] ?? "dev@jobsmith.test";

  const { eq } = await import("drizzle-orm");
  const { db, tables } = await import("../src/lib/db");
  const { addVersion } = await import("../src/lib/resume/repo");
  const { saveProfile } = await import("../src/lib/profile/repo");
  const { createQa, moveToReview, saveAnswer } = await import("../src/lib/resume/qa-repo");
  const { insightsInputHash } = await import("../src/lib/resume/insights");
  const { newId, emptyResume } = await import("../src/lib/resume/schema");

  const [user] = await db().select().from(tables.users).where(eq(tables.users.email, email));
  if (!user) throw new Error(`No user with email ${email}. Sign in once first.`);

  const b = (text: string) => ({ id: newId(), text });
  const exp1 = newId();
  const content = {
    ...emptyResume(),
    contact: { fullName: "Ada Okafor", headline: "Senior Backend Engineer", email, phone: "+234 800 000 0000", location: "Lagos, Nigeria", links: [{ id: newId(), label: "GitHub", url: "https://github.com/adaokafor" }] },
    summary: "Backend engineer with 7 years of experience building payment APIs and data pipelines in Node.js and Python.",
    experience: [
      { id: exp1, company: "Paystack-like Co", title: "Senior Backend Engineer", location: "Lagos, Nigeria", start: "2021-03", end: "", current: true, bullets: [b("Built and maintained Node.js payment APIs serving 40,000 daily users."), b("Reduced p95 latency of the settlement service from 900ms to 240ms."), b("Mentored four junior engineers and led the migration to PostgreSQL 15.")] },
      { id: newId(), company: "DataWorks", title: "Backend Engineer", location: "Remote", start: "2018-06", end: "2021-02", current: false, bullets: [b("Designed ETL pipelines in Python and Airflow processing 2TB per day."), b("Wrote integration tests that cut production incidents by 30 percent.")] },
      { id: newId(), company: "Startup Ltd", title: "Junior Developer", location: "", start: "", end: "2018-05", current: false, bullets: [] },
    ],
    education: [{ id: newId(), institution: "University of Lagos", degree: "BSc", field: "Computer Science", location: "", start: "2012", end: "2016", details: [] }],
    skills: [{ id: newId(), name: "Languages", items: ["TypeScript", "Python", "SQL", "Go"] }, { id: newId(), name: "Cloud", items: ["AWS", "Docker", "Terraform"] }],
  };
  const master = await addVersion({ userId: user.id, resumeId: crypto.randomUUID(), content, source: "upload", note: "Seeded sample", resetReviewed: true });

  const profile = await saveProfile(user.id, {
    headlineGoal: "A backend or AI engineering role at a product company in the UK or Europe.", seniority: "senior", yearsExperience: 7,
    targetRoles: ["Backend Engineer", "AI Engineer"], currentCountry: "Nigeria", preferredCountries: ["United Kingdom", "Germany", "Remote (anywhere)"],
    openToRelocation: true, workModes: ["remote", "hybrid"], salaryMin: 70000, salaryCurrency: "GBP", salaryPeriod: "year",
    authorizationStatus: "need_sponsorship", needsVisaSponsorship: true, authorizationNotes: "Nigerian citizen. UK Skilled Worker visa needed.",
  }, true);

  // An open Q&A in review state with two proposed changes
  const questions = [
    { id: "q1", question: "Are you still working at Paystack-like Co?", why: "Your latest role has no end date, so recruiters will read it as current.", kind: "yes_no" as const, targetId: exp1 },
    { id: "q2", question: "Did the PostgreSQL 15 migration have a measurable outcome (downtime, cost, speed)?", why: "Outcomes make bullets stand out.", kind: "text" as const, targetId: exp1 },
  ];
  const qa = await createQa(user.id, master.resumeId, master.version, questions);
  await saveAnswer(user.id, qa.id, { questionId: "q1", answer: "Yes", skipped: false });
  await saveAnswer(user.id, qa.id, { questionId: "q2", answer: "Zero downtime, and queries ran about 2x faster.", skipped: false });
  const patch = (o: object) => ({ op: "add_bullet", targetId: exp1, text: null, groupName: null, items: [], role: null, cert: null, description: "", reason: "", ...o });
  await moveToReview(user.id, qa.id, [
    { id: "c1", description: "Add outcome to Senior Backend Engineer at Paystack-like Co", reason: "You said the PostgreSQL 15 migration had zero downtime and roughly 2x faster queries.", decision: "pending", patch: patch({ op: "replace_bullet", targetId: master.resumeId && content.experience[0].bullets[2].id, text: "Led the zero-downtime migration to PostgreSQL 15, making queries about 2x faster." }) },
    { id: "c2", description: "Add Kubernetes to Cloud skills", reason: "You mentioned running services on Kubernetes.", decision: "pending", patch: patch({ op: "add_skills", targetId: null, groupName: "Cloud", items: ["Kubernetes"] }) },
  ]);

  const data = {
    positioning: "A senior backend engineer with payments and data-pipeline depth, readable as a strong fit for product-company backend roles.",
    strengths: ["Payments and API design at scale", "Performance tuning", "Data pipelines (Python, Airflow)", "Mentoring"],
    roles: [
      { title: "Senior Backend Engineer", category: "best_fit", fitScore: 88, whyFit: "Seven years of backend work with measurable performance and scale outcomes.", evidence: ["Node.js payment APIs for 40,000 daily users", "p95 latency 900ms → 240ms", "PostgreSQL 15 migration lead"], gaps: ["No Kubernetes or service-mesh experience shown"], searchKeywords: ["senior backend engineer", "node.js", "payments", "postgres"] },
      { title: "Platform Engineer", category: "best_fit", fitScore: 71, whyFit: "Terraform, Docker and AWS experience plus reliability work.", evidence: ["Terraform and AWS in skills", "Reduced production incidents by 30%"], gaps: ["No infrastructure-as-code project described", "No on-call or SLO ownership shown"], searchKeywords: ["platform engineer", "aws", "terraform"] },
      { title: "Data Engineer", category: "adjacent", fitScore: 66, whyFit: "Airflow ETL pipelines at 2TB/day is directly relevant.", evidence: ["ETL pipelines in Python and Airflow, 2TB per day"], gaps: ["No warehouse (Snowflake/BigQuery) experience shown", "No dbt"], searchKeywords: ["data engineer", "airflow", "python"] },
      { title: "AI Engineer", category: "adjacent", fitScore: 48, whyFit: "Strong backend foundation; no LLM or ML work is shown yet.", evidence: ["Python and API design experience"], gaps: ["No LLM application or evaluation experience", "No vector search or retrieval work"], searchKeywords: ["ai engineer", "llm", "python"] },
    ],
  };
  await db().insert(tables.roleInsights).values({ userId: user.id, resumeId: master.resumeId, resumeVersion: master.version, inputHash: insightsInputHash(content, profile.data), data }).onConflictDoNothing();
  // Sample applications at different ages so the board, reminders and prompts all have something to show.
  const { createApplication, listApplications } = await import("../src/lib/tracker/repo");
  if ((await listApplications(user.id)).length === 0) {
    const ago = (d: number) => new Date(Date.now() - d * 86_400_000);
    const rows: [string, string, string, "saved" | "applied" | "screening" | "interview" | "offer" | "rejected", number][] = [
      ["Monzo", "Backend Engineer", "London, UK", "saved", 9],
      ["Wise", "Senior Backend Engineer", "London, UK (Hybrid)", "applied", 9],
      ["Revolut", "Platform Engineer", "Remote (EMEA)", "applied", 3],
      ["Stripe", "Software Engineer, Payments", "Dublin, Ireland", "screening", 2],
      ["Datadog", "Senior SRE", "Paris, France", "interview", 1],
      ["Klarna", "Backend Engineer", "Stockholm, Sweden", "rejected", 20],
    ];
    for (const [company, title, location, status, d] of rows) await createApplication({ userId: user.id, manual: { company, title, location, url: `https://example.com/${company.toLowerCase()}/jobs/1` }, status, resume: { master: true }, now: ago(d) });
  }
  console.log(`Seeded ${email}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

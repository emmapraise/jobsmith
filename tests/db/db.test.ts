import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteUserData } from "@/lib/account";
import { db, tables } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { addVersion, getMasterResume, getVersionContent, listVersions } from "@/lib/resume/repo";
import { emptyResume, type ResumeContent } from "@/lib/resume/schema";
import { getProfile, saveProfile } from "@/lib/profile/repo";
import { createQa, completeQa, decideChange, getOpenQa, moveToReview, saveAnswer } from "@/lib/resume/qa-repo";
import { storage } from "@/lib/storage";
import { getAiSettingsView, removeUserKey, resolveLlm, saveAiSelection, saveUserKey } from "@/lib/llm/user-config";
import { LlmNotConfiguredError } from "@/lib/llm";

const A = `t-${crypto.randomUUID()}`;
const B = `t-${crypto.randomUUID()}`;
const content = (name: string): ResumeContent => ({ ...emptyResume(), contact: { ...emptyResume().contact, fullName: name } });

beforeAll(async () => {
  await db().insert(tables.users).values([{ id: A, email: `${A}@x.test` }, { id: B, email: `${B}@x.test` }]);
});
afterAll(async () => {
  await db().delete(tables.users).where(eq(tables.users.id, A));
  await db().delete(tables.users).where(eq(tables.users.id, B));
});

describe("rate limiting", () => {
  it("allows up to the limit then blocks with a retry-after, per key", async () => {
    const key = `test:${crypto.randomUUID()}`;
    const policy = { limit: 3, windowSeconds: 60 };
    const now = new Date("2026-01-01T00:00:10Z");
    for (let i = 0; i < 3; i++) expect((await rateLimit(key, policy, now)).ok).toBe(true);
    const blocked = await rateLimit(key, policy, now);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterSeconds).toBe(50);
    expect((await rateLimit(`${key}-other`, policy, now)).ok).toBe(true);
    // a new window resets
    expect((await rateLimit(key, policy, new Date("2026-01-01T00:01:05Z"))).ok).toBe(true);
  });
});

describe("master resume versions", () => {
  it("creates v1, appends versions, returns the latest, restores old content, and isolates users", async () => {
    const rid = crypto.randomUUID();
    const v1 = await addVersion({ userId: A, resumeId: rid, content: content("One"), source: "upload", file: { key: `users/${A}/resumes/${rid}/original-x.pdf`, name: "cv.pdf" }, resetReviewed: true });
    expect(v1.version).toBe(1);
    const v2 = await addVersion({ userId: A, resumeId: crypto.randomUUID(), content: content("Two"), source: "manual_edit" });
    expect(v2).toEqual({ resumeId: rid, version: 2 }); // existing resume reused, supplied id ignored

    const m = await getMasterResume(A);
    expect(m?.version).toBe(2);
    expect(m?.content.contact.fullName).toBe("Two");
    expect(m?.sourceFileName).toBe("cv.pdf");
    expect((await listVersions(A)).map((v) => v.version)).toEqual([2, 1]);
    expect((await getVersionContent(A, 1))?.contact.fullName).toBe("One");

    // other user sees nothing
    expect(await getMasterResume(B)).toBeNull();
    expect(await getVersionContent(B, 1)).toBeNull();
  });

  it("rejects content that doesn't match the schema", async () => {
    await expect(addVersion({ userId: A, resumeId: crypto.randomUUID(), content: { nope: 1 } as unknown as ResumeContent, source: "manual_edit" })).rejects.toThrow();
  });
});

describe("profile", () => {
  it("merges patches over defaults and tracks completion", async () => {
    expect((await getProfile(A)).completed).toBe(false);
    await saveProfile(A, { currentCountry: "Nigeria", preferredCountries: ["United Kingdom"] });
    const p = await saveProfile(A, { needsVisaSponsorship: true }, true);
    expect(p.completed).toBe(true);
    expect(p.data).toMatchObject({ currentCountry: "Nigeria", needsVisaSponsorship: true });
    expect((await getProfile(B)).data.currentCountry).toBe("");
  });
});

describe("Q&A sessions", () => {
  it("runs active → review → completed, applying only accepted changes, scoped to the user", async () => {
    const master = (await getMasterResume(A))!;
    const withRole: ResumeContent = { ...master.content, experience: [{ id: "e1", company: "Acme", title: "Dev", location: "", start: "2022-01", end: "", current: true, bullets: [] }] };
    await addVersion({ userId: A, resumeId: master.id, content: withRole, source: "manual_edit" });

    const qa = await createQa(A, master.id, master.version, [{ id: "q1", question: "?", why: "w", kind: "text" }]);
    expect((await getOpenQa(A))?.id).toBe(qa.id);
    expect(await getOpenQa(B)).toBeNull();
    expect(await saveAnswer(B, qa.id, { questionId: "q1", answer: "x", skipped: false })).toBeNull();
    expect(await saveAnswer(A, qa.id, { questionId: "q1", answer: "Led migration", skipped: false })).not.toBeNull();
    expect(await saveAnswer(A, qa.id, { questionId: "bogus", answer: "x", skipped: false })).toBeNull();

    const mk = (id: string, text: string) => ({
      id, description: "d", reason: "r", decision: "pending" as const,
      patch: { op: "add_bullet", targetId: "e1", text, groupName: null, items: [], role: null, cert: null, description: "d", reason: "r" },
    });
    await moveToReview(A, qa.id, [mk("c1", "Led migration"), mk("c2", "Rejected one")]);
    expect(await decideChange(B, qa.id, "c1", "accepted")).toBeNull();
    await decideChange(A, qa.id, "c1", "accepted");
    await decideChange(A, qa.id, "c2", "rejected");

    const res = await completeQa(A, qa.id);
    expect(res.applied).toBe(1);
    const after = (await getMasterResume(A))!;
    expect(after.content.experience[0].bullets.map((b) => b.text)).toEqual(["Led migration"]);
    expect(after.version).toBe(master.version + 2);
    expect(await getOpenQa(A)).toBeNull();
  });
});

describe("per-user AI settings", () => {
  it("falls back to env defaults, then honours the user's provider, model and own key; keys stay encrypted", async () => {
    const v0 = await getAiSettingsView(A);
    expect(v0).toMatchObject({ provider: "anthropic", explicitProvider: null });
    await expect(resolveLlm(A)).rejects.toBeInstanceOf(LlmNotConfiguredError); // no env key in tests

    await saveAiSelection(A, "openai", "gpt-4.1");
    await saveUserKey(A, "openai", "sk-user-abcdef1234");
    expect(await resolveLlm(A)).toEqual({ provider: "openai", model: "gpt-4.1", apiKey: "sk-user-abcdef1234" });
    const view = await getAiSettingsView(A);
    expect(view.providers.find((p) => p.provider === "openai")).toEqual({ provider: "openai", keySource: "own", keyLast4: "1234" });
    expect(JSON.stringify(view)).not.toContain("sk-user");

    const [raw] = await db().select().from(tables.userAiSettings).where(eq(tables.userAiSettings.userId, A));
    expect(JSON.stringify(raw)).not.toContain("sk-user");

    // another user is unaffected
    expect((await getAiSettingsView(B)).explicitProvider).toBeNull();

    await saveAiSelection(A, "openai", null); // model back to default
    expect((await resolveLlm(A)).model).toBe("gpt-4.1");
    await removeUserKey(A, "openai");
    await expect(resolveLlm(A)).rejects.toBeInstanceOf(LlmNotConfiguredError);
  });
});

describe("account deletion", () => {
  it("removes all rows and every object under the user's prefix in both buckets", async () => {
    const U = `t-${crypto.randomUUID()}`;
    await db().insert(tables.users).values({ id: U, email: `${U}@x.test` });
    const rid = crypto.randomUUID();
    await addVersion({ userId: U, resumeId: rid, content: content("Del"), source: "upload" });
    await saveProfile(U, { currentCountry: "UK" });
    const s = storage();
    const k = `users/${U}/resumes/${rid}/original-1.pdf`;
    const k2 = `users/${U}/resumes/${rid}/export-abc.pdf`;
    await s.put("uploads", k, new Uint8Array([1]), { contentType: "application/pdf" });
    await s.put("exports", k2, new Uint8Array([2]), { contentType: "application/pdf" });

    const out = await deleteUserData(U);
    expect(out.objectsDeleted).toBe(2);
    expect(await s.exists("uploads", k)).toBe(false);
    expect(await s.exists("exports", k2)).toBe(false);
    expect(await getMasterResume(U)).toBeNull();
    expect(await db().select().from(tables.profiles).where(eq(tables.profiles.userId, U))).toHaveLength(0);
    expect(await db().select().from(tables.users).where(eq(tables.users.id, U))).toHaveLength(0);
  });
});

import { addTailoredVersion, createTailored, deleteTailored, freezeCurrent, getTailored, listTailored, mutateWorking } from "@/lib/tailor/repo";

describe("tailored resumes", () => {
  const parsed = {
    title: "Backend Engineer", company: "Globex", location: "London", workMode: "hybrid" as const, seniority: "senior" as const, visaSponsorship: "offered" as const, summary: "",
    keywords: ["Node.js"], responsibilities: [], requirements: [{ id: "r1", text: "Node.js", importance: "must" as const, category: "skill" as const }],
  };

  it("creates, mutates in place while open, versions when frozen, scopes by user, and cascades on delete", async () => {
    const m = (await getMasterResume(A))!;
    const id = await createTailored({
      userId: A, masterResumeId: m.id, masterVersion: m.version, variant: "uk_eu", job: { source: "pasted_text", url: null, text: "job text", parsed },
      content: m.content, changes: [], gaps: [], analysis: { coverage: [], keywords: { total: 1, master: [], missing: ["Node.js"] } }, matchScore: 40,
    });

    const v1 = (await getTailored(A, id))!;
    expect(v1).toMatchObject({ version: 1, frozen: false, matchScore: 40, variant: "uk_eu" });
    expect(v1.job).toMatchObject({ title: "Backend Engineer", company: "Globex" });
    expect((await listTailored(A)).map((x) => x.id)).toContain(id);

    // open version: edits happen in place
    await mutateWorking(A, id, (w) => ({ ...w, content: { ...w.content, summary: "edit 1" } }));
    expect(await getTailored(A, id)).toMatchObject({ version: 1 });

    // frozen version: next edit creates version 2 and leaves v1 untouched
    await freezeCurrent(A, id);
    await mutateWorking(A, id, (w) => ({ ...w, content: { ...w.content, summary: "edit 2" } }));
    const v2 = (await getTailored(A, id))!;
    expect(v2).toMatchObject({ version: 2, frozen: false });
    expect(v2.content.summary).toBe("edit 2");
    const [old] = await db().select().from(tables.tailoredResumeVersions).where(eq(tables.tailoredResumeVersions.tailoredResumeId, id)).orderBy(tables.tailoredResumeVersions.version);
    expect((old.content as ResumeContent).summary).toBe("edit 1");
    expect(old.frozenAt).not.toBeNull();

    expect(await addTailoredVersion(A, id, { masterVersion: m.version, content: m.content, changes: [], gaps: [], analysis: { coverage: [], keywords: { total: 0, master: [], missing: [] } }, matchScore: 50 })).toBe(3);

    // isolation
    expect(await getTailored(B, id)).toBeNull();
    expect(await mutateWorking(B, id, (w) => w)).toBeNull();
    await deleteTailored(B, id);
    expect(await getTailored(A, id)).not.toBeNull();

    await deleteTailored(A, id);
    expect(await getTailored(A, id)).toBeNull();
    expect(await db().select().from(tables.tailoredResumeVersions).where(eq(tables.tailoredResumeVersions.tailoredResumeId, id))).toHaveLength(0);
  });
});

import { applicationForJob, createApplication, deleteApplication, dueCount, dueForUser, followedUp, getApplication, getEvents, listApplications, moveApplication, setApplicationResume, snoozeApplication, updateApplication } from "@/lib/tracker/repo";

describe("application tracker", () => {
  const day = 86_400_000;
  const parsed = { title: "Platform Engineer", company: "Initech", location: "Remote", workMode: "remote" as const, seniority: "senior" as const, visaSponsorship: "unknown" as const, summary: "", keywords: [], responsibilities: [], requirements: [] };
  const mkTailored = async (userId: string) => {
    const m = (await getMasterResume(userId))!;
    const id = await createTailored({ userId, masterResumeId: m.id, masterVersion: m.version, variant: "uk_eu", job: { source: "pasted_text", url: null, text: "t", parsed }, content: m.content, changes: [], gaps: [], analysis: { coverage: [], keywords: { total: 0, master: [], missing: [] } }, matchScore: 61 });
    return { id, jobId: (await getTailored(userId, id))!.job.id, content: m.content };
  };

  it("creates from a tailoring, pins the exact resume version (frozen), and is idempotent per job", async () => {
    const t = await mkTailored(A);
    const now = new Date("2026-03-01T10:00:00Z");
    const a = await createApplication({ userId: A, jobId: t.jobId, status: "applied", resume: { tailoredId: t.id }, now });
    expect(a.created).toBe(true);
    expect((await createApplication({ userId: A, jobId: t.jobId, status: "saved", resume: null })).created).toBe(false);
    expect(await applicationForJob(A, t.jobId)).toEqual({ id: a.id, status: "applied" });

    const row = (await getApplication(A, a.id))!;
    expect(row).toMatchObject({ title: "Platform Engineer", company: "Initech", status: "applied", resume: { kind: "tailored", tailoredId: t.id, version: 1, frozen: true, matchScore: 61 } });
    expect(row.appliedAt).toEqual(now);
    expect(row.nextFollowUpAt).toEqual(new Date(now.getTime() + 7 * day)); // reminder set automatically

    // Editing the tailored resume afterwards creates v2; the application still points at v1's exact content.
    await mutateWorking(A, t.id, (w) => ({ ...w, content: { ...w.content, summary: "edited after applying" } }));
    expect((await getTailored(A, t.id))!.version).toBe(2);
    expect((await getApplication(A, a.id))!.resume).toMatchObject({ kind: "tailored", version: 1, frozen: true });
    expect((await getEvents(A, a.id)).map((e) => e.to)).toEqual(["applied"]);
  });

  it("creates manual applications, moves stages with events, resets reminders, and sets appliedAt only once", async () => {
    const t0 = new Date("2026-04-01T09:00:00Z");
    const { id } = await createApplication({ userId: A, manual: { company: "Hooli", title: "SRE", url: "https://hooli.example/jobs/1", location: "London" }, status: "saved", resume: { master: true }, now: t0 });
    let row = (await getApplication(A, id))!;
    expect(row).toMatchObject({ status: "saved", appliedAt: null, nextFollowUpAt: null, url: "https://hooli.example/jobs/1" });
    expect(row.resume?.kind).toBe("master");

    const t1 = new Date(t0.getTime() + 2 * day);
    expect(await moveApplication(A, id, "applied", t1)).toBe(true);
    row = (await getApplication(A, id))!;
    expect(row.appliedAt).toEqual(t1);
    expect(row.nextFollowUpAt).toEqual(new Date(t1.getTime() + 7 * day));

    const t2 = new Date(t1.getTime() + 4 * day);
    await moveApplication(A, id, "interview", t2);
    row = (await getApplication(A, id))!;
    expect(row.appliedAt).toEqual(t1); // not overwritten
    expect(row.nextFollowUpAt).toEqual(new Date(t2.getTime() + 3 * day));

    await moveApplication(A, id, "rejected", new Date(t2.getTime() + day));
    row = (await getApplication(A, id))!;
    expect(row).toMatchObject({ status: "rejected", nextFollowUpAt: null });
    expect((await getEvents(A, id)).map((e) => `${e.from ?? "-"}>${e.to}`)).toEqual(["->saved", "saved>applied", "applied>interview", "interview>rejected"]);
    expect(await moveApplication(A, id, "rejected")).toBe(true); // no-op, no duplicate event
    expect(await getEvents(A, id)).toHaveLength(4);
  });

  it("surfaces follow-ups and 'any news?' prompts, and answers clear them", async () => {
    const t0 = new Date("2026-05-01T09:00:00Z");
    const { id } = await createApplication({ userId: A, manual: { company: "Pied Piper", title: "Backend" }, status: "applied", resume: null, now: t0 });
    const at = (d: number) => new Date(t0.getTime() + d * day);
    expect((await dueForUser(A, at(3))).find((r) => r.id === id)).toBeUndefined();
    const d8 = (await dueForUser(A, at(8))).find((r) => r.id === id)!;
    expect(d8.due.followUpDue).not.toBeNull();
    expect(d8.due.promptDue).toBe(false);
    expect((await dueForUser(A, at(15))).find((r) => r.id === id)!.due.promptDue).toBe(true);
    expect(await dueCount(A, at(15))).toBeGreaterThanOrEqual(1);

    await followedUp(A, id, 7, at(15)); // followed up: next reminder in a week
    await snoozeApplication(A, id, at(15)); // no news: quiet for a week
    expect((await dueForUser(A, at(16))).find((r) => r.id === id)).toBeUndefined();
    expect((await dueForUser(A, at(23))).find((r) => r.id === id)).toBeDefined();
  });

  it("updates notes/dates, swaps the resume used, is user-scoped, and deletes manual jobs with the application", async () => {
    const { id } = await createApplication({ userId: A, manual: { company: "Soylent", title: "Dev" }, status: "saved", resume: null });
    expect(await updateApplication(A, id, { notes: "Spoke to Dana", appliedAt: new Date("2026-02-02"), nextFollowUpAt: new Date("2026-02-09") })).toBe(true);
    expect(await getApplication(A, id)).toMatchObject({ notes: "Spoke to Dana" });
    expect(await setApplicationResume(A, id, { master: true })).toBe(true);
    expect((await getApplication(A, id))!.resume?.kind).toBe("master");

    expect(await getApplication(B, id)).toBeNull();
    expect(await updateApplication(B, id, { notes: "hijack" })).toBe(false);
    expect(await moveApplication(B, id, "offer")).toBe(false);
    expect(await setApplicationResume(B, id, null)).toBe(false);
    expect(await getEvents(B, id)).toEqual([]);
    expect((await listApplications(B))).toEqual([]);

    const jobId = (await getApplication(A, id))!.jobId;
    await deleteApplication(B, id);
    expect(await getApplication(A, id)).not.toBeNull();
    await deleteApplication(A, id);
    expect(await getApplication(A, id)).toBeNull();
    expect(await db().select().from(tables.jobs).where(eq(tables.jobs.id, jobId))).toHaveLength(0);
  });

  it("keeps a tailoring's job when only the application is deleted", async () => {
    const t = await mkTailored(A);
    const { id } = await createApplication({ userId: A, jobId: t.jobId, status: "saved", resume: { tailoredId: t.id } });
    await deleteApplication(A, id);
    expect(await getTailored(A, t.id)).not.toBeNull();
  });

  it("rejects a job that belongs to someone else", async () => {
    const t = await mkTailored(A);
    await expect(createApplication({ userId: B, jobId: t.jobId, status: "saved", resume: null })).rejects.toThrow();
  });
});

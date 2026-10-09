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

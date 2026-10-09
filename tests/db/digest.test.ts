import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sendEmail = vi.fn();
vi.mock("@/lib/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));

import { GET, POST } from "@/app/api/cron/reminders/route";
import { db, tables } from "@/lib/db";
import { createApplication } from "@/lib/tracker/repo";
import { getEmailReminders, runReminderDigests, setEmailReminders } from "@/lib/tracker/reminders";

const U = `d-${crypto.randomUUID()}`;
const day = 86_400_000;

beforeAll(async () => {
  await db().insert(tables.users).values({ id: U, email: `${U}@x.test` });
  await createApplication({ userId: U, manual: { company: "Acme", title: "Dev" }, status: "applied", resume: null, now: new Date("2026-06-01T09:00:00Z") });
});
afterAll(() => db().delete(tables.users).where(eq(tables.users.id, U)));
beforeEach(() => sendEmail.mockReset());

// Other users from earlier test files may exist in the shared test DB; only count calls addressed to our user.
const toUs = () => sendEmail.mock.calls.filter((c) => (c[0] as { to: string }).to === `${U}@x.test`);

describe("email reminders", () => {
  it("are off by default and send nothing", async () => {
    expect(await getEmailReminders(U)).toBe(false);
    sendEmail.mockResolvedValue(true);
    await runReminderDigests(new Date("2026-06-20T09:00:00Z"));
    expect(toUs()).toHaveLength(0);
  });

  it("send one digest to an opted-in user with something due, then not again within a day", async () => {
    sendEmail.mockResolvedValue(true);
    await setEmailReminders(U, true);
    const t = new Date("2026-06-20T09:00:00Z"); // 19 days after applying: follow-up overdue and no news
    await runReminderDigests(t);
    expect(toUs()).toHaveLength(1);
    const mail = toUs()[0][0] as { subject: string; text: string };
    expect(mail.subject).toMatch(/1 application needs your attention/);
    expect(mail.text).toContain("Dev at Acme");

    await runReminderDigests(new Date(t.getTime() + 3_600_000)); // an hour later
    expect(toUs()).toHaveLength(1);
    await runReminderDigests(new Date(t.getTime() + day + 3_600_000)); // next day
    expect(toUs()).toHaveLength(2);
  });

  it("does not send when nothing is due, and does not record a digest when sending is unavailable", async () => {
    await setEmailReminders(U, true);
    await db().update(tables.notificationPrefs).set({ lastDigestAt: null }).where(eq(tables.notificationPrefs.userId, U));
    sendEmail.mockResolvedValue(false); // e.g. no Resend key in dev
    await runReminderDigests(new Date("2026-07-30T09:00:00Z"));
    const [p] = await db().select().from(tables.notificationPrefs).where(eq(tables.notificationPrefs.userId, U));
    expect(p.lastDigestAt).toBeNull();
    await setEmailReminders(U, false);
    expect(await getEmailReminders(U)).toBe(false);
  });
});

describe("/api/cron/reminders", () => {
  const req = (auth?: string) => new Request("http://localhost/api/cron/reminders", { headers: auth ? { authorization: auth } : {} });
  it("requires the bearer secret", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer wrong"))).status).toBe(401);
    expect((await POST(req("test-cron-secret-0123456789"))).status).toBe(401); // missing "Bearer "
    sendEmail.mockResolvedValue(true);
    const ok = await POST(req("Bearer test-cron-secret-0123456789"));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ users: expect.any(Number), sent: expect.any(Number) });
  });
});

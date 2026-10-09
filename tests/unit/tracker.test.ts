import { describe, expect, it } from "vitest";
import { describeFollowUp, dueApps, snoozeUntil, type DueInput } from "@/lib/tracker/due";
import { addDays, followUpOnMove, isStage, STAGES } from "@/lib/tracker/stages";

const now = new Date("2026-10-20T12:00:00Z");
const app = (o: Partial<DueInput> = {}): DueInput => ({ id: "a", status: "applied", nextFollowUpAt: null, statusChangedAt: addDays(now, -1), lastStatusPromptAt: null, snoozedUntil: null, ...o });

describe("stages", () => {
  it("has the six stages in order and validates input", () => {
    expect(STAGES).toEqual(["saved", "applied", "screening", "interview", "offer", "rejected"]);
    expect(isStage("offer")).toBe(true);
    expect(isStage("hired")).toBe(false);
  });
  it("sets a follow-up when entering waiting stages only", () => {
    expect(followUpOnMove("applied", now)).toEqual(addDays(now, 7));
    expect(followUpOnMove("screening", now)).toEqual(addDays(now, 5));
    expect(followUpOnMove("interview", now)).toEqual(addDays(now, 3));
    for (const s of ["saved", "offer", "rejected"] as const) expect(followUpOnMove(s, now)).toBeNull();
  });
});

describe("dueApps", () => {
  it("flags a follow-up that has arrived, not one in the future", () => {
    expect(dueApps([app({ nextFollowUpAt: addDays(now, -2) })], now)[0]).toMatchObject({ followUpDue: addDays(now, -2), promptDue: false, overdueDays: 2 });
    expect(dueApps([app({ nextFollowUpAt: addDays(now, 3) })], now)).toEqual([]);
    expect(dueApps([app({ nextFollowUpAt: now })], now)).toHaveLength(1); // due today
  });
  it("asks 'any news?' after the per-stage threshold of silence", () => {
    expect(dueApps([app({ status: "applied", statusChangedAt: addDays(now, -13) })], now)).toEqual([]);
    expect(dueApps([app({ status: "applied", statusChangedAt: addDays(now, -14) })], now)[0]).toMatchObject({ promptDue: true });
    expect(dueApps([app({ status: "interview", statusChangedAt: addDays(now, -7) })], now)[0]?.promptDue).toBe(true);
    expect(dueApps([app({ status: "saved", statusChangedAt: addDays(now, -7) })], now)[0]?.promptDue).toBe(true);
  });
  it("counts silence from the last answered prompt, and respects snooze", () => {
    const old = addDays(now, -30);
    expect(dueApps([app({ statusChangedAt: old, lastStatusPromptAt: addDays(now, -2) })], now)).toEqual([]);
    expect(dueApps([app({ statusChangedAt: old, lastStatusPromptAt: addDays(now, -20) })], now)).toHaveLength(1);
    expect(dueApps([app({ statusChangedAt: old, snoozedUntil: addDays(now, 3) })], now)).toEqual([]);
    expect(dueApps([app({ statusChangedAt: old, snoozedUntil: addDays(now, -1) })], now)).toHaveLength(1);
    expect(snoozeUntil(now)).toEqual(addDays(now, 7));
  });
  it("never reminds about closed applications", () => {
    for (const status of ["offer", "rejected"] as const) expect(dueApps([app({ status, nextFollowUpAt: addDays(now, -5), statusChangedAt: addDays(now, -90) })], now)).toEqual([]);
  });
  it("sorts most overdue first and reports days in stage", () => {
    const r = dueApps([app({ id: "x", nextFollowUpAt: addDays(now, -1) }), app({ id: "y", nextFollowUpAt: addDays(now, -9), statusChangedAt: addDays(now, -10) })], now);
    expect(r.map((d) => d.id)).toEqual(["y", "x"]);
    expect(r[0].daysInStage).toBe(10);
  });
});

describe("describeFollowUp", () => {
  it("words it for humans", () => {
    expect(describeFollowUp(addDays(now, -2), now)).toEqual({ text: "2 days overdue", overdue: true });
    expect(describeFollowUp(addDays(now, -1), now)).toEqual({ text: "1 day overdue", overdue: true });
    expect(describeFollowUp(now, now)).toEqual({ text: "today", overdue: true });
    expect(describeFollowUp(addDays(now, 1), now)).toEqual({ text: "tomorrow", overdue: false });
    expect(describeFollowUp(addDays(now, 5), now)).toEqual({ text: "in 5 days", overdue: false });
  });
});

import { buildDigest } from "@/lib/tracker/digest";

describe("buildDigest", () => {
  const items = [
    { id: "11111111-1111-1111-1111-111111111111", company: "Acme <script>", title: 'Dev "Lead"', status: "applied" as const, followUpDue: true, promptDue: false, daysInStage: 8 },
    { id: "22222222-2222-2222-2222-222222222222", company: "Globex", title: "SRE", status: "interview" as const, followUpDue: false, promptDue: true, daysInStage: 9 },
  ];
  it("summarises, links to each application, and says how to stop", () => {
    const m = buildDigest(items, "https://jobsmith.example/");
    expect(m.subject).toBe("2 applications need your attention");
    expect(m.text).toContain("https://jobsmith.example/tracker/11111111-1111-1111-1111-111111111111");
    expect(m.text).toContain("time to follow up");
    expect(m.text).toContain("no update for 9 days, any news?");
    expect(m.text).toMatch(/Turn them off in Settings/);
    expect(buildDigest(items.slice(1), "http://x").subject).toBe("1 application needs your attention");
  });
  it("escapes user-entered text in the HTML body", () => {
    const m = buildDigest(items, "https://jobsmith.example");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("Acme &lt;script&gt;");
    expect(m.html).toContain("Dev &quot;Lead&quot;");
  });
});

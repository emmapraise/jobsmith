import "server-only";
import { getMasterResume } from "@/lib/resume/repo";
import { listTailored } from "@/lib/tailor/repo";
import type { ResumeOption } from "@/components/tracker/add-application";

/** Resumes a user can attach to an application. */
export async function resumeOptions(userId: string): Promise<ResumeOption[]> {
  const [master, tailored] = await Promise.all([getMasterResume(userId), listTailored(userId, 50)]);
  return [
    ...(master ? [{ value: "master", label: `Master resume (current, v${master.version})` }] : []),
    ...tailored.map((t) => ({ value: `tailored:${t.id}`, label: `Tailored: ${t.title || "Untitled role"}${t.company ? ` at ${t.company}` : ""} (v${t.version})` })),
  ];
}

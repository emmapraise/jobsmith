import "server-only";
import { eq } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { emptyProfile, profileSchema, type ProfileData } from "./schema";

export type StoredProfile = { data: ProfileData; completed: boolean };

export async function getProfile(userId: string): Promise<StoredProfile> {
  const [row] = await db().select().from(tables.profiles).where(eq(tables.profiles.userId, userId)).limit(1);
  if (!row) return { data: emptyProfile(), completed: false };
  // Merge over defaults so profiles saved before a field existed still parse.
  const data = profileSchema.parse({ ...emptyProfile(), ...row.data });
  return { data, completed: row.completed };
}

export async function saveProfile(userId: string, patch: Partial<ProfileData>, completed?: boolean): Promise<StoredProfile> {
  const current = await getProfile(userId);
  const data = profileSchema.parse({ ...current.data, ...patch });
  const done = completed ?? current.completed;
  await db()
    .insert(tables.profiles)
    .values({ userId, data, completed: done })
    .onConflictDoUpdate({ target: tables.profiles.userId, set: { data, completed: done } });
  return { data, completed: done };
}

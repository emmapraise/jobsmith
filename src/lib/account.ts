import "server-only";
import { eq } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { storage, userPrefix } from "@/lib/storage";

/**
 * Full account deletion: every object under users/{userId}/ in BOTH buckets, then the user row
 * (all other tables cascade from users). Storage goes first: if it fails we keep the account so the
 * user can retry, rather than orphaning files nobody can reach.
 */
export async function deleteUserData(userId: string): Promise<{ objectsDeleted: number }> {
  const prefix = userPrefix(userId);
  const [uploads, exports_] = await Promise.all([
    storage().deletePrefix("uploads", prefix),
    storage().deletePrefix("exports", prefix),
  ]);
  await db().delete(tables.users).where(eq(tables.users.id, userId));
  return { objectsDeleted: uploads + exports_ };
}

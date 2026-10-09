import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "./auth";

export type CurrentUser = { id: string; name: string | null; email: string; image: string | null };

/** Data access layer: the one place the session is read. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const u = session?.user;
  if (!u?.id || !u.email) return null;
  return { id: u.id, name: u.name ?? null, email: u.email, image: u.image ?? null };
});

/** For pages, layouts and server actions: redirects to sign-in when signed out. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

/** For route handlers: throws UnauthorizedError (map to 401) instead of redirecting. */
export async function requireUserApi(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

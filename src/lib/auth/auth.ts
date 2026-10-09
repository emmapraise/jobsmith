import "server-only";
import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db, tables } from "@/lib/db";
import { env } from "@/lib/env";

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function providers(): Provider[] {
  const e = env();
  const list: Provider[] = [];

  if (e.AUTH_GOOGLE_ID && e.AUTH_GOOGLE_SECRET) {
    // Google verifies email ownership, so linking to an existing magic-link account is safe.
    list.push(
      Google({ clientId: e.AUTH_GOOGLE_ID, clientSecret: e.AUTH_GOOGLE_SECRET, allowDangerousEmailAccountLinking: true }),
    );
  }

  list.push(
    Resend({
      apiKey: e.AUTH_RESEND_KEY,
      from: e.EMAIL_FROM,
      async sendVerificationRequest({ identifier, url, provider }) {
        if (!provider.apiKey) {
          if (process.env.NODE_ENV === "production") throw new Error("AUTH_RESEND_KEY is required in production");
          // Dev only: no email service configured, print the link so you can sign in locally.
          console.info(`\n[jobsmith:dev] Magic sign-in link for ${identifier}:\n${url}\n`);
          return;
        }
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: provider.from,
            to: identifier,
            subject: "Your Jobsmith sign-in link",
            html: `<p>Click to sign in to Jobsmith:</p><p><a href="${escapeHtml(url)}">Sign in</a></p><p>This link expires in 24 hours and can be used once. If you didn't request it, ignore this email.</p>`,
            text: `Sign in to Jobsmith: ${url}\n\nThis link expires in 24 hours and can be used once. If you didn't request it, ignore this email.`,
          }),
        });
        if (!res.ok) throw new Error(`Resend error ${res.status}`);
      },
    }),
  );
  return list;
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: DrizzleAdapter(db(), {
    usersTable: tables.users,
    accountsTable: tables.accounts,
    sessionsTable: tables.sessions,
    verificationTokensTable: tables.verificationTokens,
  }),
  providers: providers(),
  session: { strategy: "database", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/sign-in", verifyRequest: "/sign-in/check-email", error: "/sign-in" },
  trustHost: true,
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
}));

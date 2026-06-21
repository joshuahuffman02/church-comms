import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "./db";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { parseRoles } from "./roles";

// Module augmentation so `session.user.roles: string[]` and `session.user.id:
// string` typecheck everywhere (no `any`). The JWT already extends
// Record<string, unknown> in this Auth.js beta, so we read its custom claims
// through a narrow local helper rather than augmenting next-auth/jwt (whose
// module path can't be reliably augmented here).
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      roles: string[];
    };
  }
}

/** Narrowing reads for the JWT's custom claims (token is Record<string, unknown>). */
function tokenId(token: Record<string, unknown>): string {
  return typeof token.id === "string" ? token.id : "";
}
function tokenRoles(token: Record<string, unknown>): string[] {
  return Array.isArray(token.roles)
    ? token.roles.filter((r): r is string => typeof r === "string")
    : [];
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  trustHost: true,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (c) => {
        const user = await db.user.findUnique({ where: { email: String(c.email) } });
        if (!user) return null;
        // No bootstrap: a user with no password cannot log in. Set one
        // out-of-band via `npx tsx scripts/set-password.ts <email> <password>`.
        if (!user.password) return null;
        // Offboarding: a deactivated user can never log in.
        if (!user.active) return null;
        if (!(await bcrypt.compare(String(c.password), user.password))) return null;
        // Carry id + roles through so the jwt callback can stamp the token.
        return { id: user.id, name: user.name, email: user.email, roles: parseRoles(user.roles) };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // At sign-in `user` is present (the authorize() return): copy id + roles
    // onto the token. On later requests `user` is undefined and the token
    // already carries them, so they persist.
    jwt: async ({ token, user }) => {
      if (user) {
        const u = user as { id?: string; roles?: string[] };
        if (u.id) token.id = u.id;
        token.roles = Array.isArray(u.roles) ? u.roles : tokenRoles(token);
      }
      return token;
    },
    // Mirror id + roles from the token onto the session the app reads.
    session: async ({ session, token }) => {
      session.user.id = tokenId(token);
      session.user.roles = tokenRoles(token);
      return session;
    },
  },
});

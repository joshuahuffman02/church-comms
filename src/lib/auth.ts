import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "./db";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import {
  planningCenterProvider,
  provisionPlanningCenterUser,
} from "./pco-auth";
import { parsePlanningCenterIdentity } from "./pco-auth-profile";
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
  interface User {
    roles?: string[];
  }
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
    ...(planningCenterProvider ? [planningCenterProvider] : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    signIn: async ({ user, account, profile }) => {
      if (account?.provider !== "planning-center") return true;
      const identity = parsePlanningCenterIdentity(profile);
      if (!identity) return false;
      const localUser = await provisionPlanningCenterUser(identity);
      if (!localUser) return false;

      // The OAuth profile id is PCO's `sub`; the rest of this app deliberately
      // uses its own local SQLite id. Stamp the local identity before the JWT
      // callback runs so request ownership is never keyed to an external id.
      user.id = localUser.id;
      user.name = localUser.name;
      user.email = localUser.email;
      user.roles = localUser.roles;
      return true;
    },
  },
});

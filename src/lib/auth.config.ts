import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe base config. Contains NO database / native-module imports
 * (no Prisma, no bcrypt) so it can run in the middleware (Edge) runtime.
 * The full config in `auth.ts` spreads this and adds the Credentials provider.
 */
export const authConfig = {
  // Self-hosted on the church's own host/port — trust it (no Vercel host auto-detection).
  // Lives in the base config so BOTH the middleware (edge) instance and the full
  // auth.ts instance trust the host; otherwise middleware redirects 500 (UntrustedHost).
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    // Logged-in users pass; everyone else is redirected to `pages.signIn`.
    authorized: async ({ auth }) => !!auth,
  },
} satisfies NextAuthConfig;

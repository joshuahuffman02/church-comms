import type { NextAuthConfig } from "next-auth";

function tokenId(token: Record<string, unknown>): string {
  return typeof token.id === "string" ? token.id : "";
}

function tokenRoles(token: Record<string, unknown>): string[] {
  return Array.isArray(token.roles)
    ? token.roles.filter((role): role is string => typeof role === "string")
    : [];
}

function portalOnly(roles: string[]): boolean {
  const internalRoles = new Set([
    "admin",
    "editor",
    "viewer",
    "triager",
    "designer",
    "publisher",
    "approver",
  ]);
  return !roles.some((role) => internalRoles.has(role));
}

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
    // Carry the local database identity and roles into stateless JWT sessions.
    jwt: async ({ token, user }) => {
      if (user) {
        token.id = user.id;
        token.roles = Array.isArray(user.roles)
          ? user.roles
          : tokenRoles(token);
      }
      return token;
    },
    session: async ({ session, token }) => {
      session.user.id = tokenId(token);
      session.user.roles = tokenRoles(token);
      return session;
    },
    // PCO-created requester accounts get a focused portal. Internal staff keep
    // the full board. This edge check is backed up by ownership checks in every
    // My Requests query and action.
    authorized: async ({ auth, request }) => {
      if (!auth) return false;
      const roles = auth.user?.roles ?? [];
      if (!portalOnly(roles)) return true;

      const path = request.nextUrl.pathname;
      if (path === "/") {
        return Response.redirect(new URL("/my-requests", request.url));
      }
      if (path === "/my-requests" || path.startsWith("/my-requests/")) {
        return true;
      }
      return Response.redirect(new URL("/my-requests", request.url));
    },
  },
} satisfies NextAuthConfig;

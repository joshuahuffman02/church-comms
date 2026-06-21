import { auth } from "./auth";
import { db } from "./db";
import { hasRole, isAdmin, isEditor, parseRoles } from "./roles";

/**
 * Authorization helpers for server actions / server components.
 *
 * `requireUser()` keeps the original "is there a session?" semantics that every
 * action used to inline. `requireRole(...)` / `requireAdmin()` / `requireEditor()`
 * layer role enforcement on top. `admin` always satisfies any role check
 * (superuser), so the existing solo-admin keeps full access.
 *
 * Guards THROW ("Unauthorized" with no session, "Forbidden" without the role)
 * so a non-admin who reaches a guarded action fails closed.
 */

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  roles: string[];
};

/**
 * The current session user, or null when signed out.
 *
 * Roles + id are resolved FRESH from the database (keyed by the session email)
 * rather than trusted from the login token. This means: (a) sessions created
 * before roles existed still work, (b) role changes and deactivations take
 * effect immediately without requiring re-login. A deactivated or deleted user
 * resolves to null (fails closed).
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;
  const dbUser = await db.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, roles: true, active: true },
  });
  if (!dbUser || !dbUser.active) return null;
  return { id: dbUser.id, name: dbUser.name, email: dbUser.email, roles: parseRoles(dbUser.roles) };
}

/** Throw "Unauthorized" when there's no session; otherwise return the user. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

/**
 * Require the session user to hold one of `roles` (admin always passes).
 * Throws "Unauthorized" with no session, "Forbidden" without a matching role.
 */
export async function requireRole(...roles: string[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasRole(user.roles, roles)) throw new Error("Forbidden");
  return user;
}

/** Admin-only: user-admin, settings, destructive deletes, channels, etc. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isAdmin(user.roles)) throw new Error("Forbidden");
  return user;
}

/** Editor-or-admin (incl. legacy editor roles): the everyday comms work. */
export async function requireEditor(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isEditor(user.roles)) throw new Error("Forbidden");
  return user;
}

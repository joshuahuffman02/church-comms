"use server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { parseRoles, isAdmin } from "@/lib/roles";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

/**
 * User-admin server actions. EVERY action requires `requireAdmin()` so only an
 * admin can invite/add, set roles, deactivate/reactivate, or reset a password.
 * This is the SSH-free onboarding/offboarding surface for the church's
 * mid-turnover staff.
 *
 * Last-admin guard: we never let an admin remove the final active admin (by
 * deactivation OR by demoting away the `admin` role) — that would lock everyone
 * out of user-admin and settings with no recovery short of the CLI.
 */

const NAME_CAP = 120;
const EMAIL_CAP = 200;
const BCRYPT_ROUNDS = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KNOWN_ROLES = ["admin", "editor", "viewer", "triager", "designer", "publisher", "approver"];

/** Pull the checked role checkboxes into a clean, de-duped, known-only list. */
function readRoles(fd: FormData): string[] {
  const picked = fd
    .getAll("roles")
    .map((r) => String(r).trim())
    .filter((r) => KNOWN_ROLES.includes(r));
  return Array.from(new Set(picked));
}

/** Count active users that still carry the `admin` role, optionally excluding one id. */
async function countActiveAdmins(excludeId?: string): Promise<number> {
  const users = await db.user.findMany({
    where: { active: true, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { roles: true },
  });
  return users.filter((u) => isAdmin(parseRoles(u.roles))).length;
}

/**
 * Create a user from the add form. Name + a valid unique email are required.
 * Roles come from checkboxes. An optional initial password is bcrypt-hashed;
 * with NO password the user is created with `password: null` and cannot log in
 * until an admin sets one (but still lists with `active: true`).
 */
export async function createUser(fd: FormData) {
  await requireAdmin();

  const name = String(fd.get("name") ?? "").trim().slice(0, NAME_CAP);
  const email = String(fd.get("email") ?? "").trim().toLowerCase().slice(0, EMAIL_CAP);
  if (!name) throw new Error("Name is required");
  if (!EMAIL_RE.test(email)) throw new Error("A valid email is required");

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new Error("A user with that email already exists");

  const roles = readRoles(fd);
  const rawPassword = String(fd.get("password") ?? "");
  const password = rawPassword ? await bcrypt.hash(rawPassword, BCRYPT_ROUNDS) : null;

  await db.user.create({ data: { name, email, roles, password, active: true } });
  revalidatePath("/settings/users");
}

/**
 * Replace a user's roles from the per-row checkboxes. Blocks demoting the LAST
 * active admin away from `admin` (which would otherwise orphan user-admin).
 */
export async function setUserRoles(id: string, fd: FormData) {
  await requireAdmin();

  const target = await db.user.findUnique({ where: { id }, select: { roles: true, active: true } });
  if (!target) throw new Error("User not found");

  const roles = readRoles(fd);
  const wasAdmin = isAdmin(parseRoles(target.roles)) && target.active;
  const stillAdmin = isAdmin(roles);
  // If this active admin is losing admin, make sure another active admin remains.
  if (wasAdmin && !stillAdmin && (await countActiveAdmins(id)) === 0) {
    throw new Error("Cannot remove admin from the last active admin");
  }

  await db.user.update({ where: { id }, data: { roles } });
  revalidatePath("/settings/users");
}

/**
 * Deactivate a user (offboarding) — they can no longer log in. Blocks
 * deactivating the LAST active admin.
 */
export async function deactivateUser(id: string) {
  await requireAdmin();

  const target = await db.user.findUnique({ where: { id }, select: { roles: true, active: true } });
  if (!target) throw new Error("User not found");

  if (isAdmin(parseRoles(target.roles)) && target.active && (await countActiveAdmins(id)) === 0) {
    throw new Error("Cannot deactivate the last active admin");
  }

  await db.user.update({ where: { id }, data: { active: false } });
  revalidatePath("/settings/users");
}

/** Reactivate a previously deactivated user (re-onboarding). */
export async function reactivateUser(id: string) {
  await requireAdmin();
  await db.user.update({ where: { id }, data: { active: true } });
  revalidatePath("/settings/users");
}

/**
 * Admin resets someone's password (bcrypt). An empty value is rejected so we
 * never silently set a blank password — to disable login use deactivate instead.
 */
export async function setUserPassword(id: string, fd: FormData) {
  await requireAdmin();

  const rawPassword = String(fd.get("password") ?? "");
  if (!rawPassword) throw new Error("Password cannot be empty");

  const target = await db.user.findUnique({ where: { id }, select: { id: true } });
  if (!target) throw new Error("User not found");

  const password = await bcrypt.hash(rawPassword, BCRYPT_ROUNDS);
  await db.user.update({ where: { id }, data: { password } });
  revalidatePath("/settings/users");
}

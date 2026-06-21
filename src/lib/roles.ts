/**
 * Role vocabulary + pure helpers, shared by `auth.ts` (session wiring) and
 * `authz.ts` (server-action guards). No server-only / DB imports live here so
 * it is safe to pull into the auth layer.
 *
 * Canonical roles:
 *  - admin   → full access: user-admin, channels/settings, destructive deletes.
 *  - editor  → the everyday comms work (create/edit/triage/status/attach/etc.).
 *  - viewer  → read-only.
 *
 * Legacy role strings (triager/designer/publisher/approver) predate this model
 * and are kept harmless: anyone carrying one is treated as editor-capable so a
 * mid-turnover staff list keeps working without a data migration.
 */

/** Roles that count as "can do the everyday comms work" (editor or better). */
const EDITORISH = new Set(["admin", "editor", "triager", "designer", "publisher"]);

/** Coerce the Json `roles` column (string[] | unknown) into a clean string[]. */
export function parseRoles(roles: unknown): string[] {
  if (Array.isArray(roles)) return roles.filter((r): r is string => typeof r === "string");
  return [];
}

/** True if any of the user's roles is `admin`. */
export function isAdmin(roles: string[]): boolean {
  return roles.includes("admin");
}

/** True if the user can do comms work (admin, editor, or a legacy editor role). */
export function isEditor(roles: string[]): boolean {
  return roles.some((r) => EDITORISH.has(r));
}

/**
 * True if the user holds one of `required` — with admin as a superuser that
 * always passes. Used by `requireRole(...)`.
 */
export function hasRole(roles: string[], required: string[]): boolean {
  if (roles.includes("admin")) return true;
  return required.some((r) => roles.includes(r));
}

import type { Prisma } from "@prisma/client";

/**
 * "All ministries equal" model: an event's involved ministries live in the
 * implicit many-to-many `Request.ministries` (the source of truth). The legacy
 * single `Request.ministryId` is KEPT as a denormalized "primary" pointer,
 * always set = the first of the selected ministries, so any code path still
 * reading the single relation shows a sensible dot.
 *
 * These helpers keep the two in sync from a single `ministryIds: string[]`
 * (de-duplicated, order preserved). Use them in every write path that sets an
 * event's ministries (create, edit, recurring, quick-items, …) so the invariant
 * `ministryId === ministries[0] ?? null` holds everywhere.
 */

/** De-duplicate while preserving first-seen order. */
function uniq(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => id.length > 0))];
}

/** Read repeated `ministryId` checkbox/multi-select values from a form. */
export function ministryIdsFromForm(fd: FormData, key = "ministryId"): string[] {
  return uniq(fd.getAll(key).map((v) => String(v)));
}

/**
 * Prisma `create`-data fragment for a brand-new Request's ministries: connect
 * the m-n set and set the denormalized primary pointer to the first id.
 *
 * Typed against the *Unchecked* create input, which exposes the scalar
 * `ministryId` alongside the `ministries` relation (the checked input only has
 * the `ministry` relation). Spreadable into any `request.create({ data })`.
 */
export function ministryCreateData(
  ministryIds: string[]
): Pick<Prisma.RequestUncheckedCreateInput, "ministryId" | "ministries"> {
  const ids = uniq(ministryIds);
  return {
    ministryId: ids[0] ?? null,
    ministries: ids.length ? { connect: ids.map((id) => ({ id })) } : undefined,
  };
}

/**
 * Prisma `update`-data fragment for an existing Request's ministries: `set` the
 * m-n to exactly this list (replacing whatever was there) and re-sync the
 * denormalized primary pointer to the first id (or null when none).
 */
export function ministryUpdateData(
  ministryIds: string[]
): Pick<Prisma.RequestUncheckedUpdateInput, "ministryId" | "ministries"> {
  const ids = uniq(ministryIds);
  return {
    ministryId: ids[0] ?? null,
    ministries: { set: ids.map((id) => ({ id })) },
  };
}

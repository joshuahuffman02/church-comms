"use server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { revalidatePath } from "next/cache";

/**
 * Admin CRUD for `EventTagRule`s — the mapping from a Planning Center tag string
 * to app meaning (ministry + suggested tier + no-promo/mission-trip controls)
 * that auto-classifies a well-tagged event on import. All guarded by
 * `requireAdmin()` (settings-level). See `src/lib/tag-rules.ts` for how the
 * rules are applied and `src/app/settings/tag-rules/page.tsx` for the UI.
 */

/** Parse the shared rule fields from a form, normalizing empties → null. */
function ruleFieldsFromForm(fd: FormData): {
  ministryId: string | null;
  tierSuggestion: number | null;
  noPromo: boolean;
  missionTrip: boolean;
  suggestedTemplateId: string | null;
} {
  const ministryRaw = String(fd.get("ministryId") ?? "").trim();
  const ministryId = ministryRaw === "" ? null : ministryRaw;

  const tierRaw = String(fd.get("tier") ?? "").trim();
  const tierNum = Number(tierRaw);
  // Only 1|2|3 are valid suggestions; anything else (incl. "none"/"") → null.
  const tierSuggestion = tierNum === 1 || tierNum === 2 || tierNum === 3 ? tierNum : null;

  const templateRaw = String(fd.get("suggestedTemplateId") ?? "").trim();
  const suggestedTemplateId = templateRaw === "" ? null : templateRaw;

  return {
    ministryId,
    tierSuggestion,
    noPromo: fd.get("noPromo") === "on",
    missionTrip: fd.get("missionTrip") === "on",
    suggestedTemplateId,
  };
}

/**
 * Create a new tag rule from the add form. The `tag` is required, trimmed, and
 * unique — a duplicate (case-insensitive collision is handled by the classifier
 * at match time, but the column is unique on the exact string) throws.
 * New rules sort after the current max.
 */
export async function createTagRule(fd: FormData): Promise<void> {
  await requireAdmin();

  const tag = String(fd.get("tag") ?? "").trim();
  if (!tag) throw new Error("Tag is required");

  const max = await db.eventTagRule.aggregate({ _max: { sortOrder: true } });
  const sortOrder = (max._max.sortOrder ?? 0) + 1;

  await db.eventTagRule.create({
    data: { tag, sortOrder, ...ruleFieldsFromForm(fd) },
  });
  revalidatePath("/settings/tag-rules");
}

/**
 * Edit an existing rule's mapping. `id` is bound by the caller (the form binds
 * it via `updateTagRule.bind(null, id)`); the form carries the tag + mapping.
 */
export async function updateTagRule(id: string, fd: FormData): Promise<void> {
  await requireAdmin();

  const tag = String(fd.get("tag") ?? "").trim();
  if (!tag) throw new Error("Tag is required");

  await db.eventTagRule.update({
    where: { id },
    data: { tag, ...ruleFieldsFromForm(fd) },
  });
  revalidatePath("/settings/tag-rules");
}

/** Delete a tag rule. Auth-guarded. */
export async function deleteTagRule(id: string): Promise<void> {
  await requireAdmin();
  await db.eventTagRule.delete({ where: { id } });
  revalidatePath("/settings/tag-rules");
}

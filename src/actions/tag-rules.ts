"use server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { replanUpcomingPromotableRequests } from "@/lib/plan-service";
import { isSchedulePresetKey } from "@/lib/schedule-presets";
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
  schedulePreset: string | null;
} {
  const ministryRaw = String(fd.get("ministryId") ?? "").trim();
  const ministryId = ministryRaw === "" ? null : ministryRaw;

  const tierRaw = String(fd.get("tier") ?? "").trim();
  const tierNum = Number(tierRaw);
  // Only 1|2|3 are valid suggestions; anything else (incl. "none"/"") → null.
  const tierSuggestion = tierNum === 1 || tierNum === 2 || tierNum === 3 ? tierNum : null;

  const templateRaw = String(fd.get("suggestedTemplateId") ?? "").trim();
  const suggestedTemplateId = templateRaw === "" ? null : templateRaw;
  const schedulePresetRaw = String(fd.get("schedulePreset") ?? "").trim();
  const schedulePreset = isSchedulePresetKey(schedulePresetRaw) ? schedulePresetRaw : null;

  return {
    ministryId,
    tierSuggestion,
    noPromo: fd.get("noPromo") === "on",
    missionTrip: fd.get("missionTrip") === "on",
    suggestedTemplateId,
    schedulePreset,
  };
}

function revalidateTagRuleSurfaces() {
  revalidatePath("/settings/tag-rules");
  revalidatePath("/requests");
  revalidatePath("/pipeline");
  revalidatePath("/this-week");
  revalidatePath("/run-sheet");
  revalidatePath("/calendar");
  revalidatePath("/outputs");
  revalidatePath("/guardrails");
  revalidatePath("/assign");
}

async function replanIfSchedulePresetChanged(changed: boolean) {
  if (changed) await replanUpcomingPromotableRequests();
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
  const fields = ruleFieldsFromForm(fd);

  await db.eventTagRule.create({
    data: { tag, sortOrder, ...fields },
  });
  await replanIfSchedulePresetChanged(fields.schedulePreset !== null);
  revalidateTagRuleSurfaces();
}

/**
 * Edit an existing rule's mapping. `id` is bound by the caller (the form binds
 * it via `updateTagRule.bind(null, id)`); the form carries the tag + mapping.
 */
export async function updateTagRule(id: string, fd: FormData): Promise<void> {
  await requireAdmin();

  const tag = String(fd.get("tag") ?? "").trim();
  if (!tag) throw new Error("Tag is required");
  const before = await db.eventTagRule.findUnique({
    where: { id },
    select: { tag: true, schedulePreset: true },
  });
  const fields = ruleFieldsFromForm(fd);

  await db.eventTagRule.update({
    where: { id },
    data: { tag, ...fields },
  });
  await replanIfSchedulePresetChanged(
    (before?.schedulePreset != null || fields.schedulePreset != null) &&
      (before?.tag !== tag || before?.schedulePreset !== fields.schedulePreset),
  );
  revalidateTagRuleSurfaces();
}

/** Delete a tag rule. Auth-guarded. */
export async function deleteTagRule(id: string): Promise<void> {
  await requireAdmin();
  const before = await db.eventTagRule.findUnique({
    where: { id },
    select: { schedulePreset: true },
  });
  await db.eventTagRule.delete({ where: { id } });
  await replanIfSchedulePresetChanged(before?.schedulePreset != null);
  revalidateTagRuleSurfaces();
}

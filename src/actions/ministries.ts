"use server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { revalidatePath } from "next/cache";

/**
 * Ministry management (admin-only). Ministries drive the colored dots across the
 * app and the multi-select on events. Because an event's ministry set is the
 * source of truth, "deleting" a ministry that's in use would orphan those events
 * — so a referenced ministry is DEACTIVATED instead (hidden from new pickers but
 * still shown on events that already use it). Only an unreferenced ministry is
 * actually deleted.
 */

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Read a trimmed string field, or "" when blank. */
function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

/** Validate a hex color, falling back to the soft default. */
function color(fd: FormData, fallback = "#c7b9ff"): string {
  const c = str(fd, "color");
  return HEX_RE.test(c) ? c : fallback;
}

/** Refresh everywhere a ministry name/color/dot is shown. */
function revalidateMinistries() {
  revalidatePath("/settings/ministries");
  revalidatePath("/requests");
  revalidatePath("/pipeline");
  revalidatePath("/run-sheet");
  revalidatePath("/outputs");
}

/** Create a ministry. Name required; color validated; appended after max sortOrder. */
export async function createMinistry(fd: FormData): Promise<void> {
  await requireAdmin();
  const name = str(fd, "name");
  if (!name) return;

  const max = await db.ministry.aggregate({ _max: { sortOrder: true } });
  await db.ministry.create({
    data: {
      name,
      color: color(fd),
      active: fd.get("active") == null ? true : fd.get("active") === "on",
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
  });
  revalidateMinistries();
}

/** Edit a ministry's name / color / active / sortOrder. */
export async function updateMinistry(id: string, fd: FormData): Promise<void> {
  await requireAdmin();
  const existing = await db.ministry.findUnique({ where: { id } });
  if (!existing) throw new Error("Ministry not found");

  const name = str(fd, "name");
  const sortRaw = str(fd, "sortOrder");
  const sortOrder = sortRaw && Number.isInteger(Number(sortRaw)) ? Number(sortRaw) : existing.sortOrder;

  await db.ministry.update({
    where: { id },
    data: {
      name: name || existing.name,
      color: color(fd, existing.color),
      // The form posts `active` as a checkbox — present = on.
      active: fd.get("active") === "on",
      sortOrder,
    },
  });
  revalidateMinistries();
}

/**
 * Delete a ministry only when nothing references it (neither the m-n event set,
 * the legacy single pointer, nor a recurring series). Otherwise DEACTIVATE it,
 * so events keep their dot but it disappears from new pickers. Returns nothing;
 * the page reflects the new state.
 */
export async function deleteMinistry(id: string): Promise<void> {
  await requireAdmin();

  const [eventsCount, legacyCount, seriesCount] = await Promise.all([
    db.request.count({ where: { ministries: { some: { id } } } }),
    db.request.count({ where: { ministryId: id } }),
    db.recurringSeries.count({ where: { ministryId: id } }),
  ]);

  if (eventsCount + legacyCount + seriesCount > 0) {
    // In use — deactivate rather than orphan events.
    await db.ministry.update({ where: { id }, data: { active: false } });
  } else {
    await db.ministry.delete({ where: { id } });
  }
  revalidateMinistries();
}

/** Quick activate / deactivate toggle (admin). */
export async function setMinistryActive(id: string, active: boolean): Promise<void> {
  await requireAdmin();
  await db.ministry.update({ where: { id }, data: { active } });
  revalidateMinistries();
}

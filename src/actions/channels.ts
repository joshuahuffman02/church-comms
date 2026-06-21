"use server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { revalidatePath } from "next/cache";

const CHANNEL_TYPES = new Set(["windowed", "dated_instance", "one_shot"]);

/** lowercase + non-alphanumerics → "_", trimmed of leading/trailing "_". */
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "channel"
  );
}

/** Return a key that isn't already taken, appending _2, _3, … as needed. */
async function uniqueKey(base: string): Promise<string> {
  let key = base;
  let n = 2;
  while (await db.channel.findUnique({ where: { key }, select: { id: true } })) {
    key = `${base}_${n}`;
    n += 1;
  }
  return key;
}

/**
 * Edit an existing channel's timings + active flag. Auth-guarded.
 * (Labels in the UI: "Goes out" = offset, "Asset due" = lead.)
 *
 * `productionNotes` is the channel's free-text production reference (e.g.
 * banner dimensions + lessons learned). It is only written when the form
 * actually carries the field, so the timings form (which omits it) doesn't
 * clobber an existing note; an empty submission clears it to null.
 */
export async function updateChannel(fd: FormData) {
  await requireAdmin();

  const notesRaw = fd.get("productionNotes");
  const hasNotes = typeof notesRaw === "string";
  const productionNotes = hasNotes
    ? notesRaw.trim().slice(0, 4000) || null
    : undefined;

  // Weekly cap (windowed channels): blank clears it to null (uncapped); a
  // non-positive or non-numeric value also clears, so the field can never store
  // a nonsense cap. Only written when the form actually carries `cap`.
  const capRaw = fd.get("cap");
  const hasCap = typeof capRaw === "string";
  const capNum = hasCap ? Math.floor(Number(capRaw)) : NaN;
  const frequencyCap = hasCap
    ? capRaw.trim() === "" || !Number.isFinite(capNum) || capNum <= 0
      ? null
      : capNum
    : undefined;

  await db.channel.update({
    where: { id: String(fd.get("id")) },
    data: {
      defaultPublishOffsetDays: Number(fd.get("offset")),
      productionLeadDays: Number(fd.get("lead")),
      active: fd.get("active") === "on",
      ...(hasNotes ? { productionNotes } : {}),
      ...(hasCap ? { frequencyCap } : {}),
    },
  });
  revalidatePath("/settings/channels");
  revalidatePath("/outputs");
}

/**
 * Create a new output/channel from the add form. Auth-guarded.
 * - `key` is auto-slugged from the name and made unique.
 * - `tierEligibility` comes in as `tier` checkboxes (values 1/2/3) → number[].
 * - `cadence` weekdays come in as `weekday` checkboxes (0–6) → { weekdays }.
 *   Windowed channels default to [0] (Sunday) when none are picked.
 * - `sortOrder` is appended after the current max.
 */
export async function createChannel(fd: FormData) {
  await requireAdmin();

  const name = String(fd.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required");

  const typeRaw = String(fd.get("type") ?? "windowed");
  const type = CHANNEL_TYPES.has(typeRaw) ? typeRaw : "windowed";

  const tiers = fd
    .getAll("tier")
    .map((t) => Number(t))
    .filter((n) => n === 1 || n === 2 || n === 3);
  const tierEligibility = tiers.length ? tiers : [1, 2, 3];

  const weekdays = fd
    .getAll("weekday")
    .map((d) => Number(d))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  // Only windowed channels meaningfully use a weekly cadence; default to Sunday.
  const cadence =
    type === "windowed"
      ? { weekdays: weekdays.length ? weekdays : [0] }
      : weekdays.length
        ? { weekdays }
        : undefined;

  const capacityRaw = String(fd.get("capacity") ?? "").trim();
  const capacity = capacityRaw ? Number(capacityRaw) : null;

  const key = await uniqueKey(slugify(name));
  const max = await db.channel.aggregate({ _max: { sortOrder: true } });
  const sortOrder = (max._max.sortOrder ?? 0) + 1;

  await db.channel.create({
    data: {
      key,
      name,
      type,
      defaultPublishOffsetDays: Number(fd.get("offset") ?? 14),
      productionLeadDays: Number(fd.get("lead") ?? 7),
      capacity,
      cadence: cadence ?? undefined,
      tierEligibility,
      color: String(fd.get("color") || "#93c5fd"),
      sortOrder,
    },
  });

  revalidatePath("/settings/channels");
}

/**
 * Delete a channel AND everything scheduled on it. Auth-guarded.
 *
 * Deliverable + Touch reference channelId with no DB cascade, so we remove the
 * deliverables first (which cascades their touches) before deleting the channel.
 * This is intentional — removing a channel removes its scheduled items.
 */
export async function deleteChannel(id: string) {
  await requireAdmin();
  await db.deliverable.deleteMany({ where: { channelId: id } });
  await db.channel.delete({ where: { id } });
  revalidatePath("/settings/channels");
}

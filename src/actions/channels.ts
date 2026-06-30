"use server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { revalidatePath } from "next/cache";
import { parseChannelUpdate } from "@/lib/channel-form";

const CHANNEL_TYPES = new Set(["windowed", "dated_instance", "one_shot"]);

function revalidateChannelSurfaces() {
  revalidatePath("/settings/channels");
  revalidatePath("/outputs");
  revalidatePath("/this-week");
  revalidatePath("/run-sheet");
  revalidatePath("/calendar");
  revalidatePath("/guardrails");
  revalidatePath("/assign");
}

export interface ChannelActionState {
  ok: boolean;
  error?: string;
  savedAt?: number;
}

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
 * Edit an existing channel. Used via React `useActionState`, so the signature is
 * `(prevState, formData)` and it RETURNS a result the row can confirm / surface.
 * All field parsing lives in the pure `parseChannelUpdate` (unit-tested); fields
 * whose controls aren't rendered for the channel's type are omitted, never
 * clobbered. Auth-guarded.
 */
export async function updateChannel(
  _prev: ChannelActionState,
  fd: FormData,
): Promise<ChannelActionState> {
  await requireAdmin();

  const id = String(fd.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing channel id." };

  const parsed = parseChannelUpdate(fd);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  try {
    await db.channel.update({ where: { id }, data: parsed.data });
  } catch {
    return { ok: false, error: "Couldn’t save — that channel may no longer exist." };
  }

  revalidateChannelSurfaces();
  return { ok: true, savedAt: Date.now() };
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

  revalidateChannelSurfaces();
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
  revalidateChannelSurfaces();
}

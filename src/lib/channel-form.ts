import type { Prisma } from "@prisma/client";

export const CHANNEL_TYPES = ["windowed", "dated_instance", "one_shot", "single_weekday"] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

function isChannelType(v: string): v is ChannelType {
  return (CHANNEL_TYPES as readonly string[]).includes(v);
}

/** Non-negative integer; blank/NaN -> 0. */
function nonNegInt(v: FormDataEntryValue | null): number {
  const n = Math.floor(Number(typeof v === "string" ? v.trim() : v));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Optional non-negative int from a present field; blank/invalid -> null. */
function optNonNegInt(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export type ParseResult =
  | { ok: true; data: Prisma.ChannelUpdateInput }
  | { ok: false; error: string };

/**
 * FormData -> a Prisma Channel update. Pure + DB-free so it is unit-testable.
 * Fields are written CONDITIONALLY: a field whose form control isn't rendered for
 * this channel type (cadence for one_shot, cap unless windowed, lockLead unless
 * dated_instance) is omitted so a partial form never clobbers a stored value.
 */
export function parseChannelUpdate(fd: FormData): ParseResult {
  const typeRaw = String(fd.get("type") ?? "");
  if (!isChannelType(typeRaw)) return { ok: false, error: "Unknown channel type." };
  const type = typeRaw;

  const name = String(fd.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Name can’t be blank." };

  const data: Prisma.ChannelUpdateInput = {
    name,
    type,
    defaultPublishOffsetDays: nonNegInt(fd.get("offset")),
    productionLeadDays: nonNegInt(fd.get("lead")),
    active: fd.get("active") === "on",
  };

  const color = String(fd.get("color") ?? "").trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(color)) data.color = color;

  const tiers = fd.getAll("tier").map(Number).filter((n) => n === 1 || n === 2 || n === 3);
  data.tierEligibility = tiers.length ? tiers : [1, 2, 3];

  if (type !== "one_shot") {
    const weekdays = fd
      .getAll("weekday")
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
    data.cadence = { weekdays: weekdays.length ? weekdays : [0] };
  }

  const capRaw = fd.get("cap");
  if (typeof capRaw === "string") {
    const n = optNonNegInt(capRaw);
    data.frequencyCap = n && n > 0 ? n : null;
  }

  const capacityRaw = fd.get("capacity");
  if (typeof capacityRaw === "string") data.capacity = optNonNegInt(capacityRaw);

  const lockRaw = fd.get("lockLead");
  if (typeof lockRaw === "string") data.lockLeadDays = optNonNegInt(lockRaw);

  const notesRaw = fd.get("productionNotes");
  if (typeof notesRaw === "string") data.productionNotes = notesRaw.trim().slice(0, 4000) || null;

  return { ok: true, data };
}

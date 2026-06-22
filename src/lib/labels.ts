/**
 * User-facing display strings. Machine keys, enums and codes stay in the DB and
 * the engine; this is the one place we turn them into plain, church-friendly
 * words. Import from here instead of re-deriving labels in components so the
 * vocabulary stays consistent everywhere.
 */

/** Audience tiers shown as plain words, not a bare number. 1 = widest reach. */
export const TIER_LABEL: Record<number, string> = {
  1: "Whole church",
  2: "Ministry",
  3: "Small group",
};

/** Plain audience word for a tier (falls back to "Tier N" for unknown values). */
export function tierLabel(tier: number): string {
  return TIER_LABEL[tier] ?? `Tier ${tier}`;
}

/** Tooltip that keeps the underlying tier number discoverable. */
export function tierTitle(tier: number): string {
  return TIER_LABEL[tier] ? `Tier ${tier} · ${TIER_LABEL[tier].toLowerCase()}` : `Tier ${tier}`;
}

/** "announcement_video" -> "Announcement Video" for friendly display. */
export function prettyChannel(key: string): string {
  return titleCase(key);
}

/** Generic slug humanizer: "board_approval" / "board-approval" -> "Board Approval". */
export function titleCase(slug: string): string {
  return slug
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Friendly label for where an admin task came from; null = don't show a chip. */
export function taskSourceLabel(source: string | null | undefined): string | null {
  if (!source || source === "manual") return null;
  if (source === "playbook") return "Checklist";
  return titleCase(source);
}

/** "2026-06-07" -> "Sun, Jun 7" (parsed as a local date, no UTC shift). */
export function prettyDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/**
 * Promotion phase (engine `Phase`) -> plain words describing what that week's
 * post is doing. Shown on the per-channel output rows instead of "day_of" etc.
 */
export const PHASE_LABEL: Record<string, string> = {
  awareness: "Save the date",
  register: "Sign up",
  reminder: "Reminder",
  day_of: "Day of",
  follow_up: "Follow-up",
};

/** Friendly phase label; null when there's nothing to show. */
export function phaseLabel(phase: string | null | undefined): string | null {
  if (!phase) return null;
  return PHASE_LABEL[phase] ?? titleCase(phase);
}

/** Planning Center approval codes -> human words. */
export const PCO_STATUS_LABEL: Record<string, string> = {
  A: "Approved in Planning Center",
  P: "Pending in Planning Center",
  D: "Declined in Planning Center",
};

/** Friendly label for a PCO approval code; null when there's nothing to show. */
export function pcoStatusLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return PCO_STATUS_LABEL[code] ?? "In Planning Center";
}

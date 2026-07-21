/**
 * Tag-driven auto-classification (pure logic).
 *
 * A well-tagged Planning Center event arrives "already classified": its PCO tag
 * labels (category / ministry / campus) map — via admin-editable
 * `EventTagRule`s — to the app's ministries (multi-ministry), a *suggested*
 * audience tier, routing controls (Room-Only → don't promote), playbook hints,
 * and optional schedule presets. This module is the single source of truth for
 * that mapping; it is pure (no DB, no I/O) so it's trivially testable and
 * reused by both the PCO import path and the one-time backfill.
 *
 * See `src/actions/pco.ts` (apply on CREATE) and `prisma/seed.ts` (default rule
 * vocabulary). The matching is case-insensitive + trimmed so "All Church",
 * "all church " and "ALL CHURCH" all hit the same rule.
 */
import { isSchedulePresetKey, type SchedulePresetKey } from "@/lib/schedule-presets";

/** One admin-defined mapping from a single PCO tag string to app meaning. */
export type TagRule = {
  /** The PCO tag label this rule matches (case-insensitive, trimmed). */
  tag: string;
  /** Ministry to attach when matched, or null for tier/control-only rules. */
  ministryId: string | null;
  /** Suggested audience tier (1 broadest … 3 narrowest), or null. */
  tierSuggestion: number | null;
  /** Room-Only style rule: matched → keep the event out of the comms queue. */
  noPromo: boolean;
  /** Legacy Mission-Trip flag (kept for back-compat; UI hint uses the link). */
  missionTrip: boolean;
  /** Event Playbook this tag suggests applying, or null. Generic replacement
   * for the mission-trip flag: any tag can suggest any playbook. */
  suggestedTemplateId: string | null;
  /** Optional schedule preset that changes where matching events are placed. */
  schedulePreset?: string | null;
};

/** The classification an event's tags resolve to once rules are applied. */
export type Classification = {
  /** Distinct ministry ids from matched rules (nulls dropped). Order-stable. */
  ministryIds: string[];
  /** Broadest (lowest) tierSuggestion among matched rules, or null if none. */
  tier: number | null;
  /** True when ANY matched rule is no-promo (Room Only). */
  noPromo: boolean;
  /** True when ANY matched rule is a mission trip (legacy flag). */
  missionTrip: boolean;
  /** Distinct playbook ids suggested by matched rules (first-seen order, nulls
   * dropped). The event detail surfaces these as "apply this playbook?" hints. */
  suggestedTemplateIds: string[];
  /** Distinct schedule presets from matched rules (first-seen order). */
  schedulePresets: SchedulePresetKey[];
};

/** Normalize a tag/key for matching: trimmed + lower-cased. */
function norm(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Classify an event from its PCO tags against the configured rules.
 *
 * Matching is case-insensitive and whitespace-trimmed on both sides. From the
 * set of matched rules we derive:
 *  - `ministryIds`: the distinct non-null ministry ids (first-seen order),
 *  - `tier`: the BROADEST audience = the minimum tierSuggestion (a Whole-Church
 *    rule's tier 1 beats a Kids rule's tier 2, since the wider audience wins),
 *  - `noPromo` / `missionTrip`: an OR across matched rules.
 *  - `suggestedTemplateIds`: distinct playbook ids the matched rules point at
 *    (first-seen order), so the event can offer the right checklist.
 *
 * No tags / no matches → empty ministries + null tier + flags false + no
 * suggestions, so the caller simply leaves the event as the un-classified
 * default.
 */
export function classifyByTags(
  tags: string[],
  rules: TagRule[],
): Classification {
  // Index rules by normalized tag for O(tags) matching. Last rule wins on a
  // duplicate tag, which mirrors the DB's `tag @unique` (there's only one).
  const byTag = new Map<string, TagRule>();
  for (const rule of rules) byTag.set(norm(rule.tag), rule);

  const ministryIds: string[] = [];
  const seen = new Set<string>();
  const suggestedTemplateIds: string[] = [];
  const seenTemplates = new Set<string>();
  const schedulePresets: SchedulePresetKey[] = [];
  const seenSchedulePresets = new Set<SchedulePresetKey>();
  let tier: number | null = null;
  let noPromo = false;
  let missionTrip = false;

  for (const raw of tags) {
    const rule = byTag.get(norm(raw));
    if (!rule) continue;

    if (rule.ministryId && !seen.has(rule.ministryId)) {
      seen.add(rule.ministryId);
      ministryIds.push(rule.ministryId);
    }
    if (rule.tierSuggestion != null) {
      tier = tier == null ? rule.tierSuggestion : Math.min(tier, rule.tierSuggestion);
    }
    if (rule.noPromo) noPromo = true;
    if (rule.missionTrip) missionTrip = true;
    if (rule.suggestedTemplateId && !seenTemplates.has(rule.suggestedTemplateId)) {
      seenTemplates.add(rule.suggestedTemplateId);
      suggestedTemplateIds.push(rule.suggestedTemplateId);
    }
    if (
      isSchedulePresetKey(rule.schedulePreset) &&
      !seenSchedulePresets.has(rule.schedulePreset)
    ) {
      seenSchedulePresets.add(rule.schedulePreset);
      schedulePresets.push(rule.schedulePreset);
    }
  }

  return { ministryIds, tier, noPromo, missionTrip, suggestedTemplateIds, schedulePresets };
}

export function schedulePresetsForTags(
  tags: string[],
  rules: Pick<TagRule, "tag" | "schedulePreset">[],
): SchedulePresetKey[] {
  const byTag = new Map<string, Pick<TagRule, "tag" | "schedulePreset">>();
  for (const rule of rules) byTag.set(norm(rule.tag), rule);

  const out: SchedulePresetKey[] = [];
  const seen = new Set<SchedulePresetKey>();
  for (const raw of tags) {
    const rule = byTag.get(norm(raw));
    if (!rule || !isSchedulePresetKey(rule.schedulePreset) || seen.has(rule.schedulePreset)) continue;
    seen.add(rule.schedulePreset);
    out.push(rule.schedulePreset);
  }
  return out;
}

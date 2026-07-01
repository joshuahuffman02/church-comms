// Default EventTagRule vocabulary + an idempotent upsert helper, in a module
// with NO top-level side effects so it can be imported by the full seed
// (`prisma/seed.ts`), a standalone live-insert, and the one-time backfill
// without triggering a re-seed.
//
// Each rule maps ONE Planning Center tag string to app meaning. Ministry is
// resolved at upsert time by trying a list of candidate names against the
// ministries that actually exist in the DB (so the same data works for the
// seed's 5 demo ministries AND the live DB's fuller set). A tag with no
// matching ministry simply gets ministryId = null — its tier/controls still
// apply. See `src/lib/tag-rules.ts` for how rules are matched/applied.
import type { PrismaClient } from "@prisma/client";

const MONTHLY_FIRST_SUNDAY_FULL_RUN = "monthly_first_sunday_full_run";

/** A default rule definition. `ministryNames` are candidates tried in order. */
export type TagRuleSeed = {
  tag: string;
  /** Candidate ministry names (first match in the DB wins); [] = no ministry. */
  ministryNames: string[];
  tierSuggestion: number | null;
  noPromo?: boolean;
  missionTrip?: boolean;
  /** Name of an Event Playbook this tag suggests; resolved to its id at upsert
   * time (no-op if that playbook isn't seeded). Generic tag→playbook link. */
  suggestedPlaybookName?: string;
  /** Optional schedule preset key applied by the planner for matching tags. */
  schedulePreset?: string;
};

// The default tag vocabulary models a common Planning Center setup. Adapt these
// rules in Settings → Tag rules to match the tags used by your church. Three PCO
// groups feed classification:
//   • Ministry   → app Ministry + a default tier (audience breadth).
//   • Event Type → promote vs. room-only (Wedding/Funeral/Meeting = no-promo).
//   • Comms      → a small new group for overrides + playbook triggers.
// `ministryNames` lists candidate app-ministry names (the live DB uses "Kids",
// "Seniors", "Men", "Women"; PCO labels them "Children's", "Senior Lights",
// "Men's Ministry", "Women's Ministry") — first match wins, null if none exists.
//
// Tier model: Tier 1 = broadest (All Church) fills scarce slots first; the
// specific-audience ministries are Tier 2 backfill; Small Group is Tier 3.
// (PCO's Admin + People groups are staff scheduling and are intentionally absent
// here, so the app ignores them.)
//
// sortOrder follows array order so the settings list reads top-to-bottom.
export const DEFAULT_TAG_RULES: TagRuleSeed[] = [
  // --- Ministry group → app Ministry + default tier ------------------------
  { tag: "All Church", ministryNames: ["All-Church", "All Church"], tierSuggestion: 1 },
  { tag: "Children's", ministryNames: ["Kids", "Children's", "Children"], tierSuggestion: 2 },
  { tag: "Rise", ministryNames: ["Rise"], tierSuggestion: 2 }, // 5th–6th grade
  { tag: "Thrive", ministryNames: ["Thrive"], tierSuggestion: 2 }, // 7th–12th grade
  { tag: "College", ministryNames: ["College", "H2O"], tierSuggestion: 2 },
  { tag: "Young Adults", ministryNames: ["Young Adults"], tierSuggestion: 2 },
  { tag: "Young Families", ministryNames: ["Young Families"], tierSuggestion: 2 },
  { tag: "Women's Ministry", ministryNames: ["Women", "Women's"], tierSuggestion: 2 },
  { tag: "Men's Ministry", ministryNames: ["Men", "Men's"], tierSuggestion: 2 },
  { tag: "Senior Lights", ministryNames: ["Seniors", "Senior Lights", "Senior"], tierSuggestion: 2 },
  // Staff events are internal — keep them out of the comms queue entirely.
  { tag: "Staff", ministryNames: [], tierSuggestion: null, noPromo: true },

  // --- Event Type group → promote vs. room-only ----------------------------
  // Service/Class carry no tier of their own — the Ministry tag drives tier
  // (an All-Church Service → tier 1; a Kids Class → tier 2).
  { tag: "Service", ministryNames: [], tierSuggestion: null },
  { tag: "Class", ministryNames: [], tierSuggestion: null },
  { tag: "Small Group", ministryNames: [], tierSuggestion: 3 },
  { tag: "Funeral", ministryNames: [], tierSuggestion: null, noPromo: true },
  { tag: "Wedding", ministryNames: [], tierSuggestion: null, noPromo: true },
  { tag: "Meeting", ministryNames: [], tierSuggestion: null, noPromo: true },
  // Catch-alls for the many real events that fit none of the gathering-format
  // types above (Red Cross Blood Drive, Camp Awesome, drives, festivals,
  // conferences, milestones). Promo-eligible; tier driven by the Ministry tag.
  { tag: "Outreach", ministryNames: [], tierSuggestion: null },
  { tag: "Special Event", ministryNames: [], tierSuggestion: null },

  // --- Comms group (new) → overrides + playbook triggers -------------------
  // "Room Only" force-suppresses an otherwise promo-eligible event (e.g. a Class
  // they only want the room for). No "Promote" tag is needed: no-promo events
  // still import (just flagged), so promoting one is a one-click triage action.
  { tag: "Room Only", ministryNames: [], tierSuggestion: null, noPromo: true },
  {
    tag: "Mission Trip",
    ministryNames: ["Missions"],
    tierSuggestion: null, // rides on the All-Church tag for tier-1 reach
    missionTrip: true,
    suggestedPlaybookName: "Mission Trip",
  },
  {
    tag: "Missionary of the Month",
    ministryNames: ["Missions"],
    tierSuggestion: 1,
    schedulePreset: MONTHLY_FIRST_SUNDAY_FULL_RUN,
  },
  // A sermon series is NOT promoted across ad channels (noPromo) — its launch
  // instead offers the Sermon Series brand/asset checklist. The tag + playbook
  // IS the "event type"; no separate model needed.
  {
    tag: "Sermon Series",
    ministryNames: [],
    tierSuggestion: null,
    noPromo: true,
    suggestedPlaybookName: "Sermon Series",
  },
];

/**
 * Upsert the default tag rules into the DB, idempotent by `tag`. Resolves each
 * rule's ministry by trying its candidate names against the ministries that
 * exist (case-insensitive). Returns how many rules were ensured + how many got
 * a ministry vs. left null (so callers can report).
 */
export async function upsertDefaultTagRules(
  db: PrismaClient,
): Promise<{
  ensured: number;
  withMinistry: number;
  withoutMinistry: number;
  withPlaybook: number;
}> {
  const ministries = await db.ministry.findMany({ select: { id: true, name: true } });
  const byName = new Map(ministries.map((m) => [m.name.toLowerCase(), m.id]));
  const resolve = (names: string[]): string | null => {
    for (const n of names) {
      const id = byName.get(n.toLowerCase());
      if (id) return id;
    }
    return null;
  };

  // Resolve suggested-playbook names to ids (case-insensitive by template name).
  // A name with no seeded playbook simply yields null (the suggestion is a no-op
  // until that playbook exists).
  const templates = await db.eventTemplate.findMany({ select: { id: true, name: true } });
  const templateByName = new Map(templates.map((t) => [t.name.toLowerCase(), t.id]));
  const resolveTemplate = (name?: string): string | null =>
    name ? templateByName.get(name.toLowerCase()) ?? null : null;

  let withMinistry = 0;
  let withoutMinistry = 0;
  let withPlaybook = 0;
  for (let i = 0; i < DEFAULT_TAG_RULES.length; i++) {
    const r = DEFAULT_TAG_RULES[i];
    const ministryId = resolve(r.ministryNames);
    if (ministryId) withMinistry++;
    else withoutMinistry++;
    const suggestedTemplateId = resolveTemplate(r.suggestedPlaybookName);
    if (suggestedTemplateId) withPlaybook++;
    const data = {
      ministryId,
      tierSuggestion: r.tierSuggestion,
      noPromo: r.noPromo ?? false,
      missionTrip: r.missionTrip ?? false,
      suggestedTemplateId,
      schedulePreset: r.schedulePreset ?? null,
      sortOrder: i,
    };
    await db.eventTagRule.upsert({
      where: { tag: r.tag },
      update: data,
      create: { tag: r.tag, ...data },
    });
  }

  return {
    ensured: DEFAULT_TAG_RULES.length,
    withMinistry,
    withoutMinistry,
    withPlaybook,
  };
}

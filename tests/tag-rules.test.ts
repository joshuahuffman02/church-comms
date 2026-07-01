import { describe, it, expect } from "vitest";
import { classifyByTags, type TagRule } from "../src/lib/tag-rules";

/** Compact rule builder so the test cases read like the tag vocabulary. */
const rule = (tag: string, over: Partial<TagRule> = {}): TagRule => ({
  tag,
  ministryId: null,
  tierSuggestion: null,
  noPromo: false,
  missionTrip: false,
  suggestedTemplateId: null,
  schedulePreset: null,
  ...over,
});

// A small stand-in vocabulary mirroring the seeded rules.
const RULES: TagRule[] = [
  rule("Whole-Church", { ministryId: "m-all", tierSuggestion: 1 }),
  rule("All Church", { ministryId: "m-all", tierSuggestion: 1 }),
  rule("Kids", { ministryId: "m-kids", tierSuggestion: 2 }),
  rule("Students", { ministryId: "m-youth", tierSuggestion: 2 }),
  rule("Small Group", { tierSuggestion: 3 }),
  rule("Room Only", { noPromo: true }),
  rule("Mission Trip", { missionTrip: true, suggestedTemplateId: "tmpl-mission" }),
  rule("Missionary of the Month", { schedulePreset: "monthly_first_sunday_full_run" }),
  rule("Missions", { ministryId: "m-missions" }),
  rule("Sermon Series", { noPromo: true, suggestedTemplateId: "tmpl-series" }),
];

describe("classifyByTags", () => {
  it("returns both ministries and the broadest (lowest) tier for Whole-Church + Kids", () => {
    const out = classifyByTags(["Whole-Church", "Kids"], RULES);
    expect(out.ministryIds).toEqual(["m-all", "m-kids"]);
    expect(out.tier).toBe(1); // broadest of {1,2}
    expect(out.noPromo).toBe(false);
    expect(out.missionTrip).toBe(false);
    expect(out.suggestedTemplateIds).toEqual([]);
    expect(out.schedulePresets).toEqual([]);
  });

  it("sets noPromo true when a Room-Only tag is present", () => {
    const out = classifyByTags(["Kids", "Room Only"], RULES);
    expect(out.noPromo).toBe(true);
    // The Kids ministry + tier still resolve alongside the control tag.
    expect(out.ministryIds).toEqual(["m-kids"]);
    expect(out.tier).toBe(2);
  });

  it("sets missionTrip true when a Mission Trip tag is present", () => {
    const out = classifyByTags(["Missions", "Mission Trip"], RULES);
    expect(out.missionTrip).toBe(true);
    expect(out.ministryIds).toEqual(["m-missions"]);
    // Missions ministry rule carries no tier → null.
    expect(out.tier).toBeNull();
  });

  it("returns empty/null when no tags match", () => {
    const out = classifyByTags(["Nonexistent", "Unknown"], RULES);
    expect(out.ministryIds).toEqual([]);
    expect(out.tier).toBeNull();
    expect(out.noPromo).toBe(false);
    expect(out.missionTrip).toBe(false);
    expect(out.suggestedTemplateIds).toEqual([]);
    expect(out.schedulePresets).toEqual([]);
  });

  it("returns empty/null for an empty tag list", () => {
    const out = classifyByTags([], RULES);
    expect(out).toEqual({
      ministryIds: [],
      tier: null,
      noPromo: false,
      missionTrip: false,
      suggestedTemplateIds: [],
      schedulePresets: [],
    });
  });

  it("surfaces the suggested playbook id for a tag that points at one", () => {
    // "Sermon Series" is a no-promo tag that suggests its own playbook.
    const out = classifyByTags(["Sermon Series"], RULES);
    expect(out.noPromo).toBe(true);
    expect(out.suggestedTemplateIds).toEqual(["tmpl-series"]);
  });

  it("de-duplicates and orders suggested playbook ids across matched tags", () => {
    // Both the Mission Trip and Sermon Series tags suggest a (distinct) playbook;
    // a repeated suggestion is collapsed and first-seen order is preserved.
    const out = classifyByTags(
      ["Mission Trip", "Sermon Series", "Mission Trip"],
      RULES,
    );
    expect(out.suggestedTemplateIds).toEqual(["tmpl-mission", "tmpl-series"]);
    expect(out.missionTrip).toBe(true);
  });

  it("surfaces and de-duplicates schedule presets for matching tags", () => {
    const out = classifyByTags(
      ["Missionary of the Month", "Missionary of the Month"],
      RULES,
    );

    expect(out.schedulePresets).toEqual(["monthly_first_sunday_full_run"]);
  });

  it("matches case-insensitively and trims whitespace", () => {
    const out = classifyByTags(["  all church ", "KIDS"], RULES);
    expect(out.ministryIds).toEqual(["m-all", "m-kids"]);
    expect(out.tier).toBe(1);
  });

  it("de-duplicates ministry ids across tags that map to the same ministry", () => {
    // "Whole-Church" and "All Church" both map to m-all.
    const out = classifyByTags(["Whole-Church", "All Church"], RULES);
    expect(out.ministryIds).toEqual(["m-all"]);
    expect(out.tier).toBe(1);
  });

  it("takes the broadest tier when a narrower and broader tag both match", () => {
    const out = classifyByTags(["Small Group", "Whole-Church"], RULES);
    expect(out.tier).toBe(1); // min(3, 1)
  });

  it("skips rules with a null ministryId but still applies their tier/controls", () => {
    const out = classifyByTags(["Small Group", "Room Only"], RULES);
    expect(out.ministryIds).toEqual([]);
    expect(out.tier).toBe(3);
    expect(out.noPromo).toBe(true);
  });
});

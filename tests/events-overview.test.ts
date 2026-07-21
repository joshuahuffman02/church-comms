import { describe, expect, it } from "vitest";
import {
  buildEventsFocus,
  eventLocalDateKey,
  groupExactEventDuplicates,
  groupRepeatedEventTitles,
  normalizeEventTitle,
} from "@/lib/events-overview";

type Row = { id: string; title: string; status: string; eventStartMs: number };
const day = (offset: number) => new Date(2026, 6, 21 + offset).getTime();
const row = (id: string, title: string, offset: number, status = "submitted"): Row => ({
  id,
  title,
  status,
  eventStartMs: day(offset),
});

describe("events overview", () => {
  it("normalizes punctuation and builds stable local date keys", () => {
    expect(normalizeEventTitle("  Randy & Margie: Visit! ")).toBe("randy margie visit");
    expect(eventLocalDateKey(new Date(2026, 6, 9, 18, 30).getTime())).toBe("2026-07-09");
  });

  it("groups only exact normalized-title and same-day duplicates", () => {
    const duplicates = groupExactEventDuplicates([
      row("a", "Prayerwerks", 0),
      row("b", "Prayerwerks!", 0),
      row("c", "Prayerwerks", 7),
      row("d", "Morning Prayer", 0),
    ]);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].rows.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("summarizes recurring title patterns and counts overlapping dates", () => {
    const repeated = groupRepeatedEventTitles([
      row("a", "Young Adults", 0),
      row("b", "Young Adults", 0),
      row("c", "Young Adults", 7),
      row("d", "One-off", 2),
    ]);
    expect(repeated).toHaveLength(1);
    expect(repeated[0]).toMatchObject({ title: "Young Adults", duplicateDateCount: 1 });
    expect(repeated[0].rows).toHaveLength(3);
  });

  it("stops treating occurrences as imported cleanup once a series manages them", () => {
    const repeated = groupRepeatedEventTitles([
      { ...row("a", "Morning Prayer", 0), seriesId: "series-1" },
      { ...row("b", "Morning Prayer", 7), seriesId: "series-1" },
      { ...row("c", "Morning Prayer", 14), seriesId: "series-1" },
    ]);
    expect(repeated).toEqual([]);
  });

  it("keeps duplicates and routine repeats out of the short decision list", () => {
    const rows = [
      row("dup-1", "Prayerwerks", 0),
      row("dup-2", "Prayerwerks", 0),
      row("repeat-2", "Prayerwerks", 7),
      row("decision", "Senior Breakfast", 5),
      row("promoting", "Family Movie Night", 10, "approved"),
      row("later", "Fall Festival", 80, "approved"),
      row("cancelled", "Cancelled Event", 4, "cancelled"),
    ];

    const focus = buildEventsFocus(rows, new Date(2026, 6, 21));
    expect(focus.duplicateGroups).toHaveLength(1);
    expect(focus.repeatedGroups).toHaveLength(1);
    expect(focus.needsDecision.map((item) => item.id)).toEqual(["decision"]);
    expect(focus.promotingNow.map((item) => item.id)).toEqual(["promoting"]);
    expect(focus.later.map((item) => item.id)).toEqual(["later"]);
    expect(focus.cancelledUpcoming.map((item) => item.id)).toEqual(["cancelled"]);
    expect(focus.reviewTotal).toBe(4);
    expect(focus.promotingTotal).toBe(2);
  });
});

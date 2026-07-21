import { describe, it, expect } from "vitest";
import {
  occurrenceDates,
  cadenceSummary,
  inferRecurrencePattern,
  type SeriesLike,
} from "../src/lib/recurrence";
import { atMidnight } from "../src/lib/engine/dates";

// Helper: build a series with sensible defaults, overriding per test.
function series(over: Partial<SeriesLike>): SeriesLike {
  return {
    frequency: "weekly",
    interval: 1,
    weekday: null,
    dayOfMonth: null,
    startDate: atMidnight(new Date("2026-06-02")), // Tuesday
    untilDate: null,
    ...over,
  };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("occurrenceDates — weekly", () => {
  it("every week on startDate's weekday (weekday null)", () => {
    // start Tue Jun 2; horizon Jun 30 → Jun 2,9,16,23,30
    const out = occurrenceDates(series({}), atMidnight(new Date("2026-06-30")));
    expect(out.map(iso)).toEqual(["2026-06-02", "2026-06-09", "2026-06-16", "2026-06-23", "2026-06-30"]);
  });

  it("honors an explicit weekday different from startDate", () => {
    // start Tue Jun 2 but weekday = Thursday(4): first occurrence is Jun 4
    const out = occurrenceDates(series({ weekday: 4 }), atMidnight(new Date("2026-06-25")));
    expect(out.map(iso)).toEqual(["2026-06-04", "2026-06-11", "2026-06-18", "2026-06-25"]);
  });

  it("biweekly (interval 2) skips alternate weeks", () => {
    // start Tue Jun 2, every 2 weeks → Jun 2,16,30
    const out = occurrenceDates(series({ interval: 2 }), atMidnight(new Date("2026-06-30")));
    expect(out.map(iso)).toEqual(["2026-06-02", "2026-06-16", "2026-06-30"]);
  });

  it("untilDate cuts the series off (inclusive)", () => {
    const out = occurrenceDates(
      series({ untilDate: atMidnight(new Date("2026-06-16")) }),
      atMidnight(new Date("2026-12-31"))
    );
    expect(out.map(iso)).toEqual(["2026-06-02", "2026-06-09", "2026-06-16"]);
  });

  it("horizonEnd cuts the series off (inclusive)", () => {
    const out = occurrenceDates(series({}), atMidnight(new Date("2026-06-16")));
    expect(out.map(iso)).toEqual(["2026-06-02", "2026-06-09", "2026-06-16"]);
  });

  it("returns nothing when startDate is after the horizon", () => {
    const out = occurrenceDates(
      series({ startDate: atMidnight(new Date("2026-07-01")) }),
      atMidnight(new Date("2026-06-30"))
    );
    expect(out).toEqual([]);
  });

  it("untilDate null → forever, bounded only by the horizon", () => {
    // No end date: generation must stop exactly at the horizon (and never error
    // on the null untilDate). Weekly from Tue Jun 2, horizon Jun 23.
    const out = occurrenceDates(
      series({ untilDate: null }),
      atMidnight(new Date("2026-06-23"))
    );
    expect(out.map(iso)).toEqual(["2026-06-02", "2026-06-09", "2026-06-16", "2026-06-23"]);
    // Pushing the horizon out yields strictly more — proof it's the horizon, not
    // a hidden cap, doing the bounding.
    const further = occurrenceDates(
      series({ untilDate: null }),
      atMidnight(new Date("2026-08-31"))
    );
    expect(further.length).toBeGreaterThan(out.length);
  });
});

describe("occurrenceDates — daily", () => {
  it("supports daily and every-N-days series", () => {
    const daily = occurrenceDates(
      series({ frequency: "daily" }),
      atMidnight(new Date("2026-06-05")),
    );
    expect(daily.map(iso)).toEqual(["2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"]);

    const everyThreeDays = occurrenceDates(
      series({ frequency: "daily", interval: 3 }),
      atMidnight(new Date("2026-06-11")),
    );
    expect(everyThreeDays.map(iso)).toEqual(["2026-06-02", "2026-06-05", "2026-06-08", "2026-06-11"]);
  });
});

describe("occurrenceDates — monthly, forever (untilDate null)", () => {
  it("monthly with no end date is bounded only by the horizon", () => {
    // "Missionary of the Month": monthly on the 1st, no end. 120-day horizon
    // from Jun 1 reaches into Sep → Jun,Jul,Aug,Sep 1st.
    const out = occurrenceDates(
      series({
        frequency: "monthly",
        dayOfMonth: 1,
        untilDate: null,
        startDate: atMidnight(new Date("2026-06-01")),
      }),
      atMidnight(new Date("2026-09-29")) // ~120 days
    );
    expect(out.map(iso)).toEqual(["2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01"]);
  });
});

describe("occurrenceDates — monthly", () => {
  it("every month on a given dayOfMonth", () => {
    const out = occurrenceDates(
      series({ frequency: "monthly", dayOfMonth: 15, startDate: atMidnight(new Date("2026-06-15")) }),
      atMidnight(new Date("2026-09-30"))
    );
    expect(out.map(iso)).toEqual(["2026-06-15", "2026-07-15", "2026-08-15", "2026-09-15"]);
  });

  it("uses startDate's day when dayOfMonth is null", () => {
    const out = occurrenceDates(
      series({ frequency: "monthly", dayOfMonth: null, startDate: atMidnight(new Date("2026-06-10")) }),
      atMidnight(new Date("2026-08-31"))
    );
    expect(out.map(iso)).toEqual(["2026-06-10", "2026-07-10", "2026-08-10"]);
  });

  it("clamps dayOfMonth 31 to the last day of short months", () => {
    // Jan 31, Feb (28 in 2027), Mar 31, Apr 30
    const out = occurrenceDates(
      series({ frequency: "monthly", dayOfMonth: 31, startDate: atMidnight(new Date("2027-01-31")) }),
      atMidnight(new Date("2027-04-30"))
    );
    expect(out.map(iso)).toEqual(["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]);
  });

  it("every 2 months (interval 2)", () => {
    const out = occurrenceDates(
      series({ frequency: "monthly", interval: 2, dayOfMonth: 1, startDate: atMidnight(new Date("2026-06-01")) }),
      atMidnight(new Date("2026-12-31"))
    );
    expect(out.map(iso)).toEqual(["2026-06-01", "2026-08-01", "2026-10-01", "2026-12-01"]);
  });

  it("monthly respects untilDate", () => {
    const out = occurrenceDates(
      series({
        frequency: "monthly",
        dayOfMonth: 15,
        startDate: atMidnight(new Date("2026-06-15")),
        untilDate: atMidnight(new Date("2026-07-15")),
      }),
      atMidnight(new Date("2026-12-31"))
    );
    expect(out.map(iso)).toEqual(["2026-06-15", "2026-07-15"]);
  });
});

describe("cadenceSummary", () => {
  it("describes daily cadences in plain English", () => {
    expect(cadenceSummary(series({ frequency: "daily" }))).toBe("Every day");
    expect(cadenceSummary(series({ frequency: "daily", interval: 3 }))).toBe("Every 3 days");
  });

  it("describes weekly cadences in plain English", () => {
    expect(cadenceSummary(series({ weekday: 2 }))).toBe("Every week on Tuesday");
    expect(cadenceSummary(series({ interval: 2, weekday: 1 }))).toBe("Every 2 weeks on Monday");
  });

  it("describes monthly cadences in plain English", () => {
    expect(cadenceSummary(series({ frequency: "monthly", dayOfMonth: 15 }))).toBe("Every month on day 15");
    expect(cadenceSummary(series({ frequency: "monthly", interval: 3, dayOfMonth: 1 }))).toBe(
      "Every 3 months on day 1"
    );
  });
});

describe("inferRecurrencePattern", () => {
  const dates = (...values: string[]) => values.map((value) => atMidnight(new Date(value)));

  it("infers daily, weekly, every-four-weeks, and monthly patterns", () => {
    expect(inferRecurrencePattern(dates("2026-08-03", "2026-08-04", "2026-08-05"))).toMatchObject({
      frequency: "daily",
      interval: 1,
    });
    expect(inferRecurrencePattern(dates("2026-07-22", "2026-07-29", "2026-08-05"))).toMatchObject({
      frequency: "weekly",
      interval: 1,
      weekday: 3,
    });
    expect(inferRecurrencePattern(dates("2026-09-14", "2026-10-12", "2026-11-09"))).toMatchObject({
      frequency: "weekly",
      interval: 4,
      weekday: 1,
    });
    expect(inferRecurrencePattern(dates("2026-07-31", "2026-08-31", "2026-09-30"))).toMatchObject({
      frequency: "monthly",
      interval: 1,
      dayOfMonth: 31,
    });
  });

  it("refuses irregular patterns instead of inventing missing occurrences", () => {
    expect(inferRecurrencePattern(dates("2026-07-22", "2026-07-29", "2026-08-12"))).toBeNull();
  });
});

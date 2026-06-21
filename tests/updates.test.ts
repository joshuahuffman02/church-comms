import { describe, it, expect } from "vitest";
import {
  sortUpdates,
  activeUpdateAt,
  updatesInWeek,
  suggestStarterArc,
  type EventUpdateLite,
} from "../src/lib/updates";
import { atMidnight } from "../src/lib/engine/dates";

// Helper: build a lite update with sensible defaults, overriding per test.
function u(over: Partial<EventUpdateLite>): EventUpdateLite {
  return {
    scheduledFor: atMidnight(new Date("2026-06-01")),
    title: "Phase",
    status: "planned",
    sortOrder: 0,
    ...over,
  };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("sortUpdates", () => {
  it("sorts by scheduledFor ascending", () => {
    const out = sortUpdates([
      u({ title: "C", scheduledFor: atMidnight(new Date("2026-06-20")) }),
      u({ title: "A", scheduledFor: atMidnight(new Date("2026-06-01")) }),
      u({ title: "B", scheduledFor: atMidnight(new Date("2026-06-10")) }),
    ]);
    expect(out.map((x) => x.title)).toEqual(["A", "B", "C"]);
  });

  it("breaks same-day ties by sortOrder ascending", () => {
    const day = atMidnight(new Date("2026-06-10"));
    const out = sortUpdates([
      u({ title: "second", scheduledFor: day, sortOrder: 5 }),
      u({ title: "first", scheduledFor: day, sortOrder: 1 }),
      u({ title: "third", scheduledFor: day, sortOrder: 9 }),
    ]);
    expect(out.map((x) => x.title)).toEqual(["first", "second", "third"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      u({ title: "B", scheduledFor: atMidnight(new Date("2026-06-10")) }),
      u({ title: "A", scheduledFor: atMidnight(new Date("2026-06-01")) }),
    ];
    const snapshot = input.map((x) => x.title);
    sortUpdates(input);
    expect(input.map((x) => x.title)).toEqual(snapshot);
  });

  it("returns empty for empty input", () => {
    expect(sortUpdates([])).toEqual([]);
  });
});

describe("activeUpdateAt", () => {
  const arc = [
    u({ title: "Save the date", scheduledFor: atMidnight(new Date("2026-06-05")) }),
    u({ title: "Registration open", scheduledFor: atMidnight(new Date("2026-06-12")) }),
    u({ title: "Last call", scheduledFor: atMidnight(new Date("2026-06-26")) }),
    u({ title: "Day-of", scheduledFor: atMidnight(new Date("2026-06-29")) }),
  ];

  it("returns null before the first phase", () => {
    expect(activeUpdateAt(arc, atMidnight(new Date("2026-06-01")))).toBeNull();
  });

  it("returns the phase exactly on its start date (inclusive)", () => {
    expect(activeUpdateAt(arc, atMidnight(new Date("2026-06-05")))?.title).toBe(
      "Save the date"
    );
  });

  it("between phases returns the earlier (most recent <= asOf)", () => {
    // Jun 20 is after Registration open (Jun 12) but before Last call (Jun 26).
    expect(activeUpdateAt(arc, atMidnight(new Date("2026-06-20")))?.title).toBe(
      "Registration open"
    );
  });

  it("after the last phase returns the last phase", () => {
    expect(activeUpdateAt(arc, atMidnight(new Date("2026-07-15")))?.title).toBe(
      "Day-of"
    );
  });

  it("compares at church-local midnight (ignores time-of-day on asOf)", () => {
    // Late-evening asOf on Jun 12 still resolves to that day's phase.
    const asOf = new Date("2026-06-12T23:30:00");
    expect(activeUpdateAt(arc, asOf)?.title).toBe("Registration open");
  });

  it("honors sortOrder when two phases share the active day", () => {
    const day = atMidnight(new Date("2026-06-10"));
    const sameDay = [
      u({ title: "early", scheduledFor: day, sortOrder: 1 }),
      u({ title: "late", scheduledFor: day, sortOrder: 9 }),
    ];
    // Both are <= asOf; the latest in sort order is the active one.
    expect(activeUpdateAt(sameDay, day)?.title).toBe("late");
  });

  it("returns null for an empty arc", () => {
    expect(activeUpdateAt([], atMidnight(new Date("2026-06-10")))).toBeNull();
  });
});

describe("updatesInWeek", () => {
  // A Mon..Sun week: Jun 1 (Mon) .. Jun 7 (Sun) 2026.
  const weekStart = atMidnight(new Date("2026-06-01"));
  const weekEnd = atMidnight(new Date("2026-06-07"));

  it("keeps updates within the inclusive week and drops those outside", () => {
    const out = updatesInWeek(
      [
        u({ title: "before", scheduledFor: atMidnight(new Date("2026-05-31")) }),
        u({ title: "on-start", scheduledFor: weekStart }),
        u({ title: "mid", scheduledFor: atMidnight(new Date("2026-06-04")) }),
        u({ title: "on-end", scheduledFor: weekEnd }),
        u({ title: "after", scheduledFor: atMidnight(new Date("2026-06-08")) }),
      ],
      weekStart,
      weekEnd
    );
    expect(out.map((x) => x.title)).toEqual(["on-start", "mid", "on-end"]);
  });

  it("includes an end-of-day time on the last day (church-local midnight compare)", () => {
    const out = updatesInWeek(
      [u({ title: "late-sun", scheduledFor: new Date("2026-06-07T23:30:00") })],
      weekStart,
      weekEnd
    );
    expect(out.map((x) => x.title)).toEqual(["late-sun"]);
  });

  it("returns the matches sorted (date asc, then sortOrder)", () => {
    const out = updatesInWeek(
      [
        u({ title: "C", scheduledFor: atMidnight(new Date("2026-06-05")) }),
        u({ title: "A", scheduledFor: weekStart, sortOrder: 1 }),
        u({ title: "B", scheduledFor: weekStart, sortOrder: 5 }),
      ],
      weekStart,
      weekEnd
    );
    expect(out.map((x) => x.title)).toEqual(["A", "B", "C"]);
  });

  it("returns empty when nothing lands in the week", () => {
    expect(updatesInWeek([], weekStart, weekEnd)).toEqual([]);
  });
});

describe("suggestStarterArc", () => {
  it("produces ordered, distinct phases ending on the event (no registration)", () => {
    const eventStart = atMidnight(new Date("2026-06-29")); // Monday
    const arc = suggestStarterArc(eventStart, null);

    expect(arc.length).toBeGreaterThanOrEqual(3);
    // dates must be non-decreasing
    for (let i = 1; i < arc.length; i++) {
      expect(arc[i].scheduledFor.getTime()).toBeGreaterThanOrEqual(
        arc[i - 1].scheduledFor.getTime()
      );
    }
    // last phase is Day-of on the event date
    const last = arc[arc.length - 1];
    expect(last.kind).toBe("day_of");
    expect(iso(last.scheduledFor)).toBe(iso(eventStart));
    // nothing scheduled after the event
    for (const p of arc) {
      expect(p.scheduledFor.getTime()).toBeLessThanOrEqual(eventStart.getTime());
    }
    // first phase is the save-the-date, ~28 days out
    expect(arc[0].kind).toBe("save_the_date");
    expect(iso(arc[0].scheduledFor)).toBe(iso(atMidnight(new Date("2026-06-01"))));
  });

  it("uses registrationClosesAt to anchor register / last-call phases", () => {
    const eventStart = atMidnight(new Date("2026-07-15"));
    const regCloses = atMidnight(new Date("2026-07-10"));
    const arc = suggestStarterArc(eventStart, regCloses);

    const register = arc.find((p) => p.kind === "register");
    const lastCall = arc.find((p) => p.kind === "last_call");
    expect(register).toBeDefined();
    expect(lastCall).toBeDefined();

    // register = regCloses - 14d, last_call = regCloses - 3d
    expect(iso(register!.scheduledFor)).toBe(iso(atMidnight(new Date("2026-06-26"))));
    expect(iso(lastCall!.scheduledFor)).toBe(iso(atMidnight(new Date("2026-07-07"))));

    // overall order preserved and clamped to the event
    for (let i = 1; i < arc.length; i++) {
      expect(arc[i].scheduledFor.getTime()).toBeGreaterThanOrEqual(
        arc[i - 1].scheduledFor.getTime()
      );
    }
    for (const p of arc) {
      expect(p.scheduledFor.getTime()).toBeLessThanOrEqual(eventStart.getTime());
    }
  });

  it("is deterministic (no Date.now): same inputs → identical output", () => {
    const eventStart = atMidnight(new Date("2026-09-01"));
    const a = suggestStarterArc(eventStart, null);
    const b = suggestStarterArc(eventStart, null);
    expect(a.map((p) => `${p.kind}:${iso(p.scheduledFor)}`)).toEqual(
      b.map((p) => `${p.kind}:${iso(p.scheduledFor)}`)
    );
  });

  it("clamps phases that would land after the event for a short runway", () => {
    // Event only 5 days out: derived back-dated phases get clamped so none
    // exceed the event and the sequence stays non-decreasing.
    const eventStart = atMidnight(new Date("2026-06-06"));
    const arc = suggestStarterArc(eventStart, null);
    for (let i = 1; i < arc.length; i++) {
      expect(arc[i].scheduledFor.getTime()).toBeGreaterThanOrEqual(
        arc[i - 1].scheduledFor.getTime()
      );
    }
    for (const p of arc) {
      expect(p.scheduledFor.getTime()).toBeLessThanOrEqual(eventStart.getTime());
    }
    // Day-of is still on the event.
    expect(iso(arc[arc.length - 1].scheduledFor)).toBe(iso(eventStart));
  });
});

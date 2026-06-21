import { describe, it, expect } from "vitest";
import {
  computeTaskDueDates,
  tasksInWeek,
  sortTasks,
  type TaskLite,
} from "../src/lib/playbooks";
import { atMidnight, subDays } from "../src/lib/engine/dates";

const d = (s: string) => atMidnight(new Date(s));
const iso = (x: Date | null) =>
  x == null
    ? null
    : `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(
        x.getDate()
      ).padStart(2, "0")}`;

describe("computeTaskDueDates", () => {
  const event = d("2026-09-01");

  it("subtracts offsetDays from the event for dated tasks", () => {
    const out = computeTaskDueDates(event, [
      { offsetDays: 120, title: "board" },
      { offsetDays: 90, title: "giving" },
      { offsetDays: 60, title: "register" },
      { offsetDays: 0, title: "day-of" },
    ]);
    expect(iso(out[0].dueAt)).toBe(iso(subDays(event, 120)));
    expect(iso(out[1].dueAt)).toBe(iso(subDays(event, 90)));
    expect(iso(out[2].dueAt)).toBe(iso(subDays(event, 60)));
    expect(iso(out[3].dueAt)).toBe(iso(event)); // offset 0 == event day
  });

  it("leaves dueAt null when offsetDays is null", () => {
    const out = computeTaskDueDates(event, [{ offsetDays: null }]);
    expect(out[0].dueAt).toBeNull();
  });

  it("preserves the other task fields", () => {
    const out = computeTaskDueDates(event, [
      { offsetDays: 60, title: "Order banner", category: "logistics" },
    ]);
    expect(out[0].title).toBe("Order banner");
    expect(out[0].category).toBe("logistics");
  });

  it("normalizes a non-midnight event date to the calendar day", () => {
    const noisy = new Date(2026, 8, 1, 17, 30); // Sep 1 5:30pm
    const out = computeTaskDueDates(noisy, [{ offsetDays: 10 }]);
    expect(iso(out[0].dueAt)).toBe(iso(subDays(d("2026-09-01"), 10)));
  });

  it("does not mutate the input array", () => {
    const input = [{ offsetDays: 5 }];
    const snap = JSON.stringify(input);
    computeTaskDueDates(event, input);
    expect(JSON.stringify(input)).toBe(snap);
  });
});

describe("tasksInWeek", () => {
  const weekStart = d("2026-06-01"); // Mon
  const weekEnd = d("2026-06-07"); // Sun

  function t(over: Partial<TaskLite>): TaskLite {
    return { dueAt: d("2026-06-03"), status: "todo", ...over };
  }

  it("includes tasks whose dueAt is inside the inclusive window", () => {
    const out = tasksInWeek(
      [
        t({ dueAt: weekStart }), // boundary lo
        t({ dueAt: d("2026-06-04") }),
        t({ dueAt: weekEnd }), // boundary hi
      ],
      weekStart,
      weekEnd
    );
    expect(out.length).toBe(3);
  });

  it("excludes tasks before or after the window", () => {
    const out = tasksInWeek(
      [t({ dueAt: d("2026-05-31") }), t({ dueAt: d("2026-06-08") })],
      weekStart,
      weekEnd
    );
    expect(out.length).toBe(0);
  });

  it("excludes undated (null dueAt) tasks", () => {
    const out = tasksInWeek([t({ dueAt: null })], weekStart, weekEnd);
    expect(out.length).toBe(0);
  });

  it("counts a task due at end-of-day on weekEnd (half-open upper bound)", () => {
    const out = tasksInWeek(
      [t({ dueAt: new Date(2026, 5, 7, 23, 59) })],
      weekStart,
      weekEnd
    );
    expect(out.length).toBe(1);
  });
});

describe("sortTasks", () => {
  function t(over: Partial<TaskLite> & { title?: string }): TaskLite & { title: string } {
    return { dueAt: null, status: "todo", sortOrder: 0, title: "x", ...over };
  }

  it("sorts by dueAt ascending", () => {
    const out = sortTasks([
      t({ title: "C", dueAt: d("2026-06-20") }),
      t({ title: "A", dueAt: d("2026-06-01") }),
      t({ title: "B", dueAt: d("2026-06-10") }),
    ]);
    expect(out.map((x) => x.title)).toEqual(["A", "B", "C"]);
  });

  it("puts null dueAt (undated) tasks last", () => {
    const out = sortTasks([
      t({ title: "undated", dueAt: null }),
      t({ title: "dated", dueAt: d("2026-06-10") }),
    ]);
    expect(out.map((x) => x.title)).toEqual(["dated", "undated"]);
  });

  it("breaks same-day ties by sortOrder ascending", () => {
    const day = d("2026-06-10");
    const out = sortTasks([
      t({ title: "second", dueAt: day, sortOrder: 5 }),
      t({ title: "first", dueAt: day, sortOrder: 1 }),
      t({ title: "third", dueAt: day, sortOrder: 9 }),
    ]);
    expect(out.map((x) => x.title)).toEqual(["first", "second", "third"]);
  });

  it("breaks ties among undated tasks by sortOrder", () => {
    const out = sortTasks([
      t({ title: "b", dueAt: null, sortOrder: 2 }),
      t({ title: "a", dueAt: null, sortOrder: 1 }),
    ]);
    expect(out.map((x) => x.title)).toEqual(["a", "b"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      t({ title: "B", dueAt: d("2026-06-10") }),
      t({ title: "A", dueAt: d("2026-06-01") }),
    ];
    const snap = input.map((x) => x.title);
    sortTasks(input);
    expect(input.map((x) => x.title)).toEqual(snap);
  });
});

import { describe, it, expect } from "vitest";
import { pickNewGoogleEvents, INTAKE_TASKS, GOOGLE_ICAL_SOURCE } from "@/lib/google-intake";
import { computeTaskDueDates } from "@/lib/playbooks";
import type { ExternalCalendarEvent, ExternalEventPreview } from "@/lib/external-calendar";

function ev(key: string, opts: Partial<ExternalCalendarEvent> = {}): ExternalCalendarEvent {
  return {
    uid: key,
    key,
    title: key,
    startsAt: new Date(2026, 6, 11),
    endsAt: null,
    dateKey: "2026-07-11",
    location: null,
    description: null,
    source: "single",
    operationalNoise: false,
    ...opts,
  };
}
const prev = (e: ExternalCalendarEvent, status: ExternalEventPreview["status"]): ExternalEventPreview => ({
  event: e,
  status,
  matches: [],
});

describe("pickNewGoogleEvents", () => {
  it("keeps only new, non-noise, non-imported, non-ignored, unmatched events", () => {
    const a = ev("a");
    const noise = ev("noise", { operationalNoise: true });
    const imported = ev("imported");
    const ignored = ev("ignored");
    const matched = ev("matched");
    const events = [a, noise, imported, ignored, matched];
    const previews = [
      prev(a, "missing"),
      prev(noise, "missing"),
      prev(imported, "missing"),
      prev(ignored, "missing"),
      prev(matched, "already_in_system"),
    ];
    const out = pickNewGoogleEvents(events, previews, new Set(["imported"]), new Set(["ignored"]));
    expect(out.map((e) => e.key)).toEqual(["a"]);
  });

  it("does NOT auto-import a possible PCO/manual duplicate (only 'missing')", () => {
    const a = ev("a");
    expect(pickNewGoogleEvents([a], [prev(a, "possible_match")], new Set(), new Set())).toEqual([]);
    expect(pickNewGoogleEvents([a], [prev(a, "missing")], new Set(), new Set()).map((e) => e.key)).toEqual(["a"]);
  });
});

describe("intake ripening checklist", () => {
  it("includes the guided create-in-Planning-Center step (Phase 4)", () => {
    const create = INTAKE_TASKS.find((t) => /planning center/i.test(t.title));
    expect(create).toBeTruthy();
    expect(create!.notes.toLowerCase()).toContain("link");
  });

  it("dates each step relative to the event (eventStart − offsetDays)", () => {
    const dated = computeTaskDueDates(new Date(2026, 6, 11), INTAKE_TASKS); // Jul 11
    const create = dated.find((t) => /planning center/i.test(t.title))!; // offset 30 → Jun 11
    expect(create.dueAt?.getMonth()).toBe(5); // June (0-indexed)
    expect(create.dueAt?.getDate()).toBe(11);
    const undated = dated.find((t) => t.offsetDays === null)!; // "confirm details" is undated
    expect(undated.dueAt).toBeNull();
  });

  it("uses a stable source marker", () => {
    expect(GOOGLE_ICAL_SOURCE).toBe("google-ics");
  });
});

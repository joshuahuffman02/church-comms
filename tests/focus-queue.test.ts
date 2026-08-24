import { describe, expect, it } from "vitest";
import {
  visibleFocusCandidates,
  type FocusActivity,
  type FocusCandidate,
} from "../src/lib/focus-queue";

function candidate(id: string, fingerprint = `state-${id}`): FocusCandidate {
  return {
    key: `request:${id}`,
    entityType: "request",
    entityId: id,
    fingerprint,
    eyebrow: "Intake",
    title: `Event ${id}`,
    detail: "Needs a decision",
    href: `/requests/${id}`,
    actionLabel: "Review request",
    tone: "amber",
    sourceLabel: "Planning Center",
    requesterLabel: "Imported — no requester",
    ownerLabel: "Unassigned",
    productionNeeds: [],
  };
}

function activity(
  id: string,
  action: string,
  metadata: Record<string, unknown>,
  createdAt = new Date("2026-07-27T10:00:00Z"),
): FocusActivity {
  return {
    action,
    entityType: "request",
    entityId: id,
    metadata,
    createdAt,
  };
}

describe("personal focus queue", () => {
  const now = new Date("2026-07-27T12:00:00Z");

  it("keeps the visible queue bounded and stable", () => {
    const result = visibleFocusCandidates(
      [candidate("1"), candidate("2"), candidate("3"), candidate("4")],
      [],
      now,
      3,
    );
    expect(result.map((item) => item.entityId)).toEqual(["1", "2", "3"]);
  });

  it("hides a completed preference only for the same underlying state", () => {
    const done = activity("1", "focus_done", { fingerprint: "state-1" });
    expect(visibleFocusCandidates([candidate("1"), candidate("2")], [done], now))
      .toEqual([candidate("2")]);
    expect(visibleFocusCandidates([candidate("1", "new-state")], [done], now))
      .toEqual([candidate("1", "new-state")]);
  });

  it("returns a snoozed item after the snooze expires", () => {
    const future = activity("1", "focus_snoozed", {
      fingerprint: "state-1",
      snoozedUntil: "2026-07-28T00:00:00Z",
    });
    const expired = activity("1", "focus_snoozed", {
      fingerprint: "state-1",
      snoozedUntil: "2026-07-27T11:00:00Z",
    });
    expect(visibleFocusCandidates([candidate("1")], [future], now)).toEqual([]);
    expect(visibleFocusCandidates([candidate("1")], [expired], now)).toEqual([candidate("1")]);
  });

  it("uses the newest action for each item", () => {
    const newest = activity("1", "focus_done", { fingerprint: "state-1" }, new Date("2026-07-27T11:00:00Z"));
    const older = activity("1", "focus_snoozed", {
      fingerprint: "state-1",
      snoozedUntil: "2026-07-27T11:30:00Z",
    }, new Date("2026-07-27T10:00:00Z"));
    expect(visibleFocusCandidates([candidate("1")], [newest, older], now)).toEqual([]);
  });
});

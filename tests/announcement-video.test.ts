import { describe, expect, it } from "vitest";
import {
  resolveAnnouncementVideoLineup,
  canProtectAnnouncementItem,
  type AnnouncementCandidate,
  type AnnouncementPick,
} from "@/lib/announcement-video";
import { atMidnight } from "@/lib/engine/dates";

const sunday = atMidnight(new Date("2026-07-26"));

function candidate(
  requestId: string,
  title: string,
  tier: number,
  eventStart: string,
): AnnouncementCandidate {
  return {
    requestId,
    touchId: `touch-${requestId}`,
    title,
    tier,
    eventStart: atMidnight(new Date(eventStart)),
    registrationClosesAt: null,
    nextStepText: null,
    description: null,
    ministries: [],
    scheduledAt: sunday,
    content: null,
    touchStatus: "scheduled",
    deliverableStatus: "to_design",
  };
}

function pick(request: AnnouncementCandidate, sortOrder = 0): AnnouncementPick {
  return {
    id: `pick-${request.requestId}`,
    sortOrder,
    requestId: request.requestId,
    label: null,
    request: {
      id: request.requestId,
      title: request.title,
      tier: request.tier,
      eventStart: request.eventStart,
      registrationClosesAt: null,
      nextStepText: null,
      description: null,
      status: "approved",
      noPromo: false,
      ministries: [],
    },
  };
}

describe("resolveAnnouncementVideoLineup", () => {
  it("keeps a locked event when a higher-priority event is added", () => {
    const locked = candidate("locked", "Locked ministry event", 3, "2026-09-01");
    const tierOne = candidate("tier-one", "Whole church", 1, "2026-08-01");
    const near = candidate("near", "Near event", 2, "2026-07-30");
    const extra = candidate("extra", "Extra event", 2, "2026-08-15");

    const lineup = resolveAnnouncementVideoLineup({
      sunday,
      capacity: 3,
      candidates: [locked, tierOne, near, extra],
      picks: [],
      locks: [{ id: "lock-1", requestId: locked.requestId, createdAt: new Date("2026-07-01") }],
    });

    expect(lineup.entries.map((entry) => entry.requestId)).toEqual([
      "locked",
      "tier-one",
      "near",
    ]);
    expect(lineup.held.map((entry) => entry.requestId)).toEqual(["extra"]);
  });

  it("uses manual order, then locks, then automatic ranking", () => {
    const manual = candidate("manual", "Manually featured", 3, "2026-09-01");
    const locked = candidate("locked", "Locked", 3, "2026-10-01");
    const automatic = candidate("auto", "Automatic", 1, "2026-08-01");

    const lineup = resolveAnnouncementVideoLineup({
      sunday,
      capacity: 3,
      candidates: [automatic, locked, manual],
      picks: [pick(manual)],
      locks: [{ id: "lock-1", requestId: locked.requestId, createdAt: new Date("2026-07-01") }],
    });

    expect(lineup.entries.map((entry) => [entry.requestId, entry.source])).toEqual([
      ["manual", "manual"],
      ["locked", "locked"],
      ["auto", "automatic"],
    ]);
  });

  it("counts an awareness item against the three available slots", () => {
    const candidates = [
      candidate("one", "One", 1, "2026-08-01"),
      candidate("two", "Two", 1, "2026-08-02"),
      candidate("three", "Three", 1, "2026-08-03"),
    ];
    const lineup = resolveAnnouncementVideoLineup({
      sunday,
      capacity: 3,
      candidates,
      picks: [{ id: "label", sortOrder: 0, requestId: null, label: "Serve Day reminder", request: null }],
      locks: [],
    });

    expect(lineup.entries.map((entry) => entry.title)).toEqual([
      "Serve Day reminder",
      "One",
      "Two",
    ]);
    expect(lineup.held.map((entry) => entry.title)).toEqual(["Three"]);
  });

  it("keeps a valid manual pick visible while flagging its missing slide", () => {
    const request = candidate("manual", "Manual without slide", 1, "2026-08-01");
    const lineup = resolveAnnouncementVideoLineup({
      sunday,
      capacity: 3,
      candidates: [],
      picks: [pick(request)],
      locks: [],
    });

    expect(lineup.entries[0]).toMatchObject({
      requestId: "manual",
      missingTouch: true,
      source: "manual",
    });
    expect(lineup.issues[0]).toContain("no scheduled video slide");
  });
});

describe("canProtectAnnouncementItem", () => {
  it("rejects a fourth protected item but permits pinning an automatic slot", () => {
    const one = candidate("one", "One", 1, "2026-08-01");
    const two = candidate("two", "Two", 1, "2026-08-02");
    const auto = candidate("auto", "Automatic", 1, "2026-08-03");
    const lineup = resolveAnnouncementVideoLineup({
      sunday,
      capacity: 3,
      candidates: [one, two, auto],
      picks: [pick(one), pick(two, 1)],
      locks: [],
    });

    expect(canProtectAnnouncementItem(lineup, auto.requestId)).toBe(true);
    expect(canProtectAnnouncementItem(lineup, null)).toBe(true);

    const full = resolveAnnouncementVideoLineup({
      sunday,
      capacity: 3,
      candidates: [one, two, auto],
      picks: [pick(one), pick(two, 1), pick(auto, 2)],
      locks: [],
    });
    expect(canProtectAnnouncementItem(full, null)).toBe(false);
    expect(canProtectAnnouncementItem(full, "fourth")).toBe(false);
    expect(canProtectAnnouncementItem(full, one.requestId)).toBe(true);
  });
});

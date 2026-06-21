import { describe, it, expect } from "vitest";
import {
  parsePcoEventInstances,
  parseResourceRequestStatuses,
  reduceRoomStatus,
  type PcoEvent,
} from "../src/lib/pco";

// A realistic PCO Calendar JSON:API payload for `GET /calendar/v2/event_instances`
// with `include=event,resource_bookings`. `data` is event_instance[]; `included`
// carries the related Event, ResourceBooking, and Resource resources.
//
// - Instance "inst-approved" → Event "ev-1" (approval_status "A", has a
//   registration_url). It books two rooms via two resource_bookings → two
//   Resources ("Fellowship Hall", "Room 101").
// - Instance "inst-pending"  → Event "ev-2" (approval_status "P", no
//   registration_url, no rooms).
const fixture = {
  data: [
    {
      type: "EventInstance",
      id: "inst-approved",
      attributes: {
        starts_at: "2026-06-10T18:00:00Z",
        ends_at: "2026-06-10T20:00:00Z",
        church_center_url: "https://example.churchcenter.com/calendar/event/inst-approved",
        published_starts_at: "2026-06-10T18:00:00Z",
        published_ends_at: "2026-06-10T20:00:00Z",
      },
      relationships: {
        event: { data: { type: "Event", id: "ev-1" } },
        resource_bookings: {
          data: [
            { type: "ResourceBooking", id: "rb-1" },
            { type: "ResourceBooking", id: "rb-2" },
          ],
        },
        // Tags hang off the INSTANCE (mirrors the live API).
        tags: {
          data: [
            { type: "Tag", id: "tag-1" },
            { type: "Tag", id: "tag-2" },
          ],
        },
      },
    },
    {
      type: "EventInstance",
      id: "inst-pending",
      attributes: {
        starts_at: "2026-06-12T09:00:00Z",
        ends_at: null,
        church_center_url: null,
      },
      relationships: {
        event: { data: { type: "Event", id: "ev-2" } },
        resource_bookings: { data: [] },
        tags: { data: [] },
      },
    },
  ],
  included: [
    {
      type: "Event",
      id: "ev-1",
      attributes: {
        name: "Summer Kickoff",
        approval_status: "A",
        registration_url: "https://example.churchcenter.com/registrations/123",
        summary: "Kick off the summer with games and a cookout.",
        visible_in_church_center: true,
        featured: true,
      },
      relationships: {
        owner: { data: { type: "Person", id: "person-1" } },
      },
    },
    {
      type: "Event",
      id: "ev-2",
      attributes: {
        name: "Elders Meeting",
        approval_status: "P",
        registration_url: null,
        summary: null,
        description: "<div>\n  Monthly <b>elders</b> sync.\n</div>\n",
        visible_in_church_center: false,
        featured: false,
      },
    },
    {
      type: "ResourceBooking",
      id: "rb-1",
      relationships: { resource: { data: { type: "Resource", id: "res-1" } } },
    },
    {
      type: "ResourceBooking",
      id: "rb-2",
      relationships: { resource: { data: { type: "Resource", id: "res-2" } } },
    },
    { type: "Resource", id: "res-1", attributes: { name: "Fellowship Hall" } },
    { type: "Resource", id: "res-2", attributes: { name: "Room 101" } },
    { type: "Tag", id: "tag-1", attributes: { name: "All Church" } },
    { type: "Tag", id: "tag-2", attributes: { name: "Small Group" } },
  ],
};

describe("parsePcoEventInstances", () => {
  const out = parsePcoEventInstances(fixture);
  const byId = new Map<string, PcoEvent>(out.map((e) => [e.pcoEventId, e]));

  it("returns one PcoEvent per event_instance (approved + pending alike)", () => {
    expect(out).toHaveLength(2);
    expect(byId.has("inst-approved")).toBe(true);
    expect(byId.has("inst-pending")).toBe(true);
  });

  it("pulls name, approval_status and registration_url from the related event", () => {
    const approved = byId.get("inst-approved")!;
    expect(approved.name).toBe("Summer Kickoff");
    expect(approved.approvalStatus).toBe("A");
    expect(approved.registrationUrl).toBe(
      "https://example.churchcenter.com/registrations/123",
    );

    const pending = byId.get("inst-pending")!;
    expect(pending.name).toBe("Elders Meeting");
    expect(pending.approvalStatus).toBe("P");
    expect(pending.registrationUrl).toBeNull();
  });

  it("pulls the description: prefers plain summary, else strips the HTML description", () => {
    expect(byId.get("inst-approved")!.description).toBe(
      "Kick off the summer with games and a cookout.",
    );
    // summary is null → falls back to the HTML description, tags stripped.
    expect(byId.get("inst-pending")!.description).toBe("Monthly elders sync.");
  });

  it("resolves rooms through resource_bookings → resource names", () => {
    const approved = byId.get("inst-approved")!;
    expect(approved.rooms).toEqual(["Fellowship Hall", "Room 101"]);
    // location is the joined room list
    expect(approved.location).toBe("Fellowship Hall, Room 101");
  });

  it("leaves rooms empty and location null when nothing is booked", () => {
    const pending = byId.get("inst-pending")!;
    expect(pending.rooms).toEqual([]);
    expect(pending.location).toBeNull();
  });

  it("reads times + church_center_url from the instance, not the event", () => {
    const approved = byId.get("inst-approved")!;
    expect(approved.startsAt).toBeInstanceOf(Date);
    expect(approved.startsAt.toISOString()).toBe("2026-06-10T18:00:00.000Z");
    expect(approved.endsAt?.toISOString()).toBe("2026-06-10T20:00:00.000Z");
    expect(approved.churchCenterUrl).toBe(
      "https://example.churchcenter.com/calendar/event/inst-approved",
    );

    const pending = byId.get("inst-pending")!;
    expect(pending.endsAt).toBeNull();
    expect(pending.churchCenterUrl).toBeNull();
  });

  it("carries the parent event id (distinct from the instance id)", () => {
    expect(byId.get("inst-approved")!.parentEventId).toBe("ev-1");
    expect(byId.get("inst-pending")!.parentEventId).toBe("ev-2");
  });

  it("reads publish signals: visible_in_church_center + featured from the event", () => {
    const approved = byId.get("inst-approved")!;
    expect(approved.visibleInChurchCenter).toBe(true);
    expect(approved.featured).toBe(true);

    const pending = byId.get("inst-pending")!;
    expect(pending.visibleInChurchCenter).toBe(false);
    expect(pending.featured).toBe(false);
  });

  it("reads published_starts_at/ends_at from the instance (null when absent)", () => {
    const approved = byId.get("inst-approved")!;
    expect(approved.publishedStartsAt?.toISOString()).toBe("2026-06-10T18:00:00.000Z");
    expect(approved.publishedEndsAt?.toISOString()).toBe("2026-06-10T20:00:00.000Z");
    expect(byId.get("inst-pending")!.publishedStartsAt).toBeNull();
  });

  it("resolves the instance's tags to Tag names (empty when none)", () => {
    expect(byId.get("inst-approved")!.tags).toEqual(["All Church", "Small Group"]);
    expect(byId.get("inst-pending")!.tags).toEqual([]);
  });

  it("carries the event owner's Person id (null when no owner relationship)", () => {
    expect(byId.get("inst-approved")!.ownerPersonId).toBe("person-1");
    expect(byId.get("inst-pending")!.ownerPersonId).toBeNull();
  });

  it("is graceful on empty / malformed payloads", () => {
    expect(parsePcoEventInstances({})).toEqual([]);
    expect(parsePcoEventInstances(null)).toEqual([]);
    expect(parsePcoEventInstances({ data: [] })).toEqual([]);
  });
});

describe("parseResourceRequestStatuses", () => {
  it("pulls the approval_status codes out of an event_resource_requests page", () => {
    const payload = {
      data: [
        { type: "EventResourceRequest", id: "1", attributes: { approval_status: "A" } },
        { type: "EventResourceRequest", id: "2", attributes: { approval_status: "P" } },
        { type: "EventResourceRequest", id: "3", attributes: {} }, // no status → dropped
      ],
    };
    expect(parseResourceRequestStatuses(payload)).toEqual(["A", "P"]);
  });

  it("is graceful on empty / malformed payloads", () => {
    expect(parseResourceRequestStatuses({})).toEqual([]);
    expect(parseResourceRequestStatuses(null)).toEqual([]);
  });
});

describe("reduceRoomStatus", () => {
  it("returns null when there are no resource requests", () => {
    expect(reduceRoomStatus([])).toBeNull();
  });

  it("'approved' only when every request is approved", () => {
    expect(reduceRoomStatus(["A", "A"])).toBe("approved");
  });

  it("'pending' when any request is pending (over approved)", () => {
    expect(reduceRoomStatus(["A", "P", "A"])).toBe("pending");
  });

  it("'rejected' wins over pending and approved", () => {
    expect(reduceRoomStatus(["A", "P", "R"])).toBe("rejected");
    expect(reduceRoomStatus(["R", "A"])).toBe("rejected");
  });
});

import { describe, it, expect } from "vitest";
import {
  parsePcoResources,
  parsePcoResourceBookings,
} from "../src/lib/pco-rooms";

// A realistic `GET /calendar/v2/resources` page. Mixes a Room and a Resource,
// with the attribute-name variance we read defensively against (kind vs
// resource_type; quantity vs quantity_or_minutes; image_url vs avatar_url;
// home_location vs location).
const resourcesFixture = {
  data: [
    {
      type: "Resource",
      id: "res-1",
      attributes: {
        name: "Fellowship Hall",
        kind: "Room",
        description: "Big multipurpose room",
        home_location: "Main Building",
        quantity: 200,
        image_url: "https://example.com/hall.jpg",
        updated_at: "2026-05-01T12:00:00Z",
      },
    },
    {
      type: "Resource",
      id: "res-2",
      attributes: {
        name: "Projector",
        resource_type: "Resource",
        location: "AV Closet",
        quantity_or_minutes: "3",
        avatar_url: "https://example.com/proj.png",
      },
    },
  ],
  links: { next: null },
};

describe("parsePcoResources", () => {
  it("parses rooms and resources, reading attribute variants defensively", () => {
    const rows = parsePcoResources(resourcesFixture);
    expect(rows).toHaveLength(2);

    const hall = rows[0];
    expect(hall.pcoResourceId).toBe("res-1");
    expect(hall.name).toBe("Fellowship Hall");
    expect(hall.kind).toBe("Room");
    expect(hall.description).toBe("Big multipurpose room");
    expect(hall.homeLocation).toBe("Main Building");
    expect(hall.quantity).toBe(200);
    expect(hall.imageUrl).toBe("https://example.com/hall.jpg");
    expect(hall.updatedAt?.toISOString()).toBe("2026-05-01T12:00:00.000Z");

    const proj = rows[1];
    expect(proj.kind).toBe("Resource");
    expect(proj.homeLocation).toBe("AV Closet"); // location fallback
    expect(proj.quantity).toBe(3); // quantity_or_minutes string coerced
    expect(proj.imageUrl).toBe("https://example.com/proj.png"); // avatar_url fallback
    expect(proj.updatedAt).toBeNull();
  });

  it("defaults kind to Resource and name to a placeholder; skips rows with no id", () => {
    const rows = parsePcoResources({
      data: [
        { type: "Resource", id: "x", attributes: {} },
        { type: "Resource", attributes: { name: "no id" } },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("Resource");
    expect(rows[0].name).toBe("Untitled resource");
  });

  it("returns [] for non-object / empty payloads", () => {
    expect(parsePcoResources(null)).toEqual([]);
    expect(parsePcoResources({})).toEqual([]);
    expect(parsePcoResources({ data: [] })).toEqual([]);
  });
});

// A realistic `GET /calendar/v2/resources/{id}/resource_bookings?filter=future
// &include=event_instance,event` page. Two bookings: one with a full
// event_instance + event (title from event), one whose start is missing (must
// be skipped because it can't sit on a timeline).
const bookingsFixture = {
  data: [
    {
      type: "ResourceBooking",
      id: "rb-1",
      attributes: {
        starts_at: "2026-06-10T18:00:00Z",
        ends_at: "2026-06-10T20:00:00Z",
        approval_status: "A",
      },
      relationships: {
        event_instance: { data: { type: "EventInstance", id: "inst-1" } },
        event: { data: { type: "Event", id: "ev-1" } },
      },
    },
    {
      type: "ResourceBooking",
      id: "rb-nostart",
      attributes: { starts_at: null },
      relationships: {
        event_instance: { data: { type: "EventInstance", id: "inst-2" } },
      },
    },
  ],
  included: [
    {
      type: "EventInstance",
      id: "inst-1",
      attributes: {
        church_center_url: "https://example.churchcenter.com/calendar/event/inst-1",
      },
    },
    {
      type: "Event",
      id: "ev-1",
      attributes: { name: "Summer Kickoff", approval_status: "A" },
    },
  ],
};

describe("parsePcoResourceBookings", () => {
  it("parses a future booking with its event_instance + event", () => {
    const rows = parsePcoResourceBookings(bookingsFixture);
    expect(rows).toHaveLength(1); // the no-start booking is skipped

    const b = rows[0];
    expect(b.pcoBookingId).toBe("rb-1");
    expect(b.startsAt.toISOString()).toBe("2026-06-10T18:00:00.000Z");
    expect(b.endsAt?.toISOString()).toBe("2026-06-10T20:00:00.000Z");
    expect(b.eventInstanceId).toBe("inst-1");
    expect(b.eventTitle).toBe("Summer Kickoff");
    expect(b.churchCenterUrl).toBe(
      "https://example.churchcenter.com/calendar/event/inst-1",
    );
    expect(b.approvalStatus).toBe("A");
  });

  it("falls back to the event_instance id/name when the event isn't included", () => {
    const rows = parsePcoResourceBookings({
      data: [
        {
          type: "ResourceBooking",
          id: "rb-2",
          attributes: { starts_at: "2026-07-01T09:00:00Z" },
          relationships: {
            event_instance: { data: { type: "EventInstance", id: "inst-9" } },
          },
        },
      ],
      included: [
        {
          type: "EventInstance",
          id: "inst-9",
          attributes: { name: "Instance-named occurrence" },
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].eventInstanceId).toBe("inst-9");
    expect(rows[0].eventTitle).toBe("Instance-named occurrence");
    expect(rows[0].churchCenterUrl).toBeNull();
  });

  it("records a booking with no event_instance (null id) so the slot still shows", () => {
    const rows = parsePcoResourceBookings({
      data: [
        {
          type: "ResourceBooking",
          id: "rb-bare",
          attributes: { starts_at: "2026-08-01T09:00:00Z" },
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].eventInstanceId).toBeNull();
    expect(rows[0].eventTitle).toBeNull();
  });

  it("returns [] for non-object / empty payloads", () => {
    expect(parsePcoResourceBookings(null)).toEqual([]);
    expect(parsePcoResourceBookings({})).toEqual([]);
    expect(parsePcoResourceBookings({ data: [] })).toEqual([]);
  });
});

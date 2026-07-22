import { describe, expect, it } from "vitest";
import {
  roomBookingConflictIds,
  roomBookingMonthKey,
  roomScheduleEnd,
} from "../src/lib/room-schedule";

function booking(id: string, start: string, end: string | null) {
  return {
    id,
    startsAt: new Date(start),
    endsAt: end ? new Date(end) : null,
  };
}

describe("room schedule", () => {
  it("builds a bounded future window without discarding the current time", () => {
    const now = new Date(2026, 6, 22, 14, 30);
    const end = roomScheduleEnd(now, 90);

    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(9);
    expect(end.getDate()).toBe(20);
    expect(end.getHours()).toBe(14);
    expect(end.getMinutes()).toBe(30);
  });

  it("flags both sides of an overlap but allows back-to-back bookings", () => {
    const conflicts = roomBookingConflictIds([
      booking("first", "2026-08-01T09:00:00", "2026-08-01T10:00:00"),
      booking("overlap", "2026-08-01T09:30:00", "2026-08-01T10:30:00"),
      booking("adjacent", "2026-08-01T10:30:00", "2026-08-01T11:00:00"),
      booking("unknown-end", "2026-08-01T09:45:00", null),
    ]);

    expect([...conflicts].sort()).toEqual(["first", "overlap"]);
  });

  it("groups dates by church-local calendar month", () => {
    expect(roomBookingMonthKey(new Date(2026, 7, 8, 9))).toBe("2026-08");
  });
});

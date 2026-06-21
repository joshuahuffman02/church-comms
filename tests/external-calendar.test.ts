import { afterEach, describe, expect, it } from "vitest";
import {
  buildExternalEventPreview,
  calendarUrlToIcsUrl,
  configuredExternalCalendarUrl,
  configuredLocalIcalPath,
  expandIcsEvents,
  fetchExternalCalendarEvents,
  isOperationalNoise,
  loadLocalIcalEvents,
  parseIcsEvents,
} from "../src/lib/external-calendar";

const originalCalendarEnv = {
  GOOGLE_EVENTS_ICAL_URL: process.env.GOOGLE_EVENTS_ICAL_URL,
  GOOGLE_CALENDAR_ICAL_URL: process.env.GOOGLE_CALENDAR_ICAL_URL,
  GOOGLE_EVENTS_CALENDAR_URL: process.env.GOOGLE_EVENTS_CALENDAR_URL,
  GOOGLE_CALENDAR_URL: process.env.GOOGLE_CALENDAR_URL,
  ICAL_IMPORT_FILE: process.env.ICAL_IMPORT_FILE,
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalCalendarEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("calendarUrlToIcsUrl", () => {
  it("converts a Google Calendar embed URL to the public ICS feed", () => {
    expect(
      calendarUrlToIcsUrl(
        "https://calendar.google.com/calendar/embed?src=example%40group.calendar.google.com&ctz=America%2FChicago",
      ),
    ).toBe(
      "https://calendar.google.com/calendar/ical/example%40group.calendar.google.com/public/basic.ics",
    );
  });

  it("leaves an existing feed URL alone", () => {
    const feed = "https://example.com/calendar.ics";
    expect(calendarUrlToIcsUrl(feed)).toBe(feed);
  });
});

describe("external calendar configuration", () => {
  it("does not fall back to a private calendar when env vars are unset", async () => {
    delete process.env.GOOGLE_EVENTS_ICAL_URL;
    delete process.env.GOOGLE_CALENDAR_ICAL_URL;
    delete process.env.GOOGLE_EVENTS_CALENDAR_URL;
    delete process.env.GOOGLE_CALENDAR_URL;
    delete process.env.ICAL_IMPORT_FILE;

    expect(configuredExternalCalendarUrl()).toBeNull();
    expect(configuredLocalIcalPath()).toBeNull();
    await expect(fetchExternalCalendarEvents()).resolves.toEqual([]);
    await expect(loadLocalIcalEvents()).resolves.toEqual([]);
  });
});

describe("parseIcsEvents", () => {
  it("parses date-only and timed VEVENT rows", () => {
    const events = parseIcsEvents(`BEGIN:VCALENDAR
BEGIN:VEVENT
UID:all-day-1
DTSTART;VALUE=DATE:20260620
DTEND;VALUE=DATE:20260621
SUMMARY:Youth\\, Night
LOCATION:Room A
DESCRIPTION:Line one\\nLine two
END:VEVENT
BEGIN:VEVENT
UID:timed-1
DTSTART;TZID=America/Chicago:20260621T093000
DTEND;TZID=America/Chicago:20260621T103000
SUMMARY:Women's 
 Brunch
END:VEVENT
END:VCALENDAR`);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      uid: "all-day-1",
      title: "Youth, Night",
      dateKey: "2026-06-20",
      location: "Room A",
      description: "Line one Line two",
    });
    expect(events[1]).toMatchObject({
      uid: "timed-1",
      title: "Women's Brunch",
      dateKey: "2026-06-21",
    });
    expect(events[1].startsAt.getHours()).toBe(9);
    expect(events[1].startsAt.getMinutes()).toBe(30);
  });
});

describe("expandIcsEvents", () => {
  it("expands weekly recurrences inside the requested window", () => {
    const events = expandIcsEvents(
      `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:weekly-1
DTSTART;TZID=America/Chicago:20260601T183000
RRULE:FREQ=WEEKLY;BYDAY=MO
EXDATE;TZID=America/Chicago:20260615T183000
SUMMARY:Young Adults
END:VEVENT
END:VCALENDAR`,
      new Date(2026, 5, 9),
      new Date(2026, 5, 28),
    );

    expect(events.map((event) => [event.dateKey, event.title])).toEqual([
      ["2026-06-22", "Young Adults"],
    ]);
  });
});

describe("isOperationalNoise", () => {
  it("spots room/admin rows that should be hidden by the default import filter", () => {
    expect(isOperationalNoise("Worship Team Practice, MC", null)).toBe(true);
    expect(isOperationalNoise("Women's Fall Kickoff", "PIN SCHEDULE 123456")).toBe(true);
    expect(isOperationalNoise("Family Fall Festival", null)).toBe(false);
  });
});

describe("buildExternalEventPreview", () => {
  it("separates already-present, possible-match, and missing events", () => {
    const external = parseIcsEvents(`BEGIN:VCALENDAR
BEGIN:VEVENT
UID:1
DTSTART;VALUE=DATE:20260620
SUMMARY:Youth Night
END:VEVENT
BEGIN:VEVENT
UID:2
DTSTART;VALUE=DATE:20260621
SUMMARY:Womens Brunch
END:VEVENT
BEGIN:VEVENT
UID:3
DTSTART;VALUE=DATE:20260622
SUMMARY:Prayer Gathering
END:VEVENT
END:VCALENDAR`);

    const preview = buildExternalEventPreview(
      external,
      [
        {
          id: "req-1",
          title: "Youth Night",
          eventStart: new Date(2026, 5, 20),
          location: "Gym",
          pcoEventId: "pco-1",
        },
        {
          id: "req-2",
          title: "Womens Breakfast",
          eventStart: new Date(2026, 5, 21),
          location: null,
          pcoEventId: null,
        },
      ],
      new Date(2026, 5, 1),
    );

    expect(preview.map((row) => [row.event.title, row.status])).toEqual([
      ["Youth Night", "already_in_system"],
      ["Womens Brunch", "possible_match"],
      ["Prayer Gathering", "missing"],
    ]);
    expect(preview[1].matches[0]).toMatchObject({ id: "req-2" });
  });
});

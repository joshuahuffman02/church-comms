// Planning Center Calendar — Rooms/Resources pull (READ-ONLY).
//
// Companion to `src/lib/pco.ts` (events). This module pulls the org's bookable
// Resources (Rooms + equipment) and, per ROOM, its FUTURE resource_bookings so
// the Rooms section can show "every upcoming event happening in this room". We
// only ever READ from PCO — nothing here writes back.
//
// Reuses the shared JSON:API plumbing from `./pco` (auth header construction,
// the narrowing helpers, the `included` index) so the two modules parse PCO's
// JSON:API the same way, no `any`. The pure parsers (`parsePcoResources`,
// `parsePcoResourceBookings`) take `unknown` and narrow; they're network-free
// and unit-tested. The `fetch*` wrappers add pagination + rate-limit manners.

import {
  PCO_BASE,
  authHeader,
  pcoConfigured,
  asObject,
  str,
  parseTs,
  relRefs,
  indexIncluded,
  lookup,
  type JsonApiResource,
  type JsonApiResponse,
} from "./pco";

// PCO rate limit is 100 requests / 20s. This is a background sync, so we page
// politely (a small pause between requests) and cap total pages defensively so
// a runaway/looping `next` link can't spin forever.
const PER_PAGE = 100;
const MAX_PAGES = 50; // 50 * 100 = 5000 rows per resource — far beyond any church
const POLITE_PAUSE_MS = 250;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** A bookable PCO resource (room or equipment), parsed from `/calendar/v2/resources`. */
export interface PcoResourceRow {
  pcoResourceId: string;
  name: string;
  /** "Room" | "Resource" (the Rooms UI filters to "Room"). */
  kind: string;
  description: string | null;
  homeLocation: string | null;
  quantity: number | null;
  imageUrl: string | null;
  updatedAt: Date | null;
}

/** A future booking of a resource, parsed from `/calendar/v2/resource_bookings`. */
export interface PcoBookingRow {
  pcoBookingId: string;
  startsAt: Date;
  endsAt: Date | null;
  /** event_instance id — matches our Request.pcoEventId when imported. */
  eventInstanceId: string | null;
  eventTitle: string | null;
  churchCenterUrl: string | null;
  approvalStatus: string | null;
}

// --- pure parsers (network-free, unit-tested) -------------------------------

/** Coerce a numeric JSON:API attribute (quantity may arrive as number or string). */
function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Parse a `/calendar/v2/resources` JSON:API page into `PcoResourceRow`s.
 *
 * PCO Resource attribute names vary a little across orgs, so we read
 * defensively: `kind` accepts `kind`/`resource_type`; the image falls back
 * across `image_url`/`image`/`avatar_url`; capacity across
 * `quantity`/`quantity_or_minutes`; location across `home_location`/`location`.
 * Resources with no id are skipped. `kind` defaults to "Resource".
 */
export function parsePcoResources(payload: unknown): PcoResourceRow[] {
  const body = asObject(payload) as JsonApiResponse | null;
  if (!body) return [];
  const data = Array.isArray(body.data) ? body.data : [];

  const out: PcoResourceRow[] = [];
  for (const res of data) {
    if (!res.id) continue;
    const a = res.attributes ?? {};
    out.push({
      pcoResourceId: res.id,
      name: str(a.name) ?? "Untitled resource",
      kind: str(a.kind) ?? str(a.resource_type) ?? "Resource",
      description: str(a.description),
      homeLocation: str(a.home_location) ?? str(a.location),
      quantity: num(a.quantity) ?? num(a.quantity_or_minutes),
      imageUrl: str(a.image_url) ?? str(a.image) ?? str(a.avatar_url),
      updatedAt: parseTs(a.updated_at),
    });
  }
  return out;
}

/**
 * Parse a `/calendar/v2/resource_bookings` JSON:API page (with
 * `include=event_instance,event` where available) into `PcoBookingRow`s.
 *
 * A ResourceBooking carries `starts_at`/`ends_at`. The booked occurrence is the
 * related `event_instance` — we record its id (so the Rooms UI can match a
 * Request.pcoEventId) and lift its `church_center_url`. The human title comes
 * from the related `event` when included, else the event_instance's own name,
 * else null. Read defensively: bookings with no parseable start are skipped
 * (not placeable on a timeline); a booking with no event_instance still records
 * with a null instance id so the room's slot is still shown.
 */
export function parsePcoResourceBookings(payload: unknown): PcoBookingRow[] {
  const body = asObject(payload) as JsonApiResponse | null;
  if (!body) return [];
  const data = Array.isArray(body.data) ? body.data : [];
  const included = Array.isArray(body.included) ? body.included : [];
  const index = indexIncluded(included);

  const out: PcoBookingRow[] = [];
  for (const booking of data) {
    if (!booking.id) continue;
    const a = booking.attributes ?? {};
    const startsAt = parseTs(a.starts_at);
    if (!startsAt) continue; // a booking with no start can't sit on a timeline

    // Related event_instance → id + church_center_url (+ a fallback name).
    const instRef = relRefs(booking.relationships?.event_instance)[0];
    const instance: JsonApiResource | null = lookup(index, instRef);
    const eventInstanceId = instance?.id ?? instRef?.id ?? null;
    const instAttrs = instance?.attributes ?? {};

    // Related event (when included) → the human title. The event may be a
    // direct relationship of the booking or hang off the event_instance.
    const eventRef =
      relRefs(booking.relationships?.event)[0] ??
      relRefs(instance?.relationships?.event)[0];
    const event = lookup(index, eventRef);
    const eventTitle =
      str(event?.attributes?.name) ?? str(instAttrs.name) ?? null;

    out.push({
      pcoBookingId: booking.id,
      startsAt,
      endsAt: parseTs(a.ends_at),
      eventInstanceId,
      eventTitle,
      churchCenterUrl:
        str(instAttrs.church_center_url) ?? str(a.church_center_url),
      approvalStatus: str(a.approval_status) ?? str(event?.attributes?.approval_status),
    });
  }
  return out;
}

// --- network (paginated, polite) --------------------------------------------

/** Throw a clear, consistent error for a non-OK PCO response. */
function pcoError(res: Response): Error {
  return new Error(
    `Planning Center API error (${res.status} ${res.statusText}). ` +
      `Check your PCO credentials.`,
  );
}

/** Read the JSON:API `links.next` URL from a page body, or null when last page. */
function nextLink(body: unknown): string | null {
  const links = asObject(asObject(body)?.links);
  return str(links?.next);
}

/**
 * Fetch + parse every page of a PCO collection, following `links.next`.
 * `signals429` lets the caller stop gracefully on a rate-limit (returns what we
 * have so far instead of throwing) — this is a background sync, so we don't
 * hammer. `parse` maps each page body to rows that are concatenated in order.
 */
async function fetchAllPages<T>(
  firstUrl: string,
  parse: (body: unknown) => T[],
): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = firstUrl;
  let page = 0;

  while (url && page < MAX_PAGES) {
    const res: Response = await fetch(url, {
      headers: { Authorization: authHeader(), Accept: "application/json" },
      cache: "no-store",
    });
    // 429: stop gracefully with what we have — don't keep pushing the limit.
    if (res.status === 429) break;
    if (!res.ok) throw pcoError(res);

    const body: unknown = await res.json();
    out.push(...parse(body));

    url = nextLink(body);
    page++;
    if (url) await sleep(POLITE_PAUSE_MS);
  }
  return out;
}

/**
 * Pull EVERY bookable resource (rooms + equipment) from PCO Calendar,
 * paginating `/calendar/v2/resources`. The caller filters by `kind` ("Room").
 * Throws when unconfigured / on a non-200 (the cron catches it).
 */
export async function fetchPcoResources(): Promise<PcoResourceRow[]> {
  if (!pcoConfigured()) throw new Error("Planning Center is not configured");
  const url = `${PCO_BASE}/calendar/v2/resources?per_page=${PER_PAGE}&order=name`;
  return fetchAllPages(url, parsePcoResources);
}

/**
 * Pull a single resource's FUTURE bookings from PCO, including the related
 * event_instance and event so we can resolve the occurrence id + title. Uses
 * the nested `/calendar/v2/resources/{id}/resource_bookings` collection with
 * `filter=future`. Throws when unconfigured / on a non-200.
 */
export async function fetchFutureBookingsForResource(
  pcoResourceId: string,
): Promise<PcoBookingRow[]> {
  if (!pcoConfigured()) throw new Error("Planning Center is not configured");
  const url =
    `${PCO_BASE}/calendar/v2/resources/${encodeURIComponent(pcoResourceId)}` +
    `/resource_bookings?filter=future&include=event_instance,event` +
    `&order=starts_at&per_page=${PER_PAGE}`;
  return fetchAllPages(url, parsePcoResourceBookings);
}

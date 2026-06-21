// Planning Center Calendar integration (Model A: pull approved events only).
//
// Graceful + configurable: with no credentials this no-ops (callers surface a
// "Connect Planning Center" message). When the user sets env credentials it
// hits the real PCO Calendar API, which is READ-ONLY here — we only pull events,
// their occurrences, and the rooms each occurrence books. We never write to PCO.
//
// Auth resolution order:
//   1. HTTP Basic with PLANNING_CENTER_APP_ID + PLANNING_CENTER_SECRET
//      (Planning Center Personal Access Token pair),
//   2. HTTP Basic with PCO_APP_ID + PCO_SECRET (this app's own pair),
//   3. OAuth bearer token PCO_TOKEN.
//
// PCO speaks JSON:API. We type only the slice we consume (no `any`; the parser
// takes `unknown` and narrows).

export const PCO_BASE = "https://api.planningcenteronline.com";
const EVENT_INSTANCES_URL =
  `${PCO_BASE}/calendar/v2/event_instances` +
  `?filter=future&include=event,resource_bookings,tags&order=starts_at&per_page=50`;

export interface PcoEvent {
  /** event_instance id — one Request per occurrence is keyed on this. */
  pcoEventId: string;
  /**
   * The PARENT event id (Event resource). Distinct from `pcoEventId` (which is
   * the event_INSTANCE id). Used by the sync layer to fetch per-event extras
   * (the owner Person, the room resource-requests) — null when absent.
   */
  parentEventId: string | null;
  name: string;
  startsAt: Date;
  endsAt: Date | null;
  /** Event-level approval: "A" approved, "P" pending, "R" rejected. */
  approvalStatus: string;
  /** Plain-text description (PCO `summary`, else the HTML `description` stripped). */
  description: string | null;
  /** Booked room names resolved via resource_bookings → resource. */
  rooms: string[];
  /** rooms.join(", ") or null when nothing is booked. */
  location: string | null;
  registrationUrl: string | null;
  churchCenterUrl: string | null;
  // --- Publish signals (from the event / instance attributes) ---------------
  /** event.visible_in_church_center — published to the public Church Center. */
  visibleInChurchCenter: boolean | null;
  /** event.featured. */
  featured: boolean | null;
  /** instance.published_starts_at — the public-facing start (may differ). */
  publishedStartsAt: Date | null;
  /** instance.published_ends_at. */
  publishedEndsAt: Date | null;
  // --- Tags (category/ministry/campus labels) -------------------------------
  /** The instance's Tag names, resolved from `included` (type "Tag"). */
  tags: string[];
  // --- Owner (a Person; contact resolved later via the People API) ----------
  /** event.relationships.owner → Person id, or null. Resolved in the sync layer. */
  ownerPersonId: string | null;
}

/**
 * True when Planning Center credentials are present: a PLANNING_CENTER_* Basic
 * pair, a PCO_* Basic pair, or a bearer token. When false the feature no-ops.
 */
export function pcoConfigured(): boolean {
  const hasPlanningCenterBasic =
    !!process.env.PLANNING_CENTER_APP_ID && !!process.env.PLANNING_CENTER_SECRET;
  const hasPcoBasic = !!process.env.PCO_APP_ID && !!process.env.PCO_SECRET;
  const hasToken = !!process.env.PCO_TOKEN;
  return hasPlanningCenterBasic || hasPcoBasic || hasToken;
}

/**
 * Build the Authorization header from whichever credential mode is configured,
 * preferring the PLANNING_CENTER_* pair for Personal Access Token credentials.
 */
export function authHeader(): string {
  const planningCenterAppId = process.env.PLANNING_CENTER_APP_ID;
  const planningCenterSecret = process.env.PLANNING_CENTER_SECRET;
  if (planningCenterAppId && planningCenterSecret) {
    return `Basic ${Buffer.from(`${planningCenterAppId}:${planningCenterSecret}`).toString("base64")}`;
  }
  const appId = process.env.PCO_APP_ID;
  const secret = process.env.PCO_SECRET;
  if (appId && secret) {
    return `Basic ${Buffer.from(`${appId}:${secret}`).toString("base64")}`;
  }
  return `Bearer ${process.env.PCO_TOKEN}`;
}

// --- JSON:API shape (minimal, narrowing helpers; no `any`) -------------------

export interface JsonApiRef {
  type?: string;
  id?: string;
}
export interface JsonApiRelationship {
  data?: JsonApiRef | JsonApiRef[] | null;
}
export interface JsonApiResource {
  type?: string;
  id?: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, JsonApiRelationship | undefined>;
}
export interface JsonApiResponse {
  data?: JsonApiResource[];
  included?: JsonApiResource[];
}

export function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

export function asResource(v: unknown): JsonApiResource | null {
  const o = asObject(v);
  return o ? (o as JsonApiResource) : null;
}

export function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Narrow a JSON:API boolean attribute; null when absent/non-boolean. */
export function bool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

/**
 * Turn PCO's rich-text `description` HTML into a clean plain-text string:
 * strip tags, decode the few common entities, collapse whitespace. Returns
 * null when empty. (PCO also exposes a plain `summary`, which we prefer.)
 */
function stripHtml(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  const text = v
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 0 ? text : null;
}

/** Parse a JSON:API timestamp to a Date, or null when absent/invalid. */
export function parseTs(s: unknown): Date | null {
  if (typeof s !== "string" || !s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Normalize a relationship's `data` to an array of refs (it may be one or many). */
export function relRefs(rel: JsonApiRelationship | undefined): JsonApiRef[] {
  if (!rel) return [];
  const data = rel.data;
  if (Array.isArray(data)) return data;
  return data ? [data] : [];
}

/** Index `included` resources as type → (id → resource). */
export function indexIncluded(
  included: JsonApiResource[],
): Map<string, Map<string, JsonApiResource>> {
  const byType = new Map<string, Map<string, JsonApiResource>>();
  for (const inc of included) {
    const type = inc.type;
    const id = inc.id;
    if (!type || !id) continue;
    let m = byType.get(type);
    if (!m) {
      m = new Map<string, JsonApiResource>();
      byType.set(type, m);
    }
    m.set(id, inc);
  }
  return byType;
}

export function lookup(
  index: Map<string, Map<string, JsonApiResource>>,
  ref: JsonApiRef | undefined,
): JsonApiResource | null {
  if (!ref?.type || !ref.id) return null;
  return index.get(ref.type)?.get(ref.id) ?? null;
}

/**
 * Pure parser: turn a PCO `event_instances` JSON:API response (with
 * `include=event,resource_bookings` and the resources those bookings reference)
 * into enriched `PcoEvent`s. Network-free and exhaustively unit-tested.
 *
 * Mapping:
 *  - name / approval_status / registration_url ← related `event`
 *  - starts_at / ends_at / church_center_url   ← the `event_instance`
 *  - rooms ← instance.relationships.resource_bookings → ResourceBooking →
 *            relationships.resource → Resource.name
 *  - location ← rooms.join(", ") || null
 *
 * Instances with no parseable start are skipped (not importable).
 */
export function parsePcoEventInstances(payload: unknown): PcoEvent[] {
  const body = asObject(payload) as JsonApiResponse | null;
  if (!body) return [];

  const instances = Array.isArray(body.data) ? body.data : [];
  const included = Array.isArray(body.included) ? body.included : [];
  const index = indexIncluded(included);

  const out: PcoEvent[] = [];
  for (const inst of instances) {
    if (!inst.id) continue;
    const attrs = inst.attributes ?? {};
    const startsAt = parseTs(attrs.starts_at);
    if (!startsAt) continue; // an instance with no start is not importable

    // Related event → name, approval status, registration url, publish signals,
    // owner Person id.
    const eventRef = inst.relationships?.event?.data as JsonApiRef | undefined;
    const event = lookup(index, eventRef);
    const eventAttrs = event?.attributes ?? {};
    const name = str(eventAttrs.name) ?? "Untitled event";
    const approvalStatus = str(eventAttrs.approval_status) ?? "";
    const registrationUrl = str(eventAttrs.registration_url);
    // Prefer the plain-text summary; fall back to the HTML description stripped.
    const description = str(eventAttrs.summary) ?? stripHtml(eventAttrs.description);
    const ownerRef = relRefs(event?.relationships?.owner)[0];

    // resource_bookings → resource → name.
    const rooms: string[] = [];
    for (const bookingRef of relRefs(inst.relationships?.resource_bookings)) {
      const booking = lookup(index, bookingRef);
      const resourceRef = asResource(booking)?.relationships?.resource?.data;
      const ref = Array.isArray(resourceRef) ? resourceRef[0] : resourceRef;
      const resource = lookup(index, ref ?? undefined);
      const roomName = str(resource?.attributes?.name);
      if (roomName) rooms.push(roomName);
    }

    // Tags hang off the INSTANCE's `tags` relationship → Tag resources (name).
    const tags: string[] = [];
    for (const tagRef of relRefs(inst.relationships?.tags)) {
      const tag = lookup(index, tagRef);
      const tagName = str(tag?.attributes?.name);
      if (tagName) tags.push(tagName);
    }

    out.push({
      pcoEventId: inst.id,
      parentEventId: eventRef?.id ?? null,
      name,
      startsAt,
      endsAt: parseTs(attrs.ends_at),
      approvalStatus,
      description,
      rooms,
      location: rooms.length > 0 ? rooms.join(", ") : null,
      registrationUrl,
      churchCenterUrl: str(attrs.church_center_url),
      visibleInChurchCenter: bool(eventAttrs.visible_in_church_center),
      featured: bool(eventAttrs.featured),
      publishedStartsAt: parseTs(attrs.published_starts_at),
      publishedEndsAt: parseTs(attrs.published_ends_at),
      tags,
      ownerPersonId: ownerRef?.id ?? null,
    });
  }

  return out;
}

/**
 * Fetch upcoming (future) event instances from the PCO Calendar API — including
 * the related event and each occurrence's room bookings — and parse them into
 * `PcoEvent`s. Returns ALL approval states; callers wanting approved-only should
 * use {@link fetchApprovedUpcomingPcoEvents}.
 *
 * Throws a clear Error when unconfigured, on a non-200 response, or on a
 * network failure — the caller catches it and shows the message.
 */
export async function fetchUpcomingPcoEvents(): Promise<PcoEvent[]> {
  if (!pcoConfigured()) {
    throw new Error("Planning Center is not configured");
  }

  let res: Response;
  try {
    res = await fetch(EVENT_INSTANCES_URL, {
      headers: {
        Authorization: authHeader(),
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not reach Planning Center: ${detail}`);
  }

  if (!res.ok) {
    throw new Error(
      `Planning Center API error (${res.status} ${res.statusText}). ` +
        `Check your PCO credentials.`,
    );
  }

  const body: unknown = await res.json();
  return parsePcoEventInstances(body);
}

/**
 * Approved-only view: the upcoming events whose event-level approval_status is
 * "A". This is the default list the import/UI works from (event-approval is
 * enough; individual rooms may still be pending in PCO).
 */
export async function fetchApprovedUpcomingPcoEvents(): Promise<PcoEvent[]> {
  const all = await fetchUpcomingPcoEvents();
  return all.filter((e) => e.approvalStatus === "A");
}

// --- Per-event enrichment (People API + room resource-requests) -------------
//
// These are the extra calls the sync layer makes per approved event. They live
// here (not in the pure parser) because they hit the network. The PCO rate
// limit is 100 req/20s; the approved set is ~50 events and the sync caches by
// id, so a couple of calls each is well within budget. We pause politely
// between calls and degrade gracefully (return null) on any non-200 — a missing
// owner or room status should never abort a sync.

const POLITE_PAUSE_MS = 120;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Polite pause between per-event enrichment calls (exported for the sync loop). */
export async function pcoPolitePause(): Promise<void> {
  await sleep(POLITE_PAUSE_MS);
}

/** A resolved event owner (a PCO Person): display name + primary email. */
export interface PcoPerson {
  name: string | null;
  email: string | null;
}

/**
 * Resolve a PCO Person (the event owner) to a name + primary email via the
 * People API: `GET /people/v2/people/{id}?include=emails`. The person's `name`
 * is a ready display string; the email is the one flagged `primary` (else the
 * first). Returns nulls on any non-200 (e.g. the token lacks People scope) so
 * the caller degrades gracefully rather than failing the whole sync.
 */
export async function fetchPcoPerson(personId: string): Promise<PcoPerson> {
  if (!pcoConfigured()) throw new Error("Planning Center is not configured");
  const url =
    `${PCO_BASE}/people/v2/people/${encodeURIComponent(personId)}?include=emails`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: authHeader(), Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    return { name: null, email: null };
  }
  if (!res.ok) return { name: null, email: null };

  const body = asObject(await res.json()) as JsonApiResponse & {
    data?: JsonApiResource;
  };
  const person = asResource((body as { data?: unknown }).data);
  const name = str(person?.attributes?.name);

  // Emails arrive in `included` (type "Email"); prefer the primary one.
  const emails = Array.isArray(body.included) ? body.included : [];
  let email: string | null = null;
  for (const e of emails) {
    if (e.type !== "Email") continue;
    const addr = str(e.attributes?.address);
    if (!addr) continue;
    if (e.attributes?.primary === true) {
      email = addr;
      break;
    }
    email ??= addr; // first email as a fallback
  }
  return { name, email };
}

/**
 * Overall room-request status for one event. Pure reducer over the
 * `approval_status` codes (A/P/R) of its `event_resource_requests`:
 *   - any "R" → "rejected"
 *   - else any "P" → "pending"
 *   - else (all "A", at least one) → "approved"
 *   - no requests → null
 * "rejected" wins over "pending" wins over "approved" so the most urgent triage
 * signal surfaces. Network-free + unit-tested.
 */
export function reduceRoomStatus(statuses: readonly string[]): string | null {
  if (statuses.length === 0) return null;
  if (statuses.some((s) => s === "R")) return "rejected";
  if (statuses.some((s) => s === "P")) return "pending";
  if (statuses.some((s) => s === "A")) return "approved";
  return null;
}

/** Pure parser: pull the `approval_status` codes out of an event_resource_requests page. */
export function parseResourceRequestStatuses(payload: unknown): string[] {
  const body = asObject(payload) as JsonApiResponse | null;
  if (!body) return [];
  const data = Array.isArray(body.data) ? body.data : [];
  const out: string[] = [];
  for (const r of data) {
    const s = str(r.attributes?.approval_status);
    if (s) out.push(s);
  }
  return out;
}

/**
 * Fetch an event's room resource-requests and reduce them to one overall status
 * ("approved" | "pending" | "rejected" | null). Uses
 * `GET /calendar/v2/events/{eventId}/event_resource_requests`. Returns null on
 * any non-200 so a missing/inaccessible event never aborts a sync.
 */
export async function fetchEventRoomStatus(
  parentEventId: string,
): Promise<string | null> {
  if (!pcoConfigured()) throw new Error("Planning Center is not configured");
  const url =
    `${PCO_BASE}/calendar/v2/events/${encodeURIComponent(parentEventId)}` +
    `/event_resource_requests?per_page=100`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: authHeader(), Accept: "application/json" },
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  return reduceRoomStatus(parseResourceRequestStatuses(await res.json()));
}

// Weekly cap + curation for high-volume windowed channels (Facebook, Instagram).
//
// A windowed channel auto-schedules a touch for EVERY eligible event across its
// promo window, so in a busy season a single week can pile up dozens of posts.
// This module is the pure ranking that decides which events actually make a
// channel's weekly cap: the most important ones (by tier), then the soonest, so
// an event naturally climbs into the cap as its date approaches. Everything over
// the cap is "held" (still in the DB, just not surfaced as live that week).
//
// Pure + DB-free so it's trivially unit-tested; callers map their own touch rows
// to {@link RankableEvent} and filter by the returned live set.

/** The minimal per-event signal the weekly ranking needs. */
export type RankableEvent = {
  requestId: string;
  tier: number;
  /** Event start as epoch ms (church-local midnight) — soonest ranks higher. */
  eventStartMs: number;
  title: string;
};

export type EventCapChannel = {
  type?: string;
  capacity?: number | null;
  frequencyCap?: number | null;
};

/**
 * The event cap that should be applied when surfacing a channel. Weekly promo
 * caps use `frequencyCap`; service-instance outputs such as Announcement Video
 * use their per-instance `capacity`.
 */
export function effectiveEventCap(channel: EventCapChannel): number | null {
  if (channel.frequencyCap != null && channel.frequencyCap > 0) {
    return channel.frequencyCap;
  }
  if (channel.type === "dated_instance" && channel.capacity != null && channel.capacity > 0) {
    return channel.capacity;
  }
  return null;
}

/**
 * The distinct events that make a channel's weekly cap, ranked by importance:
 * tier ascending (1 = broadest / most important), then soonest event first,
 * then title for a stable tie-break. Returns the set of `requestId`s that are
 * LIVE this week.
 *
 * De-dupes by `requestId` first — a windowed channel can post the same event
 * several times in one week (e.g. Sun + Wed), but the cap counts EVENTS, not
 * individual posts. A null / non-positive cap means uncapped: every event is
 * live (so non-capped channels pass through unchanged).
 */
export function liveEventIds(
  events: RankableEvent[],
  cap: number | null | undefined,
): Set<string> {
  // Distinct events — first occurrence wins (the fields are per-event, so any
  // touch of the event carries the same tier/date/title).
  const byId = new Map<string, RankableEvent>();
  for (const e of events) if (!byId.has(e.requestId)) byId.set(e.requestId, e);

  const distinct = [...byId.values()];
  if (cap == null || cap <= 0 || distinct.length <= cap) {
    return new Set(distinct.map((e) => e.requestId));
  }

  const ranked = [...distinct].sort(
    (a, b) =>
      a.tier - b.tier ||
      a.eventStartMs - b.eventStartMs ||
      a.title.localeCompare(b.title),
  );
  return new Set(ranked.slice(0, cap).map((e) => e.requestId));
}

/**
 * Split arbitrary touch-like items into the `live` set (belonging to the top-cap
 * events) and the `held` set (the rest), preserving input order within each.
 * `getEvent` extracts the {@link RankableEvent} from each item. A null / 0 cap
 * leaves everything live.
 *
 * `preferred` (optional) is a human curation that FEATURES events: when given
 * and non-empty, the `preferred` events lead the live set (in that order — the
 * announcement-video Top-3 picks), and any remaining slots under the cap are
 * filled by the normal ranking over the rest. So featuring one event promotes
 * it to the top without dropping the others off the video. Everything past the
 * cap is held. (Uncapped → everything stays live, featured first.)
 */
export function splitByWeeklyCap<T>(
  items: T[],
  getEvent: (item: T) => RankableEvent,
  cap: number | null | undefined,
  preferred?: readonly string[],
): { live: T[]; held: T[] } {
  if (preferred && preferred.length > 0) {
    const order = new Map(preferred.map((id, i) => [id, i] as const));
    const isFeatured = (it: T) => order.has(getEvent(it).requestId);
    const featured = items
      .filter(isFeatured)
      .sort((a, b) => order.get(getEvent(a).requestId)! - order.get(getEvent(b).requestId)!);
    const rest = items.filter((it) => !isFeatured(it));

    if (cap == null || cap <= 0) {
      return { live: [...featured, ...rest], held: [] }; // uncapped: featured first, all live
    }
    const featuredEvents = new Set(featured.map((it) => getEvent(it).requestId)).size;
    const fillSlots = cap - featuredEvents;
    if (fillSlots <= 0) {
      return { live: featured, held: rest }; // picks already fill the cap
    }
    const fillIds = liveEventIds(rest.map(getEvent), fillSlots);
    const fillLive: T[] = [];
    const held: T[] = [];
    for (const it of rest) (fillIds.has(getEvent(it).requestId) ? fillLive : held).push(it);
    return { live: [...featured, ...fillLive], held };
  }

  const live = liveEventIds(items.map(getEvent), cap);
  const liveItems: T[] = [];
  const heldItems: T[] = [];
  for (const it of items) {
    if (live.has(getEvent(it).requestId)) liveItems.push(it);
    else heldItems.push(it);
  }
  return { live: liveItems, held: heldItems };
}

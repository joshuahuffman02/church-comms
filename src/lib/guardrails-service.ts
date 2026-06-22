import { db } from "@/lib/db";
import { atMidnight } from "@/lib/engine/dates";
import { weekRange } from "@/lib/week";
import {
  evaluateCapacity,
  evaluatePromoDensity,
  evaluateReachTier,
  type Guardrail,
  type InstanceLoad,
  type ChannelWeekLoad,
  type ReachCheck,
} from "@/lib/guardrails";
import { PROMOTABLE_REQUEST_STATUSES } from "@/lib/status";

// Defaults when a channel doesn't specify its own cap.
const DEFAULT_INSTANCE_CAPACITY = 3;
const DEFAULT_WEEK_CAP = 5;
const DEFAULT_REACH_THRESHOLD = 50;

// Volume guardrails are the ones an active sprint suspends.
const VOLUME_KINDS: ReadonlySet<Guardrail["kind"]> = new Set([
  "stage_cap",
  "loop_cap",
  "promo_density",
]);

/**
 * YYYY-MM-DD from a Date's CHURCH-LOCAL components. Never `toISOString()` — that
 * prints local midnight as the previous calendar day on hosts behind UTC.
 */
function isoDay(d: Date): string {
  const m = atMidnight(d);
  const y = m.getFullYear();
  const mm = String(m.getMonth() + 1).padStart(2, "0");
  const dd = String(m.getDate()).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

/** Parse a YYYY-MM-DD back to church-local midnight for window comparisons. */
function dayFromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

type LoadedRequest = Awaited<ReturnType<typeof loadActiveRequests>>[number];

function loadActiveRequests() {
  return db.request.findMany({
    where: { status: { in: PROMOTABLE_REQUEST_STATUSES }, noPromo: false },
    include: {
      deliverables: { include: { channel: true, touches: true } },
    },
  });
}

/**
 * Build the grouped loads + reach checks from the active requests, run the pure
 * evaluators, then suppress volume guardrails that fall inside an active sprint
 * window. Each guardrail carries the requestIds it involves so callers can link
 * back to events and `getGuardrailsForRequest` can filter.
 */
export async function getGuardrails(today: Date): Promise<Guardrail[]> {
  const [requests, setting, campaigns] = await Promise.all([
    loadActiveRequests(),
    db.setting.findUnique({ where: { id: 1 } }),
    db.campaign.findMany(),
  ]);

  const thresholdPct = setting?.reachThresholdPct ?? DEFAULT_REACH_THRESHOLD;

  // Only flag decisions you can still act on: ignore touches before THIS week's
  // start, so past Sundays (already aired) don't linger as "needs a decision".
  const cutoff = atMidnight(weekRange(today).start).getTime();

  // --- InstanceLoad[]: dated_instance touches grouped by (channelKey, instanceDate). ---
  // Key by channelKey + the touch's calendar day; track distinct requestIds.
  const instanceMap = new Map<
    string,
    { channelKey: string; whenISO: string; capacity: number; requestIds: Set<string>; titles: string[] }
  >();
  // --- ChannelWeekLoad[]: windowed/one_shot touches grouped by (channelKey, ISO-week-start). ---
  const weekMap = new Map<
    string,
    { channelKey: string; weekISO: string; cap: number; touchCount: number }
  >();

  for (const req of requests) {
    for (const del of req.deliverables) {
      const ch = del.channel;
      for (const t of del.touches) {
        if (atMidnight(t.scheduledAt).getTime() < cutoff) continue; // skip the past
        if (ch.type === "dated_instance") {
          const whenISO = isoDay(t.scheduledAt);
          const key = `${ch.key}|${whenISO}`;
          let bucket = instanceMap.get(key);
          if (!bucket) {
            bucket = {
              channelKey: ch.key,
              whenISO,
              capacity: ch.capacity ?? DEFAULT_INSTANCE_CAPACITY,
              requestIds: new Set(),
              titles: [],
            };
            instanceMap.set(key, bucket);
          }
          if (!bucket.requestIds.has(req.id)) {
            bucket.requestIds.add(req.id);
            bucket.titles.push(req.title);
          }
        } else {
          // windowed | one_shot -> per ISO-week (Mon-anchored) density
          const weekISO = isoDay(weekRange(t.scheduledAt).start);
          const key = `${ch.key}|${weekISO}`;
          let bucket = weekMap.get(key);
          if (!bucket) {
            bucket = {
              channelKey: ch.key,
              weekISO,
              cap: ch.frequencyCap ?? DEFAULT_WEEK_CAP,
              touchCount: 0,
            };
            weekMap.set(key, bucket);
          }
          bucket.touchCount += 1;
        }
      }
    }
  }

  const instanceLoads: InstanceLoad[] = [...instanceMap.values()].map((b) => ({
    channelKey: b.channelKey,
    whenISO: b.whenISO,
    capacity: b.capacity,
    requestIds: [...b.requestIds],
    titles: b.titles,
  }));
  const weekLoads: ChannelWeekLoad[] = [...weekMap.values()].map((b) => ({
    channelKey: b.channelKey,
    weekISO: b.weekISO,
    touchCount: b.touchCount,
    cap: b.cap,
  }));

  // --- ReachCheck[] from the requests themselves. ---
  const reachChecks: ReachCheck[] = requests.map((r: LoadedRequest) => ({
    requestId: r.id,
    title: r.title,
    tier: r.tier,
    reachPct: r.audienceReachPct,
  }));

  const guardrails: Guardrail[] = [
    ...evaluateCapacity(instanceLoads),
    ...evaluatePromoDensity(weekLoads),
    ...evaluateReachTier(reachChecks, thresholdPct),
  ];

  // --- Sprint suppression: drop volume guardrails whose date sits inside an
  // active sprint window (startsAt <= today <= endsAt && suspendsGuardrails). ---
  const t = atMidnight(today).getTime();
  const activeSprints = campaigns.filter(
    (c) =>
      c.suspendsGuardrails &&
      atMidnight(c.startsAt).getTime() <= t &&
      t <= atMidnight(c.endsAt).getTime()
  );

  if (activeSprints.length === 0) return guardrails;

  const inActiveSprint = (whenISO?: string): boolean => {
    if (!whenISO) return false;
    const when = atMidnight(dayFromISO(whenISO)).getTime();
    return activeSprints.some(
      (c) =>
        atMidnight(c.startsAt).getTime() <= when &&
        when <= atMidnight(c.endsAt).getTime()
    );
  };

  return guardrails.filter((g) => {
    if (!VOLUME_KINDS.has(g.kind)) return true; // reach_tier always kept
    return !inActiveSprint(g.whenISO);
  });
}

/** Guardrails that involve a specific request (those whose requestIds include it). */
export async function getGuardrailsForRequest(
  requestId: string
): Promise<Guardrail[]> {
  const all = await getGuardrails(new Date());
  return all.filter((g) => g.requestIds?.includes(requestId));
}

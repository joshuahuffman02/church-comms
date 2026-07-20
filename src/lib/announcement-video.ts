import { db } from "@/lib/db";
import { addDays, atMidnight } from "@/lib/engine/dates";
import { localDayKey } from "@/lib/schedule-locks";
import { PROMOTABLE_REQUEST_STATUSES } from "@/lib/status";

export type AnnouncementLineupSource = "manual" | "awareness" | "locked" | "automatic";

export type AnnouncementCandidate = {
  requestId: string;
  touchId: string;
  title: string;
  tier: number;
  eventStart: Date;
  registrationClosesAt: Date | null;
  nextStepText: string | null;
  description: string | null;
  ministries: { name: string; color: string }[];
  scheduledAt: Date;
  content: string | null;
  touchStatus: string;
  deliverableStatus: string;
};

export type AnnouncementPick = {
  id: string;
  sortOrder: number;
  requestId: string | null;
  label: string | null;
  request: {
    id: string;
    title: string;
    tier: number;
    eventStart: Date;
    registrationClosesAt: Date | null;
    nextStepText: string | null;
    description: string | null;
    status: string;
    noPromo: boolean;
    ministries: { name: string; color: string }[];
  } | null;
};

export type AnnouncementLock = {
  id: string;
  requestId: string;
  createdAt: Date;
};

export type AnnouncementLineupEntry = {
  key: string;
  pickId: string | null;
  requestId: string | null;
  touchId: string | null;
  lockId: string | null;
  title: string;
  source: AnnouncementLineupSource;
  locked: boolean;
  missingTouch: boolean;
  tier: number;
  eventStart: Date | null;
  registrationClosesAt: Date | null;
  nextStepText: string | null;
  description: string | null;
  ministries: { name: string; color: string }[];
  scheduledAt: Date;
  content: string | null;
  touchStatus: string | null;
  deliverableStatus: string | null;
};

export type AnnouncementVideoLineup = {
  sunday: Date;
  capacity: number;
  entries: AnnouncementLineupEntry[];
  held: AnnouncementCandidate[];
  issues: string[];
};

function candidateEntry(
  candidate: AnnouncementCandidate,
  source: AnnouncementLineupSource,
  lockId: string | null,
  pickId: string | null = null,
): AnnouncementLineupEntry {
  return {
    key: candidate.requestId,
    pickId,
    requestId: candidate.requestId,
    touchId: candidate.touchId,
    lockId,
    title: candidate.title,
    source,
    locked: lockId != null,
    missingTouch: false,
    tier: candidate.tier,
    eventStart: candidate.eventStart,
    registrationClosesAt: candidate.registrationClosesAt,
    nextStepText: candidate.nextStepText,
    description: candidate.description,
    ministries: candidate.ministries,
    scheduledAt: candidate.scheduledAt,
    content: candidate.content,
    touchStatus: candidate.touchStatus,
    deliverableStatus: candidate.deliverableStatus,
  };
}

/**
 * Resolve one Sunday's actual announcement-video lineup.
 *
 * Human picks lead, locked placements are guaranteed a remaining slot, and the
 * normal tier/date ranking fills whatever capacity is left. This is intentionally
 * pure so every UI/export can share the same decision and regression tests can
 * prove that a newly added event never displaces a locked one.
 */
export function resolveAnnouncementVideoLineup({
  sunday,
  capacity,
  candidates,
  picks,
  locks,
}: {
  sunday: Date;
  capacity: number;
  candidates: AnnouncementCandidate[];
  picks: AnnouncementPick[];
  locks: AnnouncementLock[];
}): AnnouncementVideoLineup {
  const day = atMidnight(sunday);
  const candidateByRequest = new Map<string, AnnouncementCandidate>();
  for (const candidate of candidates) {
    if (!candidateByRequest.has(candidate.requestId)) {
      candidateByRequest.set(candidate.requestId, candidate);
    }
  }

  const lockByRequest = new Map<string, AnnouncementLock>();
  for (const lock of [...locks].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    if (!lockByRequest.has(lock.requestId)) lockByRequest.set(lock.requestId, lock);
  }

  const selected = new Set<string>();
  const protectedEntries: AnnouncementLineupEntry[] = [];
  const issues: string[] = [];

  for (const pick of [...picks].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!pick.requestId) {
      const title = (pick.label ?? "").trim();
      if (!title) continue;
      protectedEntries.push({
        key: `label:${pick.id}`,
        pickId: pick.id,
        requestId: null,
        touchId: null,
        lockId: null,
        title,
        source: "awareness",
        locked: false,
        missingTouch: false,
        tier: 99,
        eventStart: null,
        registrationClosesAt: null,
        nextStepText: null,
        description: null,
        ministries: [],
        scheduledAt: day,
        content: null,
        touchStatus: null,
        deliverableStatus: null,
      });
      continue;
    }

    if (selected.has(pick.requestId)) continue;
    const request = pick.request;
    if (
      !request ||
      request.noPromo ||
      !PROMOTABLE_REQUEST_STATUSES.includes(request.status)
    ) {
      issues.push(`Picked event ${request?.title ?? pick.requestId} is no longer eligible.`);
      continue;
    }

    selected.add(pick.requestId);
    const candidate = candidateByRequest.get(pick.requestId);
    const lock = lockByRequest.get(pick.requestId) ?? null;
    if (candidate) {
      protectedEntries.push(candidateEntry(candidate, "manual", lock?.id ?? null, pick.id));
      continue;
    }

    issues.push(`${request.title} is featured but has no scheduled video slide for this Sunday.`);
    protectedEntries.push({
      key: request.id,
      pickId: pick.id,
      requestId: request.id,
      touchId: null,
      lockId: lock?.id ?? null,
      title: request.title,
      source: "manual",
      locked: lock != null,
      missingTouch: true,
      tier: request.tier,
      eventStart: request.eventStart,
      registrationClosesAt: request.registrationClosesAt,
      nextStepText: request.nextStepText,
      description: request.description,
      ministries: request.ministries,
      scheduledAt: day,
      content: null,
      touchStatus: null,
      deliverableStatus: null,
    });
  }

  for (const lock of [...lockByRequest.values()].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  )) {
    if (selected.has(lock.requestId)) continue;
    const candidate = candidateByRequest.get(lock.requestId);
    if (!candidate) {
      issues.push(`A locked video placement has no eligible slide (${lock.requestId}).`);
      continue;
    }
    selected.add(lock.requestId);
    protectedEntries.push(candidateEntry(candidate, "locked", lock.id));
  }

  const automatic = [...candidateByRequest.values()]
    .filter((candidate) => !selected.has(candidate.requestId))
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        a.eventStart.getTime() - b.eventStart.getTime() ||
        a.title.localeCompare(b.title),
    );

  if (protectedEntries.length > capacity) {
    issues.push(
      `${protectedEntries.length} featured or locked items exceed the video capacity of ${capacity}.`,
    );
  }
  const fillCount = Math.max(0, capacity - protectedEntries.length);
  const autoEntries = automatic
    .slice(0, fillCount)
    .map((candidate) => candidateEntry(candidate, "automatic", null));
  for (const entry of autoEntries) {
    if (entry.requestId) selected.add(entry.requestId);
  }

  const held = [...candidateByRequest.values()].filter(
    (candidate) => !selected.has(candidate.requestId),
  );
  return {
    sunday: day,
    capacity,
    entries: [...protectedEntries, ...autoEntries],
    held,
    issues,
  };
}

/** Load several Sunday lineups in four bounded queries, avoiding one query set per week. */
export async function loadAnnouncementVideoLineups(
  sundays: readonly Date[],
): Promise<Map<string, AnnouncementVideoLineup>> {
  const normalized = [...new Map(sundays.map((date) => {
    const day = atMidnight(date);
    return [localDayKey(day), day] as const;
  })).values()];
  const output = new Map<string, AnnouncementVideoLineup>();
  if (normalized.length === 0) return output;

  const channel = await db.channel.findUnique({
    where: { key: "announcement_video" },
    select: { id: true, capacity: true },
  });
  const capacity = channel?.capacity && channel.capacity > 0 ? channel.capacity : 3;
  if (!channel) {
    for (const sunday of normalized) {
      output.set(localDayKey(sunday), {
        sunday,
        capacity,
        entries: [],
        held: [],
        issues: ["Announcement Video channel is not configured."],
      });
    }
    return output;
  }

  const keys = new Set(normalized.map(localDayKey));
  const rangeStart = new Date(Math.min(...normalized.map((date) => date.getTime())));
  const rangeEnd = addDays(
    new Date(Math.max(...normalized.map((date) => date.getTime()))),
    1,
  );
  const [pickRows, touchRows, lockRows] = await Promise.all([
    db.videoTop3Item.findMany({
      where: { sunday: { in: normalized } },
      orderBy: [{ sunday: "asc" }, { sortOrder: "asc" }],
      select: {
        id: true,
        sunday: true,
        sortOrder: true,
        requestId: true,
        label: true,
        request: {
          select: {
            id: true,
            title: true,
            tier: true,
            eventStart: true,
            registrationClosesAt: true,
            nextStepText: true,
            description: true,
            status: true,
            noPromo: true,
            ministries: {
              orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
              select: { name: true, color: true },
            },
          },
        },
      },
    }),
    db.touch.findMany({
      where: {
        channelId: channel.id,
        scheduledAt: { gte: rangeStart, lt: rangeEnd },
        deliverable: {
          request: { status: { in: PROMOTABLE_REQUEST_STATUSES }, noPromo: false },
        },
      },
      orderBy: [
        { deliverable: { request: { tier: "asc" } } },
        { deliverable: { request: { eventStart: "asc" } } },
        { deliverable: { request: { title: "asc" } } },
      ],
      select: {
        id: true,
        scheduledAt: true,
        content: true,
        status: true,
        deliverable: {
          select: {
            status: true,
            request: {
              select: {
                id: true,
                title: true,
                tier: true,
                eventStart: true,
                registrationClosesAt: true,
                nextStepText: true,
                description: true,
                ministries: {
                  orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
                  select: { name: true, color: true },
                },
              },
            },
          },
        },
      },
    }),
    db.scheduleLock.findMany({
      where: {
        channelId: channel.id,
        scheduledAt: { gte: rangeStart, lt: rangeEnd },
      },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
      select: { id: true, requestId: true, scheduledAt: true, createdAt: true },
    }),
  ]);

  const picksByDay = new Map<string, AnnouncementPick[]>();
  for (const row of pickRows) {
    const key = localDayKey(row.sunday);
    if (!keys.has(key)) continue;
    picksByDay.set(key, [...(picksByDay.get(key) ?? []), row]);
  }
  const candidatesByDay = new Map<string, AnnouncementCandidate[]>();
  for (const row of touchRows) {
    const key = localDayKey(row.scheduledAt);
    if (!keys.has(key)) continue;
    const request = row.deliverable.request;
    const candidate: AnnouncementCandidate = {
      requestId: request.id,
      touchId: row.id,
      title: request.title,
      tier: request.tier,
      eventStart: request.eventStart,
      registrationClosesAt: request.registrationClosesAt,
      nextStepText: request.nextStepText,
      description: request.description,
      ministries: request.ministries,
      scheduledAt: row.scheduledAt,
      content: row.content,
      touchStatus: row.status,
      deliverableStatus: row.deliverable.status,
    };
    candidatesByDay.set(key, [...(candidatesByDay.get(key) ?? []), candidate]);
  }
  const locksByDay = new Map<string, AnnouncementLock[]>();
  for (const row of lockRows) {
    const key = localDayKey(row.scheduledAt);
    if (!keys.has(key)) continue;
    locksByDay.set(key, [...(locksByDay.get(key) ?? []), row]);
  }

  for (const sunday of normalized) {
    const key = localDayKey(sunday);
    output.set(
      key,
      resolveAnnouncementVideoLineup({
        sunday,
        capacity,
        candidates: candidatesByDay.get(key) ?? [],
        picks: picksByDay.get(key) ?? [],
        locks: locksByDay.get(key) ?? [],
      }),
    );
  }
  return output;
}

export async function loadAnnouncementVideoLineup(
  sunday: Date,
): Promise<AnnouncementVideoLineup> {
  const day = atMidnight(sunday);
  const lineups = await loadAnnouncementVideoLineups([day]);
  return lineups.get(localDayKey(day)) ?? {
    sunday: day,
    capacity: 3,
    entries: [],
    held: [],
    issues: ["Announcement Video lineup could not be loaded."],
  };
}

export function announcementLineupRequestIds(lineup: AnnouncementVideoLineup): string[] {
  return lineup.entries.flatMap((entry) => (entry.requestId ? [entry.requestId] : []));
}

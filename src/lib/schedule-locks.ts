import { db } from "@/lib/db";
import { atMidnight } from "@/lib/engine/dates";

export type ScheduleLockLite = {
  id: string;
  requestId: string;
  channelId: string;
  scheduledAt: Date;
};

export function localDayKey(d: Date): string {
  const day = atMidnight(d);
  const year = day.getFullYear();
  const month = String(day.getMonth() + 1).padStart(2, "0");
  const date = String(day.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

export function scheduleLockKey(requestId: string, channelId: string, scheduledAt: Date): string {
  return `${requestId}|${channelId}|${localDayKey(scheduledAt)}`;
}

export function scheduleLockLookup(locks: readonly ScheduleLockLite[]): Map<string, string> {
  return new Map(
    locks.map((lock) => [
      scheduleLockKey(lock.requestId, lock.channelId, lock.scheduledAt),
      lock.id,
    ]),
  );
}

export function preferredLockedRequestIds(locks: readonly Pick<ScheduleLockLite, "requestId">[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const lock of locks) {
    if (seen.has(lock.requestId)) continue;
    seen.add(lock.requestId);
    ids.push(lock.requestId);
  }
  return ids;
}

export function preferredLockedRequestIdsByDay(
  locks: readonly Pick<ScheduleLockLite, "requestId" | "scheduledAt">[],
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  const seenByDay = new Map<string, Set<string>>();
  for (const lock of locks) {
    const day = localDayKey(lock.scheduledAt);
    const seen = seenByDay.get(day) ?? new Set<string>();
    if (seen.has(lock.requestId)) continue;
    seen.add(lock.requestId);
    seenByDay.set(day, seen);
    grouped.set(day, [...(grouped.get(day) ?? []), lock.requestId]);
  }
  return grouped;
}

export async function scheduleLocksForChannelRange(
  channelId: string,
  start: Date,
  endExclusive: Date,
): Promise<ScheduleLockLite[]> {
  return db.scheduleLock.findMany({
    where: {
      channelId,
      scheduledAt: { gte: atMidnight(start), lt: atMidnight(endExclusive) },
    },
    select: { id: true, requestId: true, channelId: true, scheduledAt: true },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
  });
}

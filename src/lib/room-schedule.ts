export type RoomBookingTime = {
  id: string;
  startsAt: Date;
  endsAt: Date | null;
};

/** Keep schedule queries bounded without losing the time-of-day from `now`. */
export function roomScheduleEnd(now: Date, days: number): Date {
  const end = new Date(now);
  end.setDate(end.getDate() + days);
  return end;
}

/**
 * Return every booking involved in a true time overlap. Adjacent reservations
 * (one ends exactly when the next starts) are intentionally not conflicts.
 */
export function roomBookingConflictIds(
  bookings: readonly RoomBookingTime[],
): Set<string> {
  const ordered = [...bookings].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  );
  const conflicts = new Set<string>();

  for (let index = 0; index < ordered.length; index += 1) {
    const booking = ordered[index];
    if (!booking.endsAt || booking.endsAt <= booking.startsAt) continue;

    for (let candidateIndex = index + 1; candidateIndex < ordered.length; candidateIndex += 1) {
      const candidate = ordered[candidateIndex];
      if (candidate.startsAt >= booking.endsAt) break;
      if (!candidate.endsAt || candidate.endsAt <= candidate.startsAt) continue;

      conflicts.add(booking.id);
      conflicts.add(candidate.id);
    }
  }

  return conflicts;
}

export function roomBookingMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

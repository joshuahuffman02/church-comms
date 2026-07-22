import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Clock3,
  ExternalLink,
  MapPin,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  roomBookingConflictIds,
  roomBookingMonthKey,
  roomScheduleEnd,
} from "@/lib/room-schedule";

export const dynamic = "force-dynamic";

const DEFAULT_WINDOW_DAYS = 90;

const APPROVAL_META: Record<string, { label: string; cls: string }> = {
  A: { label: "Approved", cls: "bg-emerald-100 text-emerald-700" },
  P: { label: "Pending", cls: "bg-amber-100 text-amber-700" },
  R: { label: "Rejected", cls: "bg-rose-100 text-rose-700" },
};

const fmtDay = (date: Date) =>
  date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

const fmtTime = (date: Date) =>
  date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

function syncLabel(date: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 2) return "Just synced";
  if (minutes < 60) return `Synced ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Synced ${hours}h ago`;
  return `Synced ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-lg font-extrabold text-ink">{value}</div>
      <div className="mt-0.5 text-xs font-semibold text-muted">{label}</div>
    </div>
  );
}

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function RoomDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [{ id }, query] = await Promise.all([params, searchParams]);
  const showAll = firstParam(query.view) === "all";
  const now = new Date();
  const windowEnd = roomScheduleEnd(now, DEFAULT_WINDOW_DAYS);
  const nextThirtyDays = roomScheduleEnd(now, 30);

  const [room, bookingCountNextThirtyDays] = await Promise.all([
    db.pcoResource.findUnique({
      where: { id },
      include: {
        bookings: {
          where: {
            startsAt: showAll ? { gte: now } : { gte: now, lt: windowEnd },
          },
          orderBy: { startsAt: "asc" },
        },
        _count: {
          select: { bookings: { where: { startsAt: { gte: now } } } },
        },
      },
    }),
    db.pcoResourceBooking.count({
      where: {
        resourceId: id,
        startsAt: { gte: now, lt: nextThirtyDays },
      },
    }),
  ]);
  if (!room) notFound();

  const instanceIds = room.bookings
    .map((booking) => booking.eventInstanceId)
    .filter((value): value is string => !!value);
  const linked = instanceIds.length
    ? await db.request.findMany({
        where: { pcoEventId: { in: instanceIds } },
        select: { id: true, pcoEventId: true },
      })
    : [];
  const requestIdByInstance = new Map(
    linked.map((request) => [request.pcoEventId as string, request.id]),
  );

  const conflictIds = roomBookingConflictIds(room.bookings);
  const groupedBookings = new Map<string, typeof room.bookings>();
  for (const booking of room.bookings) {
    const key = roomBookingMonthKey(booking.startsAt);
    groupedBookings.set(key, [...(groupedBookings.get(key) ?? []), booking]);
  }

  const totalFutureBookings = room._count.bookings;
  const shownBookings = room.bookings.length;
  const nextBooking = room.bookings[0];

  return (
    <div className="max-w-5xl">
      <Link
        href="/rooms"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All rooms
      </Link>

      <header className="card-float mb-5 overflow-hidden">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:p-6">
          {room.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={room.imageUrl}
              alt=""
              className="h-24 w-full rounded-2xl object-cover shadow-sm sm:w-28"
            />
          ) : (
            <div className="grid h-24 w-full shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-sky-100 to-violet-100 text-sky-700 shadow-sm sm:w-28">
              <Building2 className="h-10 w-10" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="mb-1 text-xs font-extrabold uppercase tracking-[0.16em] text-sky-700">
                  Room schedule
                </p>
                <h1 className="text-2xl font-extrabold text-ink sm:text-3xl">{room.name}</h1>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-muted">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                {syncLabel(room.syncedAt, now)}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
              {room.homeLocation && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  {room.homeLocation}
                </span>
              )}
              {!room.active && <span className="font-semibold text-rose-600">Inactive in Planning Center</span>}
            </div>
            {room.description && <p className="mt-3 max-w-3xl text-sm text-muted">{room.description}</p>}
          </div>
        </div>

        <div className="border-t border-slate-100 bg-slate-50/70 p-4 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric
              label="Next booking"
              value={
                nextBooking
                  ? nextBooking.startsAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })
                  : "None scheduled"
              }
            />
            <Metric label="Bookings in next 30 days" value={String(bookingCountNextThirtyDays)} />
            <Metric label="All future bookings" value={String(totalFutureBookings)} />
          </div>
        </div>
      </header>

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
        <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
        <p>
          This is a schedule view only. To add, remove, or change a room booking,
          open the event in Planning Center Calendar.
        </p>
      </div>

      <section aria-labelledby="upcoming-room-bookings">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="upcoming-room-bookings" className="text-xl font-extrabold text-ink">
              Upcoming bookings
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              {showAll
                ? `Showing all ${shownBookings} future bookings.`
                : `Showing ${shownBookings} bookings in the next ${DEFAULT_WINDOW_DAYS} days.`}
            </p>
          </div>
          {showAll ? (
            <Link
              href={`/rooms/${room.id}`}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-ink hover:border-sky-300 hover:bg-sky-50"
            >
              Show next {DEFAULT_WINDOW_DAYS} days
            </Link>
          ) : totalFutureBookings > shownBookings ? (
            <Link
              href={`/rooms/${room.id}?view=all`}
              className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-bold text-sky-800 hover:bg-sky-100"
            >
              Show all {totalFutureBookings}
            </Link>
          ) : null}
        </div>

        {room.bookings.length === 0 ? (
          <div className="card-float bg-sky-bg/40 p-6">
            <div className="font-bold text-ink">
              {totalFutureBookings > 0
                ? `No bookings in the next ${DEFAULT_WINDOW_DAYS} days`
                : "No upcoming bookings"}
            </div>
            <p className="mt-1 text-sm text-muted">
              {totalFutureBookings > 0
                ? "There are later reservations. Use Show all to see the full future schedule."
                : "Planning Center does not currently have a future reservation for this room."}
            </p>
            {totalFutureBookings > 0 && (
              <Link
                href={`/rooms/${room.id}?view=all`}
                className="mt-3 inline-flex text-sm font-bold text-sky-700 hover:text-sky-900"
              >
                Show all {totalFutureBookings} bookings →
              </Link>
            )}
          </div>
        ) : (
          <div className="grid gap-7">
            {[...groupedBookings.entries()].map(([month, bookings]) => (
              <section key={month} aria-labelledby={`month-${month}`}>
                <div className="mb-2 flex items-center gap-3">
                  <h3 id={`month-${month}`} className="text-sm font-extrabold uppercase tracking-[0.12em] text-muted">
                    {bookings[0].startsAt.toLocaleDateString(undefined, {
                      month: "long",
                      year: "numeric",
                    })}
                  </h3>
                  <span className="h-px flex-1 bg-slate-200" />
                  <span className="text-xs font-semibold text-muted">
                    {bookings.length} {bookings.length === 1 ? "booking" : "bookings"}
                  </span>
                </div>

                <ol className="grid gap-3">
                  {bookings.map((booking) => {
                    const requestId = booking.eventInstanceId
                      ? requestIdByInstance.get(booking.eventInstanceId)
                      : undefined;
                    const approval = booking.approvalStatus
                      ? APPROVAL_META[booking.approvalStatus]
                      : undefined;
                    const hasConflict = conflictIds.has(booking.id);

                    return (
                      <li
                        key={booking.id}
                        className={`card-float overflow-hidden ${hasConflict ? "border-amber-300 bg-amber-50/40" : ""}`}
                      >
                        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                          <div className="flex shrink-0 items-center gap-3 sm:w-28">
                            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-violet-50 text-center">
                              <div>
                                <div className="text-[10px] font-extrabold uppercase text-violet-600">
                                  {booking.startsAt.toLocaleDateString(undefined, { weekday: "short" })}
                                </div>
                                <div className="text-xl font-extrabold leading-none text-ink">
                                  {booking.startsAt.getDate()}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-bold text-ink">{booking.eventTitle ?? "Booked"}</h4>
                              {approval && (
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${approval.cls}`}>
                                  {approval.label}
                                </span>
                              )}
                              {hasConflict && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                                  <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                                  Time overlap
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-sm text-muted">
                              {fmtDay(booking.startsAt)}
                            </p>
                            <p className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
                              <Clock3 className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                              {fmtTime(booking.startsAt)}
                              {booking.endsAt && <> – {fmtTime(booking.endsAt)}</>}
                            </p>
                          </div>

                          {(requestId || booking.churchCenterUrl) && (
                            <div className="flex shrink-0 flex-wrap gap-2 sm:max-w-56 sm:justify-end">
                              {requestId && (
                                <Link
                                  href={`/requests/${requestId}`}
                                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-ink hover:border-sky-300 hover:bg-sky-50"
                                >
                                  Open event
                                </Link>
                              )}
                              {booking.churchCenterUrl && (
                                <a
                                  href={booking.churchCenterUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800 hover:bg-sky-100"
                                >
                                  Planning Center
                                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CalendarRange,
  Clock3,
  MapPin,
  RefreshCw,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { pcoConfigured } from "@/lib/pco";
import { roomScheduleEnd } from "@/lib/room-schedule";

export const dynamic = "force-dynamic";

const fmtNext = (date: Date) =>
  `${date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })}, ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;

function syncLabel(date: Date | null, now: Date): string {
  if (!date) return "Waiting for sync";
  const minutes = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 2) return "Just synced";
  if (minutes < 60) return `Synced ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Synced ${hours}h ago`;
  return `Synced ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

/** Friendly card explaining how to populate the Rooms list. */
function EmptyState({ configured }: { configured: boolean }) {
  return (
    <div className="card-float max-w-2xl bg-sky-bg/40 p-6">
      <div className="mb-2 text-lg font-bold">
        {configured ? "No rooms synced yet" : "Planning Center isn't connected yet"}
      </div>
      {configured ? (
        <p className="text-sm text-muted">
          Rooms appear automatically after the Planning Center sync runs. If you
          just connected it, give the sync a few minutes.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted">
            Connect Planning Center once to see its bookable rooms and upcoming
            reservations here. This app reads that schedule but never changes it.
          </p>
          <details className="mt-3 rounded-2xl border bg-white px-4 py-3 text-sm">
            <summary className="cursor-pointer select-none font-semibold text-ink">
              Setup details for your tech helper
            </summary>
            <p className="mt-2 text-muted">
              Add Planning Center API credentials to the server&apos;s{" "}
              <code className="font-mono">.env</code> file, restart the app, then
              let <code className="font-mono">/api/cron/sync-events</code> run.
            </p>
          </details>
        </>
      )}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="card-float flex items-center gap-3 px-4 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="truncate text-lg font-extrabold text-ink">{value}</div>
        <div className="text-xs font-semibold text-muted">{label}</div>
      </div>
    </div>
  );
}

export default async function RoomsIndex() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const now = new Date();
  const nextWeek = roomScheduleEnd(now, 7);

  const [rooms, bookingsNextWeek, latestSync] = await Promise.all([
    db.pcoResource.findMany({
      where: { active: true, kind: "Room" },
      orderBy: { name: "asc" },
      include: {
        bookings: {
          where: { startsAt: { gte: now } },
          orderBy: { startsAt: "asc" },
          take: 1,
          select: { startsAt: true, eventTitle: true },
        },
        _count: {
          select: { bookings: { where: { startsAt: { gte: now } } } },
        },
      },
    }),
    db.pcoResourceBooking.count({
      where: {
        startsAt: { gte: now, lt: nextWeek },
        resource: { active: true, kind: "Room" },
      },
    }),
    db.pcoResource.aggregate({
      where: { active: true, kind: "Room" },
      _max: { syncedAt: true },
    }),
  ]);

  const configured = pcoConfigured();
  const scheduledRooms = rooms
    .filter((room) => room.bookings[0])
    .sort(
      (a, b) =>
        a.bookings[0].startsAt.getTime() - b.bookings[0].startsAt.getTime(),
    );
  const quietRooms = rooms.filter((room) => !room.bookings[0]);
  const futureBookings = rooms.reduce(
    (total, room) => total + room._count.bookings,
    0,
  );

  return (
    <div className="max-w-6xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-extrabold uppercase tracking-[0.18em] text-sky-700">
            Planning Center schedule
          </p>
          <h1 className="text-3xl font-extrabold text-ink">Rooms</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            See which church spaces are busy next. Add, remove, or change a room
            reservation in Planning Center Calendar; this page stays read-only.
          </p>
        </div>
        {rooms.length > 0 && (
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-muted">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            {syncLabel(latestSync._max.syncedAt, now)}
          </span>
        )}
      </div>

      {rooms.length === 0 ? (
        <EmptyState configured={configured} />
      ) : (
        <>
          <section aria-label="Room schedule summary" className="mb-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              icon={<Building2 className="h-4 w-4" aria-hidden="true" />}
              value={String(rooms.length)}
              label="rooms from Planning Center"
            />
            <Metric
              icon={<CalendarRange className="h-4 w-4" aria-hidden="true" />}
              value={String(scheduledRooms.length)}
              label="rooms with upcoming bookings"
            />
            <Metric
              icon={<CalendarDays className="h-4 w-4" aria-hidden="true" />}
              value={String(futureBookings)}
              label="future room bookings"
            />
            <Metric
              icon={<Clock3 className="h-4 w-4" aria-hidden="true" />}
              value={String(bookingsNextWeek)}
              label="bookings in the next 7 days"
            />
          </section>

          <section aria-labelledby="active-room-schedules">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 id="active-room-schedules" className="text-xl font-extrabold text-ink">
                  Active schedules
                </h2>
                <p className="text-sm text-muted">
                  Rooms with a future reservation, ordered by what is booked next.
                </p>
              </div>
              <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-800">
                {scheduledRooms.length} {scheduledRooms.length === 1 ? "room" : "rooms"}
              </span>
            </div>

            {scheduledRooms.length === 0 ? (
              <div className="card-float bg-sky-bg/40 p-6 text-sm text-muted">
                No future room bookings are currently synced.
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {scheduledRooms.map((room) => {
                  const next = room.bookings[0];
                  const upcoming = room._count.bookings;
                  return (
                    <Link
                      key={room.id}
                      href={`/rooms/${room.id}`}
                      className="card-float group flex min-h-40 overflow-hidden transition hover:-translate-y-0.5 hover:border-sky-200"
                    >
                      {room.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={room.imageUrl}
                          alt=""
                          className="hidden w-32 object-cover sm:block"
                        />
                      ) : (
                        <div className="hidden w-28 shrink-0 place-items-center bg-gradient-to-br from-sky-100 to-violet-100 text-sky-700 sm:grid">
                          <Building2 className="h-9 w-9" aria-hidden="true" />
                        </div>
                      )}
                      <div className="flex min-w-0 flex-1 flex-col p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-extrabold text-ink">{room.name}</h3>
                            {room.homeLocation && (
                              <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                                {room.homeLocation}
                              </p>
                            )}
                          </div>
                          <ArrowRight className="h-4 w-4 shrink-0 text-sky-600 transition group-hover:translate-x-1" aria-hidden="true" />
                        </div>
                        <div className="mt-auto pt-5">
                          <p className="text-xs font-bold uppercase tracking-wide text-muted">
                            Next booking
                          </p>
                          <p className="mt-1 font-semibold text-ink">
                            {next.eventTitle ?? "Booked"}
                          </p>
                          <p className="mt-0.5 text-sm text-muted">{fmtNext(next.startsAt)}</p>
                          <p className="mt-2 text-xs font-semibold text-sky-700">
                            {upcoming} upcoming {upcoming === 1 ? "booking" : "bookings"}
                          </p>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          {quietRooms.length > 0 && (
            <details className="card-float group mt-7 overflow-hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 select-none [&::-webkit-details-marker]:hidden">
                <div>
                  <h2 className="font-extrabold text-ink">Rooms without upcoming bookings</h2>
                  <p className="mt-0.5 text-sm text-muted">
                    Kept out of the main schedule so empty and duplicate rooms do not
                    crowd the page.
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-muted">
                  Show {quietRooms.length}
                </span>
              </summary>
              <div className="grid gap-2 border-t border-slate-100 bg-slate-50/60 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {quietRooms.map((room) => {
                  const doNotUse = /do not use|duplicate|\bdupe\b/i.test(room.name);
                  return (
                    <Link
                      key={room.id}
                      href={`/rooms/${room.id}`}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 transition hover:border-sky-300 hover:bg-sky-50/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-ink">{room.name}</span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                      </div>
                      <p className={`mt-1 text-xs ${doNotUse ? "font-semibold text-rose-600" : "text-muted"}`}>
                        {doNotUse ? "Marked do not use in Planning Center" : "No future bookings"}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { pcoConfigured } from "@/lib/pco";

export const dynamic = "force-dynamic";

const fmtNext = (d: Date) =>
  d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }) +
  ", " +
  d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** Friendly card explaining how to populate the Rooms list. */
function EmptyState({ configured }: { configured: boolean }) {
  return (
    <div className="card-float p-6 bg-sky-bg/40 max-w-2xl">
      <div className="text-lg font-bold mb-2">
        {configured ? "No rooms synced yet" : "Connect Planning Center"}
      </div>
      {configured ? (
        <p className="text-sm text-muted">
          Rooms come from Planning Center Calendar. Run the sync to pull them in —
          the scheduled job at{" "}
          <code className="font-mono">/api/cron/sync-events</code> does this
          automatically, or you can trigger it manually. Rooms and their upcoming
          bookings will appear here, read-only.
        </p>
      ) : (
        <p className="text-sm text-muted">
          Add Planning Center API credentials to your <code>.env</code> file, then
          restart the app and run the sync. Your bookable rooms — and every
          upcoming event in each — will appear here. Planning Center stays the
          source of truth; this is a one-way, read-only pull.
        </p>
      )}
    </div>
  );
}

export default async function RoomsIndex() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const now = new Date();

  // Active ROOMS only, each with its soonest future booking for a "next booked"
  // hint. (Resources that aren't rooms are intentionally hidden here.)
  const rooms = await db.pcoResource.findMany({
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
  });

  const configured = pcoConfigured();

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-1">Rooms 🏠</h1>
      <p className="text-muted mb-5">
        Spaces from Planning Center Calendar. Click a room to see every upcoming
        event booked in it. Read-only — Planning Center stays the source of truth.
      </p>

      {rooms.length === 0 ? (
        <EmptyState configured={configured} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => {
            const next = room.bookings[0];
            const upcoming = room._count.bookings;
            return (
              <Link
                key={room.id}
                href={`/rooms/${room.id}`}
                className="card-float overflow-hidden flex flex-col"
              >
                {room.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={room.imageUrl}
                    alt=""
                    className="h-32 w-full object-cover"
                  />
                ) : (
                  <div className="h-32 w-full bg-gradient-to-br from-sky-100 to-violet-100 grid place-items-center text-3xl">
                    🏠
                  </div>
                )}
                <div className="p-4 flex-1 flex flex-col">
                  <div className="font-bold text-ink">{room.name}</div>
                  {room.homeLocation && (
                    <div className="text-sm text-muted mt-0.5">
                      📍 {room.homeLocation}
                    </div>
                  )}
                  {room.quantity != null && (
                    <div className="text-sm text-muted mt-0.5">
                      Capacity {room.quantity}
                    </div>
                  )}
                  <div className="mt-3 pt-3 border-t border-slate-100 text-sm">
                    {next ? (
                      <>
                        <span className="font-semibold text-ink">
                          Next: {fmtNext(next.startsAt)}
                        </span>
                        {next.eventTitle && (
                          <span className="text-muted"> · {next.eventTitle}</span>
                        )}
                        <div className="text-xs text-muted mt-0.5">
                          {upcoming} upcoming{" "}
                          {upcoming === 1 ? "booking" : "bookings"}
                        </div>
                      </>
                    ) : (
                      <span className="text-muted">No upcoming bookings</span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

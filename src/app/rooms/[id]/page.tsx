import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// PCO approval codes → a soft badge. Bookings often carry "A" (approved) /
// "P" (pending) / "R" (rejected); we render whatever's present, defaulting to a
// neutral pill for unknown codes.
const APPROVAL_META: Record<string, { label: string; cls: string }> = {
  A: { label: "Approved", cls: "bg-emerald-100 text-emerald-700" },
  P: { label: "Pending", cls: "bg-amber-100 text-amber-700" },
  R: { label: "Rejected", cls: "bg-rose-100 text-rose-700" },
};

const fmtDay = (d: Date) =>
  d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

const fmtTime = (d: Date) =>
  d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export default async function RoomDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const now = new Date();

  const room = await db.pcoResource.findUnique({
    where: { id },
    include: {
      bookings: {
        where: { startsAt: { gte: now } },
        orderBy: { startsAt: "asc" },
      },
    },
  });
  if (!room) notFound();

  // Resolve which bookings map to an imported Request (eventInstanceId ===
  // Request.pcoEventId) so we can deep-link those to the request detail page.
  const instanceIds = room.bookings
    .map((b) => b.eventInstanceId)
    .filter((v): v is string => !!v);
  const linked = instanceIds.length
    ? await db.request.findMany({
        where: { pcoEventId: { in: instanceIds } },
        select: { id: true, pcoEventId: true },
      })
    : [];
  const requestIdByInstance = new Map(
    linked.map((r) => [r.pcoEventId as string, r.id]),
  );

  return (
    <div className="max-w-3xl">
      <Link
        href="/rooms"
        className="text-sm text-muted hover:text-ink inline-flex items-center gap-1 mb-3"
      >
        ← All rooms
      </Link>

      <div className="flex items-start gap-4 mb-6">
        {room.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={room.imageUrl}
            alt=""
            className="h-20 w-20 rounded-2xl object-cover shadow-sm"
          />
        ) : (
          <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-sky-100 to-violet-100 grid place-items-center text-3xl shadow-sm">
            🏠
          </div>
        )}
        <div>
          <h1 className="text-2xl font-extrabold">{room.name}</h1>
          <div className="text-muted text-sm mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
            {room.homeLocation && <span>📍 {room.homeLocation}</span>}
            {room.quantity != null && <span>Capacity {room.quantity}</span>}
            {!room.active && <span className="text-rose-600">Inactive in PCO</span>}
          </div>
          {room.description && (
            <p className="text-sm text-muted mt-2">{room.description}</p>
          )}
        </div>
      </div>

      <h2 className="text-lg font-bold mb-3">Upcoming events</h2>

      {room.bookings.length === 0 ? (
        <div className="card-float p-6 bg-sky-bg/40 text-sm text-muted">
          No upcoming bookings for this room.
        </div>
      ) : (
        <ol className="grid gap-3">
          {room.bookings.map((b) => {
            const requestId = b.eventInstanceId
              ? requestIdByInstance.get(b.eventInstanceId)
              : undefined;
            const approval = b.approvalStatus
              ? APPROVAL_META[b.approvalStatus]
              : undefined;
            const title = b.eventTitle ?? "Booked";

            const inner = (
              <div className="card-float p-4 flex items-start gap-4">
                <div className="text-center shrink-0 w-16">
                  <div className="text-xs font-bold uppercase text-violet-500">
                    {b.startsAt.toLocaleDateString(undefined, { month: "short" })}
                  </div>
                  <div className="text-2xl font-extrabold leading-tight text-ink">
                    {b.startsAt.getDate()}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-ink flex items-center gap-2 flex-wrap">
                    {title}
                    {approval && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${approval.cls}`}
                      >
                        {approval.label}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted mt-0.5">
                    {fmtDay(b.startsAt)} · {fmtTime(b.startsAt)}
                    {b.endsAt && <>–{fmtTime(b.endsAt)}</>}
                  </div>
                  {(requestId || b.churchCenterUrl) && (
                    <div className="text-xs font-semibold text-sky-600 mt-1">
                      {requestId
                        ? "View request →"
                        : "View in Church Center →"}
                    </div>
                  )}
                </div>
              </div>
            );

            // Deep-link to the imported Request when we have one; else the PCO
            // Church Center URL; else render a plain (unlinked) card.
            if (requestId) {
              return (
                <li key={b.id}>
                  <Link href={`/requests/${requestId}`}>{inner}</Link>
                </li>
              );
            }
            if (b.churchCenterUrl) {
              return (
                <li key={b.id}>
                  <a
                    href={b.churchCenterUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {inner}
                  </a>
                </li>
              );
            }
            return <li key={b.id}>{inner}</li>;
          })}
        </ol>
      )}
    </div>
  );
}

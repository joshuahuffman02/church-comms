import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { REQUEST_STATUSES, REQUEST_STATUS_META } from "@/lib/status";

const fmtDate = (d: Date | null | undefined) =>
  d
    ? d.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "—";

export default async function StatusPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Read-only lookup by status token. Select ONLY public-safe fields — never
  // load deliverables or other requests; nothing internal leaks here.
  const request = await db.request.findUnique({
    where: { statusToken: token },
    select: {
      title: true,
      eventStart: true,
      requesterName: true,
      status: true,
    },
  });

  if (!request) notFound();

  const currentIndex = REQUEST_STATUSES.indexOf(
    request.status as (typeof REQUEST_STATUSES)[number]
  );
  const meta = REQUEST_STATUS_META[request.status] ?? {
    label: request.status,
    color: "#94a3b8",
  };
  const isSideState = currentIndex < 0;

  return (
    <div className="mx-auto max-w-2xl py-6">
      <div className="mb-5 text-center">
        <h1 className="text-3xl font-extrabold">Request received ✅</h1>
        <p className="text-muted mt-1">Here&apos;s where your request stands.</p>
      </div>

      <div className="card-float p-6 grid gap-4">
        <div>
          <h2 className="text-2xl font-extrabold">{request.title}</h2>
          <div className="mt-2 grid gap-1 text-sm text-muted">
            <div>📅 {fmtDate(request.eventStart)}</div>
            {request.requesterName && <div>🙋 {request.requesterName}</div>}
          </div>
        </div>

        {/* Current status */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">Status:</span>
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: `${meta.color}22`, color: meta.color }}
          >
            {meta.label}
          </span>
        </div>

        {/* Stepper (linear flow only; side states show the chip above) */}
        {!isSideState && (
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {REQUEST_STATUSES.map((s, i) => {
              const stepMeta = REQUEST_STATUS_META[s];
              const isPast = i < currentIndex;
              const isCurrent = i === currentIndex;
              const filled = isPast || isCurrent;
              return (
                <div key={s} className="flex items-center shrink-0">
                  <div className="flex flex-col items-center" style={{ minWidth: 76 }}>
                    <div
                      className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold"
                      style={{
                        background: filled ? stepMeta.color : "#e2e8f0",
                        color: filled ? "#fff" : "#94a3b8",
                        boxShadow: isCurrent ? `0 0 0 4px ${stepMeta.color}33` : "none",
                      }}
                    >
                      {isPast ? "✓" : i + 1}
                    </div>
                    <span
                      className="mt-1 text-[10px] text-center font-semibold"
                      style={{ color: isCurrent ? stepMeta.color : "#94a3b8" }}
                    >
                      {stepMeta.label}
                    </span>
                  </div>
                  {i < REQUEST_STATUSES.length - 1 && (
                    <div
                      className="h-0.5 w-5 shrink-0"
                      style={{ background: i < currentIndex ? stepMeta.color : "#e2e8f0" }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-sm text-muted border-t border-slate-100 pt-4">
          The comms team reviews new requests Mon &amp; Thu.
        </p>
      </div>
    </div>
  );
}

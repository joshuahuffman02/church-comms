import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { REQUEST_STATUS_META } from "@/lib/status";

const fmtDate = (d: Date | null | undefined) =>
  d
    ? d.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "—";

// The public-facing milestones a requester actually cares about — plain words,
// not the internal stage names (Triaged, In Production, Proof). Internal stages
// map onto these so an outside requester never sees workflow jargon.
const PUBLIC_STEPS = [
  { key: "submitted", label: "Received" },
  { key: "triaged", label: "Being reviewed" },
  { key: "approved", label: "Approved" },
  { key: "in_production", label: "Being designed" },
  { key: "proof", label: "Final check" },
  { key: "scheduled", label: "Scheduled" },
  { key: "published", label: "Shared" },
] as const;

const STEP_COLOR = "#a78bfa";

/** Where the request sits on the public ladder. "archived" counts as fully done. */
function publicIndex(status: string): number {
  if (status === "archived") return PUBLIC_STEPS.length - 1;
  return PUBLIC_STEPS.findIndex((s) => s.key === status);
}

type Tone = {
  heading: string;
  blurb: string;
  footer: string;
  ok: boolean; // controls the green-check styling
};

function toneFor(status: string, name: string | null): Tone {
  const hi = name ? `, ${name}` : "";
  switch (status) {
    case "declined":
      return {
        heading: "We couldn't move this one forward",
        blurb: "The comms team wasn't able to take this request on.",
        footer: "If you have questions, just reply to the confirmation email and the team will explain.",
        ok: false,
      };
    case "cancelled":
      return {
        heading: "This request was cancelled",
        blurb: "It's no longer in the queue.",
        footer: "If that's a surprise, reply to the confirmation email and we'll take a look.",
        ok: false,
      };
    case "needs_info":
      return {
        heading: "We need a little more info",
        blurb: "The comms team has a question before they can move ahead.",
        footer: "Keep an eye on your email — the team will reach out, or you can reply to your confirmation email.",
        ok: false,
      };
    case "published":
    case "archived":
      return {
        heading: "All set — it's been shared 🎉",
        blurb: "Your event is out across its channels.",
        footer: "Thanks for planning ahead!",
        ok: true,
      };
    default:
      return {
        heading: `Request received ✅`,
        blurb: `Thanks${hi} — here's where your request stands.`,
        footer: "The comms team reviews new requests Mon & Thu.",
        ok: true,
      };
  }
}

export default async function StatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { token } = await params;
  const { new: isNew } = await searchParams;

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

  const idx = publicIndex(request.status);
  const isSideState = idx < 0;
  const meta = REQUEST_STATUS_META[request.status] ?? { label: request.status, color: "#94a3b8" };
  const tone = toneFor(request.status, request.requesterName);
  const currentLabel = isSideState ? meta.label : PUBLIC_STEPS[idx].label;

  return (
    <div className="mx-auto max-w-2xl py-6">
      <div className="mb-5 text-center">
        <h1 className="text-3xl font-extrabold">{tone.heading}</h1>
        <p className="text-muted mt-1">{tone.blurb}</p>
      </div>

      {isNew === "1" && (
        <div className="mb-4 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-800">
          Your request is in — we&apos;ve emailed you this tracking link.{" "}
          <b>Bookmark this page</b> to check back anytime.
        </div>
      )}

      <div className="card-float p-6 grid gap-4">
        <div>
          <h2 className="text-2xl font-extrabold">{request.title}</h2>
          <div className="mt-2 grid gap-1 text-sm text-muted">
            <div>📅 {fmtDate(request.eventStart)}</div>
            {request.requesterName && <div>🙋 {request.requesterName}</div>}
          </div>
        </div>

        {/* Plain-language current status */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">Status:</span>
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{
              background: tone.ok ? `${STEP_COLOR}22` : `${meta.color}22`,
              color: tone.ok ? STEP_COLOR : meta.color,
            }}
          >
            {currentLabel}
          </span>
        </div>

        {/* Compact mobile summary (no horizontal clipping) + full stepper on wider screens. */}
        {!isSideState && (
          <>
            <p className="text-sm font-semibold text-ink sm:hidden">
              Step {idx + 1} of {PUBLIC_STEPS.length} — {PUBLIC_STEPS[idx].label}
            </p>
            <div className="hidden items-center gap-1 overflow-x-auto pb-2 sm:flex">
              {PUBLIC_STEPS.map((s, i) => {
                const isPast = i < idx;
                const isCurrent = i === idx;
                const filled = isPast || isCurrent;
                return (
                  <div key={s.key} className="flex shrink-0 items-center">
                    <div className="flex flex-col items-center" style={{ minWidth: 76 }}>
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold"
                        style={{
                          background: filled ? STEP_COLOR : "#e2e8f0",
                          color: filled ? "#fff" : "#94a3b8",
                          boxShadow: isCurrent ? `0 0 0 4px ${STEP_COLOR}33` : "none",
                        }}
                      >
                        {isPast ? "✓" : i + 1}
                      </div>
                      <span
                        className="mt-1 text-center text-[10px] font-semibold"
                        style={{ color: isCurrent ? STEP_COLOR : "#94a3b8" }}
                      >
                        {s.label}
                      </span>
                    </div>
                    {i < PUBLIC_STEPS.length - 1 && (
                      <div
                        className="h-0.5 w-5 shrink-0"
                        style={{ background: i < idx ? STEP_COLOR : "#e2e8f0" }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        <p className="border-t border-slate-100 pt-4 text-sm text-muted">{tone.footer}</p>
      </div>

      <p className="mt-4 text-center text-xs text-muted">
        Keep this link handy — it&apos;s your private window into this request&apos;s status.
      </p>
    </div>
  );
}

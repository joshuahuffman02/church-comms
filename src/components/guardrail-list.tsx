import Link from "next/link";
import type { Guardrail } from "@/lib/guardrails";

const KIND_LABEL: Record<Guardrail["kind"], string> = {
  stage_cap: "Top-3 video / stage — pick your three",
  loop_cap: "Loop over capacity",
  promo_density: "Busy weeks (FYI)",
  reach_tier: "Reach vs tier",
};

// Severity → soft theme colors. block = red-ish (decision), warn = amber-ish,
// info = muted slate (informational, not an alarm).
function severityClasses(severity: Guardrail["severity"]): string {
  if (severity === "block") return "bg-rose-50 border border-rose-200";
  if (severity === "warn") return "bg-amber-50 border border-amber-200";
  return "bg-slate-50 border border-slate-200";
}

function severityChip(severity: Guardrail["severity"]) {
  if (severity === "block")
    return (
      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
        Needs a decision
      </span>
    );
  if (severity === "warn")
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
        Heads up
      </span>
    );
  return (
    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
      FYI
    </span>
  );
}

/**
 * Reusable presentational list of guardrails. Used by both the global
 * `/guardrails` page and the per-request "Heads-up" panel. Each guardrail is a
 * `.card-float` row colored by severity, showing its message, date, channel and
 * links to the involved requests. If `grouped`, splits by kind with headers.
 */
export function GuardrailList({
  guardrails,
  grouped = false,
}: {
  guardrails: Guardrail[];
  grouped?: boolean;
}) {
  if (guardrails.length === 0) {
    return <div className="text-muted text-sm">All clear ✨</div>;
  }

  if (!grouped) {
    return (
      <div className="grid gap-2">
        {guardrails.map((g, i) => (
          <GuardrailRow key={i} g={g} />
        ))}
      </div>
    );
  }

  // Group by kind, preserving first-seen order.
  const order: Guardrail["kind"][] = [];
  const byKind = new Map<Guardrail["kind"], Guardrail[]>();
  for (const g of guardrails) {
    if (!byKind.has(g.kind)) {
      byKind.set(g.kind, []);
      order.push(g.kind);
    }
    byKind.get(g.kind)!.push(g);
  }

  return (
    <div className="grid gap-5">
      {order.map((kind) => (
        <section key={kind}>
          <h2 className="font-bold mb-2">
            {KIND_LABEL[kind]}{" "}
            <span className="text-muted font-normal">({byKind.get(kind)!.length})</span>
          </h2>
          <div className="grid gap-2">
            {byKind.get(kind)!.map((g, i) => (
              <GuardrailRow key={i} g={g} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** "announcement_video" -> "Announcement Video" for friendly display. */
function prettyChannel(key: string): string {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** "2026-06-07" -> "Sun, Jun 7" (parsed as a local date, no UTC shift). */
function prettyDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function GuardrailRow({ g }: { g: Guardrail }) {
  // Prefer the labelled requests; fall back to bare ids so older shapes still link.
  const events = g.requests ?? (g.requestIds ?? []).map((id) => ({ id, title: "View event" }));
  return (
    <div className={`card-float p-4 ${severityClasses(g.severity)}`}>
      <div className="flex items-center gap-2 flex-wrap">
        {severityChip(g.severity)}
        {g.channelKey && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-muted">
            {prettyChannel(g.channelKey)}
          </span>
        )}
        {g.whenISO && <span className="text-xs text-muted">{prettyDate(g.whenISO)}</span>}
      </div>
      <p className="mt-2 text-sm">{g.message}</p>
      {events.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold text-muted mb-1">The events involved:</p>
          <div className="flex flex-wrap gap-2">
            {events.map((e) => (
              <Link
                key={e.id}
                href={`/requests/${e.id}`}
                className="rounded-full bg-white/70 border px-3 py-1 text-xs font-semibold hover:bg-white transition"
              >
                {e.title} →
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { ArrowRight, Check, Circle, Sparkles } from "lucide-react";
import type { RequestReadiness } from "@/lib/smart-workflow";

const TONE = {
  urgent: {
    border: "border-l-rose-500",
    panel: "bg-rose-50 text-rose-900",
    button: "bg-rose-700 text-white hover:bg-rose-800",
  },
  attention: {
    border: "border-l-amber-500",
    panel: "bg-amber-50 text-amber-950",
    button: "bg-amber-800 text-white hover:bg-amber-900",
  },
  steady: {
    border: "border-l-sky-500",
    panel: "bg-sky-50 text-sky-950",
    button: "bg-sky-700 text-white hover:bg-sky-800",
  },
  ready: {
    border: "border-l-emerald-500",
    panel: "bg-emerald-50 text-emerald-950",
    button: "bg-emerald-700 text-white hover:bg-emerald-800",
  },
} as const;

export function EventReadiness({ readiness }: { readiness: RequestReadiness }) {
  const tone = TONE[readiness.nextAction.tone];

  return (
    <section
      className={`card-float mb-4 overflow-hidden border-l-[6px] p-5 ${tone.border}`}
      aria-labelledby="event-readiness-heading"
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.72fr)] lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-violet-700">
              <Sparkles className="h-4 w-4" aria-hidden />
              Smart event summary
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
              {readiness.complete} of {readiness.total} ready
            </span>
          </div>
          <h2 id="event-readiness-heading" className="mt-2 text-2xl font-extrabold text-ink">
            {readiness.label}
          </h2>
          <div
            className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200"
            role="progressbar"
            aria-label="Event readiness"
            aria-valuemin={0}
            aria-valuemax={readiness.total}
            aria-valuenow={readiness.complete}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 to-violet-500 transition-[width]"
              style={{ width: `${readiness.percent}%` }}
            />
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-bold text-sky-700 hover:underline">
              Why this readiness summary?
            </summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {readiness.checks.map((check) => (
                <a
                  key={check.key}
                  href={check.href}
                  className={`flex items-start gap-2 rounded-2xl border px-3 py-2.5 text-sm ${
                    check.complete
                      ? "border-emerald-100 bg-emerald-50/70"
                      : "border-slate-200 bg-white/70"
                  }`}
                >
                  {check.complete ? (
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-600 text-white">
                      <Check className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  ) : (
                    <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden />
                  )}
                  <span>
                    <span className="block font-bold text-ink">{check.label}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted">{check.detail}</span>
                  </span>
                </a>
              ))}
            </div>
          </details>
        </div>

        <div className={`rounded-3xl p-5 ${tone.panel}`}>
          <p className="text-xs font-extrabold uppercase tracking-wide opacity-70">Recommended next</p>
          <h3 className="mt-2 text-xl font-extrabold">{readiness.nextAction.title}</h3>
          <p className="mt-1 text-sm leading-relaxed opacity-80">{readiness.nextAction.detail}</p>
          <a
            href={readiness.nextAction.href}
            className={`mt-4 inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-sm font-extrabold transition ${tone.button}`}
          >
            Go to next action
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </div>

      <nav className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4" aria-label="Jump to event section">
        {[
          ["#status", "Status"],
          ["#message-plan", "Message"],
          ["#channels", "Channels"],
          ["#pieces", "Pieces"],
          ["#assets", "Assets"],
          ["#timeline", "Timeline"],
          ["#history", "History"],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="inline-flex min-h-10 items-center rounded-full border border-slate-200 bg-white/70 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-sky-bg hover:text-sky-800"
          >
            {label}
          </a>
        ))}
      </nav>
    </section>
  );
}

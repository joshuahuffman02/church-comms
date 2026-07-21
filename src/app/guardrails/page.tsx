import { getGuardrails } from "@/lib/guardrails-service";
import { buildGuardrailOverview } from "@/lib/guardrails";
import { GuardrailInfoSummary, GuardrailList } from "@/components/guardrail-list";
import { prettyDate } from "@/lib/labels";

export const dynamic = "force-dynamic";

function SummaryCard({ label, value, detail, tone = "slate" }: {
  label: string;
  value: string | number;
  detail: string;
  tone?: "slate" | "rose" | "amber" | "sky";
}) {
  const tones = {
    slate: "border-slate-200 bg-white",
    rose: "border-rose-200 bg-rose-50/70",
    amber: "border-amber-200 bg-amber-50/70",
    sky: "border-sky-200 bg-sky-50/70",
  };
  return (
    <div className={`rounded-2xl border p-3 sm:p-4 ${tones[tone]}`}>
      <div className="text-xs font-extrabold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-extrabold text-ink">{value}</div>
      <div className="mt-1 text-xs leading-relaxed text-muted">{detail}</div>
    </div>
  );
}

export default async function GuardrailsPage() {
  const today = new Date();
  const guardrails = await getGuardrails(today);
  const overview = buildGuardrailOverview(guardrails, today);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5">
        <p className="text-xs font-extrabold uppercase tracking-wide text-sky-700">Schedule safety desk</p>
        <h1 className="mt-1 text-3xl font-extrabold text-ink">Heads-up</h1>
        <p className="mt-2 max-w-3xl text-muted">
          Resolve the decisions that can change a lineup, then keep later conflicts and busy-week notes out of the way until you need them.
        </p>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Guardrail summary">
        <SummaryCard
          label="Needs a decision"
          value={overview.summary.actionableCount}
          detail="Lineups or event settings that need a person to choose."
          tone={overview.summary.actionableCount > 0 ? "rose" : "slate"}
        />
        <SummaryCard
          label="Next 30 days"
          value={overview.summary.dueSoonCount}
          detail="The short list to resolve before looking farther ahead."
          tone={overview.summary.dueSoonCount > 0 ? "amber" : "slate"}
        />
        <SummaryCard
          label="Next decision"
          value={overview.summary.nextDecisionISO ? prettyDate(overview.summary.nextDecisionISO) : "All clear"}
          detail="The earliest dated conflict still waiting for review."
          tone="sky"
        />
        <SummaryCard
          label="FYI only"
          value={overview.summary.infoCount}
          detail="Busy weeks and already-resolved capacity notes."
        />
      </section>

      <section className="mb-6" aria-labelledby="fix-next-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-rose-700">Focus now</p>
            <h2 id="fix-next-heading" className="mt-1 text-xl font-extrabold text-ink">Fix next</h2>
          </div>
          <p className="text-sm text-muted">Due within 30 days · {overview.summary.dueSoonCount}</p>
        </div>
        <GuardrailList guardrails={overview.dueSoon} />
      </section>

      {overview.later.length > 0 && (
        <details className="card-float mb-4 overflow-hidden">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block text-xs font-extrabold uppercase tracking-wide text-muted">Plan ahead</span>
              <span className="mt-1 block font-extrabold text-ink">Later decisions</span>
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-muted">{overview.summary.laterCount}</span>
          </summary>
          <div className="border-t border-slate-100 p-4 sm:p-5">
            <p className="mb-4 text-sm text-muted">These are real conflicts, but they are more than 30 days away.</p>
            <GuardrailList guardrails={overview.later} />
          </div>
        </details>
      )}

      {overview.info.length > 0 && (
        <details className="card-float overflow-hidden">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block text-xs font-extrabold uppercase tracking-wide text-muted">Awareness only</span>
              <span className="mt-1 block font-extrabold text-ink">Busy weeks and resolved checks</span>
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-muted">{overview.summary.infoCount}</span>
          </summary>
          <div className="border-t border-slate-100 p-4 sm:p-5">
            <p className="mb-4 text-sm leading-relaxed text-muted">
              These do not block anything. They simply show where a channel is carrying more than its usual volume or where a lineup decision is already protected.
            </p>
            <GuardrailInfoSummary guardrails={overview.info} />
          </div>
        </details>
      )}
    </div>
  );
}

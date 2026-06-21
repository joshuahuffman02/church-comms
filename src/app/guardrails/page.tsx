import { getGuardrails } from "@/lib/guardrails-service";
import { GuardrailList } from "@/components/guardrail-list";

export default async function GuardrailsPage() {
  const guardrails = await getGuardrails(new Date());
  const actionable = guardrails.filter((g) => g.severity !== "info");
  const info = guardrails.filter((g) => g.severity === "info");

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-extrabold mb-1">Guardrails 🛡️</h1>
      <p className="text-muted mb-5">
        {actionable.length === 0
          ? "Nothing needs a decision right now. ✨"
          : `${actionable.length} thing${actionable.length === 1 ? "" : "s"} to look at — usually "more than 3 things want the top-3 video this Sunday, pick your three."`}
      </p>

      <GuardrailList guardrails={actionable} grouped />

      {info.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm font-semibold text-muted">
            Busy weeks (FYI) · {info.length} — informational, not alarms
          </summary>
          <p className="text-xs text-muted mt-1 mb-3">
            Weeks where a channel carries more posts than its suggested volume. Often just a
            naturally busy stretch (and inflated here by approximate imported dates) — nothing to
            fix, just good to know.
          </p>
          <GuardrailList guardrails={info} grouped />
        </details>
      )}
    </div>
  );
}

"use client";
import { useState, useTransition } from "react";
import { applyTemplate } from "@/actions/playbooks";

/**
 * A small "this event's tags suggest a playbook — apply it?" affordance on the
 * event detail page. Generic replacement for the old mission-trip-specific
 * hint: the server resolves which playbook(s) the event's tag rules suggest
 * (via `EventTagRule.suggestedTemplateId`) and renders one of these per
 * suggestion. Clicking "Apply it" materializes the playbook's checklist tasks
 * onto the event via the same `applyTemplate` server action the Admin Checklist
 * uses (idempotent by title+source, so a double-click won't duplicate).
 */
export function SuggestedPlaybook({
  requestId,
  templateId,
  templateName,
}: {
  requestId: string;
  templateId: string;
  templateName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onApply() {
    setError(null);
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await applyTemplate(requestId, templateId);
        setMsg(
          res.created > 0
            ? `Added ${res.created} task${res.created === 1 ? "" : "s"}.`
            : "Already applied."
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not apply playbook");
      }
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
      <span>🎬</span>
      <span>
        Suggested playbook: <b>{templateName}</b>
      </span>
      <button
        type="button"
        onClick={onApply}
        disabled={pending}
        className="font-semibold underline hover:text-amber-900 disabled:opacity-40"
      >
        {pending ? "Applying…" : "Apply it"}
      </button>
      {msg && <span className="font-semibold text-emerald-700">{msg}</span>}
      {error && <span className="font-semibold text-rose-600">{error}</span>}
    </div>
  );
}

"use client";

import { useFormStatus } from "react-dom";
import { Check, Clock3, UserRoundX } from "lucide-react";
import { setAttentionDisposition } from "@/actions/attention";
import type { FocusCandidate } from "@/lib/focus-queue";

function FocusActionButton({
  disposition,
  label,
  icon,
}: {
  disposition: "done" | "snoozed" | "not_mine";
  label: string;
  icon: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="disposition"
      value={disposition}
      disabled={pending}
      className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3 py-2 text-xs font-bold text-slate-700 hover:border-sky-200 hover:bg-sky-50 disabled:cursor-wait disabled:opacity-50"
    >
      {icon}
      {pending ? "Updating…" : label}
    </button>
  );
}

export function FocusQueueActions({
  candidate,
}: {
  candidate: Pick<
    FocusCandidate,
    "entityType" | "entityId" | "fingerprint"
  >;
}) {
  return (
    <form action={setAttentionDisposition} className="mt-4 grid grid-cols-3 gap-2">
      <input type="hidden" name="entityType" value={candidate.entityType} />
      <input type="hidden" name="entityId" value={candidate.entityId} />
      <input type="hidden" name="fingerprint" value={candidate.fingerprint} />
      <FocusActionButton
        disposition="done"
        label="Done"
        icon={<Check className="h-3.5 w-3.5" aria-hidden />}
      />
      <FocusActionButton
        disposition="snoozed"
        label="Snooze"
        icon={<Clock3 className="h-3.5 w-3.5" aria-hidden />}
      />
      <FocusActionButton
        disposition="not_mine"
        label="Not mine"
        icon={<UserRoundX className="h-3.5 w-3.5" aria-hidden />}
      />
    </form>
  );
}

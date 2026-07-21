"use client";

import { useOptimistic, useState, useTransition } from "react";
import { sendToProof, approveProof } from "@/actions/tasks";

/** A clear proof handoff with optimistic state and visible save failures. */
export function ProofActions({ id, status }: { id: string; status: string }) {
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(status);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(nextStatus: string, action: (deliverableId: string) => Promise<void>) {
    setError(null);
    start(async () => {
      setOptimisticStatus(nextStatus);
      try {
        await action(id);
      } catch {
        setError("Not saved—try again");
      }
    });
  }

  if (pending) {
    return (
      <span className="inline-flex min-h-11 items-center rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-muted">
        Saving…
      </span>
    );
  }

  if (["ready", "scheduled", "published", "skipped"].includes(optimisticStatus)) return null;

  return (
    <span className="inline-flex flex-col items-start">
      {optimisticStatus === "proof" ? (
        <button
          type="button"
          onClick={() => run("ready", approveProof)}
          className="inline-flex min-h-11 items-center rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
          title="Approve this proof and mark it ready"
        >
          ✓ Approve proof
        </button>
      ) : (
        <button
          type="button"
          onClick={() => run("proof", sendToProof)}
          className="inline-flex min-h-11 items-center rounded-full border border-amber-300 px-4 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-50"
          title="Send this piece to proof for sign-off"
        >
          Send to proof →
        </button>
      )}
      {error && <span role="alert" className="mt-1 text-[11px] font-bold text-rose-700">{error}</span>}
    </span>
  );
}

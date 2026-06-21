"use client";
import { useTransition } from "react";
import { sendToProof, approveProof } from "@/actions/tasks";

/**
 * Lightweight proof sign-off affordance. Before proof: "Send to proof". While
 * in proof: "Approve". Once ready/scheduled/published it renders nothing —
 * the sign-off is done. Reuses the existing Deliverable status, so this is just
 * a friendlier two-button face on `sendToProof` / `approveProof`.
 */
export function ProofActions({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();

  if (status === "proof") {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => start(() => approveProof(id))}
        className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-600 transition disabled:opacity-50"
        title="Approve this proof → Ready"
      >
        ✓ Approve proof
      </button>
    );
  }

  // Already signed off / published — nothing to do.
  if (["ready", "scheduled", "published", "skipped"].includes(status)) return null;

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => sendToProof(id))}
      className="rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50 transition disabled:opacity-50"
      title="Send this to proof for sign-off"
    >
      → Send to proof
    </button>
  );
}

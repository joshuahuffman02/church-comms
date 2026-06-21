"use client";
import { useState, useTransition } from "react";
import { approveAsApprover, rejectApproval } from "@/actions/approvals";

/** Approve / Reject buttons for a single pending Approval. */
export function ApprovalActions({ approvalId }: { approvalId: string }) {
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  if (rejecting) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reason (optional)"
          className="rounded-2xl border px-3 py-1 text-sm w-56"
        />
        <button
          disabled={pending}
          onClick={() =>
            startTransition(() => rejectApproval(approvalId, note || undefined))
          }
          className="rounded-full bg-rose-600 text-white px-4 py-1 text-sm font-semibold disabled:opacity-40"
        >
          Confirm reject
        </button>
        <button
          disabled={pending}
          onClick={() => setRejecting(false)}
          className="rounded-full border px-4 py-1 text-sm font-semibold text-muted disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        disabled={pending}
        onClick={() => startTransition(() => approveAsApprover(approvalId))}
        className="rounded-full bg-emerald-600 text-white px-4 py-1 text-sm font-semibold disabled:opacity-40"
      >
        Approve
      </button>
      <button
        disabled={pending}
        onClick={() => setRejecting(true)}
        className="rounded-full border px-4 py-1 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40"
      >
        Reject
      </button>
      {pending && <span className="text-sm text-muted">Saving…</span>}
    </div>
  );
}

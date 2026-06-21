"use client";
import { useTransition } from "react";
import { deleteTagRule } from "@/actions/tag-rules";

/**
 * Subtle per-row Delete for a tag rule. Confirms first (server-action forms
 * can't easily run window.confirm), then fires the action in a transition.
 */
export function TagRuleDeleteButton({ id, tag }: { id: string; tag: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (window.confirm(`Delete the rule for "${tag}"?`)) {
          startTransition(() => deleteTagRule(id));
        }
      }}
      className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-500 hover:bg-red-50 transition disabled:opacity-40"
      title="Delete this tag rule"
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}

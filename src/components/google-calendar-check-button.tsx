"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { checkGoogleCalendarForEvents } from "@/actions/google-import";

export function GoogleCalendarCheckButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function checkNow() {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await checkGoogleCalendarForEvents();
        if (!result.configured) {
          setMessage("Connect a calendar URL first.");
        } else if (result.pending === 0) {
          setMessage(`Checked ${result.checked} event${result.checked === 1 ? "" : "s"}; nothing needs review.`);
        } else {
          setMessage(
            `${result.pending} event${result.pending === 1 ? "" : "s"} waiting: ` +
              `${result.suggestedAccept} suggested accept, ${result.suggestedIgnore} suggested ignore, ` +
              `${result.suggestedReview} needs review.`,
          );
        }
        router.refresh();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Calendar check failed.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={checkNow}
        disabled={pending}
        className="rounded-full border px-4 py-2 text-sm font-semibold text-muted transition hover:bg-sky-bg disabled:opacity-40"
      >
        {pending ? "Checking..." : "Check calendar now"}
      </button>
      {message && <span className="text-sm font-semibold text-muted">{message}</span>}
    </div>
  );
}

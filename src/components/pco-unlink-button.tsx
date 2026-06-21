"use client";
import { useTransition } from "react";
import { unlinkPcoEvent } from "@/actions/pco-link";

/**
 * Small "Unlink" control for a request that's linked to a Planning Center event.
 * Confirms, then detaches via `unlinkPcoEvent` (clears the PCO link fields but
 * leaves the pulled date/room/registration in place).
 */
export function PcoUnlinkButton({ requestId }: { requestId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (
          window.confirm(
            "Unlink this event from Planning Center? The date and room stay, but the auto-sync will no longer treat this as the PCO event.",
          )
        ) {
          startTransition(() => unlinkPcoEvent(requestId));
        }
      }}
      className="rounded-full border px-3 py-1 text-xs font-semibold text-muted hover:bg-sky-bg transition disabled:opacity-40"
      title="Detach from Planning Center"
    >
      {pending ? "Unlinking…" : "Unlink"}
    </button>
  );
}

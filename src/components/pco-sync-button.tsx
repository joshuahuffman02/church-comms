"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { forcePcoSync } from "@/actions/pco";

/**
 * "Sync now" — forces the scheduled PCO pull to run on demand instead of waiting
 * for the cron. Admin-only action; the page only renders this for admins.
 * On success we refresh so freshly-pulled events flip to "Imported".
 */
export function PcoSyncButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  function doSync() {
    setResult(null);
    startTransition(async () => {
      try {
        const { message } = await forcePcoSync();
        setResult(message);
        router.refresh();
      } catch (err) {
        setResult(err instanceof Error ? err.message : "Sync failed.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={doSync}
        disabled={pending}
        className="rounded-full border px-4 py-2 text-sm font-semibold text-muted hover:bg-sky-bg transition disabled:opacity-40"
      >
        {pending ? "Syncing…" : "🔄 Sync now"}
      </button>
      {result && <span className="text-sm font-semibold text-muted">{result}</span>}
    </div>
  );
}

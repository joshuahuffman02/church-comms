"use client";
import { useState, useTransition } from "react";
import { testPcoConnection } from "@/actions/pco";

/** "Test connection" affordance for the Connections settings page. */
export function PcoTestButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setResult(await testPcoConnection());
          })
        }
        className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-ink/80 transition hover:bg-sky-bg disabled:opacity-50"
      >
        {pending ? "Testing…" : "Test connection"}
      </button>
      {result && (
        <span
          className={`text-sm font-semibold ${result.ok ? "text-emerald-700" : "text-rose-600"}`}
        >
          {result.ok ? "✓ " : "✕ "}
          {result.message}
        </span>
      )}
    </div>
  );
}

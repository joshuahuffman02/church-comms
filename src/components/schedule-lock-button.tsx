"use client";
import { useState, useTransition } from "react";
import { lockTouch, unlockScheduleLock } from "@/actions/schedule-locks";

export function ScheduleLockButton({
  touchId,
  lockId,
  channelName,
}: {
  touchId: string;
  lockId?: string | null;
  channelName: string;
}) {
  const [currentLockId, setCurrentLockId] = useState(lockId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const locked = currentLockId != null;

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              if (currentLockId) {
                await unlockScheduleLock(currentLockId);
                setCurrentLockId(null);
              } else {
                const nextLockId = await lockTouch(touchId);
                if (nextLockId) setCurrentLockId(nextLockId);
              }
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not update this lock.");
            }
          });
        }}
        className={`min-h-9 rounded-full border px-3 py-1 text-xs font-semibold transition disabled:opacity-40 ${
          locked
            ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            : "border-slate-300 text-slate-700 hover:bg-sky-bg"
        }`}
        title={
          locked
            ? `Locked on ${channelName}; new events and auto re-plans cannot displace it`
            : `Keep this ${channelName} placement when new events arrive or schedules are rebuilt`
        }
        aria-pressed={locked}
      >
        {pending ? "Saving…" : locked ? "🔒 Locked" : "Lock slot"}
      </button>
      {error && (
        <span role="alert" className="max-w-64 text-right text-[11px] text-red-700">
          {error}
        </span>
      )}
    </span>
  );
}

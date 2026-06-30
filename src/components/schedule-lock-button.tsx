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
  const [pending, startTransition] = useTransition();
  const locked = currentLockId != null;

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          if (currentLockId) {
            await unlockScheduleLock(currentLockId);
            setCurrentLockId(null);
          } else {
            const nextLockId = await lockTouch(touchId);
            if (nextLockId) setCurrentLockId(nextLockId);
          }
        });
      }}
      className={`rounded-full border px-2 py-1 text-xs font-semibold transition disabled:opacity-40 ${
        locked
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : "border-slate-200 text-muted hover:bg-sky-bg"
      }`}
      title={
        locked
          ? `Locked on ${channelName}; auto re-plans keep this placement`
          : `Lock this ${channelName} placement during auto re-plans`
      }
      aria-pressed={locked}
    >
      {pending ? "Saving..." : locked ? "Locked" : "Lock"}
    </button>
  );
}

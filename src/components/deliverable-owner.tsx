"use client";
import { useState, useTransition } from "react";
import { claimDeliverable, assignDeliverableOwner } from "@/actions/tasks";
import type { ActiveUser } from "@/components/owner-assign";

/**
 * Per-deliverable owner control. Shows the effective owner (initials chip) and
 * offers a one-click "claim" plus a tiny menu to assign anyone / unassign.
 *
 * `effectiveOwnerId` is the inherited-or-explicit owner; `explicit` says whether
 * it's set on the deliverable itself (vs. inherited from the request) — inherited
 * owners render slightly subdued so it's clear where the assignment lives.
 */
export function DeliverableOwner({
  deliverableId,
  effectiveOwnerId,
  effectiveOwnerName,
  explicit,
  currentUserId,
  users,
  workLabel,
  eventTitle,
}: {
  deliverableId: string;
  effectiveOwnerId: string | null;
  effectiveOwnerName: string | null;
  explicit: boolean;
  currentUserId: string;
  users: ActiveUser[];
  workLabel: string;
  eventTitle: string;
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  const ini = effectiveOwnerName ? initialsOf(effectiveOwnerName) : null;
  const mine = effectiveOwnerId === currentUserId;
  const fullWorkLabel = `${workLabel} for ${eventTitle}`;

  return (
    <div className="relative flex items-center gap-1.5">
      {ini ? (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
          <span
            title={`${effectiveOwnerName}${explicit ? " owns this piece" : " is inherited from the overall event"}`}
            className={`grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-[10px] font-bold ${
              explicit ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            {ini}
          </span>
          <span className="max-w-28 truncate">{effectiveOwnerName}</span>
          {!explicit && <span className="text-[10px] font-medium text-muted">from event</span>}
        </span>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => start(() => claimDeliverable(deliverableId))}
          className="rounded-full border border-sky-200 px-2.5 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-50 transition disabled:opacity-50"
          title={`Assign the ${fullWorkLabel} to me`}
          aria-label={`Assign the ${fullWorkLabel} to me`}
        >
          ✋ claim
        </button>
      )}

      {ini && !mine && (
        <button
          type="button"
          disabled={pending}
          onClick={() => start(() => claimDeliverable(deliverableId))}
          className="text-[11px] font-semibold text-sky-700 hover:underline disabled:opacity-50"
          title={`Take over the ${fullWorkLabel}`}
          aria-label={`Take over the ${fullWorkLabel}`}
        >
          claim
        </button>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full px-1.5 text-muted hover:bg-slate-100 transition"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`Choose the piece owner for the ${fullWorkLabel}`}
        aria-label={`Choose the piece owner for the ${fullWorkLabel}`}
      >
        ▾
      </button>

      {open && (
        <div className="absolute right-0 top-7 z-10 w-44 rounded-2xl border border-slate-100 bg-white p-1 shadow-lg">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const fd = new FormData();
              fd.set("userId", "");
              start(() => assignDeliverableOwner(deliverableId, fd));
              setOpen(false);
            }}
            className="block w-full rounded-xl px-3 py-1.5 text-left text-xs text-muted hover:bg-slate-50 disabled:opacity-50"
          >
            Use overall event owner
          </button>
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              disabled={pending}
              onClick={() => {
                const fd = new FormData();
                fd.set("userId", u.id);
                start(() => assignDeliverableOwner(deliverableId, fd));
                setOpen(false);
              }}
              className="block w-full rounded-xl px-3 py-1.5 text-left text-xs hover:bg-sky-50 disabled:opacity-50"
            >
              {u.name}
              {u.id === effectiveOwnerId && explicit ? " ✓" : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Local copy of the initials rule (keeps this client component self-contained). */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

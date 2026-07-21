"use client";

import { useActionState, useState, useTransition } from "react";
import { addTop3Item, removeTop3Item, replaceTop3Item } from "@/actions/video-top3";

type Feedback = { ok: boolean; message: string } | null;
type Option = { id: string; label: string };
type Removable = { id: string; title: string };

function messageFrom(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "That change was not saved. Please try again.";
}

function FeedbackLine({ state }: { state: Feedback }) {
  if (!state) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={`text-xs font-semibold ${state.ok ? "text-emerald-700" : "text-red-700"}`}
    >
      {state.message}
    </p>
  );
}

function AddEventForm({ sundayIso, options }: { sundayIso: string; options: Option[] }) {
  const [state, action, pending] = useActionState<Feedback, FormData>(
    async (_previous, formData) => {
      try {
        await addTop3Item(formData);
        return { ok: true, message: "Event added to the lineup." };
      } catch (error) {
        return { ok: false, message: messageFrom(error) };
      }
    },
    null,
  );

  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="sunday" value={sundayIso} />
      <label htmlFor="top3-request" className="text-xs font-semibold text-ink">
        Feature an upcoming event
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          id="top3-request"
          name="requestId"
          required
          defaultValue=""
          className="min-h-11 min-w-0 flex-1 rounded-2xl border px-3 py-2 text-sm"
        >
          <option value="" disabled>Choose an event</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
        <button type="submit" disabled={pending} className="btn-primary min-h-11 shrink-0 px-4 text-sm disabled:opacity-60">
          {pending ? "Adding…" : "Add event"}
        </button>
      </div>
      <FeedbackLine state={state} />
    </form>
  );
}

function AddAwarenessForm({ sundayIso }: { sundayIso: string }) {
  const [state, action, pending] = useActionState<Feedback, FormData>(
    async (_previous, formData) => {
      try {
        await addTop3Item(formData);
        return { ok: true, message: "Awareness note added to the lineup." };
      } catch (error) {
        return { ok: false, message: messageFrom(error) };
      }
    },
    null,
  );

  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="sunday" value={sundayIso} />
      <label htmlFor="top3-awareness" className="text-xs font-semibold text-ink">
        Or add a short awareness note
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="top3-awareness"
          name="label"
          required
          maxLength={120}
          placeholder="Example: Camp Awesome still needs volunteers"
          className="min-h-11 min-w-0 flex-1 rounded-2xl border px-3 py-2 text-sm"
        />
        <button type="submit" disabled={pending} className="btn-primary min-h-11 shrink-0 px-4 text-sm disabled:opacity-60">
          {pending ? "Adding…" : "Add note"}
        </button>
      </div>
      <FeedbackLine state={state} />
    </form>
  );
}

function SwapForm({ options, removable }: { options: Option[]; removable: Removable[] }) {
  const [state, action, pending] = useActionState<Feedback, FormData>(
    async (_previous, formData) => {
      try {
        await replaceTop3Item(formData);
        return { ok: true, message: "Lineup slot replaced." };
      } catch (error) {
        return { ok: false, message: messageFrom(error) };
      }
    },
    null,
  );

  return (
    <form action={action} className="grid gap-3">
      <p className="text-xs text-muted">All protected slots are used. Choose exactly what to replace.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-semibold text-ink">
          Take off
          <select name="removeId" required defaultValue="" className="min-h-11 min-w-0 rounded-2xl border px-3 py-2 text-sm font-normal">
            <option value="" disabled>Choose a featured item</option>
            {removable.map((item) => (
              <option key={item.id} value={item.id}>{item.title}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-ink">
          Replace with
          <select name="requestId" required defaultValue="" className="min-h-11 min-w-0 rounded-2xl border px-3 py-2 text-sm font-normal">
            <option value="" disabled>Choose an event</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>
      <button type="submit" disabled={pending} className="btn-primary min-h-11 justify-self-start px-4 text-sm disabled:opacity-60">
        {pending ? "Replacing…" : "Replace slot"}
      </button>
      <FeedbackLine state={state} />
    </form>
  );
}

export function Top3Controls({
  sundayIso,
  options,
  removable,
  protectedFull,
  capacity,
}: {
  sundayIso: string;
  options: Option[];
  removable: Removable[];
  protectedFull: boolean;
  capacity: number;
}) {
  if (protectedFull) {
    if (removable.length === 0 || options.length === 0) {
      return (
        <p className="text-xs font-semibold text-amber-800">
          All {capacity} slots are locked. Unlock a channel placement before adding another event.
        </p>
      );
    }
    return <SwapForm options={options} removable={removable} />;
  }

  return (
    <div className="grid gap-4">
      {options.length > 0 && <AddEventForm sundayIso={sundayIso} options={options} />}
      <AddAwarenessForm sundayIso={sundayIso} />
    </div>
  );
}

export function Top3UnpinButton({ id, title }: { id: string; title: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex shrink-0 flex-col items-end">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            try {
              await removeTop3Item(id);
            } catch (caught) {
              setError(messageFrom(caught));
            }
          });
        }}
        className="min-h-11 rounded-xl px-3 text-xs font-semibold text-muted hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
        aria-label={`Unpin ${title} from the announcement video lineup`}
      >
        {pending ? "Saving…" : "Unpin"}
      </button>
      {error && <span role="alert" className="max-w-48 text-right text-[10px] font-semibold text-red-700">{error}</span>}
    </span>
  );
}

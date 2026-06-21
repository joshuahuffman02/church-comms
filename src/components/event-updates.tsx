"use client";
import { useState, useTransition } from "react";
import {
  createUpdate,
  updateUpdate,
  setUpdateStatus,
  deleteUpdate,
  applyStarterArc,
} from "@/actions/updates";
import type { ChannelCopyMap } from "@/lib/updates";

// ── Types passed down from the server component ──────────────────────────────

/** An active channel, trimmed to what the per-channel copy editor needs. */
export type ChannelLite = { key: string; name: string; color: string };

/** One update row as the timeline renders it. */
export type EventUpdateRow = {
  id: string;
  scheduledFor: Date;
  title: string;
  kind: string | null;
  body: string | null;
  channelCopy: ChannelCopyMap | null;
  status: string;
  sortOrder: number;
};

export type EventUpdatesProps = {
  requestId: string;
  updates: EventUpdateRow[];
  channels: ChannelLite[];
  canEdit?: boolean;
};

// ── Constants ────────────────────────────────────────────────────────────────

const KIND_OPTIONS: { value: string; label: string }[] = [
  { value: "save_the_date", label: "Save the date" },
  { value: "register", label: "Registration open" },
  { value: "reminder", label: "Reminder" },
  { value: "last_call", label: "Last call" },
  { value: "day_of", label: "Day-of" },
  { value: "follow_up", label: "Follow-up" },
  { value: "logistics", label: "Logistics" },
  { value: "adhoc", label: "Ad-hoc" },
];

const KIND_LABEL: Record<string, string> = Object.fromEntries(
  KIND_OPTIONS.map((o) => [o.value, o.label])
);

const fmtDate = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

/** YYYY-MM-DD for an <input type="date">, using local getters (no UTC shift). */
const dateInputValue = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// ── The per-channel copy editor (shared by add + edit forms) ────────────────

function ChannelCopyFields({
  channels,
  existing,
}: {
  channels: ChannelLite[];
  existing?: ChannelCopyMap | null;
}) {
  const [open, setOpen] = useState(
    Boolean(existing && Object.keys(existing).length > 0)
  );
  if (channels.length === 0) return null;

  return (
    <div className="mt-3">
      {/* Hidden marker tells the action which channel keys to read back. */}
      <input type="hidden" name="channelKeys" value={channels.map((c) => c.key).join(",")} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-semibold text-sky-700 hover:underline"
        aria-expanded={open}
      >
        {open ? "Hide per-channel copy" : "Set per-channel copy"}
      </button>
      {open && (
        <div className="mt-2 grid gap-3 rounded-2xl border border-slate-100 bg-sky-bg/40 p-3">
          {channels.map((c) => {
            const e = existing?.[c.key];
            return (
              <div key={c.key} className="grid gap-1">
                <span className="flex items-center gap-2 text-xs font-semibold text-muted">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: c.color }}
                    aria-hidden
                  />
                  {c.name}
                </span>
                <textarea
                  name={`copy_${c.key}_content`}
                  defaultValue={e?.content ?? ""}
                  placeholder="Copy for this channel (optional)"
                  rows={2}
                  className="w-full rounded-2xl border px-3 py-1.5 text-sm resize-y"
                />
                <input
                  name={`copy_${c.key}_asset`}
                  defaultValue={e?.assetLink ?? ""}
                  placeholder="https://canva.com/… graphic link (optional)"
                  className="w-full rounded-2xl border px-3 py-1.5 text-sm"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── The add / edit form body (fields shared between create and edit) ────────

function UpdateFormFields({
  channels,
  row,
}: {
  channels: ChannelLite[];
  row?: EventUpdateRow;
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-semibold text-muted">
          Date
          <input
            type="date"
            name="scheduledFor"
            required
            defaultValue={row ? dateInputValue(row.scheduledFor) : ""}
            className="rounded-2xl border px-3 py-1.5 text-sm font-normal"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted">
          Phase title
          <input
            name="title"
            required
            defaultValue={row?.title ?? ""}
            placeholder="e.g. Registration open"
            className="rounded-2xl border px-3 py-1.5 text-sm font-normal"
          />
        </label>
      </div>
      <label className="mt-3 grid gap-1 text-xs font-semibold text-muted">
        Tag (optional)
        <select
          name="kind"
          defaultValue={row?.kind ?? ""}
          className="rounded-2xl border px-3 py-1.5 text-sm font-normal"
        >
          <option value="">— none —</option>
          {KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 grid gap-1 text-xs font-semibold text-muted">
        Message
        <textarea
          name="body"
          defaultValue={row?.body ?? ""}
          placeholder="The general copy for this phase (optional)"
          rows={3}
          className="rounded-2xl border px-3 py-2 text-sm font-normal resize-y"
        />
      </label>
      <ChannelCopyFields channels={channels} existing={row?.channelCopy} />
    </>
  );
}

// ── Add form ─────────────────────────────────────────────────────────────────

function AddUpdateForm({
  requestId,
  channels,
}: {
  requestId: string;
  channels: ChannelLite[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border px-3 py-1 text-xs font-semibold text-muted hover:bg-sky-bg transition"
      >
        + Add update
      </button>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await createUpdate(requestId, fd);
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add update");
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-slate-100 bg-white/60 p-4"
    >
      <UpdateFormFields channels={channels} />
      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-emerald-600 text-white px-4 py-1 text-sm font-semibold disabled:opacity-40"
        >
          {pending ? "Adding…" : "Add update"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="text-xs font-semibold text-muted hover:underline"
        >
          Cancel
        </button>
        {error && <span className="text-xs font-semibold text-rose-600">{error}</span>}
      </div>
    </form>
  );
}

// ── One timeline node (view + inline edit) ──────────────────────────────────

function UpdateNode({
  row,
  channels,
  canEdit,
}: {
  row: EventUpdateRow;
  channels: ChannelLite[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const channelByKey = new Map(channels.map((c) => [c.key, c]));
  const done = row.status === "done";

  function onToggle() {
    setError(null);
    startTransition(async () => {
      try {
        await setUpdateStatus(row.id, done ? "planned" : "done");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update");
      }
    });
  }

  function onDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteUpdate(row.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not delete");
      }
    });
  }

  function onSaveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await updateUpdate(row.id, fd);
        setEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save");
      }
    });
  }

  const copyEntries = row.channelCopy
    ? Object.entries(row.channelCopy).filter(([, v]) => v?.content || v?.assetLink)
    : [];

  return (
    <li className="relative pl-8">
      {/* Timeline rail + node dot */}
      <span
        className="absolute left-2 top-2 z-10 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white"
        style={{ backgroundColor: done ? "#10b981" : "#93c5fd" }}
        aria-hidden
      />
      <div className="rounded-2xl border border-slate-100 bg-white/60 p-4">
        {editing ? (
          <form onSubmit={onSaveEdit}>
            <UpdateFormFields channels={channels} row={row} />
            <div className="mt-4 flex items-center gap-3">
              <button
                type="submit"
                disabled={pending}
                className="rounded-full bg-emerald-600 text-white px-4 py-1 text-sm font-semibold disabled:opacity-40"
              >
                {pending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
                className="text-xs font-semibold text-muted hover:underline"
              >
                Cancel
              </button>
              {error && (
                <span className="text-xs font-semibold text-rose-600">{error}</span>
              )}
            </div>
          </form>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-muted">
                {fmtDate(row.scheduledFor)}
              </span>
              <span className={`font-bold ${done ? "line-through text-muted" : ""}`}>
                {row.title}
              </span>
              {row.kind && KIND_LABEL[row.kind] && (
                <span className="rounded-full bg-sky-bg px-2 py-0.5 text-xs font-semibold text-sky-700">
                  {KIND_LABEL[row.kind]}
                </span>
              )}
              {done && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  Done
                </span>
              )}
              {canEdit && (
                <div className="ml-auto flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs font-semibold text-muted">
                    <input
                      type="checkbox"
                      checked={done}
                      disabled={pending}
                      onChange={onToggle}
                    />
                    Done
                  </label>
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="text-xs font-semibold text-sky-700 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={onDelete}
                    disabled={pending}
                    className="text-xs font-semibold text-rose-600 hover:underline disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>

            {row.body && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{row.body}</p>
            )}

            {copyEntries.length > 0 && (
              <ul className="mt-3 grid gap-1.5">
                {copyEntries.map(([key, entry]) => {
                  const ch = channelByKey.get(key);
                  return (
                    <li key={key} className="text-xs">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-muted">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: ch?.color ?? "#93c5fd" }}
                          aria-hidden
                        />
                        {ch?.name ?? key}
                      </span>
                      {entry.content && (
                        <span className="ml-2 text-slate-700">{entry.content}</span>
                      )}
                      {entry.assetLink && (
                        <a
                          href={entry.assetLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2 font-semibold text-sky-700 hover:underline"
                        >
                          ↗ asset
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {error && (
              <p className="mt-2 text-xs font-semibold text-rose-600">{error}</p>
            )}
          </>
        )}
      </div>
    </li>
  );
}

// ── Section ──────────────────────────────────────────────────────────────────

export function EventUpdates({
  requestId,
  updates,
  channels,
  canEdit = true,
}: EventUpdatesProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const empty = updates.length === 0;

  function onSuggest() {
    setError(null);
    startTransition(async () => {
      try {
        await applyStarterArc(requestId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not suggest an arc");
      }
    });
  }

  return (
    <div className="card-float p-5 mb-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="font-bold">Message Arc / Updates</h2>
        {canEdit && (
        <div className="ml-auto flex items-center gap-2">
          {empty && (
            <button
              type="button"
              onClick={onSuggest}
              disabled={pending}
              className="rounded-full border px-3 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-bg transition disabled:opacity-40"
            >
              {pending ? "Suggesting…" : "✨ Suggest a starter arc"}
            </button>
          )}
          <AddUpdateForm requestId={requestId} channels={channels} />
        </div>
        )}
      </div>

      {error && (
        <p className="mb-3 text-xs font-semibold text-rose-600">{error}</p>
      )}

      {empty ? (
        <p className="text-muted text-sm">
          No message phases yet. Plan the arc up front with a starter, or add
          updates on the fly.
        </p>
      ) : (
        <ol className="relative ml-1 grid gap-3 border-l border-slate-200 pl-2">
          {updates.map((row) => (
            <UpdateNode key={row.id} row={row} channels={channels} canEdit={canEdit} />
          ))}
        </ol>
      )}
    </div>
  );
}

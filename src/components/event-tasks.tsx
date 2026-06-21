"use client";
import { useState, useTransition } from "react";
import {
  applyTemplate,
  addTask,
  updateTask,
  toggleTask,
  deleteTask,
} from "@/actions/playbooks";

// ── Types passed down from the server component ──────────────────────────────

/** One admin task row as the checklist renders it. */
export type EventTaskRow = {
  id: string;
  title: string;
  notes: string | null;
  dueAt: Date | null;
  status: string;
  source: string | null;
  category: string | null;
  sortOrder: number;
};

/** An active playbook the "Apply a playbook" dropdown can offer. */
export type TemplateOption = { id: string; name: string };

export type EventTasksProps = {
  requestId: string;
  tasks: EventTaskRow[];
  templates: TemplateOption[];
  canEdit?: boolean;
};

// ── Formatting helpers ───────────────────────────────────────────────────────

const fmtDate = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

/** YYYY-MM-DD for an <input type="date">, using local getters (no UTC shift). */
const dateInputValue = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// ── Shared add / edit form fields ────────────────────────────────────────────

function TaskFormFields({ row }: { row?: EventTaskRow }) {
  return (
    <>
      <label className="grid gap-1 text-xs font-semibold text-muted">
        Task
        <input
          name="title"
          required
          defaultValue={row?.title ?? ""}
          placeholder="e.g. Order the outdoor banner"
          className="rounded-2xl border px-3 py-1.5 text-sm font-normal"
        />
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-semibold text-muted">
          Due date (optional)
          <input
            type="date"
            name="dueAt"
            defaultValue={row?.dueAt ? dateInputValue(row.dueAt) : ""}
            className="rounded-2xl border px-3 py-1.5 text-sm font-normal"
          />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted">
          Category (optional)
          <input
            name="category"
            defaultValue={row?.category ?? ""}
            placeholder="e.g. logistics"
            className="rounded-2xl border px-3 py-1.5 text-sm font-normal"
          />
        </label>
      </div>
      <label className="mt-3 grid gap-1 text-xs font-semibold text-muted">
        Notes / tips
        <textarea
          name="notes"
          defaultValue={row?.notes ?? ""}
          placeholder="Dimensions, lessons learned, links…"
          rows={3}
          className="rounded-2xl border px-3 py-2 text-sm font-normal resize-y"
        />
      </label>
    </>
  );
}

// ── Add form ─────────────────────────────────────────────────────────────────

function AddTaskForm({
  requestId,
  onDone,
}: {
  requestId: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await addTask(requestId, fd);
        onDone();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add task");
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mb-3 rounded-2xl border border-slate-100 bg-white/60 p-4"
    >
      <TaskFormFields />
      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-emerald-600 text-white px-4 py-1 text-sm font-semibold disabled:opacity-40"
        >
          {pending ? "Adding…" : "Add task"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-xs font-semibold text-muted hover:underline"
        >
          Cancel
        </button>
        {error && <span className="text-xs font-semibold text-rose-600">{error}</span>}
      </div>
    </form>
  );
}

// ── Apply-a-playbook control ─────────────────────────────────────────────────

function ApplyPlaybook({
  requestId,
  templates,
}: {
  requestId: string;
  templates: TemplateOption[];
}) {
  const [choice, setChoice] = useState("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (templates.length === 0) return null;

  function onApply() {
    if (!choice) return;
    setError(null);
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await applyTemplate(requestId, choice);
        setMsg(
          res.created > 0
            ? `Added ${res.created} task${res.created === 1 ? "" : "s"}.`
            : "Already applied — nothing new to add."
        );
        setChoice("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not apply playbook");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        aria-label="Choose a playbook to apply"
        className="rounded-full border px-3 py-1 text-xs font-semibold text-muted"
      >
        <option value="">Apply a playbook…</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onApply}
        disabled={pending || !choice}
        className="rounded-full border px-3 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-bg transition disabled:opacity-40"
      >
        {pending ? "Applying…" : "Apply"}
      </button>
      {msg && <span className="text-xs font-semibold text-emerald-700">{msg}</span>}
      {error && <span className="text-xs font-semibold text-rose-600">{error}</span>}
    </div>
  );
}

// ── One task row (view + inline edit) ────────────────────────────────────────

function TaskRow({ row, canEdit }: { row: EventTaskRow; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const done = row.status === "done";

  function run(fn: () => Promise<unknown>, fallback: string) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        setError(err instanceof Error ? err.message : fallback);
      }
    });
  }

  function onSaveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await updateTask(row.id, fd);
        setEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save");
      }
    });
  }

  if (editing) {
    return (
      <li className="rounded-2xl border border-slate-100 bg-white/60 p-4">
        <form onSubmit={onSaveEdit}>
          <TaskFormFields row={row} />
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
            {error && <span className="text-xs font-semibold text-rose-600">{error}</span>}
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="rounded-2xl border border-slate-100 bg-white/60 p-3">
      <div className="flex items-start gap-3">
        {canEdit ? (
          <input
            type="checkbox"
            checked={done}
            disabled={pending}
            aria-label={`Mark "${row.title}" done`}
            onChange={() => run(() => toggleTask(row.id), "Could not update")}
            className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-emerald-500 disabled:opacity-50"
          />
        ) : (
          <span
            className={`mt-1 h-4 w-4 shrink-0 rounded-full border ${
              done ? "border-emerald-500 bg-emerald-500" : "border-slate-300"
            }`}
            aria-hidden
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`font-semibold ${done ? "line-through text-muted" : ""}`}>
              {row.title}
            </span>
            {row.category && (
              <span className="rounded-full bg-sky-bg px-2 py-0.5 text-xs font-semibold text-sky-700">
                {row.category}
              </span>
            )}
            {row.source && row.source !== "manual" && (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
                {row.source}
              </span>
            )}
            <span className="ml-auto text-xs text-muted">
              {row.dueAt ? `due ${fmtDate(row.dueAt)}` : "no date"}
            </span>
          </div>

          {row.notes && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="mt-1 text-xs font-semibold text-sky-700 hover:underline"
            >
              {expanded ? "Hide notes" : "Notes / tips"}
            </button>
          )}
          {row.notes && expanded && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{row.notes}</p>
          )}

          {canEdit && (
            <div className="mt-1 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-xs font-semibold text-sky-700 hover:underline"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => run(() => deleteTask(row.id), "Could not delete")}
                disabled={pending}
                className="text-xs font-semibold text-rose-600 hover:underline disabled:opacity-40"
              >
                Delete
              </button>
              {error && <span className="text-xs font-semibold text-rose-600">{error}</span>}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

// ── Section ──────────────────────────────────────────────────────────────────

export function EventTasks({
  requestId,
  tasks,
  templates,
  canEdit = true,
}: EventTasksProps) {
  const [adding, setAdding] = useState(false);
  const empty = tasks.length === 0;
  const remaining = tasks.filter((t) => t.status !== "done").length;

  return (
    <div className="card-float p-5 mb-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="font-bold">📋 Admin Checklist</h2>
        {!empty && (
          <span className="text-muted text-xs">
            · {remaining} of {tasks.length} open
          </span>
        )}
        {canEdit && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <ApplyPlaybook requestId={requestId} templates={templates} />
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              className="rounded-full border px-3 py-1 text-xs font-semibold text-muted hover:bg-sky-bg transition"
            >
              + Add task
            </button>
          </div>
        )}
      </div>

      {canEdit && adding && (
        <AddTaskForm requestId={requestId} onDone={() => setAdding(false)} />
      )}

      {empty ? (
        <p className="text-muted text-sm">
          No admin tasks yet. Apply a playbook to load the right tasks at the
          right time, or add one manually.
        </p>
      ) : (
        <ul className="grid gap-2">
          {tasks.map((row) => (
            <TaskRow key={row.id} row={row} canEdit={canEdit} />
          ))}
        </ul>
      )}
    </div>
  );
}

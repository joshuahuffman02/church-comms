"use client";
import { useState, useTransition } from "react";
import {
  createTemplate,
  updateTemplate,
  deleteTemplate,
  addTemplateTask,
  updateTemplateTask,
  deleteTemplateTask,
} from "@/actions/templates";

// ── Types from the server component ──────────────────────────────────────────

export type TemplateTaskRow = {
  id: string;
  title: string;
  notes: string | null;
  offsetDays: number | null;
  category: string | null;
  sortOrder: number;
};

export type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  tasks: TemplateTaskRow[];
};

// ── Small async-button helper ────────────────────────────────────────────────

function useAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run(fn: () => Promise<unknown>, fallback: string, after?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        after?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : fallback);
      }
    });
  }
  return { pending, error, setError, run };
}

const offsetLabel = (o: number | null) =>
  o == null ? "no date" : o === 0 ? "on the day" : `${o}d before`;

// ── Template-task fields (shared by add + edit) ──────────────────────────────

function TemplateTaskFields({ row }: { row?: TemplateTaskRow }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
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
        <label className="grid gap-1 text-xs font-semibold text-muted">
          Days before event
          <input
            name="offsetDays"
            type="number"
            min={0}
            defaultValue={row?.offsetDays ?? ""}
            placeholder="—"
            className="w-28 rounded-2xl border px-3 py-1.5 text-sm font-normal"
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
          placeholder="Dimensions, lead times, lessons learned…"
          rows={2}
          className="rounded-2xl border px-3 py-2 text-sm font-normal resize-y"
        />
      </label>
    </>
  );
}

// ── One template task (view + inline edit) ───────────────────────────────────

function TemplateTaskItem({ task }: { task: TemplateTaskRow }) {
  const [editing, setEditing] = useState(false);
  const { pending, error, run } = useAction();

  if (editing) {
    return (
      <li className="rounded-2xl border border-slate-100 bg-white/60 p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(() => updateTemplateTask(task.id, fd), "Could not save", () =>
              setEditing(false)
            );
          }}
        >
          <TemplateTaskFields row={task} />
          <div className="mt-3 flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-emerald-600 text-white px-4 py-1 text-sm font-semibold disabled:opacity-40"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
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
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
          {offsetLabel(task.offsetDays)}
        </span>
        <span className="font-semibold">{task.title}</span>
        {task.category && (
          <span className="rounded-full bg-sky-bg px-2 py-0.5 text-xs font-semibold text-sky-700">
            {task.category}
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs font-semibold text-sky-700 hover:underline"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => run(() => deleteTemplateTask(task.id), "Could not delete")}
            disabled={pending}
            className="text-xs font-semibold text-rose-600 hover:underline disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      </div>
      {task.notes && (
        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{task.notes}</p>
      )}
      {error && <p className="mt-1 text-xs font-semibold text-rose-600">{error}</p>}
    </li>
  );
}

// ── Add-task form (per template) ─────────────────────────────────────────────

function AddTemplateTaskForm({ templateId }: { templateId: string }) {
  const [open, setOpen] = useState(false);
  const { pending, error, run } = useAction();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border px-3 py-1 text-xs font-semibold text-muted hover:bg-sky-bg transition"
      >
        + Add task
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        run(() => addTemplateTask(templateId, fd), "Could not add task", () => {
          form.reset();
          setOpen(false);
        });
      }}
      className="rounded-2xl border border-slate-100 bg-white/60 p-3"
    >
      <TemplateTaskFields />
      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-emerald-600 text-white px-4 py-1 text-sm font-semibold disabled:opacity-40"
        >
          {pending ? "Adding…" : "Add task"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-semibold text-muted hover:underline"
        >
          Cancel
        </button>
        {error && <span className="text-xs font-semibold text-rose-600">{error}</span>}
      </div>
    </form>
  );
}

// ── One template card (header edit + its task list) ──────────────────────────

function TemplateCard({ template }: { template: TemplateRow }) {
  const [editing, setEditing] = useState(false);
  const { pending, error, run } = useAction();
  const sortedTasks = [...template.tasks].sort((a, b) => {
    const ao = a.offsetDays ?? -Infinity;
    const bo = b.offsetDays ?? -Infinity;
    // Bigger offset (further out) first; undated sink to the bottom.
    const an = a.offsetDays == null;
    const bn = b.offsetDays == null;
    if (an !== bn) return an ? 1 : -1;
    if (bo !== ao) return bo - ao;
    return a.sortOrder - b.sortOrder;
  });

  return (
    <div className="card-float p-5 mb-4">
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(() => updateTemplate(template.id, fd), "Could not save", () =>
              setEditing(false)
            );
          }}
          className="mb-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-muted">
              Playbook name
              <input
                name="name"
                required
                defaultValue={template.name}
                className="rounded-2xl border px-3 py-1.5 text-sm font-normal"
              />
            </label>
            <label className="flex items-end gap-2 text-xs font-semibold text-muted">
              <input
                type="checkbox"
                name="active"
                defaultChecked={template.active}
                className="h-4 w-4"
              />
              Active (offered when applying a playbook)
            </label>
          </div>
          <label className="mt-3 grid gap-1 text-xs font-semibold text-muted">
            Description
            <textarea
              name="description"
              defaultValue={template.description ?? ""}
              rows={2}
              className="rounded-2xl border px-3 py-2 text-sm font-normal resize-y"
            />
          </label>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-emerald-600 text-white px-4 py-1 text-sm font-semibold disabled:opacity-40"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs font-semibold text-muted hover:underline"
            >
              Cancel
            </button>
            {error && <span className="text-xs font-semibold text-rose-600">{error}</span>}
          </div>
        </form>
      ) : (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="font-bold">{template.name}</h2>
          {!template.active && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
              inactive
            </span>
          )}
          <span className="text-muted text-xs">· {template.tasks.length} tasks</span>
          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs font-semibold text-sky-700 hover:underline"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    `Delete the "${template.name}" playbook and its ${template.tasks.length} tasks? Events that already used it keep their tasks.`
                  )
                ) {
                  run(() => deleteTemplate(template.id), "Could not delete");
                }
              }}
              disabled={pending}
              className="text-xs font-semibold text-rose-600 hover:underline disabled:opacity-40"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {!editing && template.description && (
        <p className="mb-3 text-sm text-slate-700">{template.description}</p>
      )}
      {!editing && error && (
        <p className="mb-3 text-xs font-semibold text-rose-600">{error}</p>
      )}

      <ul className="grid gap-2">
        {sortedTasks.map((t) => (
          <TemplateTaskItem key={t.id} task={t} />
        ))}
      </ul>
      <div className="mt-3">
        <AddTemplateTaskForm templateId={template.id} />
      </div>
    </div>
  );
}

// ── New-template form ────────────────────────────────────────────────────────

function NewTemplateForm() {
  const [open, setOpen] = useState(false);
  const { pending, error, run } = useAction();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-ink text-white px-5 py-1.5 text-sm font-semibold"
      >
        ＋ New playbook
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        run(() => createTemplate(fd), "Could not create playbook", () => {
          form.reset();
          setOpen(false);
        });
      }}
      className="card-float p-5 mb-4"
    >
      <h2 className="font-bold mb-3">New playbook</h2>
      <label className="grid gap-1 text-xs font-semibold text-muted">
        Name
        <input
          name="name"
          required
          placeholder="e.g. Mission Trip"
          className="rounded-2xl border px-3 py-1.5 text-sm font-normal"
        />
      </label>
      <label className="mt-3 grid gap-1 text-xs font-semibold text-muted">
        Description (optional)
        <textarea
          name="description"
          rows={2}
          placeholder="When to use this playbook…"
          className="rounded-2xl border px-3 py-2 text-sm font-normal resize-y"
        />
      </label>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-emerald-600 text-white px-4 py-1 text-sm font-semibold disabled:opacity-40"
        >
          {pending ? "Creating…" : "Create playbook"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-semibold text-muted hover:underline"
        >
          Cancel
        </button>
        {error && <span className="text-xs font-semibold text-rose-600">{error}</span>}
      </div>
    </form>
  );
}

// ── The whole editor ─────────────────────────────────────────────────────────

export function PlaybookEditor({ templates }: { templates: TemplateRow[] }) {
  return (
    <div>
      <div className="mb-4">
        <NewTemplateForm />
      </div>
      {templates.length === 0 ? (
        <p className="text-muted text-sm">
          No playbooks yet. Create one (e.g. “Mission Trip”) and add the tasks
          that should happen on the runway before the event.
        </p>
      ) : (
        templates.map((t) => <TemplateCard key={t.id} template={t} />)
      )}
    </div>
  );
}

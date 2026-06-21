"use server";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/authz";
import { logRequestActivity } from "@/lib/activity";
import { parseDateInput } from "@/lib/engine/dates";
import { computeTaskDueDates } from "@/lib/playbooks";
import { revalidatePath } from "next/cache";

const TITLE_CAP = 200;
const NOTES_CAP = 4000;
const CATEGORY_CAP = 60;

/** Normalize a form field to a trimmed string, treating empty as null. */
function readField(fd: FormData, name: string): string | null {
  const raw = fd.get(name);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/** Revalidate the surfaces that show event tasks. */
function revalidateTask(requestId: string) {
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/this-week");
}

/**
 * Apply a playbook (EventTemplate) to an event: materialize one `EventTask` per
 * template task, with `dueAt = eventStart − offsetDays` (via the pure helper),
 * `source` = the template name, copying title/notes/category/sortOrder.
 *
 * Idempotent-ish by APPEND: re-applying the same playbook skips any task whose
 * (title, source) pair already exists on the event, so pressing it twice won't
 * duplicate rows, but a partially-applied playbook can be topped up.
 */
export async function applyTemplate(requestId: string, templateId: string) {
  const user = await requireEditor();

  const [request, template] = await Promise.all([
    db.request.findUnique({
      where: { id: requestId },
      select: { id: true, eventStart: true },
    }),
    db.eventTemplate.findUnique({
      where: { id: templateId },
      include: { tasks: { orderBy: { sortOrder: "asc" } } },
    }),
  ]);
  if (!request) throw new Error("Event not found");
  if (!template) throw new Error("Playbook not found");

  // Compute concrete due dates from the event date + each task's offset.
  const dated = computeTaskDueDates(request.eventStart, template.tasks);

  // Skip tasks already present from this same playbook (title + source).
  const existing = await db.eventTask.findMany({
    where: { requestId, source: template.name },
    select: { title: true },
  });
  const have = new Set(existing.map((t) => t.title));

  const toCreate = dated
    .filter((t) => !have.has(t.title))
    .map((t) => ({
      requestId,
      title: t.title,
      notes: t.notes ?? null,
      dueAt: t.dueAt,
      status: "todo",
      source: template.name,
      category: t.category ?? null,
      sortOrder: t.sortOrder,
    }));

  if (toCreate.length > 0) {
    await db.eventTask.createMany({ data: toCreate });
  }
  await logRequestActivity(
    {
      requestId,
      action: "playbook_applied",
      summary: `Applied playbook: ${template.name}`,
      metadata: { templateId, templateName: template.name, createdTasks: toCreate.length },
    },
    user,
  );

  revalidateTask(requestId);
  return { created: toCreate.length };
}

/** Read + validate the manual-task fields shared by add and update. */
function readTaskFields(fd: FormData) {
  const title = readField(fd, "title")?.slice(0, TITLE_CAP);
  if (!title) throw new Error("A task title is required");

  const notes = readField(fd, "notes")?.slice(0, NOTES_CAP) ?? null;
  const category = readField(fd, "category")?.slice(0, CATEGORY_CAP) ?? null;

  const dueStr = readField(fd, "dueAt");
  let dueAt: Date | null = null;
  if (dueStr) {
    dueAt = parseDateInput(dueStr);
    if (!dueAt) throw new Error("Due date must be a valid date");
  }

  return { title, notes, category, dueAt };
}

/**
 * Add a manual admin task to an event. `title` required; `notes`, `category`,
 * and `dueAt` (via parseDateInput) optional. Source is tagged "manual". New
 * tasks sort after the current max so they land at the end of the checklist.
 */
export async function addTask(requestId: string, fd: FormData) {
  const user = await requireEditor();
  const { title, notes, category, dueAt } = readTaskFields(fd);

  const max = await db.eventTask.aggregate({
    where: { requestId },
    _max: { sortOrder: true },
  });

  const task = await db.eventTask.create({
    data: {
      requestId,
      title,
      notes,
      category,
      dueAt,
      status: "todo",
      source: "manual",
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
    select: { id: true },
  });
  await logRequestActivity(
    {
      requestId,
      action: "task_created",
      summary: `Task added: ${title}`,
      metadata: { taskId: task.id, dueAt: dueAt?.toISOString() ?? null, category },
    },
    user,
  );

  revalidateTask(requestId);
}

/** Edit an existing task's title / notes / category / due date. */
export async function updateTask(id: string, fd: FormData) {
  const user = await requireEditor();
  const { title, notes, category, dueAt } = readTaskFields(fd);

  const row = await db.eventTask.update({
    where: { id },
    data: { title, notes, category, dueAt },
    select: { requestId: true },
  });
  await logRequestActivity(
    {
      requestId: row.requestId,
      action: "task_updated",
      summary: `Task updated: ${title}`,
      metadata: { taskId: id, dueAt: dueAt?.toISOString() ?? null, category },
    },
    user,
  );

  revalidateTask(row.requestId);
}

/** Toggle a task between "todo" and "done". */
export async function toggleTask(id: string) {
  const user = await requireEditor();
  const task = await db.eventTask.findUnique({
    where: { id },
    select: { status: true, requestId: true },
  });
  if (!task) throw new Error("Task not found");

  await db.eventTask.update({
    where: { id },
    data: { status: task.status === "done" ? "todo" : "done" },
  });
  await logRequestActivity(
    {
      requestId: task.requestId,
      action: "task_status_changed",
      summary: task.status === "done" ? "Task reopened" : "Task marked done",
      metadata: { taskId: id, fromStatus: task.status, toStatus: task.status === "done" ? "todo" : "done" },
    },
    user,
  );

  revalidateTask(task.requestId);
}

/** Delete a task. */
export async function deleteTask(id: string) {
  const user = await requireEditor();
  const row = await db.eventTask.delete({
    where: { id },
    select: { requestId: true, title: true },
  });
  await logRequestActivity(
    {
      requestId: row.requestId,
      action: "task_deleted",
      summary: `Task deleted: ${row.title}`,
      metadata: { taskId: id },
    },
    user,
  );
  revalidateTask(row.requestId);
}

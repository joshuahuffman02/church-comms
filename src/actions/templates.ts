"use server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { revalidatePath } from "next/cache";

const NAME_CAP = 120;
const TITLE_CAP = 200;
const NOTES_CAP = 4000;
const DESC_CAP = 2000;
const CATEGORY_CAP = 60;

/** Normalize a form field to a trimmed string, treating empty as null. */
function readField(fd: FormData, name: string): string | null {
  const raw = fd.get(name);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Parse `offsetDays` from the form: a non-negative integer = days before the
 * event; blank = null (no date). A negative or non-numeric value is rejected so
 * a stray input can't produce a post-event "due" date.
 */
function readOffset(fd: FormData): number | null {
  const raw = readField(fd, "offsetDays");
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error("Days before event must be a whole number ≥ 0 (or blank)");
  }
  return n;
}

const revalidate = () => revalidatePath("/settings/playbooks");

// ── Template CRUD ────────────────────────────────────────────────────────────

/** Create a new playbook (EventTemplate). Name required. Admin-only. */
export async function createTemplate(fd: FormData) {
  await requireAdmin();
  const name = readField(fd, "name")?.slice(0, NAME_CAP);
  if (!name) throw new Error("A playbook name is required");
  const description = readField(fd, "description")?.slice(0, DESC_CAP) ?? null;

  const tpl = await db.eventTemplate.create({
    data: { name, description, active: fd.get("active") !== "off" },
  });
  revalidate();
  return { id: tpl.id };
}

/** Edit a playbook's name / description / active flag. Admin-only. */
export async function updateTemplate(id: string, fd: FormData) {
  await requireAdmin();
  const name = readField(fd, "name")?.slice(0, NAME_CAP);
  if (!name) throw new Error("A playbook name is required");
  const description = readField(fd, "description")?.slice(0, DESC_CAP) ?? null;

  await db.eventTemplate.update({
    where: { id },
    data: { name, description, active: fd.get("active") === "on" },
  });
  revalidate();
}

/** Delete a playbook (cascades its template tasks). Admin-only. */
export async function deleteTemplate(id: string) {
  await requireAdmin();
  await db.eventTemplate.delete({ where: { id } });
  revalidate();
}

// ── Template-task CRUD ───────────────────────────────────────────────────────

/** Read + validate the fields shared by template-task add / update. */
function readTemplateTaskFields(fd: FormData) {
  const title = readField(fd, "title")?.slice(0, TITLE_CAP);
  if (!title) throw new Error("A task title is required");
  const notes = readField(fd, "notes")?.slice(0, NOTES_CAP) ?? null;
  const category = readField(fd, "category")?.slice(0, CATEGORY_CAP) ?? null;
  const offsetDays = readOffset(fd);
  return { title, notes, category, offsetDays };
}

/** Add a checklist item to a playbook. Appends after the current max. Admin-only. */
export async function addTemplateTask(templateId: string, fd: FormData) {
  await requireAdmin();
  const { title, notes, category, offsetDays } = readTemplateTaskFields(fd);

  const max = await db.eventTemplateTask.aggregate({
    where: { templateId },
    _max: { sortOrder: true },
  });

  await db.eventTemplateTask.create({
    data: {
      templateId,
      title,
      notes,
      category,
      offsetDays,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
  });
  revalidate();
}

/** Edit a checklist item's title / notes / category / offset. Admin-only. */
export async function updateTemplateTask(id: string, fd: FormData) {
  await requireAdmin();
  const { title, notes, category, offsetDays } = readTemplateTaskFields(fd);

  await db.eventTemplateTask.update({
    where: { id },
    data: { title, notes, category, offsetDays },
  });
  revalidate();
}

/** Delete a checklist item from a playbook. Admin-only. */
export async function deleteTemplateTask(id: string) {
  await requireAdmin();
  await db.eventTemplateTask.delete({ where: { id } });
  revalidate();
}

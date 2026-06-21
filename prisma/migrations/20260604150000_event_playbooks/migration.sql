-- Event Playbooks: reusable dated admin-checklist templates applied to events.
--
--   EventTemplate      — a playbook (e.g. "Mission Trip").
--   EventTemplateTask  — a checklist item with a relative `offsetDays` (days
--                        before the event; null = no date) + notes/tips/category.
--   EventTask          — a concrete task attached to a Request, with a computed
--                        (or manual) `dueAt`, a todo/done status, and a `source`
--                        (the originating playbook name or "manual").
--
-- Plus `Channel.productionNotes` — free-text production reference (banner
-- dimensions + lessons learned) surfaced on the Outputs/[key] page header.
--
-- FKs cascade on the parent delete (template → its tasks, request → its tasks).
-- Indexes on templateId / requestId back the per-parent listing queries.

-- AlterTable: production-notes reference text per channel.
ALTER TABLE "Channel" ADD COLUMN "productionNotes" TEXT;

-- CreateTable: EventTemplate (a playbook).
CREATE TABLE "EventTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable: EventTemplateTask (a checklist item on a playbook).
CREATE TABLE "EventTemplateTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "offsetDays" INTEGER,
    "category" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "EventTemplateTask_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EventTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: EventTask (a concrete task on an event/Request).
CREATE TABLE "EventTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "dueAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'todo',
    "source" TEXT,
    "category" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventTask_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "EventTemplateTask_templateId_idx" ON "EventTemplateTask"("templateId");

-- CreateIndex
CREATE INDEX "EventTask_requestId_idx" ON "EventTask"("requestId");

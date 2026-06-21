-- Tag-driven auto-classification.
--
-- EventTagRule: one admin-editable rule per Planning Center tag string, so a
-- well-tagged event lands already classified on import. `tag` is unique (one
-- rule per tag); matching against an event's tags is case-insensitive (done in
-- app code — see `src/lib/tag-rules.ts`). A matched rule can attach a Ministry,
-- suggest an audience tier (1|2|3, broadest wins across an event's tags), and
-- carry the two routing controls: noPromo ("Room Only" → keep out of the comms
-- queue) and missionTrip ("Mission Trip" → surface the playbook hint). The
-- Ministry FK is SetNull so deleting a ministry leaves its rules intact but
-- unministried; the ministryId index backs the settings list's ministry joins.
--
-- Request additions (applied on a fresh PCO import only, never on update — so
-- triage edits survive a re-import):
--   suggestedTier — the advisory tier the tags imply; the comms team confirms
--                   the real `tier` at triage.
--   noPromo       — set by a "Room Only" tag: don't promote / keep out of queue.

-- CreateTable
CREATE TABLE "EventTagRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tag" TEXT NOT NULL,
    "ministryId" TEXT,
    "tierSuggestion" INTEGER,
    "noPromo" BOOLEAN NOT NULL DEFAULT false,
    "missionTrip" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventTagRule_ministryId_fkey" FOREIGN KEY ("ministryId") REFERENCES "Ministry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "EventTagRule_tag_key" ON "EventTagRule"("tag");

-- CreateIndex
CREATE INDEX "EventTagRule_ministryId_idx" ON "EventTagRule"("ministryId");

-- AlterTable: tag-classification fields on Request (set on fresh import only).
ALTER TABLE "Request" ADD COLUMN "suggestedTier" INTEGER;
ALTER TABLE "Request" ADD COLUMN "noPromo" BOOLEAN NOT NULL DEFAULT false;

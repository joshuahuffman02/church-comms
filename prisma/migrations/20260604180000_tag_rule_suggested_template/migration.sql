-- Generalize the tag→playbook suggestion.
--
-- Replaces the mission-trip-specific hint with a generic playbook link: a tag
-- rule can now point at ANY Event Playbook via `suggestedTemplateId`, so e.g. a
-- "Sermon Series" tag suggests the Sermon Series checklist and a "Mission Trip"
-- tag suggests the Mission Trip playbook. The hint is surfaced on the event,
-- never auto-applied. The legacy `missionTrip` boolean column is KEPT for
-- back-compat (the classifier still reads it) — only the UI hint moves to
-- `suggestedTemplateId`.
--
-- The FK is ON DELETE SET NULL: deleting a playbook clears the suggestion on its
-- rules rather than blocking the delete or orphaning a dangling id.
--
-- SQLite has no `ALTER TABLE ... ADD COLUMN ... REFERENCES` that records a named
-- FK constraint, so we rebuild EventTagRule (Prisma's standard SQLite pattern):
-- create the new shape, copy rows, drop the old table, rename, recreate indexes.

PRAGMA foreign_keys=OFF;

-- RedefineTable: EventTagRule, adding the suggestedTemplateId FK column.
CREATE TABLE "new_EventTagRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tag" TEXT NOT NULL,
    "ministryId" TEXT,
    "tierSuggestion" INTEGER,
    "noPromo" BOOLEAN NOT NULL DEFAULT false,
    "missionTrip" BOOLEAN NOT NULL DEFAULT false,
    "suggestedTemplateId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventTagRule_ministryId_fkey" FOREIGN KEY ("ministryId") REFERENCES "Ministry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EventTagRule_suggestedTemplateId_fkey" FOREIGN KEY ("suggestedTemplateId") REFERENCES "EventTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_EventTagRule" ("id", "tag", "ministryId", "tierSuggestion", "noPromo", "missionTrip", "sortOrder", "createdAt")
SELECT "id", "tag", "ministryId", "tierSuggestion", "noPromo", "missionTrip", "sortOrder", "createdAt" FROM "EventTagRule";
DROP TABLE "EventTagRule";
ALTER TABLE "new_EventTagRule" RENAME TO "EventTagRule";
CREATE UNIQUE INDEX "EventTagRule_tag_key" ON "EventTagRule"("tag");
CREATE INDEX "EventTagRule_ministryId_idx" ON "EventTagRule"("ministryId");
CREATE INDEX "EventTagRule_suggestedTemplateId_idx" ON "EventTagRule"("suggestedTemplateId");

PRAGMA foreign_keys=ON;

-- Multi-ministry events: an event can belong to several ministries, all equal.
--
-- Source of truth = an implicit many-to-many between Ministry and Request,
-- exposed in the schema as `Request.ministries` / `Ministry.events`
-- (relation "MinistryEvents" → implicit join table `_MinistryEvents`, columns
-- A = Ministry.id, B = Request.id, per Prisma's convention).
--
-- The existing `Request.ministryId` single FK is KEPT as a denormalized
-- "primary" pointer (always set = the first of the selected ministries) so any
-- code path still reading the single relation shows a sensible dot.
--
-- Ministry also gains `active` + `sortOrder` for the management UI (ordering +
-- hide). SQLite supports ADD COLUMN for NOT NULL columns that carry a DEFAULT,
-- so these are plain ALTERs — no data-preserving table rebuild needed.

-- CreateTable: the implicit m-n join table.
CREATE TABLE "_MinistryEvents" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_MinistryEvents_A_fkey" FOREIGN KEY ("A") REFERENCES "Ministry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_MinistryEvents_B_fkey" FOREIGN KEY ("B") REFERENCES "Request" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "_MinistryEvents_AB_unique" ON "_MinistryEvents"("A", "B");

-- CreateIndex
CREATE INDEX "_MinistryEvents_B_index" ON "_MinistryEvents"("B");

-- AlterTable: Ministry management columns.
ALTER TABLE "Ministry" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Ministry" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill: every Request that already had a single ministryId keeps that
-- ministry in the new m-n, so existing events are unchanged in the new world.
-- (A = Ministry.id, B = Request.id.)
INSERT INTO "_MinistryEvents" ("A", "B")
SELECT "ministryId", "id" FROM "Request" WHERE "ministryId" IS NOT NULL;

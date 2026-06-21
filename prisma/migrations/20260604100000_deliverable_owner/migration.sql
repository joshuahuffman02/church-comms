-- Deliverable.ownerId: per-channel task ownership. A nullable FK to User with
-- onDelete SetNull, so removing a user un-assigns their deliverables rather than
-- cascading. SQLite supports ADD COLUMN for a nullable column with an inline FK
-- (no table rebuild needed); the index is created separately.

-- AlterTable
ALTER TABLE "Deliverable" ADD COLUMN "ownerId" TEXT REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Deliverable_ownerId_idx" ON "Deliverable"("ownerId");

-- AlterTable: per-week editable content on a Touch. Each weekly appearance of
-- the same deliverable can now carry its own slide copy, graphic link, and a
-- production note, so e.g. the Jun 7 loop slide can differ from Jun 14.
ALTER TABLE "Touch" ADD COLUMN "content" TEXT;
ALTER TABLE "Touch" ADD COLUMN "assetLink" TEXT;
ALTER TABLE "Touch" ADD COLUMN "note" TEXT;

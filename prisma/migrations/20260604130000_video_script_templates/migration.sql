-- Announcement Video Script export: editable INTRO / OUTRO templates that wrap
-- the auto-filled top-3 announcement-video items. Stored on the Setting
-- singleton. Nullable so existing rows keep working; code (and the seed) supply
-- sensible defaults when these are null.

-- AlterTable
ALTER TABLE "Setting" ADD COLUMN "videoScriptIntro" TEXT;
ALTER TABLE "Setting" ADD COLUMN "videoScriptOutro" TEXT;

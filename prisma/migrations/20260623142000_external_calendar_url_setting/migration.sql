-- Admin-editable read-only calendar feed URL. Env vars still work as a fallback,
-- but local instances can now paste/update the iCal feed from the app UI.
ALTER TABLE "Setting" ADD COLUMN "externalCalendarUrl" TEXT;

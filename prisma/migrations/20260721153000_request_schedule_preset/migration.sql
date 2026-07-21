ALTER TABLE "Request" ADD COLUMN "schedulePreset" TEXT;

CREATE INDEX "Request_schedulePreset_idx" ON "Request"("schedulePreset");

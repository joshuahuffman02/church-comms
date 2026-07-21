-- Add indexes used by the date-bounded This Week and Sunday lineup queries.
CREATE INDEX "EventUpdate_scheduledFor_status_idx" ON "EventUpdate"("scheduledFor", "status");
CREATE INDEX "EventTask_dueAt_status_idx" ON "EventTask"("dueAt", "status");
CREATE INDEX "Deliverable_productionDueAt_status_idx" ON "Deliverable"("productionDueAt", "status");
CREATE INDEX "Deliverable_channelId_productionDueAt_idx" ON "Deliverable"("channelId", "productionDueAt");
CREATE INDEX "Touch_channelId_scheduledAt_idx" ON "Touch"("channelId", "scheduledAt");
CREATE INDEX "Touch_deliverableId_idx" ON "Touch"("deliverableId");

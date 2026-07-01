-- Add an optional schedule preset to tag rules. This lets a PCO tag affect
-- channel placement without hardcoding a specific event title in the planner.
ALTER TABLE "EventTagRule" ADD COLUMN "schedulePreset" TEXT;

CREATE INDEX "EventTagRule_schedulePreset_idx" ON "EventTagRule"("schedulePreset");

-- Default customization requested for monthly awareness items like
-- "Missionary of the Month": first-Sunday announcement video, then weekly
-- loop/email/website placements for that month. If the tag already exists,
-- preserve its ministry/tier/playbook fields and only attach the preset.
INSERT INTO "EventTagRule" (
  "id",
  "tag",
  "ministryId",
  "tierSuggestion",
  "noPromo",
  "missionTrip",
  "suggestedTemplateId",
  "schedulePreset",
  "sortOrder",
  "createdAt"
)
VALUES (
  'default_missionary_of_the_month_schedule',
  'Missionary of the Month',
  NULL,
  NULL,
  false,
  false,
  NULL,
  'monthly_first_sunday_full_run',
  COALESCE((SELECT MAX("sortOrder") + 1 FROM "EventTagRule"), 0),
  CURRENT_TIMESTAMP
)
ON CONFLICT("tag") DO UPDATE SET
  "schedulePreset" = 'monthly_first_sunday_full_run';

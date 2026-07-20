-- PV Update Email is a rolling weekly listing: show every promotable event
-- starting 3 weeks out, then keep listing it weekly until the event or signup
-- deadline. Make the existing email channel match that behavior on deploy.
UPDATE "Channel"
SET
  "name" = 'PV Update Email',
  "type" = 'windowed',
  "active" = true,
  "defaultPublishOffsetDays" = 21,
  "productionLeadDays" = 3,
  "cadence" = '{"weekdays":[3]}',
  "tierEligibility" = '[1,2,3]',
  "frequencyCap" = NULL,
  "capacity" = NULL
WHERE "key" = 'email';

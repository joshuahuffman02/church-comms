# Planning Center Forms, Tags, And Rooms Setup

This guide describes one practical way to make Planning Center Calendar feed
cleanly into Church Comms.

Planning Center remains the source of truth for event requests, approvals,
rooms, resources, and public Church Center visibility. Church Comms reads
approved Calendar events and classifies them for communication planning.

## Important API Constraints

- Planning Center Calendar event data is readable.
- Calendar form answers and form definitions are not available through the API
  in the same way event tags, event dates, rooms, descriptions, and owners are.
- Because of that, Church Comms classifies imported events from tags, not from
  custom form answers.
- This app is read-only against Planning Center. It does not create or modify
  Planning Center events.

## Recommended Tag Model

Use three tag groups.

### Ministry

Tags identify the audience or owning ministry. Examples:

- `All Church` -> tier 1
- `Kids` or `Children's` -> tier 2
- `Students` or `Youth` -> tier 2
- `Women` or `Women's Ministry` -> tier 2
- `Men` or `Men's Ministry` -> tier 2
- `Small Group` -> tier 3
- `Staff` -> no-promo

Adapt the default rules in Settings -> Tag rules to match your actual Planning
Center tag names.

### Event Type

Tags identify whether the event should usually be promoted.

- `Service` -> promo-eligible
- `Class` -> promo-eligible
- `Small Group` -> tier 3
- `Meeting` -> no-promo
- `Funeral` -> no-promo
- `Wedding` -> no-promo

### Comms

Use a small override/playbook group:

- `Room Only` -> force no-promo
- `Mission Trip` -> suggest the Mission Trip playbook
- `Missionary of the Month` -> first-Sunday announcement video, then weekly
  loop, weekly email, and website placements for that month
- `Sermon Series` -> suggest the Sermon Series playbook and no-promo channel
  planning

## Approval Groups

A common setup:

- Office or comms intake group approves event requests.
- Facilities group approves rooms/resources.

Church Comms should not be a Planning Center approval step. Event approval means
the event exists. Promotion decisions happen downstream in Church Comms.

## Forms

For each request form:

- Preset obvious Event Type tags when the form has one clear purpose.
- Require requester name and email.
- Require event name, date/time, and public description.
- Include rooms/resources as native Planning Center fields.
- Ask promotion intent as a human hint, but rely on tags for app
  classification.
- State lead-time expectations in the form header.

Suggested lead times:

- Promoted events: 6 weeks.
- Room-only events: 3 weeks.
- Large campaigns or mission trips: 8-12 weeks.

## Round-Trip Test

1. Submit a test form.
2. Approve it in Planning Center.
3. Add Ministry and Event Type tags.
4. Run Church Comms import or wait for scheduled sync.
5. Confirm the imported request has the expected ministry, tier, no-promo
   status, rooms, description, and requester contact.

Re-run `npx tsx scripts/sync-tag-rules.ts` when you want to refresh the default
tag-rule set in an existing database without reseeding demo data.

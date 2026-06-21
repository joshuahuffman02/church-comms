# Project Status

Church Comms is pre-`v1.0.0` and ready for public hardening.

## Current Capabilities

- Request intake and requester status pages.
- Admin request list, detail pages, status pipeline, and kanban pipeline.
- Reverse-timeline planning for channel deliverables and touches.
- This Week board, master calendar, run sheet, output previews, and exports.
- Optional approvals, guardrails, sprints, recurring series, playbooks, owners,
  assets, proofs, and activity logs.
- Optional one-way Planning Center Calendar import.
- Optional local iCal import preview.
- SQLite backup and restore scripts.

## Before v1.0.0

- Add screenshots or a short demo video.
- Confirm GitHub Actions passes.
- Review issue templates after first outside feedback.
- Tag `v1.0.0` with release notes that mention whether migrations are included.

## Instance Policy

The public repo contains reusable product code and demo data only. Live church
data, credentials, SQLite databases, backups, import files, and church-only
scripts stay out of git. Upgrades should keep the same local `.env` and
SQLite database, then run `npm run db:prepare`.

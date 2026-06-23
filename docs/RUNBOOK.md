# Operator Runbook

This runbook covers running Church Comms as a self-hosted production instance on
macOS, Linux, or Docker. It focuses on data safety: SQLite, backups, upgrades,
and recovery.

## Quick Facts

| Thing | Default |
| --- | --- |
| Database | `dev.db` at the repo root, controlled by `DATABASE_URL` |
| Backups | `backups/`, written by `scripts/backup-db.sh` |
| App port | `3000`, override with `PORT` |
| Timezone | Pin the church's timezone with `TZ` |
| Production start | `npm run start` |
| Database setup/upgrades | `npm run db:prepare`; never use `prisma migrate dev` in production |
| Secrets | `.env`, gitignored |

## First-Time Setup

```bash
npm ci
cp .env.example .env
```

Fill in:

```bash
DATABASE_URL="file:./dev.db"
AUTH_SECRET="<openssl rand -base64 32>"
APP_URL="http://localhost:3000"
```

Then initialize:

```bash
npm run prisma:generate
npm run db:prepare
ADMIN_PASSWORD="<temporary-admin-password>" npx tsx prisma/seed.ts
npm run build
TZ=America/Chicago NODE_ENV=production npm run start
```

`db:prepare` creates a current schema baseline on a blank SQLite database. On an
existing Prisma-managed database, it only applies pending migrations.

Set or reset a password any time:

```bash
npx tsx scripts/set-password.ts admin@example.church '<new-password>'
```

## Process Managers

Build before starting. The process manager should run `npm run start`.

### systemd

Edit `deploy/comms.service`, then:

```bash
sudo cp deploy/comms.service /etc/systemd/system/comms.service
sudo systemctl daemon-reload
sudo systemctl enable --now comms
systemctl status comms
journalctl -u comms -f
```

### PM2

```bash
npm install -g pm2
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup
pm2 status
pm2 logs comms
```

### Docker

```bash
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml logs -f
```

The compose file bind-mounts `dev.db` and `backups/` from the host so data stays
outside the container.

## Backups

```bash
npm run backup
```

The script uses SQLite's online-safe `.backup`, verifies the snapshot with
`PRAGMA integrity_check`, prunes old snapshots, and optionally copies the backup
to `BACKUP_REMOTE` with `rclone`.

Example cron:

```cron
0 2 * * * cd "/srv/church-comms" && bash scripts/backup-db.sh >> backups/backup.log 2>&1
```

## Restore

Stop the app first.

```bash
ls -lt backups/comms-*.db
bash scripts/restore-db.sh backups/comms-YYYYMMDD-HHMMSS.db
```

The restore script saves the current DB to `backups/pre-restore-<timestamp>.db`
before replacing it and integrity-checking the result.

## Safe Upgrade

```bash
npm run backup
git fetch --tags
git checkout vX.Y.Z
npm ci
npm run prisma:generate
npm run db:prepare
npm run build
# restart systemd, PM2, or Docker
```

Read release notes before upgrading. Pay special attention to migration notes and
any manual configuration changes.

### In-App Updates

Trusted local installs can expose the same safe upgrade flow at
`Settings > Updates`.

Keep it disabled unless the app is only reachable by trusted admins on a trusted
machine:

```bash
ENABLE_APP_UPDATER=true
UPDATE_REMOTE=origin
UPDATE_BRANCH=main
PM2_APP_NAME=comms
# Optional:
# UPDATE_RESTART_CMD="pm2 restart comms"
```

Admins can then check GitHub and run the update from the app. The updater only
fast-forwards to the configured branch. If tracked local changes, local-only
commits, or diverged history are present, it stops and asks for a manual update.

The button runs:

```bash
npm run backup
git pull --ff-only "$UPDATE_REMOTE" "$UPDATE_BRANCH"
npm ci
npm run prisma:generate
npm run db:prepare
npm run build
pm2 restart "$PM2_APP_NAME" # or UPDATE_RESTART_CMD
```

The page may briefly disconnect during restart. Reload it after the process
comes back up.

## Product Repo Vs Church Instance

Keep the public GitHub repo generic. The live church instance should keep its
identity and content in ignored local state:

- `.env` for secrets, URLs, timezone, SMTP, Planning Center, cron, and calendar
  settings.
- The SQLite database file named by `DATABASE_URL` for real users, requests,
  ministries, channels, tag rules, playbooks, templates, mirrored rooms, and
  imported events.
- `backups/` for database snapshots.
- `instance/`, `local-instance/`, or `local-data/` for private import files,
  operational notes, one-off scripts, and source exports.

The usual live upgrade flow is: back up the DB, move the code to a reviewed
release, install dependencies, generate Prisma, run `db:prepare`, build, and
restart. Do not run `prisma/seed.ts` on a live instance unless you intentionally
want demo content mixed into the real database.

## Troubleshooting

1. Check the process: `systemctl status comms`, `pm2 status`, or `docker ps`.
2. Check logs: `journalctl -u comms -n 100`, `pm2 logs comms --lines 100`, or
   Docker logs.
3. Confirm local reachability: `curl -I http://localhost:3000`.
4. Confirm database preparation: `npm run db:prepare`.
5. Confirm DB health: `sqlite3 dev.db 'PRAGMA integrity_check;'`.
6. Confirm timezone: the production process should set `TZ` to the church's
   local timezone.
7. If login fails, reset a password with `scripts/set-password.ts`.

After any incident, take a fresh backup once the app is healthy.

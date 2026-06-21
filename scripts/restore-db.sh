#!/usr/bin/env bash
#
# restore-db.sh — restore the Church Communications SQLite database from a backup.
#
# Usage:
#   bash scripts/restore-db.sh <backup-file>
#   bash scripts/restore-db.sh backups/comms-20260604-021500.db
#
# IMPORTANT: STOP THE APP FIRST.
#   This script does NOT stop the running app — restoring the DB out from under
#   a live process can corrupt the new file and confuse the app. Before running:
#     systemd:  sudo systemctl stop comms
#     PM2:      pm2 stop comms
#     Docker:   docker compose -f deploy/docker-compose.yml down
#     dev:      stop `npm run dev` / `npm run start` (Ctrl-C)
#
# What it does:
#   1. Validates the backup file exists and passes a SQLite integrity check.
#   2. Backs up the CURRENT dev.db to backups/pre-restore-<ts>.db (so a restore
#      is itself reversible — you never lose the pre-restore state).
#   3. Copies the chosen backup over dev.db.
#   4. Verifies the restored DB passes an integrity check.
#
# Configuration (environment variables, optional):
#   DATABASE_FILE   Path to the live SQLite DB   (default: ./dev.db)
#   BACKUP_DIR      Where the safety copy is put (default: ./backups)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DB="${DATABASE_FILE:-$REPO_ROOT/dev.db}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"

fail() { echo "restore-db: ERROR: $*" >&2; exit 1; }

# --- Usage guard ---
if [ "$#" -ne 1 ] || [ -z "${1:-}" ]; then
  cat >&2 <<'USAGE'
Usage: restore-db.sh <backup-file>

Restore the Church Communications database from a backup.

  <backup-file>   Path to a backup .db file (e.g. backups/comms-YYYYMMDD-HHMMSS.db)

STOP THE APP FIRST (systemctl stop comms / pm2 stop comms / docker compose down).
The current dev.db is saved to backups/pre-restore-<timestamp>.db before being
overwritten, so this operation is reversible.
USAGE
  exit 1
fi

SRC="$1"
command -v sqlite3 >/dev/null 2>&1 || fail "sqlite3 not found on PATH."
[ -f "$SRC" ] || fail "backup file not found: $SRC"
[ -s "$SRC" ] || fail "backup file is empty: $SRC"

# --- Validate the backup before trusting it ---
SRC_INTEGRITY="$(sqlite3 "$SRC" 'PRAGMA integrity_check;' 2>/dev/null || true)"
[ "$SRC_INTEGRITY" = "ok" ] || fail "backup file failed integrity check ($SRC): ${SRC_INTEGRITY:-<not a valid SQLite DB>}"

echo "restore-db: about to restore"
echo "             FROM (backup): $SRC"
echo "             INTO (live DB): $DB"
echo
echo "  Make sure the app is STOPPED (systemctl stop comms / pm2 stop comms /"
echo "  docker compose down). Restoring under a live app can corrupt the DB."
echo

# --- Confirm (skippable for non-interactive runs with FORCE=1) ---
if [ "${FORCE:-0}" != "1" ]; then
  printf "Type 'yes' to continue: "
  read -r CONFIRM
  [ "$CONFIRM" = "yes" ] || fail "aborted by operator (no changes made)."
fi

mkdir -p "$BACKUP_DIR" || fail "could not create backup dir: $BACKUP_DIR"

# --- Safety copy of the current live DB (if it exists) ---
if [ -f "$DB" ]; then
  TS="$(date +%Y%m%d-%H%M%S)"
  PRE="$BACKUP_DIR/pre-restore-$TS.db"
  # Use sqlite3 .backup so the safety copy is consistent even if something is
  # still attached; fall back to cp only if .backup fails (e.g. unreadable).
  if ! sqlite3 "$DB" ".backup '$PRE'" 2>/dev/null; then
    cp "$DB" "$PRE" || fail "could not save current DB to $PRE"
  fi
  echo "restore-db: saved current DB to $PRE"
else
  echo "restore-db: NOTE: no existing $DB to back up (fresh restore)."
fi

# --- Perform the restore ---
cp "$SRC" "$DB" || fail "failed to copy backup over $DB"

# --- Verify the restored DB ---
RESTORED_INTEGRITY="$(sqlite3 "$DB" 'PRAGMA integrity_check;' 2>/dev/null || true)"
[ "$RESTORED_INTEGRITY" = "ok" ] || fail "restored DB failed integrity check! The pre-restore copy in $BACKUP_DIR is intact — copy it back to $DB to recover."

echo "restore-db: OK — restored $DB from $SRC (integrity=ok)"
echo "restore-db: NEXT — start the app again:"
echo "             systemd: sudo systemctl start comms"
echo "             PM2:     pm2 start comms"
echo "             Docker:  docker compose -f deploy/docker-compose.yml up -d"

#!/usr/bin/env bash
#
# backup-db.sh — online-safe, timestamped backups of the Church Communications
# SQLite database, with pruning and optional off-box copy to Google Drive.
#
# Why this exists: the entire system of record is a single SQLite file
# (dev.db). Losing it loses everything. This script is the #1 safeguard.
#
# What it does:
#   1. Uses sqlite3 ".backup" (online-safe — consistent even while the app is
#      writing) to snapshot the DB. We do NOT `cp` a live SQLite file; a raw
#      copy of a database mid-write can be corrupt.
#   2. Writes a timestamped copy to backups/comms-YYYYMMDD-HHMMSS.db
#   3. Prunes old backups: keeps the newest N (default 30) AND anything from
#      the last 7 days (whichever is the larger set — recent backups are never
#      pruned even if you have more than N in a busy week).
#   4. If rclone is installed AND $BACKUP_REMOTE is set, copies the new backup
#      off the box (e.g. to Google Drive). Skips gracefully otherwise.
#
# Usage:
#   bash scripts/backup-db.sh
#   npm run backup
#
# Configuration (environment variables, all optional):
#   DATABASE_FILE   Path to the SQLite DB        (default: ./dev.db)
#   BACKUP_DIR      Where backups are written    (default: ./backups)
#   KEEP_COUNT      Min number of backups to keep (default: 30)
#   KEEP_DAYS       Always keep backups newer than this many days (default: 7)
#   BACKUP_REMOTE   rclone remote:path for off-box copy (e.g.
#                   gdrive:church-comms-backups). If unset, off-box copy is
#                   skipped with a note.
#
# Exits non-zero on any failure (so cron/systemd can alert).

set -euo pipefail

# --- Resolve repo root so the script works from any cwd (path has a space) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- Config (with defaults) ---
DB="${DATABASE_FILE:-$REPO_ROOT/dev.db}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
KEEP_COUNT="${KEEP_COUNT:-30}"
KEEP_DAYS="${KEEP_DAYS:-7}"
BACKUP_REMOTE="${BACKUP_REMOTE:-}"

fail() { echo "backup-db: ERROR: $*" >&2; exit 1; }

# --- Preconditions ---
command -v sqlite3 >/dev/null 2>&1 || fail "sqlite3 not found on PATH. Install it (macOS ships it; Linux: apt-get install sqlite3)."
[ -f "$DB" ] || fail "database file not found: $DB (set DATABASE_FILE to override)"

mkdir -p "$BACKUP_DIR" || fail "could not create backup dir: $BACKUP_DIR"

TS="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_DIR/comms-$TS.db"

# --- Online-safe backup ---
# Single-quote the destination inside the SQL so paths with spaces are safe.
if ! sqlite3 "$DB" ".backup '$DEST'"; then
  rm -f "$DEST" 2>/dev/null || true
  fail "sqlite3 .backup failed for $DB"
fi

[ -s "$DEST" ] || fail "backup produced an empty file: $DEST"

# --- Verify the snapshot is a valid SQLite DB before trusting it ---
INTEGRITY="$(sqlite3 "$DEST" 'PRAGMA integrity_check;' 2>/dev/null || true)"
if [ "$INTEGRITY" != "ok" ]; then
  fail "integrity check on fresh backup failed ($DEST): ${INTEGRITY:-<no output>}"
fi

# --- Prune: keep newest KEEP_COUNT, plus everything newer than KEEP_DAYS ---
# Build the set of files to keep, then delete the rest. Null-delimited to be
# safe with spaces in paths.
prune() {
  local keep_list rm_count=0
  # Newest KEEP_COUNT files (by mtime, newest first).
  keep_list="$(ls -t "$BACKUP_DIR"/comms-*.db 2>/dev/null | head -n "$KEEP_COUNT" || true)"

  local f
  while IFS= read -r -d '' f; do
    [ -n "$f" ] || continue
    # Keep if in the newest-N list.
    if printf '%s\n' "$keep_list" | grep -Fxq "$f"; then
      continue
    fi
    # Keep if modified within the last KEEP_DAYS days.
    if [ -n "$(find "$f" -mtime "-$KEEP_DAYS" -print 2>/dev/null)" ]; then
      continue
    fi
    rm -f "$f" && rm_count=$((rm_count + 1))
  done < <(find "$BACKUP_DIR" -maxdepth 1 -name 'comms-*.db' -print0 2>/dev/null)

  [ "$rm_count" -gt 0 ] && echo "backup-db: pruned $rm_count old backup(s) (keep newest $KEEP_COUNT + last $KEEP_DAYS days)"
  return 0
}
prune

# --- Optional off-box copy via rclone (e.g. Google Drive) ---
if [ -n "$BACKUP_REMOTE" ]; then
  if command -v rclone >/dev/null 2>&1; then
    if rclone copy "$DEST" "$BACKUP_REMOTE" >/dev/null 2>&1; then
      echo "backup-db: copied off-box to $BACKUP_REMOTE"
    else
      fail "rclone copy to $BACKUP_REMOTE failed (backup is still safe locally at $DEST)"
    fi
  else
    echo "backup-db: NOTE: BACKUP_REMOTE is set ($BACKUP_REMOTE) but rclone is not installed — skipping off-box copy. Install rclone and run 'rclone config' to enable Google Drive backups."
  fi
else
  echo "backup-db: NOTE: BACKUP_REMOTE not set — backup is LOCAL ONLY. Set BACKUP_REMOTE (e.g. gdrive:church-comms-backups) and install rclone to keep a copy off the box."
fi

# --- Success summary ---
SIZE="$(du -h "$DEST" | cut -f1)"
echo "backup-db: OK — $DEST ($SIZE), integrity=ok"

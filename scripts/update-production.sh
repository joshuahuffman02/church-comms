#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

REMOTE="${UPDATE_REMOTE:-origin}"
BRANCH="${UPDATE_BRANCH:-main}"
PM2_APP_NAME="${PM2_APP_NAME:-comms}"

log() {
  printf "\n==> %s\n" "$*"
}

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "This update script must run inside a Git checkout."
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Tracked local changes are present. Commit, stash, or remove them before updating."
  git status --short
  exit 1
fi

log "Fetching ${REMOTE}/${BRANCH}"
git fetch "$REMOTE" "+refs/heads/${BRANCH}:refs/remotes/${REMOTE}/${BRANCH}" --tags

CURRENT_SHA="$(git rev-parse HEAD)"
TARGET_SHA="$(git rev-parse "${REMOTE}/${BRANCH}")"

if [ "$CURRENT_SHA" = "$TARGET_SHA" ]; then
  echo "Already up to date at ${CURRENT_SHA}."
  exit 0
fi

MERGE_BASE="$(git merge-base HEAD "${REMOTE}/${BRANCH}")"

if [ "$MERGE_BASE" != "$CURRENT_SHA" ]; then
  echo "This checkout cannot fast-forward to ${REMOTE}/${BRANCH}."
  echo "Current: ${CURRENT_SHA}"
  echo "Target:  ${TARGET_SHA}"
  echo "Update manually so no local commits are lost."
  exit 1
fi

log "Backing up database"
npm run backup

log "Updating code"
git pull --ff-only "$REMOTE" "$BRANCH"

log "Installing dependencies"
npm ci

log "Generating Prisma client"
npm run prisma:generate

log "Preparing database"
npm run db:prepare

log "Building app"
npm run build

log "Restarting app"
if [ -n "${UPDATE_RESTART_CMD:-}" ]; then
  sh -c "$UPDATE_RESTART_CMD"
elif command -v pm2 >/dev/null 2>&1; then
  pm2 restart "$PM2_APP_NAME"
else
  echo "No restart command configured and pm2 was not found."
  echo "Restart the app manually."
fi

log "Update complete"

# deploy/Dockerfile — optional containerized run of the Church Communications app.
#
# Minimal, correct single-stage image: install deps, generate the Prisma client,
# build, then `next start`. We keep build + runtime on ONE Node 24 image on
# purpose: the app uses @prisma/adapter-better-sqlite3, a NATIVE module, so the
# build and runtime Node ABI must match. A slim multi-stage copy can break the
# native binding; this avoids that whole class of bug.
#
# Build context is the REPO ROOT (so the whole project is available). Build with:
#   docker compose -f deploy/docker-compose.yml up -d --build
# or directly:
#   docker build -f deploy/Dockerfile -t church-comms .
#
# The SQLite DB and backups/ are bind-mounted at runtime (see docker-compose.yml)
# so data lives on the host, NOT inside the container.

FROM node:24-bookworm-slim

# sqlite3 CLI is needed by scripts/backup-db.sh and restore-db.sh.
RUN apt-get update \
  && apt-get install -y --no-install-recommends sqlite3 ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    TZ=America/Chicago \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

# --- Install dependencies (cached on lockfile changes) ---
# Copy manifests + the prisma + config files needed by the postinstall/build.
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# Need devDependencies (prisma, tsx, typescript, tailwind) to build, so install
# the full tree; we are not optimizing image size to the last MB here.
RUN npm ci

# --- Copy the rest of the source and build ---
COPY . .

# Generate the Prisma client, then build the Next.js app.
RUN npx prisma generate \
  && npm run build

EXPOSE 3000

# Apply pending migrations against the mounted DB, then start the server.
# (migrate deploy is non-interactive and safe for production.)
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]

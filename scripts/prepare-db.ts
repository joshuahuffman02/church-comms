import "dotenv/config";

import Database from "better-sqlite3";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(repoRoot, "prisma", "migrations");

function sqliteFileFromDatabaseUrl(databaseUrl: string): string {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error(
      `Only SQLite file: DATABASE_URL values are supported by db:prepare. Received ${JSON.stringify(databaseUrl)}.`,
    );
  }

  const withoutScheme = databaseUrl.slice("file:".length).split("?")[0] ?? "";
  if (!withoutScheme) {
    throw new Error("DATABASE_URL must include a SQLite file path, for example file:./dev.db.");
  }

  const decodedPath = decodeURIComponent(withoutScheme);
  if (decodedPath.startsWith("//")) {
    return fileURLToPath(`file:${decodedPath}`);
  }

  return path.isAbsolute(decodedPath)
    ? decodedPath
    : path.resolve(repoRoot, decodedPath);
}

function npxCommand(): string {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function runPrisma(args: string[]): void {
  execFileSync(npxCommand(), ["prisma", ...args], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
}

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);
  return Boolean(row);
}

function userTableNames(db: Database.Database): string[] {
  const rows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as { name: string }[];
  return rows.map((row) => row.name);
}

function migrationNames(): string[] {
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(migrationsDir, name, "migration.sql")))
    .sort();
}

function migrationChecksum(migrationName: string): string {
  const sql = fs.readFileSync(path.join(migrationsDir, migrationName, "migration.sql"));
  return crypto.createHash("sha256").update(sql).digest("hex");
}

function createMigrationTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
    );
  `);
}

function markExistingMigrationsApplied(db: Database.Database): void {
  const now = Date.now();
  const insert = db.prepare(`
    INSERT INTO "_prisma_migrations" (
      "id",
      "checksum",
      "finished_at",
      "migration_name",
      "logs",
      "rolled_back_at",
      "started_at",
      "applied_steps_count"
    )
    VALUES (?, ?, ?, ?, NULL, NULL, ?, 1)
  `);

  for (const [index, migrationName] of migrationNames().entries()) {
    const appliedAt = now + index;
    insert.run(
      crypto.randomUUID(),
      migrationChecksum(migrationName),
      appliedAt,
      migrationName,
      appliedAt,
    );
  }
}

function generateBaselineSql(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "church-comms-db-"));
  const outputPath = path.join(tmpDir, "baseline.sql");

  try {
    runPrisma([
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema",
      "prisma/schema.prisma",
      "--script",
      "--output",
      outputPath,
    ]);
    return fs.readFileSync(outputPath, "utf8");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function baselineBlankDatabase(db: Database.Database): void {
  const baselineSql = generateBaselineSql();

  const applyBaseline = db.transaction(() => {
    db.exec(baselineSql);
    createMigrationTable(db);
    markExistingMigrationsApplied(db);
  });

  db.pragma("foreign_keys = OFF");
  try {
    applyBaseline();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

function main(): void {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required. Copy .env.example to .env and set DATABASE_URL=file:./dev.db.");
  }

  const dbPath = sqliteFileFromDatabaseUrl(databaseUrl);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  try {
    const tables = userTableNames(db);
    const hasMigrationTable = tables.includes("_prisma_migrations");
    const migrationCount = hasMigrationTable
      ? (db.prepare('SELECT COUNT(*) AS count FROM "_prisma_migrations"').get() as { count: number }).count
      : 0;

    if (hasMigrationTable && migrationCount > 0) {
      console.log("Existing Prisma database detected; applying pending migrations.");
      db.close();
      runPrisma(["migrate", "deploy"]);
      return;
    }

    const nonMigrationTables = tables.filter((table) => table !== "_prisma_migrations");
    if (nonMigrationTables.length > 0) {
      throw new Error(
        `Database already contains tables but has no Prisma migration history: ${nonMigrationTables.join(", ")}. ` +
          "Back it up and reconcile it manually before running migrations.",
      );
    }

    if (tableExists(db, "_prisma_migrations") && migrationCount === 0) {
      db.exec('DROP TABLE "_prisma_migrations"');
    }

    console.log("Blank SQLite database detected; creating current schema baseline.");
    baselineBlankDatabase(db);
  } finally {
    if (db.open) db.close();
  }

  console.log("Database schema is ready.");
}

main();

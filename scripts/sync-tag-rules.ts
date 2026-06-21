import "dotenv/config";
import { db } from "../src/lib/db";
import { upsertDefaultTagRules } from "../prisma/tag-rules-seed-data";

// Non-destructive sync of the tag-classification layer against the current DB:
//   1. Ensure the brand ministries the PCO tag rules resolve to actually exist
//      (creates only the missing ones — never wipes or renames).
//   2. Re-run the idempotent default tag-rule upsert (idempotent by `tag`).
// Safe to run repeatedly. Unlike the full seed, this touches NOTHING else
// (no events, channels, users). Run with: npx tsx scripts/sync-tag-rules.ts

// The ministries the rules' `ministryNames` candidates expect to find. Colors
// match the demo seed so a created ministry looks consistent. Names here are the
// app names (the rules already map PCO labels → these via candidate lists).
const MINISTRY_COLORS: Record<string, string> = {
  "All-Church": "#c7b9ff", Kids: "#34d399", Rise: "#f59e0b", Thrive: "#ef4444",
  College: "#06b6d4", Men: "#3b82f6", Women: "#ec4899", Seniors: "#a3e635",
  Missions: "#8b5cf6", "Young Adults": "#2dd4bf", "Young Families": "#818cf8",
  Community: "#fb7185",
};

async function main() {
  // 1) Ensure ministries (Ministry.name has no unique index, so find-or-create).
  const existing = await db.ministry.findMany({ select: { name: true } });
  const have = new Set(existing.map((m) => m.name.toLowerCase()));
  let created = 0;
  for (const [name, color] of Object.entries(MINISTRY_COLORS)) {
    if (have.has(name.toLowerCase())) continue;
    await db.ministry.create({ data: { name, color } });
    created++;
    console.log(`  + created ministry "${name}"`);
  }
  if (!created) console.log("  all expected ministries already present");

  // 2) Re-run the idempotent tag-rule upsert.
  const r = await upsertDefaultTagRules(db);
  console.log(
    `Tag rules: ${r.ensured} ensured · ${r.withMinistry} with a ministry · ` +
      `${r.withoutMinistry} control/tier-only · ${r.withPlaybook} with a playbook.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

// Standalone, idempotent upsert of the example "Mission Trip" Event Playbook
// into the CURRENT database — without re-running the full seed (which would
// recreate sample events). Reuses the same helper the full seed uses.
//
//   npx tsx prisma/seed-mission-trip.ts
import "dotenv/config";
import { db } from "../src/lib/db";
import { upsertMissionTripPlaybook } from "./playbook-seed-data";

async function main() {
  const res = await upsertMissionTripPlaybook(db);
  console.log(
    `Mission Trip playbook upserted: templateId=${res.templateId}, ${res.tasksEnsured} tasks ensured.`
  );
}

main().finally(() => db.$disconnect());

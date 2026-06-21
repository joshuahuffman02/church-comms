// Standalone, idempotent insert of the "Sermon Series" Event Playbook + its
// tag rule into the CURRENT database — without re-running the full seed (which
// would recreate sample events / clobber the live demo data). Also backfills
// the existing "Mission Trip" tag rule's suggestedTemplateId so the generalized
// tag→playbook suggestion works for it too.
//
// A sermon series is NOT promoted across ad channels (the tag rule sets
// noPromo) — its launch instead offers the brand/asset checklist. The tag +
// playbook IS the "event type"; no new model.
//
//   npx tsx prisma/seed-sermon-series.ts
import "dotenv/config";
import { db } from "../src/lib/db";
import {
  upsertSermonSeriesPlaybook,
  upsertMissionTripPlaybook,
} from "./playbook-seed-data";

async function main() {
  // 1. Ensure both playbooks exist (idempotent by name) and grab their ids.
  const series = await upsertSermonSeriesPlaybook(db);
  const mission = await upsertMissionTripPlaybook(db);

  // 2. Upsert the "Sermon Series" tag rule → noPromo + suggest the playbook.
  //    sortOrder lands after the current max so it reads last in settings.
  const max = await db.eventTagRule.aggregate({ _max: { sortOrder: true } });
  const existing = await db.eventTagRule.findUnique({
    where: { tag: "Sermon Series" },
    select: { sortOrder: true },
  });
  await db.eventTagRule.upsert({
    where: { tag: "Sermon Series" },
    update: { noPromo: true, suggestedTemplateId: series.templateId },
    create: {
      tag: "Sermon Series",
      noPromo: true,
      suggestedTemplateId: series.templateId,
      sortOrder: existing?.sortOrder ?? (max._max.sortOrder ?? 0) + 1,
    },
  });

  // 3. Backfill the existing "Mission Trip" tag rule's suggestedTemplateId so
  //    the generalized suggestion works for it too (only if that rule exists).
  const missionRule = await db.eventTagRule.findUnique({
    where: { tag: "Mission Trip" },
    select: { id: true },
  });
  if (missionRule) {
    await db.eventTagRule.update({
      where: { tag: "Mission Trip" },
      data: { suggestedTemplateId: mission.templateId },
    });
  }

  console.log(
    `Sermon Series playbook upserted: templateId=${series.templateId}, ${series.tasksEnsured} tasks ensured.\n` +
      `Sermon Series tag rule upserted: noPromo=true, suggestedTemplateId=${series.templateId}.\n` +
      (missionRule
        ? `Mission Trip tag rule linked to playbook ${mission.templateId}.`
        : `Mission Trip tag rule not found — skipped linking (run the tag-rule seed first).`)
  );
}

main().finally(() => db.$disconnect());

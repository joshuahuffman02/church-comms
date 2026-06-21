-- PCO event-import enrichment: extra READ-ONLY Planning Center data persisted on
-- each imported Request. All pulled from PCO (never written back) and refreshed
-- every sync. See `src/lib/pco.ts` (parser + People/resource-request fetches)
-- and `src/actions/pco.ts` (upsert/sync).
--
--   pcoVisibleInChurchCenter — event.visible_in_church_center (published flag).
--   pcoFeatured              — event.featured.
--   pcoTags                  — JSON string[]: the instance's Tag names
--                              (category/ministry/campus labels).
--   pcoOwnerName / pcoOwnerEmail — the event owner (a Person, via People API).
--   pcoRoomStatus            — overall room resource-request approval:
--                              "approved" | "pending" | "rejected" (null = none).

-- AlterTable: add the six nullable enrichment columns to Request.
ALTER TABLE "Request" ADD COLUMN "pcoVisibleInChurchCenter" BOOLEAN;
ALTER TABLE "Request" ADD COLUMN "pcoFeatured" BOOLEAN;
ALTER TABLE "Request" ADD COLUMN "pcoTags" JSONB;
ALTER TABLE "Request" ADD COLUMN "pcoOwnerName" TEXT;
ALTER TABLE "Request" ADD COLUMN "pcoOwnerEmail" TEXT;
ALTER TABLE "Request" ADD COLUMN "pcoRoomStatus" TEXT;

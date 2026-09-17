-- Drop foreign keys and indexes tying LoadingAppointment to Occupant/LoadingBay
ALTER TABLE "LoadingAppointment" DROP CONSTRAINT "LoadingAppointment_occupantId_fkey";
ALTER TABLE "LoadingAppointment" DROP CONSTRAINT "LoadingAppointment_bayId_fkey";
DROP INDEX "LoadingAppointment_occupantId_idx";
DROP INDEX "LoadingAppointment_bayId_idx";

-- Add clientName as nullable first so existing rows can be backfilled
ALTER TABLE "LoadingAppointment" ADD COLUMN "clientName" TEXT;

-- Backfill clientName from the occupant that was previously linked
UPDATE "LoadingAppointment" la
SET "clientName" = o."firstName" || ' ' || o."lastName"
FROM "Occupant" o
WHERE o."id" = la."occupantId";

-- Any remaining rows without a matching occupant get a placeholder
UPDATE "LoadingAppointment" SET "clientName" = 'Client' WHERE "clientName" IS NULL;

ALTER TABLE "LoadingAppointment" ALTER COLUMN "clientName" SET NOT NULL;

-- Drop columns that are no longer part of the model
ALTER TABLE "LoadingAppointment" DROP COLUMN "occupantId";
ALTER TABLE "LoadingAppointment" DROP COLUMN "bayId";
ALTER TABLE "LoadingAppointment" DROP COLUMN "vehiclePlate";
ALTER TABLE "LoadingAppointment" DROP COLUMN "notes";

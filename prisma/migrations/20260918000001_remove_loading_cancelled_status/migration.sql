-- Postgres can't drop a single enum value directly: recreate the type
-- without CANCELLED and repoint the column.
CREATE TYPE "LoadingStatus_new" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED');
ALTER TABLE "LoadingAppointment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "LoadingAppointment" ALTER COLUMN "status" TYPE "LoadingStatus_new" USING ("status"::text::"LoadingStatus_new");
ALTER TABLE "LoadingAppointment" ALTER COLUMN "status" SET DEFAULT 'SCHEDULED';
DROP TYPE "LoadingStatus";
ALTER TYPE "LoadingStatus_new" RENAME TO "LoadingStatus";

-- Reassign any box currently under maintenance to available before dropping the enum value
UPDATE "StorageUnit" SET "status" = 'AVAILABLE' WHERE "status" = 'MAINTENANCE';

-- Recreate UnitStatus without MAINTENANCE
ALTER TYPE "UnitStatus" RENAME TO "UnitStatus_old";
CREATE TYPE "UnitStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'OCCUPIED');
ALTER TABLE "StorageUnit" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "StorageUnit" ALTER COLUMN "status" TYPE "UnitStatus" USING ("status"::text::"UnitStatus");
ALTER TABLE "StorageUnit" ALTER COLUMN "status" SET DEFAULT 'AVAILABLE';
DROP TYPE "UnitStatus_old";

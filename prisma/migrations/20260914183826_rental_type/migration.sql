-- CreateEnum
CREATE TYPE "RentalType" AS ENUM ('MONTHLY', 'ONE_TIME');

-- AlterTable
ALTER TABLE "Rental" ADD COLUMN     "type" "RentalType" NOT NULL DEFAULT 'MONTHLY';

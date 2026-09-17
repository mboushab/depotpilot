-- Parking spots are not numbered in real life; capacity and rate now come
-- from the existing "parkingSpaces" / "defaultParkingRateCents" app settings.
ALTER TABLE "ParkingAssignment" DROP CONSTRAINT "ParkingAssignment_spotId_fkey";
DROP INDEX "ParkingAssignment_spotId_idx";
ALTER TABLE "ParkingAssignment" DROP COLUMN "spotId";
DROP TABLE "ParkingSpot";
DROP TYPE "ParkingSpotStatus";

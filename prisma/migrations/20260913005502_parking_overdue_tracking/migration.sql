-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PARKING_OVERDUE';

-- AlterTable
ALTER TABLE "ParkingAssignment" ADD COLUMN     "overdueNotifiedAt" TIMESTAMP(3);

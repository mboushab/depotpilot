-- AlterTable
ALTER TABLE "LoadingAppointment" ADD COLUMN     "clientPhone" TEXT NOT NULL DEFAULT '';
ALTER TABLE "LoadingAppointment" ALTER COLUMN "clientPhone" DROP DEFAULT;

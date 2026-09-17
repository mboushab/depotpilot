CREATE TYPE "UnitStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'OCCUPIED', 'MAINTENANCE');
CREATE TYPE "RentalStatus" AS ENUM ('RESERVED', 'ACTIVE', 'ENDED', 'CANCELLED');
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'OVERDUE', 'VOID');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'DIRECT_DEBIT');
CREATE TYPE "ParkingSpotStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE');
CREATE TYPE "LoadingStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "NotificationType" AS ENUM ('PAYMENT_DUE', 'PAYMENT_OVERDUE', 'RENTAL_ENDING', 'LOADING_TODAY', 'SYSTEM');

CREATE TABLE "AdminUser" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Occupant" (
  "id" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "company" TEXT,
  "address" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "postalCode" TEXT NOT NULL,
  "country" TEXT NOT NULL DEFAULT 'FR',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Occupant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StorageUnit" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "floor" INTEGER NOT NULL DEFAULT 0,
  "surfaceM2" DECIMAL(6,2) NOT NULL,
  "volumeM3" DECIMAL(7,2) NOT NULL,
  "monthlyRateCents" INTEGER NOT NULL,
  "status" "UnitStatus" NOT NULL DEFAULT 'AVAILABLE',
  "climateControlled" BOOLEAN NOT NULL DEFAULT false,
  "accessNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StorageUnit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Rental" (
  "id" TEXT NOT NULL,
  "occupantId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "status" "RentalStatus" NOT NULL DEFAULT 'RESERVED',
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3),
  "billingDay" INTEGER NOT NULL,
  "depositCents" INTEGER NOT NULL,
  "monthlyRateCents" INTEGER NOT NULL,
  "accessCode" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Rental_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Invoice" (
  "id" TEXT NOT NULL,
  "invoiceNumber" TEXT NOT NULL,
  "occupantId" TEXT NOT NULL,
  "rentalId" TEXT,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "issueDate" TIMESTAMP(3) NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "subtotalCents" INTEGER NOT NULL,
  "taxCents" INTEGER NOT NULL,
  "totalCents" INTEGER NOT NULL,
  "paidCents" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceLine" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitCents" INTEGER NOT NULL,
  "totalCents" INTEGER NOT NULL,
  CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payment" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL,
  "reference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ParkingSpot" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "status" "ParkingSpotStatus" NOT NULL DEFAULT 'AVAILABLE',
  "monthlyRateCents" INTEGER NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ParkingSpot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ParkingAssignment" (
  "id" TEXT NOT NULL,
  "occupantId" TEXT NOT NULL,
  "spotId" TEXT NOT NULL,
  "vehiclePlate" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "plannedEndDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "monthlyRateCents" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ParkingAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoadingBay" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoadingBay_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoadingAppointment" (
  "id" TEXT NOT NULL,
  "occupantId" TEXT NOT NULL,
  "bayId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" "LoadingStatus" NOT NULL DEFAULT 'SCHEDULED',
  "vehiclePlate" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LoadingAppointment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppSetting" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");
CREATE UNIQUE INDEX "Occupant_email_key" ON "Occupant"("email");
CREATE UNIQUE INDEX "StorageUnit_code_key" ON "StorageUnit"("code");
CREATE UNIQUE INDEX "StorageUnit_position_key" ON "StorageUnit"("position");
CREATE INDEX "Rental_occupantId_idx" ON "Rental"("occupantId");
CREATE INDEX "Rental_unitId_idx" ON "Rental"("unitId");
CREATE INDEX "Rental_status_idx" ON "Rental"("status");
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");
CREATE INDEX "Invoice_occupantId_idx" ON "Invoice"("occupantId");
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");
CREATE UNIQUE INDEX "ParkingSpot_code_key" ON "ParkingSpot"("code");
CREATE INDEX "ParkingAssignment_occupantId_idx" ON "ParkingAssignment"("occupantId");
CREATE INDEX "ParkingAssignment_spotId_idx" ON "ParkingAssignment"("spotId");
CREATE UNIQUE INDEX "LoadingBay_code_key" ON "LoadingBay"("code");
CREATE UNIQUE INDEX "LoadingBay_position_key" ON "LoadingBay"("position");
CREATE INDEX "LoadingAppointment_occupantId_idx" ON "LoadingAppointment"("occupantId");
CREATE INDEX "LoadingAppointment_bayId_idx" ON "LoadingAppointment"("bayId");
CREATE INDEX "LoadingAppointment_startsAt_idx" ON "LoadingAppointment"("startsAt");
CREATE INDEX "Notification_readAt_idx" ON "Notification"("readAt");
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

ALTER TABLE "Rental" ADD CONSTRAINT "Rental_occupantId_fkey" FOREIGN KEY ("occupantId") REFERENCES "Occupant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "StorageUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_occupantId_fkey" FOREIGN KEY ("occupantId") REFERENCES "Occupant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "Rental"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ParkingAssignment" ADD CONSTRAINT "ParkingAssignment_occupantId_fkey" FOREIGN KEY ("occupantId") REFERENCES "Occupant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ParkingAssignment" ADD CONSTRAINT "ParkingAssignment_spotId_fkey" FOREIGN KEY ("spotId") REFERENCES "ParkingSpot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LoadingAppointment" ADD CONSTRAINT "LoadingAppointment_occupantId_fkey" FOREIGN KEY ("occupantId") REFERENCES "Occupant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LoadingAppointment" ADD CONSTRAINT "LoadingAppointment_bayId_fkey" FOREIGN KEY ("bayId") REFERENCES "LoadingBay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

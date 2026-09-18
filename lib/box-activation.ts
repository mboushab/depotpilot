import { prisma } from "@/lib/prisma";

// A box booked ahead of time is "RESERVED" (see createRentalAction) until
// its rental's start date arrives, at which point it becomes "OCCUPIED".
// There is no background job in this app, so this runs on every admin page
// load (see app/(admin)/layout.tsx), same pattern as the notification syncs.
export async function syncReservedBoxesToOccupied() {
  await prisma.storageUnit.updateMany({
    where: {
      status: "RESERVED",
      rentals: { some: { status: "ACTIVE", startDate: { lte: new Date() } } }
    },
    data: { status: "OCCUPIED" }
  });
}

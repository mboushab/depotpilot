import { prisma } from "@/lib/prisma";
import { isParkingOverdue } from "@/lib/storage-rules";

export async function syncOverdueParkingNotifications() {
  const candidates = await prisma.parkingAssignment.findMany({
    where: { endDate: null, overdueNotifiedAt: null },
    include: { occupant: true }
  });
  const overdue = candidates.filter((assignment) => isParkingOverdue(assignment.startDate));
  if (overdue.length === 0) {
    return;
  }

  await prisma.$transaction(
    overdue.flatMap((assignment) => [
      prisma.notification.create({
        data: {
          type: "PARKING_OVERDUE",
          title: "Stationnement à facturer",
          message: `Le véhicule ${assignment.vehiclePlate} (${assignment.occupant.firstName} ${assignment.occupant.lastName}) dépasse la période gratuite de 3 jours et devient payant.`
        }
      }),
      prisma.parkingAssignment.update({
        where: { id: assignment.id },
        data: { overdueNotifiedAt: new Date() }
      })
    ])
  );
}

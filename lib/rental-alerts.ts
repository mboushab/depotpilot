import { differenceInCalendarDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { isRentalUnpaid } from "@/lib/storage-rules";

const DEFAULT_LEAD_DAYS = 3;

export async function syncUnpaidExitNotifications() {
  const leadDaysSetting = await prisma.appSetting.findUnique({ where: { key: "notificationLeadDays" } });
  const leadDays = leadDaysSetting ? Number(leadDaysSetting.value) : DEFAULT_LEAD_DAYS;

  const candidates = await prisma.rental.findMany({
    where: { status: "ACTIVE", endDate: { not: null }, exitAlertNotifiedAt: null },
    include: { occupant: true, unit: true, invoices: true }
  });

  const now = new Date();
  const due = candidates.filter((rental) => {
    const daysUntilExit = differenceInCalendarDays(rental.endDate!, now);
    return daysUntilExit >= 0 && daysUntilExit <= leadDays && isRentalUnpaid(rental.invoices);
  });
  if (due.length === 0) {
    return;
  }

  await prisma.$transaction(
    due.flatMap((rental) => [
      prisma.notification.create({
        data: {
          type: "RENTAL_ENDING",
          title: "Sortie proche avec impayé",
          message: `${rental.occupant.firstName} ${rental.occupant.lastName} (box ${rental.unit.code}) sort bientôt et a un solde impayé.`
        }
      }),
      prisma.rental.update({
        where: { id: rental.id },
        data: { exitAlertNotifiedAt: now }
      })
    ])
  );
}

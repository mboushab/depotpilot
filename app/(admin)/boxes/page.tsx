import { prisma } from "@/lib/prisma";
import { BoxPlan } from "@/components/box-plan";

export default async function BoxesPage() {
  const [boxes, occupants, settings] = await Promise.all([
    prisma.storageUnit.findMany({
      orderBy: { position: "asc" },
      include: {
        // No take:1 — a box can have a current rental AND one already
        // booked ahead for after it ends, so all active ones are needed to
        // tell them apart.
        rentals: {
          where: { status: "ACTIVE" },
          orderBy: { startDate: "asc" },
          include: {
            occupant: true,
            invoices: true
          }
        }
      }
    }),
    prisma.occupant.findMany({ orderBy: { lastName: "asc" } }),
    prisma.appSetting.findMany()
  ]);
  const depositEnabled = settings.find((setting) => setting.key === "depositEnabled")?.value === "true";
  const defaultDepositCents = Number(settings.find((setting) => setting.key === "defaultDepositCents")?.value ?? 0);
  const leadDays = Number(settings.find((setting) => setting.key === "notificationLeadDays")?.value ?? 3);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Box de stockage</h1>
        <p className="text-sm text-muted-foreground">Le dépôt contient {boxes.length} box. Ajoutez-en depuis Paramètres → Tarifs des box.</p>
      </div>
      <BoxPlan
        boxes={boxes.map((box) => {
          const now = new Date();
          // Rentals are ordered by startDate asc: the current one is the
          // last one already started (covers "now"); anything after it is
          // queued for later.
          const started = box.rentals.filter((rental) => rental.startDate <= now);
          const rental = started[started.length - 1];
          const upcoming = box.rentals.find((candidate) => candidate.startDate > now);
          const toRental = (entry: (typeof box.rentals)[number]) => ({
            id: entry.id,
            type: entry.type,
            startDate: entry.startDate.toISOString(),
            endDate: entry.endDate?.toISOString() ?? null,
            occupantName: `${entry.occupant.firstName} ${entry.occupant.lastName}`,
            occupantPhone: entry.occupant.phone,
            monthlyRateCents: entry.monthlyRateCents,
            invoices: entry.invoices.map((invoice) => ({
              status: invoice.status,
              totalCents: invoice.totalCents,
              paidCents: invoice.paidCents
            }))
          });
          return {
            id: box.id,
            code: box.code,
            position: box.position,
            status: box.status,
            monthlyRateCents: box.monthlyRateCents,
            surfaceM2: box.surfaceM2.toString(),
            activeRental: rental ? toRental(rental) : undefined,
            upcomingRental: upcoming
              ? {
                  occupantName: `${upcoming.occupant.firstName} ${upcoming.occupant.lastName}`,
                  startDate: upcoming.startDate.toISOString()
                }
              : undefined,
            // All of them, current and queued — a period search needs to
            // check every one, and each can be managed from the drawer.
            rentals: box.rentals.map(toRental)
          };
        })}
        occupants={occupants.map((occupant) => ({ id: occupant.id, label: `${occupant.firstName} ${occupant.lastName}`, phone: occupant.phone }))}
        depositEnabled={depositEnabled}
        defaultDepositCents={defaultDepositCents}
        leadDays={leadDays}
      />
    </div>
  );
}

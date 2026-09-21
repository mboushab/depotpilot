import { prisma } from "@/lib/prisma";
import { BoxPlan } from "@/components/box-plan";

export default async function BoxesPage() {
  const [boxes, occupants, settings] = await Promise.all([
    prisma.storageUnit.findMany({
      orderBy: { position: "asc" },
      include: {
        rentals: {
          where: { status: "ACTIVE" },
          include: {
            occupant: true,
            invoices: true
          },
          take: 1
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
          const rental = box.rentals[0];
          return {
            id: box.id,
            code: box.code,
            position: box.position,
            status: box.status,
            monthlyRateCents: box.monthlyRateCents,
            surfaceM2: box.surfaceM2.toString(),
            activeRental: rental
              ? {
                  id: rental.id,
                  type: rental.type,
                  startDate: rental.startDate.toISOString(),
                  endDate: rental.endDate?.toISOString() ?? null,
                  occupantName: `${rental.occupant.firstName} ${rental.occupant.lastName}`,
                  occupantPhone: rental.occupant.phone,
                  monthlyRateCents: rental.monthlyRateCents,
                  invoices: rental.invoices.map((invoice) => ({
                    status: invoice.status,
                    totalCents: invoice.totalCents,
                    paidCents: invoice.paidCents
                  }))
                }
              : undefined
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

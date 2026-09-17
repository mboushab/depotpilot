import { prisma } from "@/lib/prisma";
import { AddCarDialog } from "@/components/parking/add-car-dialog";
import { ParkingPlan } from "@/components/parking-plan";

export default async function ParkingPage() {
  const [occupants, assignments] = await Promise.all([
    prisma.occupant.findMany({ orderBy: { lastName: "asc" } }),
    prisma.parkingAssignment.findMany({
      where: { endDate: null },
      orderBy: { startDate: "asc" },
      include: { occupant: true }
    })
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Parking</h1>
          <p className="text-sm text-muted-foreground">Stationnement libre (non numéroté). Gratuit 3 jours, payant au-delà.</p>
        </div>
        <AddCarDialog occupants={occupants.map((occupant) => ({ id: occupant.id, label: `${occupant.firstName} ${occupant.lastName}` }))} />
      </div>
      <ParkingPlan
        cars={assignments.map((assignment) => ({
          id: assignment.id,
          vehiclePlate: assignment.vehiclePlate,
          occupantName: `${assignment.occupant.firstName} ${assignment.occupant.lastName}`,
          phone: assignment.occupant.phone,
          startDate: assignment.startDate.toISOString(),
          monthlyRateCents: assignment.monthlyRateCents
        }))}
      />
    </div>
  );
}

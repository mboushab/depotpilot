import { addDays, endOfMonth, format, startOfMonth } from "date-fns";
import { fr } from "date-fns/locale";
import { Boxes, Car, TrendingUp } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { occupancyRate } from "@/lib/storage-rules";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th } from "@/components/ui/table";

export default async function DashboardPage() {
  const [units, leadDaysSetting, parkingCapacitySetting, parkingOccupied] = await Promise.all([
    prisma.storageUnit.findMany({ orderBy: { code: "asc" } }),
    prisma.appSetting.findUnique({ where: { key: "notificationLeadDays" } }),
    prisma.appSetting.findUnique({ where: { key: "parkingSpaces" } }),
    prisma.parkingAssignment.count({ where: { endDate: null } })
  ]);
  const leadDays = Number(leadDaysSetting?.value ?? 3);
  const dueSoonCutoff = addDays(new Date(), leadDays);
  const invoices = await prisma.invoice.findMany({
    where: {
      OR: [{ status: "OVERDUE" }, { status: "ISSUED", dueDate: { lte: dueSoonCutoff } }]
    },
    orderBy: { dueDate: "asc" },
    take: 6,
    include: { occupant: true }
  });
  const parkingCapacity = Number(parkingCapacitySetting?.value ?? 0);

  const occupied = units.filter((unit) => unit.status === "OCCUPIED").length;
  const period = `${format(startOfMonth(new Date()), "d MMM", { locale: fr })} - ${format(endOfMonth(new Date()), "d MMM yyyy", { locale: fr })}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tableau de bord</h1>
        <p className="text-sm text-muted-foreground">Vue opérationnelle du mois en cours, {period}.</p>
      </div>
      <section className="grid gap-4 md:grid-cols-3">
        <Metric title="Occupation" value={formatPercent(occupancyRate(units.length, occupied))} icon={<TrendingUp />} />
        <Metric title="Box loués" value={`${occupied}/${units.length}`} icon={<Boxes />} />
        <Metric title="Véhicules stationnés" value={`${parkingOccupied}/${parkingCapacity}`} icon={<Car />} />
      </section>
      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Échéances à suivre</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Numéro</Th>
                  <Th>Client</Th>
                  <Th>Statut</Th>
                  <Th>Échéance</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <Td>{invoice.invoiceNumber}</Td>
                    <Td>{invoice.occupant.firstName} {invoice.occupant.lastName}</Td>
                    <Td><Badge>{invoice.status === "OVERDUE" ? "OVERDUE" : "DUE_SOON"}</Badge></Td>
                    <Td>{format(invoice.dueDate, "dd/MM/yyyy")}</Td>
                    <Td className="text-right font-medium">{formatCurrency(invoice.totalCents)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Répartition box</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {["AVAILABLE", "RESERVED", "OCCUPIED"].map((status) => {
              const count = units.filter((unit) => unit.status === status).length;
              return (
                <div key={status} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <Badge>{status}</Badge>
                  <span className="font-semibold">{count}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Metric({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-md bg-secondary text-primary [&_svg]:h-5 [&_svg]:w-5">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

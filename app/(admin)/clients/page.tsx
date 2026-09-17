import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { AddClientDialog } from "@/components/clients/add-client-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const CLIENT_LIST_LIMIT = 30;

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const clients = await prisma.occupant.findMany({
    where: query
      ? {
          OR: [
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
            { phone: { contains: query } }
          ]
        }
      : undefined,
    include: { rentals: true, parkingAssignments: true, invoices: true }
  });

  const sortedClients = clients
    .map((client) => ({ ...client, hasActiveBox: client.rentals.some((rental) => rental.status === "ACTIVE") }))
    .sort((a, b) => {
      if (a.hasActiveBox !== b.hasActiveBox) return a.hasActiveBox ? -1 : 1;
      return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
    })
    .slice(0, CLIENT_LIST_LIMIT);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Clients</h1>
          <p className="text-sm text-muted-foreground">Personnes et entreprises présentes dans le dépôt.</p>
        </div>
        <AddClientDialog />
      </div>
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Registre clients</CardTitle>
          <form className="flex gap-2">
            <Input name="q" defaultValue={query} placeholder="Nom ou téléphone" className="h-9 w-56" />
            <Button type="submit" variant="outline" size="sm">Filtrer</Button>
          </form>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <thead><tr><Th>Nom</Th><Th>E-mail</Th><Th>Téléphone</Th><Th>Ville</Th><Th>Box</Th><Th>Parking</Th><Th className="text-right">Solde impayé</Th></tr></thead>
            <tbody>
              {sortedClients.map((client) => {
                const unpaidBalance = client.invoices
                  .filter((invoice) => invoice.status !== "VOID")
                  .reduce((sum, invoice) => sum + Math.max(invoice.totalCents - invoice.paidCents, 0), 0);
                return (
                  <tr key={client.id}>
                    <Td className="font-medium">{client.firstName} {client.lastName}</Td>
                    <Td>{client.email ?? "–"}</Td>
                    <Td>{client.phone}</Td>
                    <Td>{client.city ?? "–"}</Td>
                    <Td>{client.rentals.filter((rental) => rental.status === "ACTIVE").length}</Td>
                    <Td>{client.parkingAssignments.filter((assignment) => !assignment.endDate).length}</Td>
                    <Td className={`text-right font-medium ${unpaidBalance > 0 ? "text-red-600" : ""}`}>
                      {unpaidBalance > 0 ? formatCurrency(unpaidBalance) : "À jour"}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

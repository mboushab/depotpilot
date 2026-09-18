import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { AddClientDialog } from "@/components/clients/add-client-dialog";
import { DeleteClientButton } from "@/components/clients/delete-client-button";
import { ConfirmClientPaymentButton } from "@/components/clients/confirm-client-payment-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";

const PAGE_SIZE = 20;

export default async function ClientsPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: pageParam } = await searchParams;
  const query = q?.trim() ?? "";
  const page = Math.max(1, Number(pageParam) || 1);

  const where = query
    ? {
        OR: [
          { firstName: { contains: query, mode: "insensitive" as const } },
          { lastName: { contains: query, mode: "insensitive" as const } },
          { phone: { contains: query } }
        ]
      }
    : undefined;

  const [clients, total] = await Promise.all([
    prisma.occupant.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        _count: {
          select: {
            rentals: { where: { status: "ACTIVE" } },
            parkingAssignments: { where: { endDate: null } }
          }
        },
        invoices: { where: { status: { not: "VOID" } }, select: { totalCents: true, paidCents: true } }
      }
    }),
    prisma.occupant.count({ where })
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const buildHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `/clients?${qs}` : "/clients";
  };

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
            <thead><tr><Th>Nom</Th><Th>E-mail</Th><Th>Téléphone</Th><Th>Ville</Th><Th>Box</Th><Th>Parking</Th><Th>Statut paiement</Th><Th className="text-right">Solde impayé</Th><Th></Th></tr></thead>
            <tbody>
              {clients.map((client) => {
                const unpaidBalance = client.invoices.reduce((sum, invoice) => sum + Math.max(invoice.totalCents - invoice.paidCents, 0), 0);
                return (
                  <tr key={client.id}>
                    <Td className="font-medium">{client.firstName} {client.lastName}</Td>
                    <Td>{client.email ?? "–"}</Td>
                    <Td>{client.phone}</Td>
                    <Td>{client.city ?? "–"}</Td>
                    <Td>{client._count.rentals}</Td>
                    <Td>{client._count.parkingAssignments}</Td>
                    <Td>{client.invoices.length > 0 ? <Badge>{unpaidBalance > 0 ? "PAYMENT_OVERDUE" : "PAID"}</Badge> : null}</Td>
                    <Td className={`text-right font-medium ${unpaidBalance > 0 ? "text-red-600" : ""}`}>
                      {client.invoices.length === 0 ? "" : unpaidBalance > 0 ? formatCurrency(unpaidBalance) : "À jour"}
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-2">
                        {unpaidBalance > 0 ? (
                          <ConfirmClientPaymentButton
                            occupantId={client.id}
                            name={`${client.firstName} ${client.lastName}`}
                            balanceCents={unpaidBalance}
                          />
                        ) : null}
                        <DeleteClientButton id={client.id} name={`${client.firstName} ${client.lastName}`} />
                      </div>
                    </Td>
                  </tr>
                );
              })}
              {clients.length === 0 ? (
                <tr><Td colSpan={9} className="text-center text-muted-foreground">Aucun client pour cette recherche.</Td></tr>
              ) : null}
            </tbody>
          </Table>
          <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />
        </CardContent>
      </Card>
    </div>
  );
}

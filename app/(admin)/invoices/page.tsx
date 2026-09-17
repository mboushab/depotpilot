import Link from "next/link";
import { format } from "date-fns";
import { Download } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { PaymentForm } from "@/components/forms/payment-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";

export default async function InvoicesPage() {
  const invoices = await prisma.invoice.findMany({
    orderBy: { issueDate: "desc" },
    include: { occupant: true, rental: { include: { unit: true } } }
  });
  const unpaidInvoices = invoices.filter((invoice) => invoice.status !== "PAID" && invoice.status !== "VOID");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Factures</h1>
        <p className="text-sm text-muted-foreground">Suivi des échéances, règlements et exports PDF.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Enregistrer un paiement</CardTitle></CardHeader>
        <CardContent>
          <PaymentForm
            invoices={unpaidInvoices.map((invoice) => ({
              id: invoice.id,
              label: `${invoice.invoiceNumber} · ${invoice.occupant.firstName} ${invoice.occupant.lastName} · ${formatCurrency(invoice.totalCents - invoice.paidCents)}`,
              remainingCents: invoice.totalCents - invoice.paidCents
            }))}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Registre de facturation</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <thead><tr><Th>Numéro</Th><Th>Client</Th><Th>Box</Th><Th>Statut</Th><Th>Émission</Th><Th>Échéance</Th><Th className="text-right">Total</Th><Th></Th></tr></thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <Td className="font-medium">{invoice.invoiceNumber}</Td>
                  <Td>{invoice.occupant.firstName} {invoice.occupant.lastName}</Td>
                  <Td>{invoice.rental?.unit.code ?? "-"}</Td>
                  <Td><Badge>{invoice.status}</Badge></Td>
                  <Td>{format(invoice.issueDate, "dd/MM/yyyy")}</Td>
                  <Td>{format(invoice.dueDate, "dd/MM/yyyy")}</Td>
                  <Td className="text-right font-medium">{formatCurrency(invoice.totalCents)}</Td>
                  <Td className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/api/invoices/${invoice.id}/pdf`} target="_blank">
                        <Download className="h-4 w-4" />
                        PDF
                      </Link>
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

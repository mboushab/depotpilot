import Link from "next/link";
import { format } from "date-fns";
import { Download } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { labelStatus } from "@/lib/status-labels";
import { PaymentForm } from "@/components/forms/payment-form";
import { WhatsAppInvoiceButton } from "@/components/invoices/whatsapp-invoice-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";

const PAGE_SIZE = 20;
const INVOICE_STATUSES = ["DRAFT", "ISSUED", "PAID", "OVERDUE", "VOID"] as const;

export default async function InvoicesPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const { page: pageParam, status } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const statusFilter = status && (INVOICE_STATUSES as readonly string[]).includes(status) ? status : undefined;
  const where = statusFilter ? { status: statusFilter as (typeof INVOICE_STATUSES)[number] } : undefined;

  const [invoices, total, unpaidInvoices] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { issueDate: "desc" },
      include: { occupant: true, rental: { include: { unit: true } } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where: { status: { notIn: ["PAID", "VOID"] } },
      orderBy: { issueDate: "desc" },
      include: { occupant: true }
    })
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const buildHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `/invoices?${qs}` : "/invoices";
  };

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
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Registre de facturation</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/invoices"
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${!statusFilter ? "bg-primary text-primary-foreground" : "bg-white dark:bg-card"}`}
            >
              Toutes
            </Link>
            {INVOICE_STATUSES.map((value) => (
              <Link
                key={value}
                href={`/invoices?status=${value}`}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusFilter === value ? "bg-primary text-primary-foreground" : "bg-white dark:bg-card"}`}
              >
                {labelStatus(value)}
              </Link>
            ))}
          </div>
        </CardHeader>
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
                    <div className="flex justify-end gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/api/invoices/${invoice.id}/pdf`} target="_blank">
                          <Download className="h-4 w-4" />
                          PDF
                        </Link>
                      </Button>
                      <WhatsAppInvoiceButton
                        invoiceId={invoice.id}
                        invoiceNumber={invoice.invoiceNumber}
                        totalCents={invoice.totalCents}
                        phone={invoice.occupant.phone}
                        clientName={invoice.occupant.firstName}
                      />
                    </div>
                  </Td>
                </tr>
              ))}
              {invoices.length === 0 ? (
                <tr><Td colSpan={8} className="text-center text-muted-foreground">Aucune facture pour ce filtre.</Td></tr>
              ) : null}
            </tbody>
          </Table>
          <Pagination page={page} totalPages={totalPages} buildHref={buildHref} />
        </CardContent>
      </Card>
    </div>
  );
}

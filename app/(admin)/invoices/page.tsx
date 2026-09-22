import Link from "next/link";
import { format } from "date-fns";
import { Download, Search } from "lucide-react";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { labelStatus } from "@/lib/status-labels";
import { RegisterPaymentDialog } from "@/components/invoices/register-payment-dialog";
import { WhatsAppInvoiceButton } from "@/components/invoices/whatsapp-invoice-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";

const PAGE_SIZE = 20;
const INVOICE_STATUSES = ["DRAFT", "ISSUED", "PAID", "OVERDUE", "VOID"] as const;

export default async function InvoicesPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string; status?: string; q?: string }>;
}) {
  const { page: pageParam, status, q } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const statusFilter = status && (INVOICE_STATUSES as readonly string[]).includes(status) ? status : undefined;
  const search = q?.trim() || undefined;

  const where: Prisma.InvoiceWhereInput = {};
  if (statusFilter) where.status = statusFilter as (typeof INVOICE_STATUSES)[number];
  if (search) {
    where.OR = [
      { invoiceNumber: { contains: search, mode: "insensitive" } },
      { occupant: { firstName: { contains: search, mode: "insensitive" } } },
      { occupant: { lastName: { contains: search, mode: "insensitive" } } }
    ];
  }

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
    if (search) params.set("q", search);
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `/invoices?${qs}` : "/invoices";
  };

  const statusHref = (value?: string) => {
    const params = new URLSearchParams();
    if (value) params.set("status", value);
    if (search) params.set("q", search);
    const qs = params.toString();
    return qs ? `/invoices?${qs}` : "/invoices";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Factures</h1>
          <p className="text-sm text-muted-foreground">Suivi des échéances, règlements et exports PDF.</p>
        </div>
        <RegisterPaymentDialog
          invoices={unpaidInvoices.map((invoice) => ({
            id: invoice.id,
            label: `${invoice.invoiceNumber} · ${invoice.occupant.firstName} ${invoice.occupant.lastName} · ${formatCurrency(invoice.totalCents - invoice.paidCents)}`,
            remainingCents: invoice.totalCents - invoice.paidCents
          }))}
        />
      </div>
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Registre de facturation</CardTitle>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-2">
              <Link
                href={statusHref()}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${!statusFilter ? "bg-primary text-primary-foreground" : "bg-white dark:bg-card"}`}
              >
                Toutes
              </Link>
              {INVOICE_STATUSES.map((value) => (
                <Link
                  key={value}
                  href={statusHref(value)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusFilter === value ? "bg-primary text-primary-foreground" : "bg-white dark:bg-card"}`}
                >
                  {labelStatus(value)}
                </Link>
              ))}
            </div>
            <form className="flex items-center gap-2" action="/invoices">
              {statusFilter ? <input type="hidden" name="status" value={statusFilter} /> : null}
              <Input type="search" name="q" defaultValue={search ?? ""} placeholder="Client ou n° de facture" className="h-8 w-48" />
              <Button type="submit" size="sm" variant="outline">
                <Search className="h-4 w-4" />
              </Button>
            </form>
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

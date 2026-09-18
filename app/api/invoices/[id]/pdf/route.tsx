import { NextResponse } from "next/server";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { format } from "date-fns";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { labelStatus } from "@/lib/status-labels";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: "#152231", fontFamily: "Helvetica" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 28 },
  brand: { fontSize: 22, fontWeight: 700, color: "#176b73" },
  muted: { color: "#64748b" },
  h1: { fontSize: 18, fontWeight: 700, marginBottom: 8 },
  block: { marginBottom: 18 },
  table: { borderWidth: 1, borderColor: "#d7dee8", marginTop: 10 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#d7dee8" },
  cell: { padding: 8, flex: 1 },
  cellRight: { padding: 8, width: 110, textAlign: "right" },
  totalRow: { flexDirection: "row", justifyContent: "flex-end", gap: 24, marginTop: 8 },
  totalLabel: { width: 120, textAlign: "right", color: "#64748b" },
  totalValue: { width: 100, textAlign: "right", fontWeight: 700 }
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  await requireAdmin();
  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      occupant: true,
      rental: { include: { unit: true } },
      lines: true
    }
  });

  if (!invoice) {
    return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });
  }

  const buffer = await renderToBuffer(
    <Document title={invoice.invoiceNumber}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>BoxPilot</Text>
            <Text style={styles.muted}>Gestion de dépôt et self-storage</Text>
          </View>
          <View>
            <Text style={styles.h1}>Facture {invoice.invoiceNumber}</Text>
            <Text>Émise le {format(invoice.issueDate, "dd/MM/yyyy")}</Text>
            <Text>Échéance {format(invoice.dueDate, "dd/MM/yyyy")}</Text>
          </View>
        </View>
        <View style={styles.block}>
          <Text style={styles.muted}>Client</Text>
          <Text>{invoice.occupant.firstName} {invoice.occupant.lastName}</Text>
          {invoice.occupant.company ? <Text>{invoice.occupant.company}</Text> : null}
          {invoice.occupant.address ? <Text>{invoice.occupant.address}</Text> : null}
          {invoice.occupant.postalCode || invoice.occupant.city ? (
            <Text>{invoice.occupant.postalCode} {invoice.occupant.city}</Text>
          ) : null}
          {invoice.occupant.email ? <Text>{invoice.occupant.email}</Text> : null}
        </View>
        <View style={styles.block}>
          <Text style={styles.muted}>Contrat</Text>
          <Text>Box: {invoice.rental?.unit.code ?? "-"}</Text>
          <Text>Statut facture: {labelStatus(invoice.status)}</Text>
        </View>
        <View style={styles.table}>
          <View style={styles.row}>
            <Text style={styles.cell}>Description</Text>
            <Text style={styles.cellRight}>Qté</Text>
            <Text style={styles.cellRight}>Prix</Text>
            <Text style={styles.cellRight}>Total</Text>
          </View>
          {invoice.lines.map((line) => {
            const isRentalLine = line.description.startsWith("Location");
            const unitLabel = isRentalLine ? (invoice.rental?.type === "ONE_TIME" ? "période" : "mois") : "";
            return (
              <View style={styles.row} key={line.id}>
                <Text style={styles.cell}>{line.description}</Text>
                <Text style={styles.cellRight}>{line.quantity} {unitLabel}</Text>
                <Text style={styles.cellRight}>{formatCurrency(line.unitCents)}</Text>
                <Text style={styles.cellRight}>{formatCurrency(line.totalCents)}</Text>
              </View>
            );
          })}
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatCurrency(invoice.totalCents)}</Text>
        </View>
      </Page>
    </Document>
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.invoiceNumber}.pdf"`
    }
  });
}

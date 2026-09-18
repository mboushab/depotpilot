import { NextResponse } from "next/server";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { format } from "date-fns";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PARKING_FREE_DAYS } from "@/lib/storage-rules";

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 12, color: "#152231", fontFamily: "Helvetica" },
  brand: { fontSize: 16, fontWeight: 700, color: "#176b73", marginBottom: 40 },
  warning: { fontSize: 26, fontWeight: 700, color: "#b91c1c", textAlign: "center", marginBottom: 24 },
  plate: {
    fontSize: 32,
    fontWeight: 700,
    textAlign: "center",
    borderWidth: 2,
    borderColor: "#152231",
    borderRadius: 6,
    paddingVertical: 14,
    marginBottom: 32
  },
  message: { fontSize: 16, textAlign: "center", lineHeight: 1.6, marginBottom: 32, paddingHorizontal: 20 },
  detailsBlock: { borderTopWidth: 1, borderTopColor: "#d7dee8", paddingTop: 16, gap: 4 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", fontSize: 11, color: "#64748b" }
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  await requireAdmin();
  const { id } = await params;
  const assignment = await prisma.parkingAssignment.findUnique({ where: { id } });

  if (!assignment) {
    return NextResponse.json({ error: "Attribution de parking introuvable" }, { status: 404 });
  }

  const buffer = await renderToBuffer(
    <Document title={`Avis de stationnement ${assignment.vehiclePlate}`}>
      <Page size="A5" style={styles.page}>
        <Text style={styles.brand}>BoxPilot</Text>
        <Text style={styles.warning}>AVIS DE STATIONNEMENT</Text>
        <Text style={styles.plate}>{assignment.vehiclePlate}</Text>
        <Text style={styles.message}>
          Cette voiture a dépassé le nombre de jours autorisé. Veuillez la déplacer ou vous rapprocher de nous pour
          prolonger votre stationnement de quelques jours supplémentaires.
        </Text>
        <View style={styles.detailsBlock}>
          <View style={styles.detailRow}>
            <Text>Entrée</Text>
            <Text>{format(assignment.startDate, "dd/MM/yyyy")}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text>Jours de stationnement gratuit</Text>
            <Text>{PARKING_FREE_DAYS}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text>Avis imprimé le</Text>
            <Text>{format(new Date(), "dd/MM/yyyy")}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="avis-stationnement-${assignment.vehiclePlate}.pdf"`
    }
  });
}

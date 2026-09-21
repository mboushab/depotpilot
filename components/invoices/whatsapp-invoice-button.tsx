"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

// French numbers as typed by an admin ("06 12 34 56 78", "+33 6…", "0033…")
// -> the digits-only international form WhatsApp expects ("33612345678").
function toWhatsAppPhone(raw: string) {
  const cleaned = raw.replace(/[\s.\-()]/g, "");
  if (cleaned.startsWith("+")) return cleaned.slice(1);
  if (cleaned.startsWith("00")) return cleaned.slice(2);
  if (cleaned.startsWith("0")) return `33${cleaned.slice(1)}`;
  return cleaned;
}

export function WhatsAppInvoiceButton({
  invoiceId,
  invoiceNumber,
  totalCents,
  phone,
  clientName,
  size = "sm"
}: {
  invoiceId: string;
  invoiceNumber?: string;
  totalCents?: number;
  phone: string | null | undefined;
  clientName: string;
  size?: "sm" | "default";
}) {
  const [busy, setBusy] = useState(false);

  if (!phone) {
    return null;
  }

  async function share() {
    setBusy(true);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/pdf`);
      if (!response.ok) {
        throw new Error("PDF indisponible");
      }
      const blobUrl = URL.createObjectURL(await response.blob());
      const download = document.createElement("a");
      download.href = blobUrl;
      download.download = `${invoiceNumber ?? "Facture"}.pdf`;
      document.body.appendChild(download);
      download.click();
      download.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);

      const reference = invoiceNumber ? ` ${invoiceNumber}` : "";
      const amount = totalCents !== undefined ? ` d'un montant de ${formatCurrency(totalCents)}` : "";
      const text = `Bonjour ${clientName}, voici votre facture${reference}${amount}.`;
      window.location.href = `whatsapp://send?phone=${toWhatsAppPhone(phone!)}&text=${encodeURIComponent(text)}`;

      toast.success("Facture téléchargée. Glissez-la dans la conversation WhatsApp (ou trombone → Document).");
    } catch {
      toast.error("Impossible de préparer la facture.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="outline" size={size} disabled={busy} onClick={share}>
      <MessageCircle className="h-4 w-4" />
      WhatsApp
    </Button>
  );
}

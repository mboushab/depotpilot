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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function pdfFirstPageToPng(pdf: Blob): Promise<Blob> {
  // Loaded on demand: the PDF renderer is only needed when this is clicked.
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const document_ = await pdfjs.getDocument({ data: new Uint8Array(await pdf.arrayBuffer()) }).promise;
  const page = await document_.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = window.document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport, canvas }).promise;
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("png"))), "image/png"));
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
      const pdf = await response.blob();

      // A whatsapp:// link can only carry text, so the invoice itself goes
      // through the clipboard as an image (Cmd+V in the conversation).
      // Falls back to a plain PDF download where image copy isn't available.
      let copied = false;
      try {
        if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
          const png = await pdfFirstPageToPng(pdf);
          await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
          copied = true;
        }
      } catch {
        copied = false;
      }
      if (!copied) {
        downloadBlob(pdf, `${invoiceNumber ?? "Facture"}.pdf`);
      }

      const reference = invoiceNumber ? ` ${invoiceNumber}` : "";
      const amount = totalCents !== undefined ? ` d'un montant de ${formatCurrency(totalCents)}` : "";
      const text = `Bonjour ${clientName}, voici votre facture${reference}${amount}.`;
      window.location.href = `whatsapp://send?phone=${toWhatsAppPhone(phone!)}&text=${encodeURIComponent(text)}`;

      toast.success(
        copied
          ? "Facture copiée. Dans WhatsApp : Cmd+V pour la coller, puis Entrée."
          : "Facture téléchargée. Glissez-la dans la conversation WhatsApp (ou trombone → Document)."
      );
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

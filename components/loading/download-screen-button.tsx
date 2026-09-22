"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function DownloadScreenButton({ targetId, filename }: { targetId: string; filename: string }) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const target = document.getElementById(targetId);
      if (!target) throw new Error("target not found");

      // Loaded on demand: only needed when this is clicked.
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(target, { backgroundColor: "#020617", scale: 2 });

      await new Promise<void>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("toBlob failed"));
            return;
          }
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 10_000);
          resolve();
        }, "image/png");
      });
    } catch {
      toast.error("Impossible de télécharger l'image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      className="fixed right-6 top-6 z-10 inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20 disabled:pointer-events-none disabled:opacity-50 print:hidden"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      Télécharger
    </button>
  );
}

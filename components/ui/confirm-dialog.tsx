"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  onConfirm,
  onCancel
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => {
      cancelAnimationFrame(frame);
      setVisible(false);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={cn("fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 transition-opacity duration-200", visible ? "opacity-100" : "opacity-0")}
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        className={cn(
          "w-full max-w-sm rounded-lg border bg-white p-5 shadow-xl transition-all duration-200",
          visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-95 opacity-0"
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-100 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="pt-1">
            <h3 className="text-base font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>{cancelLabel}</Button>
          <Button variant="destructive" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

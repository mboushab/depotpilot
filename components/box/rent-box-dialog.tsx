"use client";

import { X } from "lucide-react";
import { RentBoxForm } from "@/components/forms/rent-box-form";

type Option = { id: string; label: string };

export function RentBoxDialog({
  open,
  onClose,
  unitId,
  unitCode,
  monthlyRateCents,
  occupants,
  depositEnabled,
  defaultDepositCents
}: {
  open: boolean;
  onClose: () => void;
  unitId: string;
  unitCode: string;
  monthlyRateCents: number;
  occupants: Option[];
  depositEnabled: boolean;
  defaultDepositCents: number;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="w-full max-w-2xl rounded-lg border bg-card shadow-panel" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-base font-semibold">Louer le box {unitCode}</h2>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">
          <RentBoxForm
            unitId={unitId}
            unitCode={unitCode}
            monthlyRateCents={monthlyRateCents}
            occupants={occupants}
            depositEnabled={depositEnabled}
            defaultDepositCents={defaultDepositCents}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  );
}

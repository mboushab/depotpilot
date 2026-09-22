"use client";

import { useState } from "react";
import { CreditCard, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaymentForm } from "@/components/forms/payment-form";

type InvoiceOption = { id: string; label: string; remainingCents: number };

export function RegisterPaymentDialog({ invoices }: { invoices: InvoiceOption[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <CreditCard className="h-4 w-4" />
        Enregistrer un paiement
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-2xl rounded-lg border bg-card shadow-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-base font-semibold">Enregistrer un paiement</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <PaymentForm invoices={invoices} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

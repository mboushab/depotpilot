"use client";

import { useEffect, useRef, useState, useActionState } from "react";
import { toast } from "sonner";
import { CircleDollarSign } from "lucide-react";
import { confirmClientPaymentAction, type ConfirmClientPaymentState } from "@/server/actions/forms";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ConfirmClientPaymentButton({ occupantId, name, balanceCents }: { occupantId: string; name: string; balanceCents: number }) {
  const [state, formAction, isPending] = useActionState(confirmClientPaymentAction, { status: "idle" } as ConfirmClientPaymentState);
  const formRef = useRef<HTMLFormElement>(null);
  const amountCentsRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state.status === "success") {
      toast.success("Paiement confirmé.");
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <>
      <form ref={formRef} action={formAction}>
        <input type="hidden" name="occupantId" value={occupantId} />
        <input type="hidden" name="amountCents" ref={amountCentsRef} defaultValue={balanceCents} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => setOpen(true)}
        >
          <CircleDollarSign className="h-4 w-4" />
          Confirmer le paiement
        </Button>
      </form>
      {open ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-lg border bg-card p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-base font-semibold">Confirmer le paiement de {name}</h3>
            <p className="mt-1 text-sm text-red-600">Solde restant : {formatCurrency(balanceCents)}</p>
            <div className="mt-4 space-y-2">
              <Label>Montant encaissé (€)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={(balanceCents / 100).toFixed(2)}
                defaultValue={(balanceCents / 100).toFixed(2)}
                onChange={(event) => {
                  if (amountCentsRef.current) {
                    amountCentsRef.current.value = String(Math.round(Number(event.target.value || "0") * 100));
                  }
                }}
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
              <Button
                onClick={() => {
                  setOpen(false);
                  formRef.current?.requestSubmit();
                }}
              >
                Confirmer
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

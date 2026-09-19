"use client";

import { useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createPaymentAction } from "@/server/actions/forms";
import { paymentSchema, type PaymentInput } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type InvoiceOption = { id: string; label: string; remainingCents: number };

export function PaymentForm({ invoices }: { invoices: InvoiceOption[] }) {
  const form = useForm<PaymentInput>({ resolver: zodResolver(paymentSchema) });
  const amountEurosRef = useRef<HTMLInputElement>(null);
  const amountCentsRef = useRef<HTMLInputElement>(null);
  return (
    <form action={createPaymentAction} className="grid gap-4 md:grid-cols-4">
      <div className="space-y-2 md:col-span-2">
        <Label>Facture</Label>
        <select
          className="h-10 w-full rounded-md border bg-white px-3 text-sm text-foreground dark:bg-card"
          name="invoiceId"
          onChange={(event) => {
            const invoice = invoices.find((item) => item.id === event.target.value);
            if (invoice) {
              if (amountEurosRef.current) amountEurosRef.current.value = (invoice.remainingCents / 100).toFixed(2);
              if (amountCentsRef.current) amountCentsRef.current.value = String(invoice.remainingCents);
            }
          }}
        >
          <option value="">Sélectionner</option>
          {invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.label}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <Label>Montant (€)</Label>
        <Input
          type="number"
          step="0.01"
          min="0.01"
          ref={amountEurosRef}
          onChange={(event) => {
            if (amountCentsRef.current) {
              amountCentsRef.current.value = String(Math.round(Number(event.target.value || "0") * 100));
            }
          }}
        />
        <input type="hidden" name="amountCents" ref={amountCentsRef} />
      </div>
      <div className="space-y-2">
        <Label>Moyen</Label>
        <select className="h-10 w-full rounded-md border bg-white px-3 text-sm text-foreground dark:bg-card" {...form.register("method")}>
          <option value="CARD">Carte</option>
          <option value="BANK_TRANSFER">Virement</option>
          <option value="DIRECT_DEBIT">Prélèvement</option>
          <option value="CASH">Espèces</option>
        </select>
      </div>
      <div className="space-y-2 md:col-span-3">
        <Label>Référence</Label>
        <Input {...form.register("reference")} />
      </div>
      <div className="flex items-end">
        <Button>Enregistrer</Button>
      </div>
    </form>
  );
}

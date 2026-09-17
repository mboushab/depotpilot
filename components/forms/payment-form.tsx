"use client";

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
  return (
    <form action={createPaymentAction} className="grid gap-4 md:grid-cols-4">
      <div className="space-y-2 md:col-span-2">
        <Label>Facture</Label>
        <select
          className="h-10 w-full rounded-md border bg-white px-3 text-sm"
          {...form.register("invoiceId", {
            onChange: (event) => {
              const invoice = invoices.find((item) => item.id === event.target.value);
              if (invoice) form.setValue("amountCents", invoice.remainingCents);
            }
          })}
        >
          <option value="">Sélectionner</option>
          {invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.label}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <Label>Montant en centimes</Label>
        <Input type="number" {...form.register("amountCents")} />
      </div>
      <div className="space-y-2">
        <Label>Moyen</Label>
        <select className="h-10 w-full rounded-md border bg-white px-3 text-sm" {...form.register("method")}>
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

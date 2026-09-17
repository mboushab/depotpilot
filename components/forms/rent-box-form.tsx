"use client";

import { useEffect, useRef, useState, useActionState } from "react";
import { format } from "date-fns";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { createRentalAction, type CreateRentalState } from "@/server/actions/forms";
import { NewClientDialog } from "@/components/clients/new-client-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Option = { id: string; label: string };

export function RentBoxForm({
  unitId,
  unitCode,
  monthlyRateCents,
  occupants,
  depositEnabled,
  defaultDepositCents,
  onClose
}: {
  unitId: string;
  unitCode: string;
  monthlyRateCents: number;
  occupants: Option[];
  depositEnabled: boolean;
  defaultDepositCents: number;
  onClose?: () => void;
}) {
  const [state, formAction, isPending] = useActionState(createRentalAction, { status: "idle" } as CreateRentalState);
  const today = format(new Date(), "yyyy-MM-dd");
  const [rentalType, setRentalType] = useState<"MONTHLY" | "ONE_TIME">("MONTHLY");
  const selectRef = useRef<HTMLSelectElement>(null);
  const pendingSelectId = useRef<string | null>(null);
  const [clientOptions, setClientOptions] = useState(occupants);

  useEffect(() => {
    if (pendingSelectId.current && selectRef.current) {
      selectRef.current.value = pendingSelectId.current;
      pendingSelectId.current = null;
    }
  }, [clientOptions]);

  useEffect(() => {
    if (state.status === "success") {
      toast.success("Contrat créé.");
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state]);

  if (state.status === "success") {
    return (
      <div className="space-y-4 py-2 text-center">
        <p className="text-sm text-muted-foreground">Le box {unitCode} est loué. Vous pouvez imprimer la facture.</p>
        <div className="flex justify-center gap-2">
          <Button asChild variant="outline">
            <a href={`/api/invoices/${state.invoiceId}/pdf`} target="_blank" rel="noreferrer">
              <Download className="h-4 w-4" />
              Imprimer la facture
            </a>
          </Button>
          <Button onClick={onClose}>Fermer</Button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-3">
      <input type="hidden" name="unitId" value={unitId} />
      <Field label="Box"><Input value={unitCode} disabled /></Field>
      <Field
        label="Client"
        action={
          <NewClientDialog
            onCreated={(client) => {
              pendingSelectId.current = client.id;
              setClientOptions((current) => [...current, client]);
              toast.success(`${client.label} sélectionné.`);
            }}
          />
        }
      >
        <select ref={selectRef} className="h-10 w-full rounded-md border bg-white px-3 text-sm" name="occupantId" defaultValue="">
          <option value="">Sélectionner</option>
          {clientOptions.map((occupant) => <option key={occupant.id} value={occupant.id}>{occupant.label}</option>)}
        </select>
      </Field>
      <Field label="Date de début"><Input type="date" name="startDate" defaultValue={today} required /></Field>
      <Field label="Type de location">
        <div className="flex h-10 items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="type"
              value="MONTHLY"
              checked={rentalType === "MONTHLY"}
              onChange={() => setRentalType("MONTHLY")}
            />
            Mensuel
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="type"
              value="ONE_TIME"
              checked={rentalType === "ONE_TIME"}
              onChange={() => setRentalType("ONE_TIME")}
            />
            Ponctuel
          </label>
        </div>
      </Field>
      {rentalType === "ONE_TIME" ? (
        <Field label="Nombre de jours"><Input type="number" name="durationDays" min={1} defaultValue={1} required /></Field>
      ) : null}
      <input type="hidden" name="billingDay" value="1" />
      <Field label="Dépôt de garantie">
        {depositEnabled ? (
          <Input type="number" name="depositCents" defaultValue={defaultDepositCents} />
        ) : (
          <>
            <Input type="number" value={0} disabled />
            <input type="hidden" name="depositCents" value="0" />
          </>
        )}
      </Field>
      <Field label="Prix"><Input type="number" name="monthlyRateCents" defaultValue={monthlyRateCents} required /></Field>
      <div className="flex items-center gap-3 rounded-md border bg-white px-3">
        <input id="paidNow" type="checkbox" name="paidNow" className="h-4 w-4" />
        <Label htmlFor="paidNow">Le client paie maintenant</Label>
      </div>
      <div className="md:col-span-3"><Button disabled={isPending}>{isPending ? "Création…" : "Créer le contrat"}</Button></div>
    </form>
  );
}

function Field({ label, children, action }: { label: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {action}
      </div>
      {children}
    </div>
  );
}

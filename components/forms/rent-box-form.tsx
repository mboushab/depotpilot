"use client";

import { useEffect, useState, useActionState } from "react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { createRentalAction, type CreateRentalState } from "@/server/actions/forms";
import { NewClientDialog } from "@/components/clients/new-client-dialog";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WhatsAppInvoiceButton } from "@/components/invoices/whatsapp-invoice-button";
import { cn } from "@/lib/utils";

type Option = { id: string; label: string; phone?: string };

export function RentBoxForm({
  unitId,
  unitCode,
  monthlyRateCents,
  occupants,
  depositEnabled,
  defaultDepositCents,
  initialStartDate,
  initialType,
  initialDurationDays,
  maxEndDate,
  minStartDate,
  onClose
}: {
  unitId: string;
  unitCode: string;
  monthlyRateCents: number;
  occupants: Option[];
  depositEnabled: boolean;
  defaultDepositCents: number;
  initialStartDate?: string;
  initialType?: "MONTHLY" | "ONE_TIME";
  initialDurationDays?: number;
  // Last day the box is free (the next booking starts right after).
  maxEndDate?: string;
  // First day the box is free again (the previous rental ended the day before).
  minStartDate?: string;
  onClose?: () => void;
}) {
  const [state, formAction, isPending] = useActionState(createRentalAction, { status: "idle" } as CreateRentalState);
  const today = format(new Date(), "yyyy-MM-dd");
  // No type is preselected, so the person renting has to pick one on purpose
  // (unless a period search already decided it).
  const [rentalType, setRentalType] = useState<"" | "MONTHLY" | "ONE_TIME">(initialType ?? "");
  const [startDate, setStartDate] = useState(initialStartDate ?? today);
  const maxDays = maxEndDate && startDate ? differenceInCalendarDays(parseISO(maxEndDate), parseISO(startDate)) : undefined;
  const openEndedBlocked = !!maxEndDate && rentalType === "MONTHLY";
  const startTooEarly = !!minStartDate && !!startDate && startDate < minStartDate;
  const [paymentMode, setPaymentMode] = useState<"NONE" | "FULL" | "PARTIAL">("NONE");
  // Every field is controlled: React resets uncontrolled fields after any
  // form action, so a rejected submission would otherwise wipe what was typed.
  const [clientOptions, setClientOptions] = useState(occupants);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [durationDays, setDurationDays] = useState(String(initialDurationDays ?? 1));
  const [depositCents, setDepositCents] = useState(String(defaultDepositCents));
  const [priceEuros, setPriceEuros] = useState((monthlyRateCents / 100).toFixed(2));
  const [partialEuros, setPartialEuros] = useState("");

  useEffect(() => {
    if (state.status === "success") {
      toast.success("Contrat créé.");
    }
  }, [state]);

  const selectedClient = clientOptions.find((option) => option.id === selectedClientId);

  if (state.status === "success") {
    return (
      <div className="space-y-4 py-2 text-center">
        <p className="text-sm text-muted-foreground">
          Le box {unitCode} est loué.{" "}
          {state.paid ? "Vous pouvez imprimer la facture." : "Le paiement n'a pas encore été enregistré."}
        </p>
        <div className="flex justify-center gap-2">
          {state.paid ? (
            <Button asChild variant="outline">
              <a href={`/api/invoices/${state.invoiceId}/pdf`} target="_blank" rel="noreferrer">
                <Download className="h-4 w-4" />
                Imprimer la facture
              </a>
            </Button>
          ) : null}
          {state.paid ? (
            <WhatsAppInvoiceButton
              invoiceId={state.invoiceId}
              phone={selectedClient?.phone}
              clientName={selectedClient?.label.split(" ")[0] ?? ""}
              size="default"
            />
          ) : null}
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
              setSelectedClientId(client.id);
              setClientOptions((current) => [...current, client]);
              toast.success(`${client.label} sélectionné.`);
            }}
          />
        }
      >
        <Combobox
          name="occupantId"
          options={clientOptions.map((occupant) => ({ id: occupant.id, label: occupant.label, hint: occupant.phone }))}
          value={selectedClientId}
          onChange={setSelectedClientId}
          placeholder="Taper un nom pour rechercher"
          emptyMessage="Aucun client trouvé"
        />
      </Field>
      <Field label="Date de début"><Input type="date" name="startDate" min={minStartDate} value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></Field>
      <Field label="Type de location (à choisir)">
        <div className="flex h-10 items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="type"
              value="MONTHLY"
              required
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
        <Field label="Nombre de jours"><Input type="number" name="durationDays" min={1} max={maxDays && maxDays > 0 ? maxDays : undefined} value={durationDays} onChange={(event) => setDurationDays(event.target.value)} required /></Field>
      ) : null}
      <input type="hidden" name="billingDay" value="1" />
      <Field label="Dépôt de garantie">
        {depositEnabled ? (
          <Input type="number" name="depositCents" value={depositCents} onChange={(event) => setDepositCents(event.target.value)} />
        ) : (
          <>
            <Input type="number" value={0} disabled />
            <input type="hidden" name="depositCents" value="0" />
          </>
        )}
      </Field>
      <Field label={rentalType === "ONE_TIME" ? "Prix total (€)" : rentalType === "MONTHLY" ? "Prix (€ / mois)" : "Prix (€)"}>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={priceEuros}
          onChange={(event) => setPriceEuros(event.target.value)}
          required
        />
        <input type="hidden" name="monthlyRateCents" value={Math.round(Number(priceEuros || "0") * 100)} />
      </Field>
      <Field label="Paiement" className="md:col-span-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="paymentMode"
              value="FULL"
              checked={paymentMode === "FULL"}
              onChange={() => setPaymentMode("FULL")}
            />
            Total payé maintenant
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="paymentMode"
              value="PARTIAL"
              checked={paymentMode === "PARTIAL"}
              onChange={() => setPaymentMode("PARTIAL")}
            />
            Payer une partie
          </label>
        </div>
        {paymentMode === "PARTIAL" ? (
          <div className="mt-3 max-w-xs space-y-2">
            <Label>Montant payé (€)</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={partialEuros}
              onChange={(event) => setPartialEuros(event.target.value)}
              required
            />
            <input type="hidden" name="partialAmountCents" value={Math.round(Number(partialEuros || "0") * 100)} />
          </div>
        ) : null}
      </Field>
      {minStartDate ? (
        <p className={cn("text-sm md:col-span-3", startTooEarly ? "font-medium text-destructive" : "text-amber-700 dark:text-amber-300")}>
          Ce box est disponible à partir du {format(parseISO(minStartDate), "dd/MM/yyyy")} : la date de début ne peut pas être antérieure.
        </p>
      ) : null}
      {maxEndDate ? (
        <p className="text-sm text-amber-700 dark:text-amber-300 md:col-span-3">
          Ce box est libre jusqu&apos;au {format(parseISO(maxEndDate), "dd/MM/yyyy")} (une autre location suit) : seule une location ponctuelle
          se terminant au plus tard ce jour-là est possible.
        </p>
      ) : null}
      {state.status === "error" ? (
        <p className="text-sm font-medium text-destructive md:col-span-3">{state.message}</p>
      ) : null}
      <div className="md:col-span-3"><Button disabled={isPending || openEndedBlocked || startTooEarly}>{isPending ? "Création…" : "Créer le contrat"}</Button></div>
    </form>
  );
}

function Field({
  label,
  children,
  action,
  className
}: {
  label: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {action}
      </div>
      {children}
    </div>
  );
}

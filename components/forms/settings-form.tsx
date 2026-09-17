"use client";

import { useEffect, useActionState } from "react";
import { toast } from "sonner";
import { updateSettingsAction, type UpdateSettingsState } from "@/server/actions/forms";
import type { SettingsInput } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SettingsForm({ defaults }: { defaults: SettingsInput }) {
  const [state, formAction, isPending] = useActionState(updateSettingsAction, { status: "idle" } as UpdateSettingsState);

  useEffect(() => {
    if (state.status === "success") {
      toast.success("Paramètres enregistrés.");
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-3">
      <Field label="Places parking"><Input type="number" name="parkingSpaces" defaultValue={defaults.parkingSpaces} /></Field>
      <Field label="Tarif parking en centimes"><Input type="number" name="defaultParkingRateCents" defaultValue={defaults.defaultParkingRateCents} /></Field>
      <Field label="Alerte sortie impayée (jours)"><Input type="number" name="notificationLeadDays" defaultValue={defaults.notificationLeadDays} /></Field>
      <div className="flex items-center gap-3 rounded-md border bg-white px-3 py-2">
        <input id="depositEnabled" type="checkbox" name="depositEnabled" className="h-4 w-4" defaultChecked={defaults.depositEnabled} />
        <Label htmlFor="depositEnabled">Activer le dépôt de garantie</Label>
      </div>
      <Field label="Dépôt par défaut en centimes"><Input type="number" name="defaultDepositCents" defaultValue={defaults.defaultDepositCents} /></Field>
      <div className="md:col-span-3"><Button disabled={isPending}>{isPending ? "Enregistrement…" : "Enregistrer les paramètres"}</Button></div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

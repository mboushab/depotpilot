"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { assignParkingAction, type AssignParkingState } from "@/server/actions/forms";
import { NewClientDialog } from "@/components/clients/new-client-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Option = { id: string; label: string };

const initialState: AssignParkingState = { status: "idle" };

export function ParkingForm({ occupants, onSuccess }: { occupants: Option[]; onSuccess?: () => void }) {
  const [state, formAction, isPending] = useActionState(assignParkingAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const lastSubmission = useRef<FormData | null>(null);
  const pendingSelectId = useRef<string | null>(null);
  const today = format(new Date(), "yyyy-MM-dd");
  const [clientOptions, setClientOptions] = useState(occupants);

  useEffect(() => {
    if (pendingSelectId.current && selectRef.current) {
      selectRef.current.value = pendingSelectId.current;
      pendingSelectId.current = null;
    }
  }, [clientOptions]);

  useEffect(() => {
    if (state.status === "success") {
      toast.success("Véhicule ajouté au parking.");
      formRef.current?.reset();
      onSuccess?.();
    } else if (state.status === "error") {
      toast.error(state.message);
      const form = formRef.current;
      const submitted = lastSubmission.current;
      if (form && submitted) {
        for (const [name, value] of submitted.entries()) {
          const field = form.elements.namedItem(name);
          if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) {
            field.value = String(value);
          }
        }
      }
    }
  }, [state, onSuccess]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={(event) => {
        lastSubmission.current = new FormData(event.currentTarget);
      }}
      className="grid gap-4 md:grid-cols-3"
    >
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
        <select ref={selectRef} className="h-10 w-full rounded-md border bg-white px-3 text-sm text-foreground dark:bg-card" name="occupantId" defaultValue="">
          <option value="">Sélectionner</option>
          {clientOptions.map((occupant) => <option key={occupant.id} value={occupant.id}>{occupant.label}</option>)}
        </select>
      </Field>
      <Field label="Plaque"><Input name="vehiclePlate" placeholder="AB-123-CD" required /></Field>
      <Field label="Début"><Input type="date" name="startDate" defaultValue={today} required /></Field>
      <div className="md:col-span-3"><Button disabled={isPending}>{isPending ? "Ajout…" : "Ajouter la voiture"}</Button></div>
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

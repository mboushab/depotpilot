"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { scheduleLoadingAction, type ScheduleLoadingState } from "@/server/actions/forms";
import { isValidFrenchPhone } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ScheduleLoadingState = { status: "idle" };

export function LoadingForm({ onSuccess }: { onSuccess?: () => void }) {
  const [state, formAction, isPending] = useActionState(scheduleLoadingAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const lastSubmission = useRef<FormData | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const minStart = format(new Date(), "yyyy-MM-dd'T'HH:mm");

  useEffect(() => {
    if (state.status === "success") {
      toast.success("Chargement programmé avec succès.");
      formRef.current?.reset();
      onSuccess?.();
    } else if (state.status === "error") {
      toast.error(state.message);
      // React resets uncontrolled form fields after any action call that doesn't throw,
      // regardless of the returned status, so restore what the user typed.
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
        const data = new FormData(event.currentTarget);
        const phone = String(data.get("clientPhone") ?? "");
        if (phone !== "" && !isValidFrenchPhone(phone)) {
          event.preventDefault();
          setPhoneError("Numéro de téléphone français invalide");
          return;
        }
        setPhoneError(null);
        lastSubmission.current = data;
      }}
      className="grid gap-4 md:grid-cols-3"
    >
      <Field label="Client"><Input name="clientName" placeholder="Nom et prénom" required /></Field>
      <Field label="Téléphone (optionnel)" error={phoneError}>
        <Input name="clientPhone" placeholder="06 12 34 56 78" onChange={() => setPhoneError(null)} />
      </Field>
      <Field label="Début"><Input type="datetime-local" name="startsAt" min={minStart} required /></Field>
      <Field label="Durée">
        <select className="h-10 w-full rounded-md border bg-white px-3 text-sm" name="durationValue" defaultValue={1}>
          {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </Field>
      <Field label="Unité">
        <select className="h-10 w-full rounded-md border bg-white px-3 text-sm" name="durationUnit" defaultValue="HOURS">
          <option value="HOURS">Heures</option>
          <option value="DAYS">Jours</option>
        </select>
      </Field>
      <div className="md:col-span-3"><Button disabled={isPending}>{isPending ? "Programmation…" : "Programmer"}</Button></div>
    </form>
  );
}

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string | null }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

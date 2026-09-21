"use client";

import { useEffect, useRef, useState, useActionState } from "react";
import { toast } from "sonner";
import { createOccupantAction, type CreateOccupantState } from "@/server/actions/forms";
import { isValidFrenchPhone } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type CreatedClient = { id: string; label: string; phone?: string };

export function ClientForm({ onSuccess }: { onSuccess?: (client: CreatedClient) => void }) {
  const [state, formAction, isPending] = useActionState(createOccupantAction, { status: "idle" } as CreateOccupantState);
  const formRef = useRef<HTMLFormElement>(null);
  const lastSubmission = useRef<{ firstName: string; lastName: string; phone: string } | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === "success") {
      toast.success("Client créé.");
      const submitted = lastSubmission.current;
      formRef.current?.reset();
      if (submitted) {
        onSuccess?.({ id: state.occupantId, label: `${submitted.firstName} ${submitted.lastName}`, phone: submitted.phone });
      }
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state, onSuccess]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={(event) => {
        const data = new FormData(event.currentTarget);
        const phone = String(data.get("phone") ?? "");
        if (!isValidFrenchPhone(phone)) {
          event.preventDefault();
          setPhoneError("Numéro de téléphone français invalide");
          return;
        }
        setPhoneError(null);
        lastSubmission.current = {
          firstName: String(data.get("firstName") ?? ""),
          lastName: String(data.get("lastName") ?? ""),
          phone
        };
      }}
      className="grid gap-4 md:grid-cols-2"
    >
      <Field label="Prénom"><Input name="firstName" required /></Field>
      <Field label="Nom"><Input name="lastName" required /></Field>
      <Field label="Téléphone" error={phoneError}>
        <Input
          name="phone"
          placeholder="06 12 34 56 78"
          required
          onChange={() => setPhoneError(null)}
        />
      </Field>
      <Field label="E-mail"><Input type="email" name="email" /></Field>
      <Field label="Société"><Input name="company" /></Field>
      <Field label="Adresse"><Input name="address" /></Field>
      <Field label="Ville"><Input name="city" /></Field>
      <Field label="Code postal"><Input name="postalCode" /></Field>
      <input type="hidden" name="country" value="FR" />
      <div className="md:col-span-2">
        <Button disabled={isPending}>{isPending ? "Création…" : "Créer le client"}</Button>
      </div>
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

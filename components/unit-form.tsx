"use client";

import { useEffect, useRef, useActionState } from "react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createUnitAction, type CreateUnitState } from "@/server/actions/forms";
import { unitSchema, type UnitInput } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function UnitForm({ suggestedCode, onSuccess }: { suggestedCode?: string; onSuccess?: () => void }) {
  const [state, formAction, isPending] = useActionState(createUnitAction, { status: "idle" } as CreateUnitState);
  const formRef = useRef<HTMLFormElement>(null);
  const form = useForm<UnitInput>({ resolver: zodResolver(unitSchema) });

  useEffect(() => {
    if (state.status === "success") {
      toast.success("Box créé.");
      formRef.current?.reset();
      onSuccess?.();
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state, onSuccess]);

  return (
    <form ref={formRef} action={formAction} className="grid gap-4 md:grid-cols-3">
      <Field label="Code"><Input placeholder="B-30" defaultValue={suggestedCode} {...form.register("code")} /></Field>
      <Field label="Tarif mensuel (€)">
        <Input
          type="number"
          step="0.01"
          min={0}
          onChange={(event) => form.setValue("monthlyRateCents", Math.round(Number(event.target.value || "0") * 100))}
        />
        <input type="hidden" {...form.register("monthlyRateCents")} />
      </Field>
      <Field label="Surface m2"><Input type="number" step="0.1" {...form.register("surfaceM2")} /></Field>
      <div className="md:col-span-3">
        <Button disabled={isPending}>{isPending ? "Création…" : "Créer le box"}</Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

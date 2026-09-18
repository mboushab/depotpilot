"use client";

import { useEffect, useRef, useActionState } from "react";
import { toast } from "sonner";
import { updateBoxRatesAction, type UpdateBoxRatesState } from "@/server/actions/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Unit = { id: string; code: string; monthlyRateCents: number };

export function BoxRatesForm({ units }: { units: Unit[] }) {
  const [state, formAction, isPending] = useActionState(updateBoxRatesAction, { status: "idle" } as UpdateBoxRatesState);

  useEffect(() => {
    if (state.status === "success") {
      toast.success("Tarifs mis à jour.");
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {units.map((unit) => (
          <BoxRateField key={unit.id} unit={unit} />
        ))}
      </div>
      <Button disabled={isPending}>{isPending ? "Enregistrement…" : "Enregistrer les tarifs"}</Button>
    </form>
  );
}

function BoxRateField({ unit }: { unit: Unit }) {
  const centsRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1">
      <Label>{unit.code} (€)</Label>
      <Input
        type="number"
        step="0.01"
        min={0}
        defaultValue={(unit.monthlyRateCents / 100).toFixed(2)}
        onChange={(event) => {
          if (centsRef.current) {
            centsRef.current.value = String(Math.round(Number(event.target.value || "0") * 100));
          }
        }}
      />
      <input type="hidden" name={`rate_${unit.id}`} ref={centsRef} defaultValue={unit.monthlyRateCents} />
    </div>
  );
}

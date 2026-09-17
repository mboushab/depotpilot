"use client";

import { useEffect, useActionState } from "react";
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
          <div key={unit.id} className="space-y-1">
            <Label>{unit.code}</Label>
            <Input type="number" name={`rate_${unit.id}`} defaultValue={unit.monthlyRateCents} min={0} />
          </div>
        ))}
      </div>
      <Button disabled={isPending}>{isPending ? "Enregistrement…" : "Enregistrer les tarifs"}</Button>
    </form>
  );
}

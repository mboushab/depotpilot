"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UnitForm } from "@/components/unit-form";

export function AddBoxDialog({ suggestedCode }: { suggestedCode: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} aria-label="Ajouter un box">
        <Plus className="h-4 w-4" />
        Nouveau box
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" className="w-full max-w-2xl rounded-lg border bg-white shadow-panel" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-base font-semibold">Nouveau box</h2>
              <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted" aria-label="Fermer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <UnitForm suggestedCode={suggestedCode} onSuccess={() => setOpen(false)} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

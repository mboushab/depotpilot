"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { ClientForm, type CreatedClient } from "@/components/forms/client-form";

export function NewClientDialog({ onCreated }: { onCreated: (client: CreatedClient) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-primary hover:underline">
        + Nouveau client
      </button>
      {open
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
              <div role="dialog" aria-modal="true" className="w-full max-w-2xl rounded-lg border bg-white shadow-panel" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-center justify-between border-b px-5 py-4">
                  <h2 className="text-base font-semibold">Nouveau client</h2>
                  <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted" aria-label="Fermer">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="px-5 py-4">
                  <ClientForm
                    onSuccess={(client) => {
                      setOpen(false);
                      onCreated(client);
                    }}
                  />
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

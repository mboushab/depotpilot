"use client";

import { useEffect, useRef, useState, useActionState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteOccupantAction, type DeleteOccupantState } from "@/server/actions/forms";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function DeleteClientButton({ id, name }: { id: string; name: string }) {
  const [state, formAction, isPending] = useActionState(deleteOccupantAction, { status: "idle" } as DeleteOccupantState);
  const formRef = useRef<HTMLFormElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (state.status === "success") {
      toast.success("Client supprimé.");
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <>
      <form ref={formRef} action={formAction}>
        <input type="hidden" name="id" value={id} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-red-700 hover:bg-red-50"
          disabled={isPending}
          onClick={() => setConfirmOpen(true)}
          aria-label={`Supprimer ${name}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </form>
      <ConfirmDialog
        open={confirmOpen}
        title={`Supprimer ${name} ?`}
        description="Cette action est définitive et ne peut pas être annulée."
        confirmLabel="Supprimer"
        onConfirm={() => {
          setConfirmOpen(false);
          formRef.current?.requestSubmit();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

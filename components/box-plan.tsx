"use client";

import { useEffect, useMemo, useRef, useState, useActionState } from "react";
import { Euro, LogOut, Download } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { RentBoxDialog } from "@/components/box/rent-box-dialog";
import {
  extendRentalAction,
  releaseRentalAction,
  confirmBoxPaymentAction,
  type ExtendRentalState,
  type ReleaseRentalState,
  type ConfirmBoxPaymentState
} from "@/server/actions/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Option = { id: string; label: string };

type BoxCard = {
  id: string;
  code: string;
  position: number;
  status: string;
  monthlyRateCents: number;
  surfaceM2: string;
  activeRental?: {
    id: string;
    type: string;
    monthlyRateCents: number;
    startDate: string;
    endDate: string | null;
    occupantName: string;
    occupantPhone: string;
    invoices: Array<{ status: string; totalCents: number; paidCents: number }>;
  };
};

function getBoxSignal(box: BoxCard, leadDays: number) {
  const unpaid = box.activeRental?.invoices.some((invoice) => invoice.status === "OVERDUE" || invoice.paidCents < invoice.totalCents);
  const exitClose = box.activeRental?.endDate
    ? new Date(box.activeRental.endDate).getTime() - Date.now() <= leadDays * 24 * 60 * 60 * 1000
    : false;

  if (box.status === "AVAILABLE") return { label: "Libre", className: "border-amber-400 bg-amber-400/15 text-amber-700" };
  if (unpaid) return { label: "Impayé", className: "border-rose-400 bg-rose-400/15 text-rose-700" };
  if (exitClose) return { label: "Sortie proche", className: "border-orange-500 bg-orange-500/15 text-orange-700" };
  if (box.status === "RESERVED") return { label: "Réservé", className: "border-violet-500 bg-violet-500/15 text-violet-700" };
  return { label: "Occupé", className: "border-emerald-400 bg-emerald-400/15 text-emerald-700" };
}

export function BoxPlan({
  boxes,
  occupants,
  depositEnabled,
  defaultDepositCents,
  leadDays
}: {
  boxes: BoxCard[];
  occupants: Option[];
  depositEnabled: boolean;
  defaultDepositCents: number;
  leadDays: number;
}) {
  const [selectedId, setSelectedId] = useState(boxes[0]?.id);
  const selected = useMemo(() => boxes.find((box) => box.id === selectedId) ?? boxes[0], [boxes, selectedId]);
  const stats = {
    free: boxes.filter((box) => getBoxSignal(box, leadDays).label === "Libre").length,
    occupied: boxes.filter((box) => getBoxSignal(box, leadDays).label === "Occupé").length,
    unpaid: boxes.filter((box) => getBoxSignal(box, leadDays).label === "Impayé").length,
    exitClose: boxes.filter((box) => getBoxSignal(box, leadDays).label === "Sortie proche").length
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Libres" value={`${stats.free}/30`} />
        <Metric label="Loués/Payés" value={String(stats.occupied)} />
        <Metric label="Impayés" value={String(stats.unpaid)} tone="danger" />
        <Metric label="Sorties proches" value={String(stats.exitClose)} tone="warning" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="rounded-lg border bg-white p-4 shadow-panel">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Plan des box</h2>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {["Libre", "Occupé", "Sortie proche", "Impayé", "Réservé"].map((label) => <span key={label}>{label}</span>)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {boxes.map((box) => {
              const signal = getBoxSignal(box, leadDays);
              return (
                <button
                  key={box.id}
                  type="button"
                  onClick={() => setSelectedId(box.id)}
                  className={`min-h-28 rounded-md border-2 p-3 text-left transition hover:scale-[1.01] ${signal.className} ${selected?.id === box.id ? "ring-[3px] ring-slate-900 ring-offset-2" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{box.code}</span>
                    {signal.label === "Impayé" ? <Euro className="h-4 w-4" /> : null}
                    {signal.label === "Sortie proche" ? <LogOut className="h-4 w-4" /> : null}
                  </div>
                  <p className="mt-5 text-sm font-medium">{box.activeRental?.occupantName ?? signal.label}</p>
                  <p className="mt-2 text-xs opacity-80">{signal.label === "Libre" ? `À partir de ${formatCurrency(box.monthlyRateCents)}` : signal.label}</p>
                </button>
              );
            })}
          </div>
        </div>
        {selected ? (
          <BoxDetails key={selected.id} box={selected} occupants={occupants} depositEnabled={depositEnabled} defaultDepositCents={defaultDepositCents} leadDays={leadDays} />
        ) : null}
      </div>
    </div>
  );
}

function BoxDetails({
  box,
  occupants,
  depositEnabled,
  defaultDepositCents,
  leadDays
}: {
  box: BoxCard;
  occupants: Option[];
  depositEnabled: boolean;
  defaultDepositCents: number;
  leadDays: number;
}) {
  const signal = getBoxSignal(box, leadDays);
  const balance = box.activeRental?.invoices.reduce((sum, invoice) => sum + invoice.totalCents - invoice.paidCents, 0) ?? 0;
  const [extending, setExtending] = useState(false);
  const [renting, setRenting] = useState(false);
  const [paymentState, confirmPaymentFormAction, isConfirmingPayment] = useActionState(
    confirmBoxPaymentAction,
    { status: "idle" } as ConfirmBoxPaymentState
  );

  useEffect(() => {
    if (paymentState.status === "success") {
      toast.success("Paiement confirmé.");
    } else if (paymentState.status === "error") {
      toast.error(paymentState.message);
    }
  }, [paymentState]);

  return (
    <aside className="rounded-lg border bg-white p-5 shadow-panel">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Box {box.code}</h2>
        <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold">{signal.label}</span>
      </div>
      <div className="mt-6 space-y-4 text-sm">
        <Row label="Client" value={box.activeRental?.occupantName ?? "Aucun client"} />
        {box.activeRental ? <Row label="Téléphone" value={box.activeRental.occupantPhone} /> : null}
        {box.activeRental ? <Row label="Type" value={box.activeRental.type === "ONE_TIME" ? "Ponctuel" : "Mensuel"} /> : null}
        <Row label="Entrée" value={box.activeRental ? format(new Date(box.activeRental.startDate), "dd MMM yyyy", { locale: fr }) : "-"} />
        <Row label="Sortie" value={box.activeRental?.endDate ? format(new Date(box.activeRental.endDate), "dd MMM yyyy", { locale: fr }) : "Non planifiée"} />
        <Row label="Loyer" value={`${formatCurrency(box.activeRental?.monthlyRateCents ?? box.monthlyRateCents)} / mois`} />
        {box.activeRental ? <Row label="Statut" value={balance > 0 ? "Impayé" : "Payé"} /> : null}
        <Row label="Surface" value={`${box.surfaceM2} m2`} />
      </div>
      <div className="mt-6 grid gap-2">
        {!box.activeRental ? (
          <Button onClick={() => setRenting(true)}>Louer ce box</Button>
        ) : paymentState.status === "success" ? (
          <Button asChild variant="outline" className="w-full">
            <a href={`/api/invoices/${paymentState.invoiceId}/pdf`} target="_blank" rel="noreferrer">
              <Download className="h-4 w-4" />
              Imprimer la facture
            </a>
          </Button>
        ) : extending ? (
          <ExtendExitForm rentalId={box.activeRental.id} currentEndDate={box.activeRental.endDate} onDone={() => setExtending(false)} />
        ) : (
          <>
            <Button variant="outline" onClick={() => setExtending(true)}>Prolonger la sortie</Button>
            {balance > 0 ? (
              <form action={confirmPaymentFormAction}>
                <input type="hidden" name="rentalId" value={box.activeRental.id} />
                <Button type="submit" variant="outline" className="w-full" disabled={isConfirmingPayment}>
                  {isConfirmingPayment ? "Confirmation…" : "Confirmer le paiement"}
                </Button>
              </form>
            ) : null}
            <ReleaseBoxButton rentalId={box.activeRental.id} />
          </>
        )}
      </div>
      <RentBoxDialog
        open={renting}
        onClose={() => setRenting(false)}
        unitId={box.id}
        unitCode={box.code}
        monthlyRateCents={box.monthlyRateCents}
        occupants={occupants}
        depositEnabled={depositEnabled}
        defaultDepositCents={defaultDepositCents}
      />
    </aside>
  );
}

function ExtendExitForm({ rentalId, currentEndDate, onDone }: { rentalId: string; currentEndDate: string | null; onDone: () => void }) {
  const [state, formAction, isPending] = useActionState(extendRentalAction, { status: "idle" } as ExtendRentalState);

  useEffect(() => {
    if (state.status === "success") {
      toast.success("Date de sortie mise à jour.");
      onDone();
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state, onDone]);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="rentalId" value={rentalId} />
      <Label>Nouvelle date de sortie</Label>
      <Input type="date" name="endDate" defaultValue={currentEndDate ? currentEndDate.slice(0, 10) : ""} />
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" className="flex-1" onClick={onDone}>Annuler</Button>
        <Button type="submit" className="flex-1" disabled={isPending}>{isPending ? "Enregistrement…" : "Enregistrer"}</Button>
      </div>
    </form>
  );
}

function ReleaseBoxButton({ rentalId }: { rentalId: string }) {
  const [state, formAction, isPending] = useActionState(releaseRentalAction, { status: "idle" } as ReleaseRentalState);
  const formRef = useRef<HTMLFormElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (state.status === "success") {
      toast.success("Box libéré.");
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <>
      <form ref={formRef} action={formAction}>
        <input type="hidden" name="rentalId" value={rentalId} />
        <Button
          type="button"
          variant="outline"
          className="w-full text-red-700 hover:bg-red-50"
          disabled={isPending}
          onClick={() => setConfirmOpen(true)}
        >
          {isPending ? "Libération…" : "Libérer le box"}
        </Button>
      </form>
      <ConfirmDialog
        open={confirmOpen}
        title="Libérer ce box ?"
        description="La location sera clôturée et le box redeviendra disponible."
        confirmLabel="Libérer"
        onConfirm={() => {
          setConfirmOpen(false);
          formRef.current?.requestSubmit();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "danger" | "warning" }) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-panel">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone === "danger" ? "text-red-600" : tone === "warning" ? "text-amber-600" : ""}`}>{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4 border-b pb-2"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{value}</span></div>;
}

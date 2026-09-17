"use client";

import { useEffect, useMemo, useState, useActionState } from "react";
import { Download } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { PARKING_FREE_DAYS, parkingDaysElapsed } from "@/lib/storage-rules";
import { releaseParkingAction, type ReleaseParkingState } from "@/server/actions/forms";
import { Button } from "@/components/ui/button";

type ParkedCar = {
  id: string;
  vehiclePlate: string;
  occupantName: string;
  phone: string;
  startDate: string;
  monthlyRateCents: number;
};

function getCarSignal(car: ParkedCar) {
  const daysElapsed = parkingDaysElapsed(new Date(car.startDate));
  const overdue = daysElapsed >= PARKING_FREE_DAYS;
  return {
    overdue,
    daysElapsed,
    daysRemaining: Math.max(PARKING_FREE_DAYS - daysElapsed, 0),
    label: overdue ? "Payant" : "Gratuit",
    className: overdue ? "border-red-500 bg-red-950/15 text-red-700" : "border-emerald-500 bg-emerald-950/15 text-emerald-700"
  };
}

export function ParkingPlan({ cars }: { cars: ParkedCar[] }) {
  const [selectedId, setSelectedId] = useState(cars[0]?.id);
  const selected = useMemo(() => cars.find((car) => car.id === selectedId) ?? cars[0], [cars, selectedId]);
  const overdueCount = cars.filter((car) => getCarSignal(car).overdue).length;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Metric label="Véhicules enregistrés" value={String(cars.length)} />
          <Metric label="Gratuit" value={String(cars.length - overdueCount)} />
          <Metric label="Payant" value={String(overdueCount)} tone="danger" />
        </div>
        <div className="rounded-lg border bg-white p-4 shadow-panel">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Véhicules stationnés</h2>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {["Gratuit", "Payant"].map((label) => <span key={label}>{label}</span>)}
            </div>
          </div>
          {cars.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Aucun véhicule stationné. Ajoutez-en un ci-dessus.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {cars.map((car) => {
                const signal = getCarSignal(car);
                return (
                  <button
                    type="button"
                    key={car.id}
                    onClick={() => setSelectedId(car.id)}
                    className={`min-h-28 rounded-md border-2 p-3 text-left transition hover:scale-[1.01] ${signal.className} ${selected?.id === car.id ? "ring-2 ring-primary ring-offset-2" : ""}`}
                  >
                    <div className="font-semibold">{car.vehiclePlate}</div>
                    <p className="mt-6 text-sm font-medium">{car.occupantName}</p>
                    <p className="mt-2 text-xs opacity-80">{signal.overdue ? `Payant, jour ${signal.daysElapsed + 1}` : `${signal.daysRemaining} j gratuits restants`}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {selected ? <ParkingDetails car={selected} /> : null}
    </div>
  );
}

function ParkingDetails({ car }: { car: ParkedCar }) {
  const signal = getCarSignal(car);

  return (
    <aside className="rounded-lg border bg-white p-5 shadow-panel">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{car.vehiclePlate}</h2>
        <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold">{signal.label}</span>
      </div>
      <div className="mt-6 space-y-4 text-sm">
        <Row label="Client" value={car.occupantName} />
        <Row label="Téléphone" value={car.phone} />
        <Row label="Entrée" value={format(new Date(car.startDate), "dd MMM yyyy", { locale: fr })} />
        <Row label="Jours de stationnement" value={String(signal.daysElapsed)} />
        <Row label="Situation" value={signal.overdue ? `Payant depuis ${signal.daysElapsed - PARKING_FREE_DAYS + 1} j` : `${signal.daysRemaining} j gratuits restants`} />
        <Row label="Montant" value={signal.overdue ? formatCurrency(car.monthlyRateCents) : "Gratuit"} />
      </div>
      <div className="mt-6 grid gap-2">
        <ReleaseParkingButton assignmentId={car.id} />
        {signal.overdue ? (
          <Button asChild variant="outline" className="w-full">
            <Link href={`/api/parking/${car.id}/notice`} target="_blank">
              <Download className="h-4 w-4" />
              Imprimer l&apos;avis
            </Link>
          </Button>
        ) : null}
      </div>
    </aside>
  );
}

function ReleaseParkingButton({ assignmentId }: { assignmentId: string }) {
  const [state, formAction, isPending] = useActionState(releaseParkingAction, { status: "idle" } as ReleaseParkingState);

  useEffect(() => {
    if (state.status === "success") {
      toast.success("Sortie enregistrée.");
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Enregistrement…" : "Enregistrer la sortie"}
      </Button>
    </form>
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

"use client";

import { useMemo, useState } from "react";
import { addMonths, endOfMonth, format, parseISO, startOfMonth, subMonths } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarSearch, ChevronLeft, ChevronRight, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type PeriodBox = {
  code: string;
  activeRental?: {
    type: string;
    startDate: string;
    endDate: string | null;
    occupantName: string;
  };
};

type Mode = "month" | "range";

function toDateInputValue(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function PeriodAvailabilityDialog({ boxes }: { boxes: PeriodBox[] }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("month");
  const [monthCursor, setMonthCursor] = useState(() => new Date());
  const [rangeStart, setRangeStart] = useState(() => toDateInputValue(startOfMonth(new Date())));
  const [rangeEnd, setRangeEnd] = useState(() => toDateInputValue(endOfMonth(new Date())));

  const { periodStart, periodEnd, rangeLabel } = useMemo(() => {
    if (mode === "month") {
      return {
        periodStart: startOfMonth(monthCursor),
        periodEnd: endOfMonth(monthCursor),
        rangeLabel: format(monthCursor, "MMMM yyyy", { locale: fr })
      };
    }
    const start = parseISO(rangeStart);
    const end = parseISO(rangeEnd);
    return {
      periodStart: start,
      periodEnd: end,
      rangeLabel: `${format(start, "d MMM yyyy", { locale: fr })} au ${format(end, "d MMM yyyy", { locale: fr })}`
    };
  }, [mode, monthCursor, rangeStart, rangeEnd]);

  const results = useMemo(() => {
    return boxes.map((box) => {
      const rental = box.activeRental;
      const occupied = !!rental && parseISO(rental.startDate) <= periodEnd && (!rental.endDate || parseISO(rental.endDate) >= periodStart);
      const untilLabel = occupied
        ? rental?.endDate
          ? `Jusqu'au ${format(parseISO(rental.endDate), "dd/MM/yyyy")}`
          : "Durée indéterminée"
        : "";
      return { code: box.code, occupied, clientName: rental?.occupantName ?? "", untilLabel };
    });
  }, [boxes, periodStart, periodEnd]);

  const occupiedCount = results.filter((box) => box.occupied).length;
  const availableCount = results.length - occupiedCount;

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <CalendarSearch className="h-4 w-4" />
        Vérifier une période
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg border bg-card shadow-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-base font-semibold">Vérifier une période</h2>
              <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted" aria-label="Fermer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto px-5 py-4">
              <p className="text-sm text-muted-foreground">
                Ceci ne change pas les statuts affichés sur la page — c&apos;est une simulation pour trouver un box libre à l&apos;avance.
              </p>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex rounded-md border bg-background p-0.5">
                  <button
                    type="button"
                    onClick={() => setMode("month")}
                    className={cn("rounded px-3 py-1.5 text-xs font-semibold", mode === "month" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                  >
                    Par mois
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("range")}
                    className={cn("rounded px-3 py-1.5 text-xs font-semibold", mode === "range" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                  >
                    Période personnalisée
                  </button>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Disponible</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Occupé sur la période</span>
                </div>
              </div>

              {mode === "month" ? (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setMonthCursor((current) => subMonths(current, 1))}
                    className="grid h-9 w-9 place-items-center rounded-md border hover:bg-muted"
                    aria-label="Mois précédent"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="min-w-[180px] text-center text-base font-semibold capitalize">{format(monthCursor, "MMMM yyyy", { locale: fr })}</span>
                  <button
                    type="button"
                    onClick={() => setMonthCursor((current) => addMonths(current, 1))}
                    className="grid h-9 w-9 place-items-center rounded-md border hover:bg-muted"
                    aria-label="Mois suivant"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-end gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Du</label>
                    <input
                      type="date"
                      value={rangeStart}
                      onChange={(event) => setRangeStart(event.target.value)}
                      className="h-9 w-40 rounded-md border bg-background px-2 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Au</label>
                    <input
                      type="date"
                      value={rangeEnd}
                      onChange={(event) => setRangeEnd(event.target.value)}
                      className="h-9 w-40 rounded-md border bg-background px-2 text-sm"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2.5 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Une location mensuelle sans date de sortie est considérée occupée pour toute la période — ces box sont marqués <strong>« Durée indéterminée »</strong>.
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Résultats pour <strong className="text-foreground">{rangeLabel}</strong>
                </span>
                <span className="text-muted-foreground">
                  <strong className="text-amber-600 dark:text-amber-400">{availableCount} disponibles</strong> · <strong className="text-emerald-600 dark:text-emerald-400">{occupiedCount} occupés</strong>
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
                {results.map((box) => (
                  <div
                    key={box.code}
                    className={cn(
                      "flex min-h-[68px] flex-col gap-1 rounded-md border-2 p-2.5 text-left",
                      box.occupied
                        ? "border-emerald-400 bg-emerald-400/10"
                        : "border-amber-400 bg-amber-400/10"
                    )}
                  >
                    <span className="text-sm font-semibold">{box.code}</span>
                    {box.occupied ? (
                      <span className="truncate text-[11px] text-muted-foreground">{box.untilLabel}</span>
                    ) : (
                      <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">Disponible</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

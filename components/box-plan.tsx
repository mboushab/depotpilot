"use client";

import { useEffect, useMemo, useRef, useState, useActionState } from "react";
import {
  Euro,
  LogOut,
  Download,
  Pencil,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Package,
  Users,
  AlertTriangle,
  CalendarClock,
  User,
  Phone,
  MapPin,
  Zap
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { addDays, addMonths, differenceInCalendarDays, endOfMonth, format, isSameMonth, parseISO, startOfDay, startOfMonth, subMonths } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { availableSince, lastAvailableDate, rangesOverlap } from "@/lib/rental-conflicts";
import { RentBoxDialog } from "@/components/box/rent-box-dialog";
import { WhatsAppInvoiceButton } from "@/components/invoices/whatsapp-invoice-button";
import {
  extendRentalAction,
  releaseRentalAction,
  cancelReservationAction,
  confirmBoxPaymentAction,
  updateRentalRateAction,
  updateRentalStartDateAction,
  updateRentalTypeAction,
  markRentalUnpaidAction,
  type ExtendRentalState,
  type ReleaseRentalState,
  type CancelReservationState,
  type ConfirmBoxPaymentState,
  type UpdateRentalRateState,
  type UpdateRentalStartDateState,
  type UpdateRentalTypeState,
  type MarkRentalUnpaidState
} from "@/server/actions/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Option = { id: string; label: string; phone?: string };

type RentalCard = {
  id: string;
  type: string;
  monthlyRateCents: number;
  startDate: string;
  endDate: string | null;
  occupantName: string;
  occupantPhone: string;
  invoices: Array<{ status: string; totalCents: number; paidCents: number }>;
};

type BoxCard = {
  id: string;
  code: string;
  position: number;
  status: string;
  monthlyRateCents: number;
  surfaceM2: string;
  activeRental?: RentalCard;
  upcomingRental?: { occupantName: string; startDate: string };
  // All of the box's active rentals (current + any queued one): a period
  // search checks every one, and the drawer can manage whichever it shows.
  rentals: RentalCard[];
};

// A box that frees up for less than this many days before its next
// booking starts isn't worth renting out, so no "Louer" button is offered.
const MIN_RENTABLE_DAYS = 2;

function getBoxSignal(box: BoxCard, leadDays: number) {
  const unpaid = box.activeRental?.invoices.some((invoice) => invoice.status === "OVERDUE" || invoice.paidCents < invoice.totalCents);
  const exitClose = box.activeRental?.endDate
    ? new Date(box.activeRental.endDate).getTime() - Date.now() <= leadDays * 24 * 60 * 60 * 1000
    : false;

  if (box.status === "AVAILABLE") return { label: "Libre", className: "border-amber-400 bg-amber-400/15 text-amber-700 dark:text-amber-300" };
  if (box.status === "RESERVED") return { label: "Réservé", className: "border-violet-500 bg-violet-500/15 text-violet-700 dark:text-violet-300" };
  if (unpaid) return { label: "Impayé", className: "border-rose-400 bg-rose-400/15 text-rose-700 dark:text-rose-300" };
  if (exitClose) return { label: "Sortie proche", className: "border-orange-500 bg-orange-500/15 text-orange-700 dark:text-orange-300" };
  return { label: "Occupé", className: "border-emerald-400 bg-emerald-400/15 text-emerald-700 dark:text-emerald-300" };
}

// The filter pills display a friendlier plural than the underlying signal
// label used for matching ("Libre" stays the comparison key everywhere else).
// The status spelled out on every card, not just implied by its colour.
function StatusBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-bold dark:bg-black/30">
      {label === "Impayé" ? <Euro className="h-3 w-3" /> : null}
      {label === "Sortie proche" ? <LogOut className="h-3 w-3" /> : null}
      {label}
    </span>
  );
}

function filterDisplayLabel(label: string) {
  const plurals: Record<string, string> = {
    Libre: "Libres",
    Occupé: "Occupés",
    Réservé: "Réservés",
    Impayé: "Impayés",
    Disponible: "Disponibles"
  };
  return plurals[label] ?? label;
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const selected = useMemo(() => boxes.find((box) => box.id === selectedId) ?? boxes[0], [boxes, selectedId]);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [monthCursor, setMonthCursor] = useState(() => new Date());
  // A validated custom period (yyyy-MM-dd); while set it replaces the month navigation.
  const [period, setPeriod] = useState<{ start: string; end: string } | null>(null);
  const dateMode = period ? "range" : "month";
  const [periodModalOpen, setPeriodModalOpen] = useState(false);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const [periodError, setPeriodError] = useState<string | null>(null);
  const isCurrentMonth = dateMode === "month" && isSameMonth(monthCursor, new Date());
  const [periodBooking, setPeriodBooking] = useState<{
    box: BoxCard;
    startDate: string;
    type: "MONTHLY" | "ONE_TIME";
    durationDays?: number;
    maxEndDate?: string;
    minStartDate?: string;
  } | null>(null);

  function goToMonth(next: Date) {
    setStatusFilter(null);
    setPeriod(null);
    setMonthCursor(next);
  }

  function openPeriodModal() {
    const today = format(new Date(), "yyyy-MM-dd");
    setDraftStart(period?.start ?? today);
    setDraftEnd(period?.end ?? today);
    setPeriodError(null);
    setPeriodModalOpen(true);
  }

  function applyPeriod() {
    if (!draftStart || !draftEnd) {
      setPeriodError("Renseignez la date de début et la date de fin.");
      return;
    }
    if (draftEnd < draftStart) {
      setPeriodError("La date de fin doit être après la date de début.");
      return;
    }
    setStatusFilter(null);
    setPeriod({ start: draftStart, end: draftEnd });
    setPeriodModalOpen(false);
  }

  const periodRange = useMemo(
    () => ({
      start: period ? parseISO(period.start) : startOfMonth(monthCursor),
      end: period ? parseISO(period.end) : endOfMonth(monthCursor)
    }),
    [period, monthCursor]
  );

  // Away from the current month (or in a custom period), "occupied" is
  // derived from each box's rentals' dates instead of its live status — a
  // rental with no end date (the common monthly case) is treated as
  // occupying every period until it's actually ended.
  const periodBoxes = useMemo(() => {
    const { start: periodStart, end: periodEnd } = periodRange;
    return boxes.map((box) => {
      const toRange = (rental: BoxCard["rentals"][number]) => ({
        startDate: new Date(rental.startDate),
        endDate: rental.endDate ? new Date(rental.endDate) : null
      });
      const overlapping = box.rentals.find((rental) => rangesOverlap({ startDate: periodStart, endDate: periodEnd }, toRange(rental)));
      const occupied = !!overlapping;
      const untilLabel = occupied
        ? overlapping.endDate
          ? `Jusqu'au ${format(new Date(overlapping.endDate), "dd/MM/yyyy")}`
          : "Durée indéterminée"
        : "";
      // Free over the whole period: it stays free until the day before the
      // next booking starts (or with no limit when nothing follows).
      const lastAvailable = occupied ? null : lastAvailableDate(periodStart, box.rentals.map(toRange));
      const freeSince = occupied ? null : availableSince(periodStart, box.rentals.map(toRange));
      const nextRental = occupied
        ? undefined
        : box.rentals
            .filter((rental) => startOfDay(new Date(rental.startDate)) > startOfDay(periodStart))
            .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
      return { box, occupied, untilLabel, occupantName: overlapping?.occupantName, overlapping, lastAvailable, freeSince, nextRental };
    });
  }, [boxes, periodRange]);

  // Booking straight from a period search pre-fills the dates the admin
  // just searched for: an exact start/end becomes a one-off contract ending
  // that day, a whole month stays an open-ended monthly rental — unless a
  // booking follows, in which case only a one-off ending before it fits.
  function openPeriodBooking(entry: (typeof periodBoxes)[number]) {
    const { box, lastAvailable, freeSince } = entry;
    const minStartDate = freeSince ? format(freeSince, "yyyy-MM-dd") : undefined;
    setSelectedId(box.id);
    const startDate = format(periodRange.start, "yyyy-MM-dd");
    const maxEndDate = lastAvailable ? format(lastAvailable, "yyyy-MM-dd") : undefined;
    if (dateMode === "range" || maxEndDate) {
      const end = dateMode === "range" ? periodRange.end : (lastAvailable ?? periodRange.end);
      const durationDays = Math.max(1, differenceInCalendarDays(end, periodRange.start));
      setPeriodBooking({ box, startDate, type: "ONE_TIME", durationDays, maxEndDate, minStartDate });
    } else {
      setPeriodBooking({ box, startDate, type: "MONTHLY", minStartDate });
    }
  }

  const stats = {
    free: boxes.filter((box) => getBoxSignal(box, leadDays).label === "Libre").length,
    // "Loués/Payés" (top metric) is deliberately the narrow, fully-settled
    // subset — no unpaid balance, no exit looming.
    occupied: boxes.filter((box) => getBoxSignal(box, leadDays).label === "Occupé").length,
    // The "Occupé" filter pill is broader: any box actually occupied,
    // including ones that are also unpaid or about to leave — those are
    // still occupied boxes, just needing attention too.
    occupiedTotal: boxes.filter((box) => box.status === "OCCUPIED").length,
    unpaid: boxes.filter((box) => getBoxSignal(box, leadDays).label === "Impayé").length,
    exitClose: boxes.filter((box) => getBoxSignal(box, leadDays).label === "Sortie proche").length,
    reserved: boxes.filter((box) => getBoxSignal(box, leadDays).label === "Réservé").length
  };
  const periodAvailableCount = periodBoxes.filter((entry) => !entry.occupied).length;
  const periodOccupiedCount = periodBoxes.filter((entry) => entry.occupied).length;

  const totalVisibleCount = isCurrentMonth ? boxes.length : periodBoxes.length;
  const filterOptions = isCurrentMonth
    ? [
        { label: "Libre", count: stats.free },
        { label: "Occupé", count: stats.occupiedTotal },
        { label: "Réservé", count: stats.reserved },
        { label: "Sortie proche", count: stats.exitClose },
        { label: "Impayé", count: stats.unpaid }
      ]
    : [
        { label: "Disponible", count: periodAvailableCount },
        { label: "Occupé", count: periodOccupiedCount }
      ];
  const visibleBoxes = statusFilter
    ? statusFilter === "Occupé" && isCurrentMonth
      ? boxes.filter((box) => box.status === "OCCUPIED")
      : boxes.filter((box) => getBoxSignal(box, leadDays).label === statusFilter)
    : boxes;
  const selectedPeriodEntry = periodBoxes.find((entry) => entry.box.id === selected?.id);
  const visiblePeriodBoxes = statusFilter
    ? periodBoxes.filter((entry) => (statusFilter === "Disponible" ? !entry.occupied : entry.occupied))
    : periodBoxes;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric icon={Package} label="Libres" value={`${stats.free}/30`} tone="success" />
        <Metric icon={Users} label="Loués/Payés" value={String(stats.occupied)} tone="info" />
        <Metric icon={AlertTriangle} label="Impayés" value={String(stats.unpaid)} tone="danger" />
        <Metric icon={CalendarClock} label="Sorties proches" value={String(stats.exitClose)} tone="warning" />
      </div>
      <div>
        <div className="rounded-lg border bg-card p-4 shadow-panel">
          <h2 className="mb-3 text-base font-semibold">Plan des box</h2>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            {period ? (
              <div className="flex items-center overflow-hidden rounded-md border bg-primary/10 text-sm font-semibold text-primary">
                <button type="button" onClick={openPeriodModal} className="px-3 py-1.5 hover:bg-primary/10" aria-label="Modifier la période">
                  Du {format(parseISO(period.start), "dd MMM yyyy", { locale: fr })} au {format(parseISO(period.end), "dd MMM yyyy", { locale: fr })}
                </button>
                <button
                  type="button"
                  onClick={() => setPeriod(null)}
                  className="grid h-full w-8 place-items-center self-stretch border-l border-primary/20 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                  aria-label="Supprimer la période"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goToMonth(subMonths(monthCursor, 1))}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md border hover:bg-muted"
                  aria-label="Mois précédent"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-semibold capitalize">{format(monthCursor, "MMMM yyyy", { locale: fr })}</span>
                <button
                  type="button"
                  onClick={() => goToMonth(addMonths(monthCursor, 1))}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md border hover:bg-muted"
                  aria-label="Mois suivant"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openPeriodModal}
                className="shrink-0 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
              >
                Période personnalisée
              </button>
              <button
                type="button"
                onClick={() => goToMonth(new Date())}
                disabled={isCurrentMonth}
                className="shrink-0 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
              >
                Aujourd&apos;hui
              </button>
            </div>
          </div>
          <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            {(isCurrentMonth
              ? [
                  { label: "Libre", dot: "bg-amber-400" },
                  { label: "Occupé", dot: "bg-emerald-400" },
                  { label: "Réservé", dot: "bg-violet-500" },
                  { label: "Sortie proche", dot: "bg-orange-500" },
                  { label: "Impayé", dot: "bg-rose-400" }
                ]
              : [
                  { label: "Disponible", dot: "bg-amber-400" },
                  { label: "Occupé", dot: "bg-emerald-400" }
                ]
            ).map(({ label, dot }) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                {label}
              </span>
            ))}
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStatusFilter(null)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${statusFilter === null ? "bg-slate-900 text-white" : "border bg-card text-slate-700 dark:text-slate-300 hover:bg-muted"}`}
            >
              Tous
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${statusFilter === null ? "bg-white/20" : "bg-muted"}`}>
                {totalVisibleCount}
              </span>
            </button>
            {filterOptions.map((option) => {
              const active = statusFilter === option.label;
              return (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setStatusFilter(active ? null : option.label)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${active ? "bg-slate-900 text-white" : "border bg-card text-slate-700 dark:text-slate-300 hover:bg-muted"}`}
                >
                  {filterDisplayLabel(option.label)}
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? "bg-white/20" : "bg-muted"}`}>{option.count}</span>
                </button>
              );
            })}
          </div>
          {isCurrentMonth ? (
            visibleBoxes.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Aucun box ne correspond à ce filtre.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-5 xl:grid-cols-6">
                {visibleBoxes.map((box) => {
                  const signal = getBoxSignal(box, leadDays);
                  return (
                    <button
                      key={box.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(box.id);
                        setDrawerOpen(true);
                      }}
                      className={`min-h-28 rounded-md border-2 p-3 text-left transition hover:scale-[1.01] ${signal.className} ${selected?.id === box.id ? "ring-[3px] ring-slate-900 ring-offset-2" : ""}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <span className="font-semibold">{box.code}</span>
                        <StatusBadge label={signal.label} />
                      </div>
                      <p className="mt-5 text-sm font-medium">{box.activeRental?.occupantName ?? "Aucun locataire"}</p>
                      <p className="mt-2 text-xs opacity-80">
                        {signal.label === "Libre"
                          ? `À partir de ${formatCurrency(box.monthlyRateCents)}`
                          : signal.label === "Réservé"
                            ? `Payé : ${formatCurrency(box.activeRental?.invoices.reduce((sum, invoice) => sum + invoice.paidCents, 0) ?? 0)}`
                            : box.activeRental?.endDate
                              ? `Jusqu'au ${format(new Date(box.activeRental.endDate), "dd/MM/yyyy")}`
                              : "Durée indéterminée"}
                      </p>
                    </button>
                  );
                })}
              </div>
            )
          ) : visiblePeriodBoxes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Aucun box ne correspond à ce filtre.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5 xl:grid-cols-6">
              {visiblePeriodBoxes.map(({ box, occupied, untilLabel, occupantName, lastAvailable }) => (
                <button
                  key={box.id}
                  type="button"
                  onClick={() => {
                        setSelectedId(box.id);
                        setDrawerOpen(true);
                      }}
                  className={`min-h-28 rounded-md border-2 p-3 text-left transition hover:scale-[1.01] ${
                    occupied
                      ? "border-emerald-400 bg-emerald-400/15 text-emerald-700 dark:text-emerald-300"
                      : "border-amber-400 bg-amber-400/15 text-amber-700 dark:text-amber-300"
                  } ${selected?.id === box.id ? "ring-[3px] ring-slate-900 ring-offset-2" : ""}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{box.code}</span>
                    <StatusBadge label={occupied ? "Occupé" : "Disponible"} />
                  </span>
                  <p className="mt-5 text-sm font-medium">{occupied ? occupantName : "Aucun locataire"}</p>
                  <p className="mt-2 text-xs opacity-80">{occupied ? untilLabel : lastAvailable ? `Libre jusqu'au ${format(lastAvailable, "dd/MM/yyyy")}` : "Libre sans limite"}</p>
                </button>
              ))}
            </div>
          )}
        </div>
        {periodBooking ? (
          <RentBoxDialog
            open
            onClose={() => setPeriodBooking(null)}
            unitId={periodBooking.box.id}
            unitCode={periodBooking.box.code}
            monthlyRateCents={periodBooking.box.monthlyRateCents}
            occupants={occupants}
            depositEnabled={depositEnabled}
            defaultDepositCents={defaultDepositCents}
            initialStartDate={periodBooking.startDate}
            initialType={periodBooking.type}
            initialDurationDays={periodBooking.durationDays}
            maxEndDate={periodBooking.maxEndDate}
            minStartDate={periodBooking.minStartDate}
          />
        ) : null}
        {periodModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPeriodModalOpen(false)}>
            <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-lg border bg-card shadow-panel" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between border-b px-5 py-4">
                <h2 className="text-base font-semibold">Période personnalisée</h2>
                <button
                  type="button"
                  onClick={() => setPeriodModalOpen(false)}
                  className="grid h-8 w-8 place-items-center rounded-md text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                  aria-label="Fermer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <form
                noValidate
                className="space-y-4 px-5 py-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  applyPeriod();
                }}
              >
                <p className="text-sm text-muted-foreground">Choisissez le début et la fin pour voir les box libres sur cette période.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Du</Label>
                    <Input type="date" value={draftStart} onChange={(event) => setDraftStart(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Au</Label>
                    <Input type="date" value={draftEnd} min={draftStart || undefined} onChange={(event) => setDraftEnd(event.target.value)} />
                  </div>
                </div>
                {periodError ? <p className="text-sm font-medium text-destructive">{periodError}</p> : null}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setPeriodModalOpen(false)}>
                    Annuler
                  </Button>
                  <Button type="submit">Appliquer</Button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
        {drawerOpen && selected ? (
          <BoxDrawer onClose={() => setDrawerOpen(false)}>
            {!isCurrentMonth && selectedPeriodEntry && !selectedPeriodEntry.overlapping ? (
              <PeriodBoxDetails
                key={selected.id}
                entry={selectedPeriodEntry}
                period={periodRange}
                onRent={() => openPeriodBooking(selectedPeriodEntry)}
              />
            ) : (
              <BoxDetails
                key={`${selected.id}-${selectedPeriodEntry?.overlapping?.id ?? "live"}`}
                box={selected}
                rental={!isCurrentMonth ? selectedPeriodEntry?.overlapping : undefined}
                period={!isCurrentMonth ? periodRange : undefined}
                occupants={occupants}
                depositEnabled={depositEnabled}
                defaultDepositCents={defaultDepositCents}
                leadDays={leadDays}
              />
            )}
          </BoxDrawer>
        ) : null}
      </div>
    </div>
  );
}

// Box details open in a right-hand drawer so the grid can use the full width.
// Not transformed once its entrance animation ends, so the fixed dialogs
// rendered inside (rent, confirmations) still position against the viewport.
function BoxDrawer({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-card shadow-xl [animation:drawer-in_180ms_ease-out] [&>aside]:rounded-none [&>aside]:border-0 [&>aside]:shadow-none"
      >
        <div className="sticky top-0 z-10 flex justify-end bg-card px-3 pt-3">
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10" aria-label="Fermer les détails">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PeriodBoxDetails({
  entry,
  period,
  onRent
}: {
  entry: {
    box: BoxCard;
    lastAvailable: Date | null;
    freeSince: Date | null;
    nextRental?: RentalCard;
  };
  period: { start: Date; end: Date };
  onRent: () => void;
}) {
  const { box, lastAvailable, freeSince, nextRental } = entry;
  const fmt = (value: Date | string) => format(new Date(value), "dd MMM yyyy", { locale: fr });

  return (
    <aside className="rounded-lg border bg-card p-5 shadow-panel">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Box {box.code}</h2>
        <span className="rounded-full border border-amber-400 bg-amber-400/15 px-3 py-1 text-sm font-semibold text-amber-700 dark:text-amber-300">
          Disponible
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Du {fmt(period.start)} au {fmt(period.end)}
      </p>

      <>
          <div className="mt-6 space-y-3">
            <SectionHeader icon={CalendarClock} label="Disponibilité" />
            <div className="space-y-4 text-sm">
              <Row label="Libre sur toute la période" value="Oui" />
              <Row label="Dernière date de disponibilité" value={freeSince ? fmt(freeSince) : "Jamais loué avant"} />
              <Row label="Libre jusqu'au" value={lastAvailable ? fmt(lastAvailable) : "Sans limite"} />
              {nextRental ? (
                <Row label="Prochaine location" value={`${nextRental.occupantName} dès le ${fmt(nextRental.startDate)}`} />
              ) : null}
            </div>
          </div>
          <div className="mt-6 space-y-3">
            <SectionHeader icon={MapPin} label="Box" />
            <div className="space-y-4 text-sm">
              <Row label="Loyer" value={`${formatCurrency(box.monthlyRateCents)} / mois`} />
              <Row label="Surface" value={`${box.surfaceM2} m2`} />
            </div>
          </div>
          <div className="mt-6 space-y-3">
            <SectionHeader icon={Zap} label="Actions" />
            {nextRental && differenceInCalendarDays(new Date(nextRental.startDate), period.start) < MIN_RENTABLE_DAYS ? (
              <p className="text-center text-sm text-muted-foreground">
                Libre moins de {MIN_RENTABLE_DAYS} jours avant la prochaine location : location impossible.
              </p>
            ) : (
              <Button className="w-full" onClick={onRent}>
                Louer ce box pour cette période
              </Button>
            )}
          </div>
      </>
    </aside>
  );
}

function BoxDetails({
  box,
  occupants,
  depositEnabled,
  defaultDepositCents,
  leadDays,
  rental: rentalProp,
  period
}: {
  box: BoxCard;
  // The rental to manage — defaults to the box's current one. In a period
  // view it can be one that isn't running yet.
  rental?: RentalCard;
  period?: { start: Date; end: Date };
  occupants: Option[];
  depositEnabled: boolean;
  defaultDepositCents: number;
  leadDays: number;
}) {
  const rental = rentalProp ?? box.activeRental;
  const isCurrentRental = rental?.id === box.activeRental?.id;
  // A rental that hasn't started yet is simply "Réservé", whatever the box's live status says.
  const reserved = isCurrentRental ? box.status === "RESERVED" : true;
  const signal = isCurrentRental
    ? getBoxSignal(box, leadDays)
    : { label: "Réservé", className: "border-violet-500 bg-violet-500/15 text-violet-700 dark:text-violet-300" };
  const balance = rental?.invoices.reduce((sum, invoice) => sum + invoice.totalCents - invoice.paidCents, 0) ?? 0;
  const paidTotal = rental?.invoices.reduce((sum, invoice) => sum + invoice.paidCents, 0) ?? 0;
  const [extending, setExtending] = useState(false);
  const [renting, setRenting] = useState(false);
  const [confirmPaymentOpen, setConfirmPaymentOpen] = useState(false);
  const paymentFormRef = useRef<HTMLFormElement>(null);
  const paymentAmountCentsRef = useRef<HTMLInputElement>(null);
  const [paymentState, confirmPaymentFormAction, isConfirmingPayment] = useActionState(
    confirmBoxPaymentAction,
    { status: "idle" } as ConfirmBoxPaymentState
  );

  useEffect(() => {
    if (paymentState.status === "success") {
      toast.success("Paiement confirmé.");
      // Only known once the server action resolves — cannot close synchronously at click time.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConfirmPaymentOpen(false);
    }
    // On error the confirm overlay stays open and shows the message inline
    // (below) so the admin can see what went wrong and retry.
  }, [paymentState]);

  // Booking ahead on an occupied box can only start once the current rental is over.
  const freeFromCurrent = rental?.endDate ? format(addDays(new Date(rental.endDate), 1), "yyyy-MM-dd") : undefined;
  const isUnpaid = !!rental && !reserved && balance > 0;

  return (
    <aside className="rounded-lg border bg-card p-5 shadow-panel">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Box {box.code}</h2>
        <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${signal.className}`}>{signal.label}</span>
      </div>
      {period ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Location sur la période du {format(period.start, "dd MMM yyyy", { locale: fr })} au {format(period.end, "dd MMM yyyy", { locale: fr })}
        </p>
      ) : null}

      {isUnpaid ? (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-rose-300 bg-rose-50 p-3 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="text-sm font-semibold">Paiement en retard</p>
            <p className="text-sm">{formatCurrency(balance)} restant</p>
          </div>
        </div>
      ) : null}

      <div className="mt-6 space-y-3">
        <SectionHeader icon={User} label="Client" />
        <div className="space-y-4 text-sm">
          <Row label="Client" value={rental?.occupantName ?? "Aucun client"} />
          {rental ? <Row icon={Phone} label="Téléphone" value={rental.occupantPhone} /> : null}
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <SectionHeader icon={MapPin} label="Location" />
        <div className="space-y-4 text-sm">
          {rental ? (
            <RentalTypeRow rentalId={rental.id} type={rental.type} hasEndDate={!!rental.endDate} />
          ) : null}
          {rental ? (
            <StartDateRow rentalId={rental.id} startDate={rental.startDate} />
          ) : (
            <Row label="Entrée" value="-" />
          )}
          <Row label="Sortie" value={rental?.endDate ? format(new Date(rental.endDate), "dd MMM yyyy", { locale: fr }) : "Non planifiée"} />
          {rental ? (
            <RentRow
              rentalId={rental.id}
              label={rental.type === "ONE_TIME" ? "Prix" : "Loyer"}
              valueCents={rental.monthlyRateCents}
              suffix={rental.type === "ONE_TIME" ? "" : " / mois"}
            />
          ) : (
            <Row label="Loyer" value={`${formatCurrency(box.monthlyRateCents)} / mois`} />
          )}
          {rental ? (
            !reserved && balance <= 0 ? (
              <StatusRow rentalId={rental.id} label="Statut" value="Payé" />
            ) : (
              <Row label="Statut" value={reserved ? "Réservé" : "Impayé"} />
            )
          ) : null}
          {rental && paidTotal > 0 && balance > 0 ? (
            <>
              <Row label="Montant payé" value={formatCurrency(paidTotal)} />
              <Row label="Solde restant" value={formatCurrency(balance)} danger />
            </>
          ) : null}
          {period ? (
            <Row
              label="Disponible à partir du"
              value={rental?.endDate ? format(addDays(new Date(rental.endDate), 1), "dd MMM yyyy", { locale: fr }) : "Durée indéterminée"}
            />
          ) : null}
          <Row label="Surface" value={`${box.surfaceM2} m2`} />
          {isCurrentRental && box.upcomingRental ? (
            <Row
              label="Prochaine location"
              value={`${box.upcomingRental.occupantName} à partir du ${format(new Date(box.upcomingRental.startDate), "dd MMM yyyy", { locale: fr })}`}
            />
          ) : null}
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <SectionHeader icon={Zap} label="Actions" />
        <div className="grid gap-2">
        {!rental ? (
          box.upcomingRental && differenceInCalendarDays(new Date(box.upcomingRental.startDate), new Date()) < MIN_RENTABLE_DAYS ? (
            <p className="text-center text-sm text-muted-foreground">
              Libre moins de {MIN_RENTABLE_DAYS} jours avant la prochaine location : location impossible.
            </p>
          ) : (
            <Button onClick={() => setRenting(true)}>Louer ce box</Button>
          )
        ) : paymentState.status === "success" ? (
          balance <= 0 ? (
            <div className="grid gap-2">
              <Button asChild variant="outline" className="w-full">
                <a href={`/api/invoices/${paymentState.invoiceId}/pdf`} target="_blank" rel="noreferrer">
                  <Download className="h-4 w-4" />
                  Imprimer la facture
                </a>
              </Button>
              <WhatsAppInvoiceButton
                invoiceId={paymentState.invoiceId}
                phone={rental.occupantPhone}
                clientName={rental.occupantName.split(" ")[0]}
                size="default"
              />
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Paiement partiel enregistré. Solde restant : {formatCurrency(balance)}
            </p>
          )
        ) : extending ? (
          <ExtendExitForm rentalId={rental.id} currentEndDate={rental.endDate} onDone={() => setExtending(false)} />
        ) : (
          <>
            {rental.type === "ONE_TIME" ? (
              <Button variant="outline" onClick={() => setExtending(true)}>Prolonger la sortie</Button>
            ) : null}
            {balance > 0 ? (
              <form ref={paymentFormRef} action={confirmPaymentFormAction}>
                <input type="hidden" name="rentalId" value={rental.id} />
                <input type="hidden" name="amountCents" ref={paymentAmountCentsRef} defaultValue={balance} />
                <Button
                  type="button"
                  className="w-full"
                  disabled={isConfirmingPayment}
                  onClick={() => setConfirmPaymentOpen(true)}
                >
                  <Euro className="h-4 w-4" />
                  {isConfirmingPayment ? "Confirmation…" : "Confirmer le paiement"}
                </Button>
              </form>
            ) : null}
            {differenceInCalendarDays(new Date(rental.startDate), new Date()) > 0 ? (
              <CancelReservationButton rentalId={rental.id} hasPayment={paidTotal > 0} />
            ) : (
              <ReleaseBoxButton rentalId={rental.id} />
            )}
            {isCurrentRental && !box.upcomingRental ? (
              <Button variant="outline" onClick={() => setRenting(true)}>
                Réserver pour plus tard
              </Button>
            ) : null}
          </>
        )}
        </div>
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
        initialStartDate={freeFromCurrent}
        minStartDate={freeFromCurrent}
      />
      {confirmPaymentOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => (isConfirmingPayment ? null : setConfirmPaymentOpen(false))}>
          <div className="w-full max-w-sm rounded-lg border bg-card p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-base font-semibold">Confirmer le paiement de ce box</h3>
            <p className="mt-1 text-sm text-muted-foreground">Solde restant : {formatCurrency(balance)}</p>
            <div className="mt-4 space-y-2">
              <Label>Montant encaissé (€)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={(balance / 100).toFixed(2)}
                defaultValue={(balance / 100).toFixed(2)}
                onChange={(event) => {
                  if (paymentAmountCentsRef.current) {
                    paymentAmountCentsRef.current.value = String(Math.round(Number(event.target.value || "0") * 100));
                  }
                }}
              />
            </div>
            {paymentState.status === "error" ? (
              <p className="mt-3 text-sm font-medium text-destructive">{paymentState.message}</p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" disabled={isConfirmingPayment} onClick={() => setConfirmPaymentOpen(false)}>
                Annuler
              </Button>
              <Button disabled={isConfirmingPayment} onClick={() => paymentFormRef.current?.requestSubmit()}>
                {isConfirmingPayment ? "Confirmation…" : "Confirmer"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function ExtendExitForm({ rentalId, currentEndDate, onDone }: { rentalId: string; currentEndDate: string | null; onDone: () => void }) {
  const [state, formAction, isPending] = useActionState(extendRentalAction, { status: "idle" } as ExtendRentalState);

  useEffect(() => {
    if (state.status === "success") {
      toast.success("Date de sortie mise à jour.");
      onDone();
    }
  }, [state, onDone]);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="rentalId" value={rentalId} />
      <Label>Nouvelle date de sortie</Label>
      <Input type="date" name="endDate" defaultValue={currentEndDate ? currentEndDate.slice(0, 10) : ""} />
      {state.status === "error" ? <p className="text-sm font-medium text-destructive">{state.message}</p> : null}
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
      // Only known once the server action resolves — cannot close synchronously at click time.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConfirmOpen(false);
    }
    // On error the dialog stays open with the message shown inline below.
  }, [state]);

  return (
    <>
      <form ref={formRef} action={formAction}>
        <input type="hidden" name="rentalId" value={rentalId} />
        <Button
          type="button"
          variant="outline"
          className="w-full text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
          disabled={isPending}
          onClick={() => setConfirmOpen(true)}
        >
          {isPending ? "Libération…" : "Libérer le box"}
        </Button>
      </form>
      <ConfirmDialog
        open={confirmOpen}
        title="Libérer ce box ?"
        description="La location sera clôturée et le box redeviendra disponible. Pour changer la date d'entrée ou le type de location, utilisez le stylo : ne libérez pas le box."
        confirmLabel="Libérer"
        pending={isPending}
        errorMessage={state.status === "error" ? state.message : undefined}
        onConfirm={() => formRef.current?.requestSubmit()}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

function CancelReservationButton({ rentalId, hasPayment }: { rentalId: string; hasPayment: boolean }) {
  const [state, formAction, isPending] = useActionState(cancelReservationAction, { status: "idle" } as CancelReservationState);
  const formRef = useRef<HTMLFormElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (state.status === "success") {
      toast.success("Réservation annulée.");
      // Only known once the server action resolves — cannot close synchronously at click time.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConfirmOpen(false);
    }
    // On error the dialog stays open with the message shown inline below.
  }, [state]);

  return (
    <>
      <form ref={formRef} action={formAction}>
        <input type="hidden" name="rentalId" value={rentalId} />
        <Button
          type="button"
          variant="outline"
          className="w-full text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
          disabled={isPending}
          onClick={() => setConfirmOpen(true)}
        >
          {isPending ? "Annulation…" : "Annuler la réservation"}
        </Button>
      </form>
      <ConfirmDialog
        open={confirmOpen}
        title="Annuler cette réservation ?"
        description={
          hasPayment
            ? "La réservation sera annulée. Un paiement a déjà été enregistré : la facture payée est conservée, pensez à rembourser le client si nécessaire."
            : "La réservation sera annulée et les factures non payées seront annulées."
        }
        confirmLabel="Annuler la réservation"
        pending={isPending}
        errorMessage={state.status === "error" ? state.message : undefined}
        onConfirm={() => formRef.current?.requestSubmit()}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

const METRIC_TONE_STYLES = {
  success: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
  info: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400",
  danger: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400",
  warning: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
} as const;

function Metric({
  icon: Icon,
  label,
  value,
  tone
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: keyof typeof METRIC_TONE_STYLES;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-panel">
      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ${METRIC_TONE_STYLES[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xl font-bold leading-tight">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, value, danger }: { icon?: LucideIcon; label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-2">
      <span className={`flex items-center gap-1.5 ${danger ? "text-red-600" : "text-muted-foreground"}`}>
        {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" /> : null}
        {label}
      </span>
      <span className={`text-right font-medium ${danger ? "text-red-600" : ""}`}>{value}</span>
    </div>
  );
}

function SectionHeader({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className="h-4 w-4" />
      {label}
    </div>
  );
}

function StatusRow({ rentalId, label, value }: { rentalId: string; label: string; value: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(markRentalUnpaidAction, { status: "idle" } as MarkRentalUnpaidState);

  useEffect(() => {
    if (state.status === "success") {
      toast.success("Statut mis à jour.");
      // Only known once the server action resolves — cannot close synchronously at click time.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConfirmOpen(false);
    }
    // On error the dialog stays open with the message shown inline below.
  }, [state]);

  return (
    <div className="flex justify-between gap-4 border-b pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 text-right font-medium">
        {value}
        <form ref={formRef} action={formAction}>
          <input type="hidden" name="rentalId" value={rentalId} />
          <button
            type="button"
            disabled={isPending}
            onClick={() => setConfirmOpen(true)}
            className="text-xs font-normal text-muted-foreground underline hover:text-foreground"
          >
            Marquer comme impayé
          </button>
        </form>
      </span>
      <ConfirmDialog
        open={confirmOpen}
        title="Marquer ce box comme impayé ?"
        description="Le paiement enregistré sur ce box sera annulé."
        confirmLabel="Marquer comme impayé"
        pending={isPending}
        errorMessage={state.status === "error" ? state.message : undefined}
        onConfirm={() => formRef.current?.requestSubmit()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function StartDateRow({ rentalId, startDate }: { rentalId: string; startDate: string }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, isPending] = useActionState(updateRentalStartDateAction, { status: "idle" } as UpdateRentalStartDateState);

  useEffect(() => {
    if (state.status === "success") {
      toast.success("Date d'entrée mise à jour.");
      // Only known once the server action resolves — cannot close synchronously at click time.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditing(false);
    }
    // On error stay in edit mode and show the message inline below.
  }, [state]);

  if (editing) {
    return (
      <div className="space-y-1.5 border-b pb-2">
        <form action={formAction} className="flex items-center justify-between gap-2">
          <input type="hidden" name="rentalId" value={rentalId} />
          <span className="text-muted-foreground">Entrée</span>
          <div className="flex items-center gap-1">
            <Input type="date" name="startDate" required defaultValue={startDate.slice(0, 10)} className="h-8 w-40" autoFocus />
            <button type="submit" disabled={isPending} className="grid h-7 w-7 shrink-0 place-items-center rounded hover:bg-muted" aria-label="Enregistrer">
              <Check className="h-3.5 w-3.5 text-emerald-600" />
            </button>
            <button type="button" onClick={() => setEditing(false)} className="grid h-7 w-7 shrink-0 place-items-center rounded hover:bg-muted" aria-label="Annuler">
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        </form>
        {state.status === "error" ? <p className="text-right text-xs font-medium text-destructive">{state.message}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex justify-between gap-4 border-b pb-2">
      <span className="text-muted-foreground">Entrée</span>
      <span className="flex items-center gap-1.5 text-right font-medium">
        {format(new Date(startDate), "dd MMM yyyy", { locale: fr })}
        <button type="button" onClick={() => setEditing(true)} className="text-muted-foreground hover:text-foreground" aria-label="Modifier la date d'entrée">
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  );
}

function RentalTypeRow({ rentalId, type, hasEndDate }: { rentalId: string; type: string; hasEndDate: boolean }) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState(type);
  const [state, formAction, isPending] = useActionState(updateRentalTypeAction, { status: "idle" } as UpdateRentalTypeState);

  useEffect(() => {
    if (state.status === "success") {
      toast.success("Type de location mis à jour.");
      // Only known once the server action resolves — cannot close synchronously at click time.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditing(false);
    }
    // On error stay in edit mode and show the message inline below.
  }, [state]);

  if (editing) {
    return (
      <div className="space-y-1.5 border-b pb-2">
        <form action={formAction} className="space-y-2">
          <input type="hidden" name="rentalId" value={rentalId} />
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Type</span>
            <div className="flex items-center gap-1">
              <select
                name="type"
                value={selected}
                onChange={(event) => setSelected(event.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-sm"
                autoFocus
              >
                <option value="MONTHLY">Mensuel</option>
                <option value="ONE_TIME">Ponctuel</option>
              </select>
              <button type="submit" disabled={isPending} className="grid h-7 w-7 shrink-0 place-items-center rounded hover:bg-muted" aria-label="Enregistrer">
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              </button>
              <button type="button" onClick={() => setEditing(false)} className="grid h-7 w-7 shrink-0 place-items-center rounded hover:bg-muted" aria-label="Annuler">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>
          {selected === "ONE_TIME" && !hasEndDate ? (
            <div className="flex items-center justify-between gap-2">
              <Label className="text-muted-foreground">Date de sortie</Label>
              <Input type="date" name="endDate" required className="h-8 w-40" />
            </div>
          ) : null}
        </form>
        {state.status === "error" ? <p className="text-right text-xs font-medium text-destructive">{state.message}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex justify-between gap-4 border-b pb-2">
      <span className="text-muted-foreground">Type</span>
      <span className="flex items-center gap-1.5 text-right font-medium">
        {type === "ONE_TIME" ? "Ponctuel" : "Mensuel"}
        <button type="button" onClick={() => { setSelected(type); setEditing(true); }} className="text-muted-foreground hover:text-foreground" aria-label="Modifier le type de location">
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  );
}

function RentRow({ rentalId, label, valueCents, suffix }: { rentalId: string; label: string; valueCents: number; suffix: string }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, isPending] = useActionState(updateRentalRateAction, { status: "idle" } as UpdateRentalRateState);
  const formRef = useRef<HTMLFormElement>(null);
  const amountCentsRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      toast.success("Prix mis à jour.");
      // Only known once the server action resolves — cannot close synchronously at click time.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditing(false);
    }
    // On error stay in edit mode and show the message inline below.
  }, [state]);

  if (editing) {
    return (
      <div className="space-y-1.5 border-b pb-2">
        <form ref={formRef} action={formAction} className="flex items-center justify-between gap-2">
          <input type="hidden" name="rentalId" value={rentalId} />
          <span className="text-muted-foreground">{label}</span>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              step="0.01"
              min="0.01"
              defaultValue={(valueCents / 100).toFixed(2)}
              className="h-8 w-24 text-right"
              autoFocus
              onChange={(event) => {
                if (amountCentsRef.current) {
                  amountCentsRef.current.value = String(Math.round(Number(event.target.value || "0") * 100));
                }
              }}
            />
            <input type="hidden" name="monthlyRateCents" ref={amountCentsRef} defaultValue={valueCents} />
            <button type="submit" disabled={isPending} className="grid h-7 w-7 shrink-0 place-items-center rounded hover:bg-muted" aria-label="Enregistrer">
              <Check className="h-3.5 w-3.5 text-emerald-600" />
            </button>
            <button type="button" onClick={() => setEditing(false)} className="grid h-7 w-7 shrink-0 place-items-center rounded hover:bg-muted" aria-label="Annuler">
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        </form>
        {state.status === "error" ? <p className="text-right text-xs font-medium text-destructive">{state.message}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex justify-between gap-4 border-b pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5 text-right font-medium">
        {formatCurrency(valueCents)}
        {suffix}
        <button type="button" onClick={() => setEditing(true)} className="text-muted-foreground hover:text-foreground" aria-label="Modifier le prix">
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  );
}

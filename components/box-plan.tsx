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
import { addMonths, endOfMonth, format, isSameMonth, parseISO, startOfMonth, subMonths } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { RentBoxDialog } from "@/components/box/rent-box-dialog";
import { WhatsAppInvoiceButton } from "@/components/invoices/whatsapp-invoice-button";
import {
  extendRentalAction,
  releaseRentalAction,
  confirmBoxPaymentAction,
  updateRentalRateAction,
  markRentalUnpaidAction,
  type ExtendRentalState,
  type ReleaseRentalState,
  type ConfirmBoxPaymentState,
  type UpdateRentalRateState,
  type MarkRentalUnpaidState
} from "@/server/actions/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Option = { id: string; label: string; phone?: string };

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
  upcomingRental?: { occupantName: string; startDate: string };
};

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
  const selected = useMemo(() => boxes.find((box) => box.id === selectedId) ?? boxes[0], [boxes, selectedId]);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [monthCursor, setMonthCursor] = useState(() => new Date());
  const [dateMode, setDateMode] = useState<"month" | "range">("month");
  const [rangeStart, setRangeStart] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [rangeEnd, setRangeEnd] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const isCurrentMonth = dateMode === "month" && isSameMonth(monthCursor, new Date());

  function goToMonth(next: Date) {
    setStatusFilter(null);
    setDateMode("month");
    setMonthCursor(next);
  }

  // Away from the current month (or in a custom period), "occupied" is
  // derived from each box's active rental dates instead of its live status —
  // a rental with no end date (the common monthly case) is treated as
  // occupying every period until it's actually ended.
  const periodBoxes = useMemo(() => {
    const periodStart = dateMode === "month" ? startOfMonth(monthCursor) : parseISO(rangeStart);
    const periodEnd = dateMode === "month" ? endOfMonth(monthCursor) : parseISO(rangeEnd);
    return boxes.map((box) => {
      const rental = box.activeRental;
      const occupied = !!rental && new Date(rental.startDate) <= periodEnd && (!rental.endDate || new Date(rental.endDate) >= periodStart);
      const untilLabel = occupied ? (rental?.endDate ? `Jusqu'au ${format(new Date(rental.endDate), "dd/MM/yyyy")}` : "Durée indéterminée") : "";
      return { box, occupied, untilLabel };
    });
  }, [boxes, dateMode, monthCursor, rangeStart, rangeEnd]);

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
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="rounded-lg border bg-card p-4 shadow-panel">
          <h2 className="mb-3 text-base font-semibold">Plan des box</h2>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            {dateMode === "month" ? (
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
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs">Du</Label>
                <input
                  type="date"
                  value={rangeStart}
                  onChange={(event) => {
                    setStatusFilter(null);
                    setRangeStart(event.target.value);
                  }}
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                />
                <Label className="text-xs">Au</Label>
                <input
                  type="date"
                  value={rangeEnd}
                  min={rangeStart}
                  onChange={(event) => {
                    setStatusFilter(null);
                    setRangeEnd(event.target.value);
                  }}
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setStatusFilter(null);
                  setDateMode(dateMode === "month" ? "range" : "month");
                }}
                className={`shrink-0 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted ${dateMode === "range" ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}`}
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
              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                {visibleBoxes.map((box) => {
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
                      <p className="mt-2 text-xs opacity-80">
                        {signal.label === "Libre"
                          ? `À partir de ${formatCurrency(box.monthlyRateCents)}`
                          : signal.label === "Réservé"
                            ? `Payé : ${formatCurrency(box.activeRental?.invoices.reduce((sum, invoice) => sum + invoice.paidCents, 0) ?? 0)}`
                            : signal.label}
                      </p>
                    </button>
                  );
                })}
              </div>
            )
          ) : visiblePeriodBoxes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Aucun box ne correspond à ce filtre.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              {visiblePeriodBoxes.map(({ box, occupied, untilLabel }) => (
                <button
                  key={box.id}
                  type="button"
                  onClick={() => setSelectedId(box.id)}
                  className={`min-h-28 rounded-md border-2 p-3 text-left transition hover:scale-[1.01] ${
                    occupied
                      ? "border-emerald-400 bg-emerald-400/15 text-emerald-700 dark:text-emerald-300"
                      : "border-amber-400 bg-amber-400/15 text-amber-700 dark:text-amber-300"
                  } ${selected?.id === box.id ? "ring-[3px] ring-slate-900 ring-offset-2" : ""}`}
                >
                  <span className="font-semibold">{box.code}</span>
                  <p className="mt-5 text-sm font-medium">{occupied ? box.activeRental?.occupantName : "Disponible"}</p>
                  <p className="mt-2 text-xs opacity-80">{occupied ? untilLabel : `À partir de ${formatCurrency(box.monthlyRateCents)}`}</p>
                </button>
              ))}
            </div>
          )}
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
  const paidTotal = box.activeRental?.invoices.reduce((sum, invoice) => sum + invoice.paidCents, 0) ?? 0;
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

  const isUnpaid = !!box.activeRental && box.status !== "RESERVED" && balance > 0;

  return (
    <aside className="rounded-lg border bg-card p-5 shadow-panel">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Box {box.code}</h2>
        <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${signal.className}`}>{signal.label}</span>
      </div>

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
          <Row label="Client" value={box.activeRental?.occupantName ?? "Aucun client"} />
          {box.activeRental ? <Row icon={Phone} label="Téléphone" value={box.activeRental.occupantPhone} /> : null}
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <SectionHeader icon={MapPin} label="Location" />
        <div className="space-y-4 text-sm">
          {box.activeRental ? <Row label="Type" value={box.activeRental.type === "ONE_TIME" ? "Ponctuel" : "Mensuel"} /> : null}
          <Row label="Entrée" value={box.activeRental ? format(new Date(box.activeRental.startDate), "dd MMM yyyy", { locale: fr }) : "-"} />
          <Row label="Sortie" value={box.activeRental?.endDate ? format(new Date(box.activeRental.endDate), "dd MMM yyyy", { locale: fr }) : "Non planifiée"} />
          {box.activeRental ? (
            <RentRow
              rentalId={box.activeRental.id}
              label={box.activeRental.type === "ONE_TIME" ? "Prix" : "Loyer"}
              valueCents={box.activeRental.monthlyRateCents}
              suffix={box.activeRental.type === "ONE_TIME" ? "" : " / mois"}
            />
          ) : (
            <Row label="Loyer" value={`${formatCurrency(box.monthlyRateCents)} / mois`} />
          )}
          {box.activeRental ? (
            box.status !== "RESERVED" && balance <= 0 ? (
              <StatusRow rentalId={box.activeRental.id} label="Statut" value="Payé" />
            ) : (
              <Row label="Statut" value={box.status === "RESERVED" ? "Réservé" : "Impayé"} />
            )
          ) : null}
          {box.activeRental && paidTotal > 0 && balance > 0 ? (
            <>
              <Row label="Montant payé" value={formatCurrency(paidTotal)} />
              <Row label="Solde restant" value={formatCurrency(balance)} danger />
            </>
          ) : null}
          <Row label="Surface" value={`${box.surfaceM2} m2`} />
          {box.upcomingRental ? (
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
        {!box.activeRental ? (
          <Button onClick={() => setRenting(true)}>Louer ce box</Button>
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
                phone={box.activeRental.occupantPhone}
                clientName={box.activeRental.occupantName.split(" ")[0]}
                size="default"
              />
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Paiement partiel enregistré. Solde restant : {formatCurrency(balance)}
            </p>
          )
        ) : extending ? (
          <ExtendExitForm rentalId={box.activeRental.id} currentEndDate={box.activeRental.endDate} onDone={() => setExtending(false)} />
        ) : (
          <>
            {box.activeRental.type === "ONE_TIME" ? (
              <Button variant="outline" onClick={() => setExtending(true)}>Prolonger la sortie</Button>
            ) : null}
            {balance > 0 ? (
              <form ref={paymentFormRef} action={confirmPaymentFormAction}>
                <input type="hidden" name="rentalId" value={box.activeRental.id} />
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
            <ReleaseBoxButton rentalId={box.activeRental.id} />
            {!box.upcomingRental ? (
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
        description="La location sera clôturée et le box redeviendra disponible."
        confirmLabel="Libérer"
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

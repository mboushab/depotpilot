"use client";

import { useEffect, useMemo, useRef, useState, useActionState } from "react";
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks
} from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { labelStatus } from "@/lib/status-labels";
import { isValidFrenchPhone } from "@/lib/validations";
import {
  deleteLoadingAppointmentAction,
  updateLoadingAppointmentAction,
  type DeleteLoadingState,
  type UpdateLoadingState
} from "@/server/actions/forms";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DateTimePicker } from "@/components/ui/datetime-picker";

export type CalendarAppointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  clientName: string;
  clientPhone: string | null;
};

type View = "week" | "month";

const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 19;
const HOUR_HEIGHT = 56;
const MONTH_MAX_VISIBLE = 3;

const STATUS_LEGEND = ["SCHEDULED", "IN_PROGRESS", "COMPLETED"];

const STATUS_STYLES: Record<string, { block: string; dot: string }> = {
  SCHEDULED: { block: "border-l-4 border-violet-500 bg-violet-50 text-violet-800", dot: "bg-violet-500" },
  IN_PROGRESS: { block: "border-l-4 border-cyan-500 bg-cyan-50 text-cyan-800", dot: "bg-cyan-500" },
  COMPLETED: { block: "border-l-4 border-emerald-500 bg-emerald-50 text-emerald-800", dot: "bg-emerald-500" }
};

// Nothing ever updates the persisted `status` column (there's no cron job
// and no manual action for it), so it stays SCHEDULED forever in the DB.
// Derive the displayed status from the current time instead — that's what
// actually determines whether a slot is upcoming, ongoing, or done.
function deriveDisplayStatus(start: Date, end: Date, now = new Date()) {
  if (now < start) return "SCHEDULED";
  if (now > end) return "COMPLETED";
  return "IN_PROGRESS";
}

function layoutDay<T extends { start: Date; end: Date }>(items: T[]) {
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime());
  const laneEnds: number[] = [];
  const placed = sorted.map((item) => {
    let lane = laneEnds.findIndex((end) => end <= item.start.getTime());
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = item.end.getTime();
    return { ...item, lane };
  });
  const laneCount = laneEnds.length || 1;
  return placed.map((item) => ({ ...item, laneCount }));
}

type TooltipAnchor = { id: string; top: number; left: number };
const TOOLTIP_MAX_HEIGHT = 280;

function deriveDuration(start: Date, end: Date) {
  const hours = Math.round((end.getTime() - start.getTime()) / 3600000);
  if (hours > 0 && hours % 24 === 0 && hours / 24 <= 10) {
    return { value: hours / 24, unit: "DAYS" as const };
  }
  return { value: Math.min(Math.max(hours, 1), 10), unit: "HOURS" as const };
}

export function LoadingCalendar({ appointments }: { appointments: CalendarAppointment[] }) {
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState(() => new Date());
  const [tooltip, setTooltip] = useState<TooltipAnchor | null>(null);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const toolbarRef = useRef<HTMLDivElement>(null);

  const parsed = useMemo(
    () => appointments.map((appointment) => ({ ...appointment, start: parseISO(appointment.startsAt), end: parseISO(appointment.endsAt) })),
    [appointments]
  );
  const selected = parsed.find((appointment) => appointment.id === tooltip?.id) ?? null;

  function closeTooltip() {
    setTooltip(null);
    setMode("view");
  }

  function handleSelect(event: React.MouseEvent<HTMLButtonElement>, id: string) {
    const rect = event.currentTarget.getBoundingClientRect();
    // Clamp to the viewport: a block taller than the viewport (e.g. a multi-hour
    // "Jours" booking) can have its top/bottom edges off-screen even while partly visible.
    const visibleTop = Math.max(rect.top, 0);
    const visibleBottom = Math.min(rect.bottom, window.innerHeight);
    const spaceBelow = window.innerHeight - visibleBottom;
    const preferredTop = spaceBelow < TOOLTIP_MAX_HEIGHT + 20 ? visibleTop - 8 - TOOLTIP_MAX_HEIGHT : visibleBottom + 8;
    // Never overlap the toolbar (Précédent/Suivant/Aujourd'hui/Semaine/Mois): a tooltip placed
    // "above" a block near the top of the grid could otherwise land on top of those controls
    // and silently swallow clicks meant for them.
    const minTop = (toolbarRef.current?.getBoundingClientRect().bottom ?? 0) + 8;
    const top = Math.min(Math.max(preferredTop, minTop, 8), window.innerHeight - TOOLTIP_MAX_HEIGHT - 8);
    setMode("view");
    setTooltip({
      id,
      top,
      left: Math.min(Math.max(rect.left, 8), window.innerWidth - 320)
    });
  }

  const weekDays = useMemo(() => eachDayOfInterval({ start: startOfWeek(cursor, { weekStartsOn: 1 }), end: endOfWeek(cursor, { weekStartsOn: 1 }) }), [cursor]);
  const monthDays = useMemo(() => {
    const monthStart = startOfMonth(cursor);
    const monthEnd = endOfMonth(cursor);
    return eachDayOfInterval({ start: startOfWeek(monthStart, { weekStartsOn: 1 }), end: endOfWeek(monthEnd, { weekStartsOn: 1 }) });
  }, [cursor]);

  const weekAppointments = useMemo(() => parsed.filter((appointment) => weekDays.some((day) => isSameDay(appointment.start, day))), [parsed, weekDays]);

  const { startHour, endHour } = useMemo(() => {
    let start = DEFAULT_START_HOUR;
    let end = DEFAULT_END_HOUR;
    weekAppointments.forEach((appointment) => {
      start = Math.min(start, appointment.start.getHours());
      const endsAtHour = appointment.end.getMinutes() > 0 ? appointment.end.getHours() + 1 : appointment.end.getHours();
      end = Math.max(end, endsAtHour);
    });
    return { startHour: start, endHour: end };
  }, [weekAppointments]);

  const hours = Array.from({ length: endHour - startHour }, (_, index) => startHour + index);

  const canGoPrev =
    view === "week"
      ? startOfWeek(cursor, { weekStartsOn: 1 }).getTime() > startOfWeek(new Date(), { weekStartsOn: 1 }).getTime()
      : startOfMonth(cursor).getTime() > startOfMonth(new Date()).getTime();

  function goPrev() {
    if (!canGoPrev) return;
    setCursor((current) => (view === "week" ? subWeeks(current, 1) : subMonths(current, 1)));
  }
  function goNext() {
    setCursor((current) => (view === "week" ? addWeeks(current, 1) : addMonths(current, 1)));
  }
  function goToday() {
    setCursor(new Date());
  }
  function openWeekOf(day: Date) {
    setCursor(day);
    setView("week");
  }

  const rangeLabel = useMemo(() => {
    if (view === "month") return format(cursor, "MMMM yyyy", { locale: fr });
    const start = startOfWeek(cursor, { weekStartsOn: 1 });
    const end = endOfWeek(cursor, { weekStartsOn: 1 });
    return `Semaine du ${format(start, "d")} au ${format(end, "d MMMM yyyy", { locale: fr })}`;
  }, [view, cursor]);

  return (
    <div className="space-y-4">
      <div ref={toolbarRef} className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            disabled={!canGoPrev}
            className="grid h-8 w-8 place-items-center rounded-md border hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
            aria-label="Précédent"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-48 text-sm font-semibold capitalize">{rangeLabel}</span>
          <button type="button" onClick={goNext} className="grid h-8 w-8 place-items-center rounded-md border hover:bg-muted" aria-label="Suivant">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {STATUS_LEGEND.map((status) => (
              <span key={status} className="flex items-center gap-1.5">
                <span className={cn("h-2.5 w-2.5 rounded-full", STATUS_STYLES[status].dot)} />
                {labelStatus(status)}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={goToday} className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted">
              Aujourd&apos;hui
            </button>
            <div className="flex rounded-md border p-0.5">
              {(["week", "month"] as View[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setView(option)}
                  className={cn(
                    "rounded px-3 py-1.5 text-sm font-medium transition",
                    view === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {option === "week" ? "Semaine" : "Mois"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {view === "week" ? (
        <div className="flex overflow-hidden rounded-lg border bg-white">
          <div className="w-14 shrink-0 border-r">
            <div className="border-b" style={{ height: 40 }} />
            {hours.map((hour) => (
              <div key={hour} style={{ height: HOUR_HEIGHT }} className="border-b px-1.5 pt-0.5 text-right text-[11px] text-muted-foreground">
                {String(hour).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          <div className="flex flex-1">
            {weekDays.map((day) => {
              const dayAppointments = layoutDay(weekAppointments.filter((appointment) => isSameDay(appointment.start, day)));
              return (
                <div key={day.toISOString()} className="flex-1 border-r last:border-r-0">
                  <div className={cn("flex items-center justify-center border-b px-1 text-xs font-semibold capitalize", isToday(day) ? "bg-primary/10 text-primary" : "")} style={{ height: 40 }}>
                    {format(day, "EEE d", { locale: fr })}
                  </div>
                  <div className="relative" style={{ height: hours.length * HOUR_HEIGHT }}>
                    {hours.map((hour, index) => (
                      <div key={hour} className="absolute inset-x-0 border-b border-dashed border-border/70" style={{ top: index * HOUR_HEIGHT }} />
                    ))}
                    {dayAppointments.map((appointment) => {
                      const startMinutes = (appointment.start.getHours() - startHour) * 60 + appointment.start.getMinutes();
                      const dayBottomMinutes = hours.length * 60;
                      const rawEndMinutes = isSameDay(appointment.start, appointment.end)
                        ? (appointment.end.getHours() - startHour) * 60 + appointment.end.getMinutes()
                        : dayBottomMinutes;
                      const endMinutes = Math.min(rawEndMinutes, dayBottomMinutes);
                      const durationMinutes = Math.max(endMinutes - startMinutes, 20);
                      const style = STATUS_STYLES[deriveDisplayStatus(appointment.start, appointment.end)];
                      const widthPercent = 100 / appointment.laneCount;
                      return (
                        <button
                          key={appointment.id}
                          type="button"
                          onClick={(event) => handleSelect(event, appointment.id)}
                          className={cn("absolute overflow-hidden rounded-md px-2 py-1 text-left text-[11px] leading-tight shadow-sm transition hover:brightness-95", style.block)}
                          style={{
                            top: (startMinutes / 60) * HOUR_HEIGHT,
                            height: (durationMinutes / 60) * HOUR_HEIGHT,
                            left: `calc(${appointment.lane * widthPercent}% + 2px)`,
                            width: `calc(${widthPercent}% - 4px)`
                          }}
                        >
                          <span className="block truncate font-semibold">{appointment.clientName}</span>
                          <span className="block truncate opacity-90">
                            {format(appointment.start, "HH:mm")}–{format(appointment.end, "HH:mm")}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1.5">
          {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((label) => (
            <div key={label} className="px-1 text-center text-[11px] font-semibold text-muted-foreground">
              {label}
            </div>
          ))}
          {monthDays.map((day) => {
            const dayAppointments = parsed
              .filter((appointment) => isSameDay(appointment.start, day))
              .sort((a, b) => a.start.getTime() - b.start.getTime());
            const visible = dayAppointments.slice(0, MONTH_MAX_VISIBLE);
            const overflow = dayAppointments.length - visible.length;
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "min-h-[6rem] rounded-md border bg-white p-1.5",
                  !isSameMonth(day, cursor) ? "bg-muted/30 text-muted-foreground/60" : "",
                  isToday(day) ? "border-primary/60 ring-1 ring-primary/30" : ""
                )}
              >
                <button type="button" onClick={() => openWeekOf(day)} className={cn("mb-1 text-xs font-semibold hover:underline", isToday(day) ? "text-primary" : "")}>
                  {format(day, "d")}
                </button>
                <div className="space-y-1">
                  {visible.map((appointment) => {
                    const style = STATUS_STYLES[deriveDisplayStatus(appointment.start, appointment.end)];
                    return (
                      <button
                        key={appointment.id}
                        type="button"
                        onClick={(event) => handleSelect(event, appointment.id)}
                        className={cn("w-full truncate rounded px-1 py-0.5 text-left text-[10px] transition hover:brightness-95", style.block)}
                      >
                        {format(appointment.start, "HH:mm")} {appointment.clientName}
                      </button>
                    );
                  })}
                  {overflow > 0 ? (
                    <button type="button" onClick={() => openWeekOf(day)} className="text-[10px] font-medium text-muted-foreground hover:underline">
                      +{overflow} de plus
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && tooltip ? (
        <>
          <div className="fixed inset-0 z-40" onClick={closeTooltip} />
          <div
            className="fixed z-50 w-80 space-y-2 overflow-y-auto rounded-lg border bg-white p-4 text-sm shadow-lg"
            style={{ top: tooltip.top, left: tooltip.left, maxHeight: TOOLTIP_MAX_HEIGHT }}
          >
            {mode === "edit" ? (
              <EditAppointmentForm appointment={selected} onSuccess={closeTooltip} onCancel={() => setMode("view")} />
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">{selected.clientName}</p>
                  <button type="button" onClick={closeTooltip} className="grid h-6 w-6 shrink-0 place-items-center rounded-md hover:bg-muted" aria-label="Fermer">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-muted-foreground">
                  {format(selected.start, "EEEE d MMMM yyyy", { locale: fr })} de {format(selected.start, "HH:mm")} à {format(selected.end, "HH:mm")}
                </p>
                <p className="text-muted-foreground">Téléphone : {selected.clientPhone ?? "-"}</p>
                <p className="text-muted-foreground">Statut : {labelStatus(deriveDisplayStatus(selected.start, selected.end))}</p>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setMode("edit")}>
                    Modifier
                  </Button>
                  <DeleteAppointmentButton id={selected.id} onSuccess={closeTooltip} />
                </div>
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

type ParsedAppointment = CalendarAppointment & { start: Date; end: Date };

function EditAppointmentForm({ appointment, onSuccess, onCancel }: { appointment: ParsedAppointment; onSuccess: () => void; onCancel: () => void }) {
  const [state, formAction, isPending] = useActionState(updateLoadingAppointmentAction, { status: "idle" } as UpdateLoadingState);
  const startValue = format(appointment.start, "yyyy-MM-dd'T'HH:mm");
  const duration = deriveDuration(appointment.start, appointment.end);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === "success") {
      toast.success("Chargement modifié.");
      onSuccess();
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state, onSuccess]);

  return (
    <form
      action={formAction}
      className="space-y-2"
      onSubmit={(event) => {
        const data = new FormData(event.currentTarget);
        const phone = String(data.get("clientPhone") ?? "");
        if (phone !== "" && !isValidFrenchPhone(phone)) {
          event.preventDefault();
          setPhoneError("Numéro de téléphone français invalide");
        } else {
          setPhoneError(null);
        }
      }}
    >
      <input type="hidden" name="id" value={appointment.id} />
      <Input name="clientName" defaultValue={appointment.clientName} placeholder="Nom et prénom" required />
      <div className="space-y-1">
        <Input
          name="clientPhone"
          defaultValue={appointment.clientPhone ?? ""}
          placeholder="06 12 34 56 78 (optionnel)"
          onChange={() => setPhoneError(null)}
        />
        {phoneError ? <p className="text-xs text-red-600">{phoneError}</p> : null}
      </div>
      <DateTimePicker name="startsAt" defaultValue={startValue} />
      <div className="flex gap-2">
        <select className="h-10 flex-1 rounded-md border bg-white px-2 text-sm" name="durationValue" defaultValue={duration.value}>
          {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
        <select className="h-10 flex-1 rounded-md border bg-white px-2 text-sm" name="durationUnit" defaultValue={duration.unit}>
          <option value="HOURS">Heures</option>
          <option value="DAYS">Jours</option>
        </select>
      </div>
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" size="sm" className="flex-1" disabled={isPending}>
          {isPending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}

function DeleteAppointmentButton({ id, onSuccess }: { id: string; onSuccess: () => void }) {
  const [state, formAction, isPending] = useActionState(deleteLoadingAppointmentAction, { status: "idle" } as DeleteLoadingState);
  const formRef = useRef<HTMLFormElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (state.status === "success") {
      toast.success("Chargement supprimé.");
      onSuccess();
    } else if (state.status === "error") {
      toast.error(state.message);
    }
  }, [state, onSuccess]);

  return (
    <>
      <form ref={formRef} action={formAction} className="flex-1">
        <input type="hidden" name="id" value={id} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full text-red-700 hover:bg-red-50"
          disabled={isPending}
          onClick={() => setConfirmOpen(true)}
        >
          {isPending ? "Suppression…" : "Supprimer"}
        </Button>
      </form>
      <ConfirmDialog
        open={confirmOpen}
        title="Supprimer ce chargement ?"
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

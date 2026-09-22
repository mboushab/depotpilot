"use client";

import { useRef, useState } from "react";
import { format, isToday } from "date-fns";
import { fr } from "date-fns/locale";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deriveLoadingDisplayStatus } from "@/lib/loading-status";
import { labelStatus } from "@/lib/status-labels";

export type ScreenAppointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  clientName: string;
};

export type ScreenDay = {
  date: string;
  appointments: ScreenAppointment[];
};

// Bright, high-contrast badges on a dark background — readable even once
// downsized into a still image.
const STATUS_STYLES: Record<string, string> = {
  SCHEDULED: "bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30",
  IN_PROGRESS: "bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/30",
  COMPLETED: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
};

export function WeeklyScheduleDownload({ weekStart, weekEnd, days }: { weekStart: string; weekEnd: string; days: ScreenDay[] }) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const now = new Date();

  async function download() {
    setBusy(true);
    try {
      const target = boardRef.current;
      if (!target) throw new Error("target not found");

      // Loaded on demand: only needed when this is clicked. The board is
      // rendered off-screen (not display:none, html2canvas needs real
      // layout) purely to be captured — no dedicated route to visit first.
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(target, { backgroundColor: "#0f172a", scale: 2 });

      await new Promise<void>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("toBlob failed"));
            return;
          }
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `chargements-semaine-du-${format(new Date(weekStart), "yyyy-MM-dd")}.png`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 10_000);
          resolve();
        }, "image/png");
      });
    } catch {
      toast.error("Impossible de générer l'image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={download} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Télécharger le planning
      </Button>

      <div className="fixed left-[-10000px] top-0" aria-hidden="true">
        <div ref={boardRef} className="w-[1700px] bg-slate-950 p-10 text-white">
          <div className="flex items-baseline justify-between border-b border-white/10 pb-6">
            <h1 className="text-4xl font-bold tracking-tight">Chargements de la semaine</h1>
            <p className="text-xl font-medium capitalize text-white/60">
              Semaine du {format(new Date(weekStart), "d")} au {format(new Date(weekEnd), "d MMMM yyyy", { locale: fr })}
            </p>
          </div>

          <div className="mt-8 grid grid-cols-7 gap-4">
            {days.map((day) => {
              const date = new Date(day.date);
              const today = isToday(date);
              return (
                <div
                  key={day.date}
                  className={`flex flex-col rounded-2xl p-4 ${today ? "bg-white/10 ring-2 ring-sky-400/50" : "bg-white/5"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-lg font-bold capitalize ${today ? "text-sky-300" : "text-white/80"}`}>
                      {format(date, "EEEE d", { locale: fr })}
                    </p>
                    {day.appointments.length > 0 ? (
                      <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/60">
                        {day.appointments.length}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-1 flex-col gap-2">
                    {day.appointments.length === 0 ? (
                      <p className="text-sm text-white/30">—</p>
                    ) : (
                      day.appointments.map((appointment) => {
                        const status = deriveLoadingDisplayStatus(new Date(appointment.startsAt), new Date(appointment.endsAt), now);
                        return (
                          <div key={appointment.id} className="rounded-lg bg-white/5 p-2.5">
                            <p className="text-sm font-semibold tabular-nums text-white/90">
                              {format(new Date(appointment.startsAt), "HH:mm")}–{format(new Date(appointment.endsAt), "HH:mm")}
                            </p>
                            <p className="truncate text-sm font-medium">{appointment.clientName}</p>
                            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[status]}`}>
                              {labelStatus(status)}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

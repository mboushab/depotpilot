import { eachDayOfInterval, endOfWeek, format, isSameDay, isToday, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { prisma } from "@/lib/prisma";
import { deriveLoadingDisplayStatus } from "@/lib/loading-status";
import { labelStatus } from "@/lib/status-labels";
import { ScreenAutoRefresh } from "@/components/loading/screen-auto-refresh";
import { DownloadScreenButton } from "@/components/loading/download-screen-button";

export const dynamic = "force-dynamic";

// Bright, high-contrast badges on a dark background — readable from across a
// warehouse floor, unlike the admin calendar's subtler light-mode palette.
const STATUS_SCREEN_STYLES: Record<string, string> = {
  SCHEDULED: "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40",
  IN_PROGRESS: "bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/40",
  COMPLETED: "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40"
};

export default async function LoadingScreenPage() {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const appointments = await prisma.loadingAppointment.findMany({
    where: { startsAt: { lte: weekEnd }, endsAt: { gte: weekStart } },
    orderBy: { startsAt: "asc" }
  });

  const filename = `chargements-semaine-du-${format(weekStart, "yyyy-MM-dd")}.png`;

  return (
    <div className="min-h-screen bg-slate-950 px-12 py-10 text-white">
      <ScreenAutoRefresh />
      <DownloadScreenButton targetId="loading-screen-board" filename={filename} />
      <div id="loading-screen-board" className="bg-slate-950 p-2">
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-white/10 pb-6">
          <h1 className="text-5xl font-bold tracking-tight">Chargements de la semaine</h1>
          <p className="text-3xl font-medium capitalize text-white/70">
            Semaine du {format(weekStart, "d")} au {format(weekEnd, "d MMMM yyyy", { locale: fr })}
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-7">
          {days.map((day) => {
            const dayAppointments = appointments.filter((appointment) => isSameDay(appointment.startsAt, day));
            const today = isToday(day);
            return (
              <div
                key={day.toISOString()}
                className={`rounded-xl p-5 ${today ? "bg-white/10 ring-2 ring-sky-400/60" : "bg-white/5"}`}
              >
                <p className={`text-2xl font-bold capitalize ${today ? "text-sky-300" : "text-white/80"}`}>
                  {format(day, "EEEE d", { locale: fr })}
                </p>
                {dayAppointments.length === 0 ? (
                  <p className="mt-4 text-lg text-white/40">Aucun chargement</p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {dayAppointments.map((appointment) => {
                      const status = deriveLoadingDisplayStatus(appointment.startsAt, appointment.endsAt, now);
                      return (
                        <div key={appointment.id} className="space-y-1.5 border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
                          <p className="text-xl font-semibold tabular-nums text-white/90">
                            {format(appointment.startsAt, "HH:mm")}–{format(appointment.endsAt, "HH:mm")}
                          </p>
                          <p className="text-xl font-medium leading-tight">{appointment.clientName}</p>
                          <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${STATUS_SCREEN_STYLES[status]}`}>
                            {labelStatus(status)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

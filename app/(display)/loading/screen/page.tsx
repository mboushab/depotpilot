import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { prisma } from "@/lib/prisma";
import { deriveLoadingDisplayStatus } from "@/lib/loading-status";
import { labelStatus } from "@/lib/status-labels";
import { ScreenAutoRefresh } from "@/components/loading/screen-auto-refresh";

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
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const appointments = await prisma.loadingAppointment.findMany({
    where: { startsAt: { lte: dayEnd }, endsAt: { gte: dayStart } },
    orderBy: { startsAt: "asc" }
  });

  return (
    <div className="min-h-screen bg-slate-950 px-12 py-10 text-white">
      <ScreenAutoRefresh />
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-white/10 pb-6">
        <h1 className="text-5xl font-bold tracking-tight">Chargements du jour</h1>
        <p className="text-3xl font-medium capitalize text-white/70">{format(now, "EEEE d MMMM", { locale: fr })}</p>
      </div>

      {appointments.length === 0 ? (
        <p className="mt-16 text-center text-3xl text-white/50">Aucun chargement programmé aujourd&apos;hui.</p>
      ) : (
        <div className="mt-8 divide-y divide-white/10">
          {appointments.map((appointment) => {
            const status = deriveLoadingDisplayStatus(appointment.startsAt, appointment.endsAt, now);
            return (
              <div key={appointment.id} className="flex flex-wrap items-center justify-between gap-6 py-6">
                <div className="flex flex-wrap items-baseline gap-6">
                  <span className="text-4xl font-semibold tabular-nums text-white/90">
                    {format(appointment.startsAt, "HH:mm")}–{format(appointment.endsAt, "HH:mm")}
                  </span>
                  <span className="text-4xl font-medium">{appointment.clientName}</span>
                </div>
                <span className={`rounded-full px-5 py-2 text-2xl font-semibold ${STATUS_SCREEN_STYLES[status]}`}>
                  {labelStatus(status)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

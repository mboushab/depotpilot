import { eachDayOfInterval, endOfWeek, isSameDay, startOfWeek } from "date-fns";
import { ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { LoadingCalendar } from "@/components/loading/loading-calendar";
import { ScheduleLoadingDialog } from "@/components/loading/schedule-loading-dialog";
import { WeeklyScheduleDownload } from "@/components/loading/weekly-schedule-download";
import { Card, CardContent } from "@/components/ui/card";

export default async function LoadingPage() {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  const [capacity, appointments, weekAppointments] = await Promise.all([
    prisma.loadingBay.count(),
    // Only current/future appointments — past ones aren't shown and would
    // otherwise accumulate here forever.
    prisma.loadingAppointment.findMany({
      where: { endsAt: { gte: now } },
      orderBy: { startsAt: "asc" }
    }),
    // Separate query for the downloadable weekly board: it also needs
    // earlier-this-week (possibly already completed) appointments.
    prisma.loadingAppointment.findMany({
      where: { startsAt: { lte: weekEnd }, endsAt: { gte: weekStart } },
      orderBy: { startsAt: "asc" }
    })
  ]);

  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd }).map((date) => ({
    date: date.toISOString(),
    appointments: weekAppointments
      .filter((appointment) => isSameDay(appointment.startsAt, date))
      .map((appointment) => ({
        id: appointment.id,
        startsAt: appointment.startsAt.toISOString(),
        endsAt: appointment.endsAt.toISOString(),
        clientName: appointment.clientName
      }))
  }));

  return (
    <div className="space-y-6">
      <div className="sticky top-16 z-10 flex flex-wrap items-start justify-between gap-4 bg-background py-2">
        <div>
          <h1 className="text-2xl font-semibold">Planning des chargements</h1>
          <p className="text-sm text-muted-foreground">Chargements des clients, par ordre d&apos;arrivée.</p>
        </div>
        <div className="flex items-center gap-2">
          <WeeklyScheduleDownload weekStart={weekStart.toISOString()} weekEnd={weekEnd.toISOString()} days={weekDays} />
          <ScheduleLoadingDialog />
        </div>
      </div>
      <div className="flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
        <p>
          La capacité est limitée à <strong>{capacity} chargements simultanés</strong>. Les conflits sont bloqués automatiquement.
        </p>
      </div>
      <Card>
        <CardContent className="pt-4">
          <LoadingCalendar
            appointments={appointments.map((appointment) => ({
              id: appointment.id,
              startsAt: appointment.startsAt.toISOString(),
              endsAt: appointment.endsAt.toISOString(),
              status: appointment.status,
              clientName: appointment.clientName,
              clientPhone: appointment.clientPhone
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}

import { ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { LoadingCalendar } from "@/components/loading/loading-calendar";
import { ScheduleLoadingDialog } from "@/components/loading/schedule-loading-dialog";
import { Card, CardContent } from "@/components/ui/card";

export default async function LoadingPage() {
  const [capacity, appointments] = await Promise.all([
    prisma.loadingBay.count(),
    prisma.loadingAppointment.findMany({ orderBy: { startsAt: "asc" } })
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Planning des chargements</h1>
          <p className="text-sm text-muted-foreground">Chargements des clients, par ordre d&apos;arrivée.</p>
        </div>
        <ScheduleLoadingDialog />
      </div>
      <div className="flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
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

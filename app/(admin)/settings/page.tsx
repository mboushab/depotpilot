import { prisma } from "@/lib/prisma";
import { SettingsForm } from "@/components/forms/settings-form";
import { BoxRatesForm } from "@/components/forms/box-rates-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SettingsPage() {
  const [settings, units] = await Promise.all([
    prisma.appSetting.findMany(),
    prisma.storageUnit.findMany({ orderBy: { position: "asc" } })
  ]);
  const value = (key: string, fallback: number) => Number(settings.find((setting) => setting.key === key)?.value ?? fallback);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Paramètres</h1>
        <p className="text-sm text-muted-foreground">Capacité parking, tarifs par défaut et délais d’alerte.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Configuration dépôt</CardTitle></CardHeader>
        <CardContent>
          <SettingsForm
            defaults={{
              parkingSpaces: value("parkingSpaces", 12),
              defaultParkingRateCents: value("defaultParkingRateCents", 4500),
              notificationLeadDays: value("notificationLeadDays", 3),
              depositEnabled: settings.find((setting) => setting.key === "depositEnabled")?.value === "true",
              defaultDepositCents: value("defaultDepositCents", 0)
            }}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Tarifs des box</CardTitle></CardHeader>
        <CardContent>
          <BoxRatesForm units={units.map((unit) => ({ id: unit.id, code: unit.code, monthlyRateCents: unit.monthlyRateCents }))} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Contraintes fixes</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border px-4 py-3"><div className="font-semibold">Box de stockage</div><p className="text-sm text-muted-foreground">30 box exactement.</p></div>
          <div className="rounded-md border px-4 py-3"><div className="font-semibold">Chargement</div><p className="text-sm text-muted-foreground">2 emplacements exactement.</p></div>
        </CardContent>
      </Card>
    </div>
  );
}

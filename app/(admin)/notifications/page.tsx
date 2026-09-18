import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { markNotificationReadAction } from "@/server/actions/forms";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function NotificationsPage() {
  const notifications = await prisma.notification.findMany({
    orderBy: [{ readAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
    take: 50
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <p className="text-sm text-muted-foreground">Alertes internes générées par les opérations du dépôt.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Centre de notifications</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`flex items-start justify-between gap-4 rounded-md border px-4 py-3 ${
                notification.readAt ? "" : "border-sky-200 bg-sky-50"
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <Badge>{notification.type}</Badge>
                  <span className="font-semibold">{notification.title}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{notification.message}</p>
                <p className="mt-2 text-xs text-muted-foreground">{formatDistanceToNow(notification.createdAt, { addSuffix: true, locale: fr })}</p>
              </div>
              {notification.readAt ? (
                <span className="rounded-md border px-3 py-1 text-xs font-semibold text-muted-foreground">Lu</span>
              ) : (
                <form action={markNotificationReadAction}>
                  <input type="hidden" name="id" value={notification.id} />
                  <button className="rounded-md border px-3 py-1 text-xs font-semibold">Lu</button>
                </form>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

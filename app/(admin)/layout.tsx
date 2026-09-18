import { AdminShell } from "@/components/layout/admin-shell";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncOverdueParkingNotifications } from "@/lib/parking-overdue";
import { syncUnpaidExitNotifications } from "@/lib/rental-alerts";
import { syncReservedBoxesToOccupied } from "@/lib/box-activation";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  await Promise.all([syncOverdueParkingNotifications(), syncUnpaidExitNotifications(), syncReservedBoxesToOccupied()]);
  const unreadCount = await prisma.notification.count({ where: { readAt: null } });
  return (
    <AdminShell userName={user.name} unreadNotifications={unreadCount}>
      {children}
    </AdminShell>
  );
}

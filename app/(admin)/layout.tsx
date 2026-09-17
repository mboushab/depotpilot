import { AdminShell } from "@/components/layout/admin-shell";
import { requireAdmin } from "@/lib/auth";
import { syncOverdueParkingNotifications } from "@/lib/parking-overdue";
import { syncUnpaidExitNotifications } from "@/lib/rental-alerts";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  await Promise.all([syncOverdueParkingNotifications(), syncUnpaidExitNotifications()]);
  return <AdminShell userName={user.name}>{children}</AdminShell>;
}

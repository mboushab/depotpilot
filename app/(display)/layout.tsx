import { requireAdmin } from "@/lib/auth";

// Full-bleed pages meant for a TV/monitor, not the admin console — no
// sidebar, no header. Still behind requireAdmin() so the screen URL can't
// be reached without being logged in as the admin somewhere on the network.
export const dynamic = "force-dynamic";

export default async function DisplayLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}

import Link from "next/link";
import Image from "next/image";
import { Bell, CalendarClock, Car, FileText, LayoutDashboard, LogOut, Settings, Users, Warehouse } from "lucide-react";
import { logoutAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";

const nav = [
  { href: "/dashboard", label: "Accueil", icon: LayoutDashboard },
  { href: "/boxes", label: "Box", icon: Warehouse },
  { href: "/loading", label: "Chargements", icon: CalendarClock },
  { href: "/parking", label: "Parking", icon: Car },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/invoices", label: "Factures", icon: FileText },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings", label: "Paramètres", icon: Settings }
];

export function AdminShell({ children, userName }: { children: React.ReactNode; userName: string }) {
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-white/94 px-4 py-5 lg:block">
        <Link href="/dashboard" className="flex items-center gap-3 px-2">
          <Image src="/logo-mark.png" alt="Logo" width={36} height={36} className="rounded-md" />
          <div>
            <div className="font-semibold">BoxPilot</div>
            <div className="text-xs text-muted-foreground">Gestion dépôt</div>
          </div>
        </Link>
        <nav className="mt-8 space-y-1">
          {nav.map((item) => (
            <Link
              href={item.href}
              key={item.href}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="text-sm font-medium text-muted-foreground">Connecté en tant que {userName}</div>
          <form action={logoutAction}>
            <Button variant="outline" size="sm">
              <LogOut className="h-4 w-4" />
              Déconnexion
            </Button>
          </form>
        </header>
        <main className="px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}

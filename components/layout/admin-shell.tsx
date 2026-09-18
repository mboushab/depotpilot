"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Bell, CalendarClock, Car, FileText, LayoutDashboard, LogOut, Menu, Settings, Users, Warehouse, X } from "lucide-react";
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

function NavLinks({ unreadNotifications, onNavigate }: { unreadNotifications: number; onNavigate?: () => void }) {
  return (
    <nav className="mt-8 space-y-1">
      {nav.map((item) => (
        <Link
          href={item.href}
          key={item.href}
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <item.icon className="h-4 w-4" />
          {item.label}
          {item.href === "/notifications" && unreadNotifications > 0 ? (
            <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-xs font-semibold text-white">
              {unreadNotifications}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

function BrandLink({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-3 px-2">
      <Image src="/logo-mark.png" alt="Logo" width={36} height={36} className="rounded-md" />
      <div>
        <div className="font-semibold">BoxPilot</div>
        <div className="text-xs text-muted-foreground">Gestion dépôt</div>
      </div>
    </Link>
  );
}

export function AdminShell({
  children,
  userName,
  unreadNotifications = 0
}: {
  children: React.ReactNode;
  userName: string;
  unreadNotifications?: number;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-white/94 px-4 py-5 lg:block">
        <BrandLink />
        <NavLinks unreadNotifications={unreadNotifications} />
      </aside>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} />
          <aside className="fixed inset-y-0 left-0 w-64 border-r bg-white px-4 py-5 shadow-panel">
            <div className="flex items-center justify-between">
              <BrandLink onNavigate={() => setMobileNavOpen(false)} />
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md hover:bg-muted"
                aria-label="Fermer le menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <NavLinks unreadNotifications={unreadNotifications} onNavigate={() => setMobileNavOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b bg-white/90 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md border hover:bg-muted lg:hidden"
              aria-label="Ouvrir le menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="truncate text-sm font-medium text-muted-foreground">Connecté en tant que {userName}</div>
          </div>
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

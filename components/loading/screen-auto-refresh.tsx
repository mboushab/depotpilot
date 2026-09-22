"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// A TV screen is left open indefinitely with nobody there to reload it, so
// the page has to refresh itself to pick up new/updated appointments and to
// move slots from "Programmé" to "En cours" to "Terminé" as time passes.
export function ScreenAutoRefresh({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}

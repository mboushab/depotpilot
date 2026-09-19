"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    // Reads real DOM/browser state (set by the inline script in layout.tsx
    // before hydration) that can't be known during server rendering —
    // syncing it here, once, after mount is the correct approach, not a
    // symptom of missing derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // ignore (private browsing, blocked storage, etc.)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-md border hover:bg-muted"
      aria-label={dark ? "Passer en mode clair" : "Passer en mode sombre"}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type ComboboxOption = { id: string; label: string; hint?: string };

// Accent- and case-insensitive, so "Francois" finds "François".
const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function Combobox({
  options,
  value,
  onChange,
  name,
  placeholder = "Rechercher…",
  emptyMessage = "Aucun résultat"
}: {
  options: ComboboxOption[];
  value: string;
  onChange: (id: string) => void;
  name?: string;
  placeholder?: string;
  emptyMessage?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.id === value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const matches = useMemo(() => {
    const needle = normalize(query.trim());
    if (!needle) return options;
    return options.filter((option) => normalize(`${option.label} ${option.hint ?? ""}`).includes(needle));
  }, [options, query]);

  // While closed the input shows the chosen option; typing replaces it.
  const shown = open ? query : (selected?.label ?? "");

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function choose(option: ComboboxOption) {
    onChange(option.id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={rootRef} className="relative">
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        className="flex h-10 w-full rounded-md border bg-white px-3 py-2 text-sm text-foreground shadow-sm transition placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-card"
        placeholder={placeholder}
        value={shown}
        onFocus={(event) => {
          setQuery("");
          setHighlight(0);
          setOpen(true);
          event.currentTarget.select();
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setHighlight(0);
          setOpen(true);
          // Editing the text drops the previous choice until a new one is picked.
          if (value) onChange("");
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setHighlight((current) => Math.min(current + 1, matches.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlight((current) => Math.max(current - 1, 0));
          } else if (event.key === "Enter" && open) {
            // Never submit the form while the list is open.
            event.preventDefault();
            if (matches[highlight]) choose(matches[highlight]);
          } else if (event.key === "Escape" && open) {
            event.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-card py-1 text-sm shadow-lg"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground">{emptyMessage}</li>
          ) : (
            matches.map((option, index) => (
              <li
                key={option.id}
                role="option"
                aria-selected={option.id === value}
                className={cn("cursor-pointer px-3 py-2", index === highlight && "bg-muted", option.id === value && "font-semibold")}
                onMouseEnter={() => setHighlight(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                {option.label}
                {option.hint ? <span className="ml-2 text-xs text-muted-foreground">{option.hint}</span> : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

"use client";

/**
 * Pill-style dark/light theme toggle.
 *
 * The rest of the app already supports both themes via the `.dark`
 * class on `<html>` (set by shadcn convention). This control is just a
 * UI affordance that flips that class — it doesn't define a separate
 * theme system. We persist the user's choice to localStorage so the
 * War Room respects it across reloads.
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Theme = "dark" | "light";
const STORAGE_KEY = "warroom.theme";

/** Apply the selected theme by toggling the `.dark` class on <html>. */
function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function ThemeToggle() {
  // SSR-safe: start neutral, then resolve from storage / system pref
  // on first effect tick so the marker doesn't desync on hydration.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? null;
    const systemDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    const initial: Theme = stored ?? (systemDark ? "dark" : "light");
    setTheme(initial);
    applyTheme(initial);
  }, []);

  function pick(next: Theme) {
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore — incognito / blocked storage shouldn't kill the toggle
    }
  }

  return (
    <div className="flex rounded-full border border-wr-border bg-wr-panel-2 p-[3px]">
      {(["dark", "light"] as const).map((t) => {
        const selected = theme === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => pick(t)}
            className={cn(
              "wr-mono cursor-pointer rounded-full border-0 px-3 py-[5px] text-[10px]",
              selected
                ? "bg-wr-fg text-wr-bg"
                : "bg-transparent text-wr-fg-faint"
            )}
            aria-pressed={selected}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

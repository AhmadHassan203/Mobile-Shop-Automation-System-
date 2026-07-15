"use client";

import { MoonIcon } from "@/components/ui/icons";

type Theme = "light" | "dark";

function currentTheme(): Theme {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === "light" || explicit === "dark") return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeToggle() {
  const toggleTheme = (): void => {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem("msos-theme", next);
    } catch {
      // Theme persistence is optional; business data never uses localStorage.
    }
  };

  return (
    <button
      aria-label="Toggle color theme"
      className="grid size-9 shrink-0 place-items-center rounded-control border border-line bg-surface text-ink-subtle transition-colors hover:bg-surface-subtle"
      onClick={toggleTheme}
      title="Toggle color theme"
      type="button"
    >
      <MoonIcon className="size-[1.1rem]" />
    </button>
  );
}

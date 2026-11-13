"use client";

import { useEffect } from "react";

import type { Theme } from "@/lib/theme";

/**
 * Keeps the `dark` class on <html> in line with the user's theme after client-side re-renders (the inline head
 * script only covers the first paint). For «system» it follows the operating system setting live.
 */
export function ThemeSync({ theme }: { theme: Theme }) {
  useEffect(() => {
    const root = document.documentElement;
    const apply = (dark: boolean) => {
      root.classList.toggle("dark", dark);
      root.style.colorScheme = dark ? "dark" : "light";
    };
    if (theme !== "system") {
      apply(theme === "dark");
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  return null;
}

import { z } from "zod";

/** Colour scheme of a user: follow the operating system, or always light / dark (profiles.theme). */
export const themes = ["system", "light", "dark"] as const;
export type Theme = (typeof themes)[number];

export const themeSchema = z.enum(themes);
export const THEME_COOKIE = "LUPI_THEME";

export const parseTheme = (value: unknown): Theme => themeSchema.catch("system").parse(value);

/** Cookie options shared by login and the profile form (mirrors the profile so the server renders the right scheme). */
export const themeCookie = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" } as const;

/**
 * Inline script for theme «system»: sets the `dark` class before the first paint and follows changes of the
 * operating system. Kept tiny and dependency-free because it runs in <head>.
 */
export const systemThemeScript = `(function(){try{var m=window.matchMedia("(prefers-color-scheme: dark)"),r=document.documentElement,a=function(){r.classList.toggle("dark",m.matches);r.style.colorScheme=m.matches?"dark":"light"};a();m.addEventListener("change",a)}catch(e){}})()`;

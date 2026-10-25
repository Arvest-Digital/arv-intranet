export const THEMES = ['light', 'dark', 'system'] as const;

export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = 'system';

export function parseTheme(value: unknown): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : DEFAULT_THEME;
}

/** Class for `<html>` known on the server; `system` is resolved in the browser. */
export function themeClass(theme: Theme): string | undefined {
  return theme === 'dark' ? 'dark' : undefined;
}

/**
 * Runs in `<head>` before first paint when the theme is `system`, so a dark OS
 * never sees a light flash. Keep it tiny and dependency-free.
 */
export const SYSTEM_THEME_SCRIPT =
  "try{if(matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark')}catch(e){}";

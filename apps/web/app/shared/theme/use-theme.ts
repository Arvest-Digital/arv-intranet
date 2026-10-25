import { useLayoutEffect } from 'react';
import { useFetcher, useRouteLoaderData } from 'react-router';
import { DEFAULT_THEME, parseTheme, type Theme } from './theme';

export const THEME_FETCHER_KEY = 'theme';

/** Current theme choice: optimistic while a change is in flight, then from the root loader. */
export function useTheme(): Theme {
  const root = useRouteLoaderData<{ theme: Theme }>('root');
  const fetcher = useFetcher({ key: THEME_FETCHER_KEY });
  const pending = fetcher.formData?.get('theme');
  return pending ? parseTheme(pending) : (root?.theme ?? DEFAULT_THEME);
}

/**
 * Keeps `.dark` on `<html>` in sync after hydration. React can't own the class alone:
 * under `system` it is added outside React (inline script / OS changes), so switching
 * `system` → `light` would otherwise leave a stale `.dark` behind.
 */
export function useThemeClass(theme: Theme) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (theme !== 'system') {
      root.classList.toggle('dark', theme === 'dark');
      return;
    }
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => root.classList.toggle('dark', media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}

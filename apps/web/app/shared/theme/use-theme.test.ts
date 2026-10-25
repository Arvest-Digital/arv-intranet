import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Theme } from './theme';
import { useThemeClass } from './use-theme';

let osDark = false;
const listeners = new Set<() => void>();

beforeEach(() => {
  osDark = false;
  listeners.clear();
  document.documentElement.className = '';
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return osDark;
    },
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const isDark = () => document.documentElement.classList.contains('dark');

describe('useThemeClass', () => {
  it('follows the OS while the theme is system', () => {
    renderHook(() => useThemeClass('system'));
    expect(isDark()).toBe(false);
    osDark = true;
    for (const fn of listeners) fn();
    expect(isDark()).toBe(true);
  });

  it('removes the script-added class when switching system → light', () => {
    osDark = true;
    const { rerender } = renderHook(({ theme }) => useThemeClass(theme), {
      initialProps: { theme: 'system' as Theme },
    });
    expect(isDark()).toBe(true);
    rerender({ theme: 'light' });
    expect(isDark()).toBe(false);
    expect(listeners.size).toBe(0);
  });

  it('forces dark regardless of the OS', () => {
    renderHook(() => useThemeClass('dark'));
    expect(isDark()).toBe(true);
  });
});

import type { CSSProperties } from 'react';

/**
 * OKLCH hues for project colors, spread around the wheel at 20° steps.
 * Red (~340°–40°) is excluded: it is reserved for the overload status.
 * Lightness/chroma come from the theme (--project-*-l/-c in app/app.css).
 */
export const PROJECT_HUES = [
  50, 70, 90, 110, 130, 150, 170, 190, 210, 230, 250, 270, 290, 310, 330,
] as const;

export type ProjectHue = (typeof PROJECT_HUES)[number];

// FNV-1a: small, fast and stable across runtimes, so SSR and client agree.
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic hue for a project: the same id always maps to the same hue. */
export function getProjectColor(id: string): ProjectHue {
  return PROJECT_HUES[hash(id) % PROJECT_HUES.length] as ProjectHue;
}

/** Inline style for a `.project-block` element. */
export function projectColorStyle(id: string): CSSProperties {
  return { '--project-hue': getProjectColor(id) } as CSSProperties;
}

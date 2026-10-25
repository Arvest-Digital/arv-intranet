import { describe, expect, it } from 'vitest';
import { getProjectColor, PROJECT_HUES, projectColorStyle } from './project-color';

const ids = Array.from({ length: 500 }, (_, i) => `project-${i}`);

describe('getProjectColor', () => {
  it('returns the same hue for the same id', () => {
    expect(getProjectColor('6f1c1f0e-4d6a-4b8e-9b3a-2f0a3c5d7e91')).toBe(
      getProjectColor('6f1c1f0e-4d6a-4b8e-9b3a-2f0a3c5d7e91'),
    );
  });

  it('only returns hues from the fixed list', () => {
    for (const id of ids) expect(PROJECT_HUES).toContain(getProjectColor(id));
  });

  it('spreads ids over every hue', () => {
    expect(new Set(ids.map(getProjectColor)).size).toBe(PROJECT_HUES.length);
  });

  it('never uses the red range reserved for overload', () => {
    for (const hue of PROJECT_HUES) expect(hue >= 40 && hue <= 340).toBe(true);
  });

  it('builds the inline style for .project-block', () => {
    expect(projectColorStyle('a')).toEqual({ '--project-hue': getProjectColor('a') });
  });
});

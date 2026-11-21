import { CircleIcon } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import {
  everyone,
  type Section,
  sectionHome,
  sectionOf,
  visibleItems,
  visibleSections,
} from './section';

const me = (permissions: string[]) => ({
  id: '6f1c1f0e-4d6a-4b8e-9b3a-2f0a3c5d7e91',
  email: 'ann@arvest.digital',
  name: 'Ann',
  permissions,
});
const may = (permission: string) => (user: { permissions: readonly string[] }) =>
  user.permissions.includes(permission);

const work: Section = {
  id: 'work',
  label: 'Work',
  icon: CircleIcon,
  items: [
    { label: 'Board', to: '/work', icon: CircleIcon, visible: may('board') },
    { label: 'Mine', to: '/work/mine', icon: CircleIcon, visible: everyone },
  ],
};
const admin: Section = {
  id: 'admin',
  label: 'Admin',
  icon: CircleIcon,
  items: [{ label: 'Users', to: '/admin/users', icon: CircleIcon, visible: may('admin') }],
};

describe('section navigation by permission', () => {
  it('shows only the items the user may open', () => {
    expect(visibleItems(work, me([])).map((item) => item.label)).toEqual(['Mine']);
    expect(visibleItems(work, me(['board'])).map((item) => item.label)).toEqual(['Board', 'Mine']);
  });

  it('hides a section with no item the user may open', () => {
    expect(visibleSections([work, admin], me([])).map((s) => s.id)).toEqual(['work']);
    expect(visibleSections([work, admin], me(['admin'])).map((s) => s.id)).toEqual([
      'work',
      'admin',
    ]);
  });

  it('opens a section on its first page the user may open', () => {
    expect(sectionHome(work, me(['board']))).toBe('/work');
    expect(sectionHome(work, me([]))).toBe('/work/mine');
    expect(sectionHome(admin, me([]))).toBeUndefined();
  });
});

describe('sectionOf', () => {
  it('takes the deepest match that names a section', () => {
    expect(sectionOf([{ handle: undefined }, { handle: { section: work } }, { handle: {} }])).toBe(
      work,
    );
    expect(sectionOf([{ handle: { section: admin } }, { handle: { section: work } }])?.id).toBe(
      'work',
    );
  });

  it('finds none outside a section', () => {
    expect(sectionOf([{ handle: undefined }, { handle: null }])).toBeUndefined();
  });
});

import type { Me } from '@arv/contracts/identity';
import type { LucideIcon } from 'lucide-react';

/** One link in a section's side navigation, shown only to whom `visible` lets see it. */
export type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Active only on `to` itself, not on the pages below it. */
  end?: boolean;
  visible: (me: Me) => boolean;
};

/** A large part of the app: its entry in the section switcher and its side navigation. */
export type Section = { id: string; label: string; icon: LucideIcon; items: NavItem[] };

/** The `handle` of a section's layout route; the shell reads it from the deepest match. */
export type SectionHandle = { section: Section };

export const everyone = () => true;

export const visibleItems = (section: Section, me: Me) =>
  section.items.filter((item) => item.visible(me));

/** A section shows in the switcher if the user may open at least one of its pages. */
export const visibleSections = (sections: readonly Section[], me: Me) =>
  sections.filter((section) => visibleItems(section, me).length > 0);

/** Where the switcher takes the user: the section's first page they may open. */
export const sectionHome = (section: Section, me: Me): string | undefined =>
  visibleItems(section, me)[0]?.to;

export const isSectionHandle = (handle: unknown): handle is SectionHandle =>
  typeof handle === 'object' && handle !== null && 'section' in handle;

/** The section of the deepest matched route that names one; none on Home, sign-in or a 404. */
export function sectionOf(matches: readonly { handle: unknown }[]): Section | undefined {
  const handle = matches.findLast((match) => isSectionHandle(match.handle))?.handle;
  return isSectionHandle(handle) ? handle.section : undefined;
}

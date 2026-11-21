import type { Section } from '~/shared/nav/section';
import { section as access } from './access';
import { section as schedule } from './schedule';

/**
 * Every section, in the switcher's order. Adding one: a file here exporting `section`, `handle`
 * and an `<Outlet />`, an entry below, and a `layout()` block in `routes.ts`.
 */
export const SECTIONS: readonly Section[] = [schedule, access];

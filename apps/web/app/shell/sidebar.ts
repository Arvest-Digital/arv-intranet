/** Whether the side navigation is a full panel or a rail of icons; the user's choice, kept in a cookie. */
export type SidebarState = 'expanded' | 'collapsed';

export const DEFAULT_SIDEBAR: SidebarState = 'expanded';

export const parseSidebar = (value: unknown): SidebarState =>
  value === 'collapsed' ? 'collapsed' : 'expanded';

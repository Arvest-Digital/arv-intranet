import { useFetcher, useRouteLoaderData } from 'react-router';
import { DEFAULT_SIDEBAR, parseSidebar, type SidebarState } from './sidebar';

export const SIDEBAR_FETCHER_KEY = 'sidebar';
export const SIDEBAR_ACTION = '/sidebar';

/** The side navigation's state (optimistic while a change is in flight) and a setter that keeps it. */
export function useSidebar(): [SidebarState, (state: SidebarState) => void] {
  const root = useRouteLoaderData<{ sidebar?: SidebarState }>('root');
  const fetcher = useFetcher({ key: SIDEBAR_FETCHER_KEY });
  const pending = fetcher.formData?.get('sidebar');
  const state = pending ? parseSidebar(pending) : (root?.sidebar ?? DEFAULT_SIDEBAR);
  const set = (next: SidebarState) =>
    fetcher.submit({ sidebar: next }, { method: 'post', action: SIDEBAR_ACTION });
  return [state, set];
}

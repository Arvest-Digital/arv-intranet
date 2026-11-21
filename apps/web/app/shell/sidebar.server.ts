import { createCookie } from 'react-router';
import { DEFAULT_SIDEBAR, parseSidebar, type SidebarState } from './sidebar';

const sidebarCookie = createCookie('sidebar', {
  path: '/',
  sameSite: 'lax',
  httpOnly: true,
  secure: import.meta.env.PROD,
  maxAge: 60 * 60 * 24 * 365,
});

export async function getSidebar(request: Request): Promise<SidebarState> {
  const value = await sidebarCookie.parse(request.headers.get('Cookie'));
  return value === null ? DEFAULT_SIDEBAR : parseSidebar(value);
}

export function serializeSidebar(state: SidebarState): Promise<string> {
  return sidebarCookie.serialize(state);
}

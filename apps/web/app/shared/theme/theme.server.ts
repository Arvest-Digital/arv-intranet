import { createCookie } from 'react-router';
import { DEFAULT_THEME, parseTheme, type Theme } from './theme';

const themeCookie = createCookie('theme', {
  path: '/',
  sameSite: 'lax',
  httpOnly: true,
  secure: import.meta.env.PROD,
  maxAge: 60 * 60 * 24 * 365,
});

export async function getTheme(request: Request): Promise<Theme> {
  const value = await themeCookie.parse(request.headers.get('Cookie'));
  return value === null ? DEFAULT_THEME : parseTheme(value);
}

export function serializeTheme(theme: Theme): Promise<string> {
  return themeCookie.serialize(theme);
}

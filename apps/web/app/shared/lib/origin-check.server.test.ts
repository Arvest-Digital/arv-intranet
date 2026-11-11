import { describe, expect, it } from 'vitest';
import { foreignOriginResponse, isAllowedOrigin } from './origin-check.server';

const WEB = 'https://intranet.example';

const request = (method: string, origin?: string) =>
  new Request(`${WEB}/sign-out`, {
    method,
    headers: origin === undefined ? {} : { Origin: origin },
  });

describe('isAllowedOrigin (sad §8 CSRF)', () => {
  it('rejects a foreign origin on POST', () => {
    expect(isAllowedOrigin(request('POST', 'https://evil.example'))).toBe(false);
  });

  it('accepts web’s own origin on POST', () => {
    expect(isAllowedOrigin(request('POST', WEB))).toBe(true);
  });

  it.each(['PUT', 'PATCH', 'DELETE'])('rejects a foreign origin on %s', (method) => {
    expect(isAllowedOrigin(request(method, 'https://evil.example'))).toBe(false);
  });

  it('rejects a POST without Origin or with Origin null', () => {
    expect(isAllowedOrigin(request('POST'))).toBe(false);
    expect(isAllowedOrigin(request('POST', 'null'))).toBe(false);
  });

  it('rejects a sibling subdomain and another port', () => {
    expect(isAllowedOrigin(request('POST', 'https://evil.intranet.example'))).toBe(false);
    expect(isAllowedOrigin(request('POST', `${WEB}:8443`))).toBe(false);
  });

  it.each(['GET', 'HEAD'])('lets %s through whatever the origin', (method) => {
    expect(isAllowedOrigin(request(method, 'https://evil.example'))).toBe(true);
  });

  it('answers a refused request with 403', () => {
    expect(foreignOriginResponse().status).toBe(403);
  });
});

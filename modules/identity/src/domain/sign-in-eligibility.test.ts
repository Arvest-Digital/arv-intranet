import { describe, expect, it } from 'vitest';
import { requiresHostedDomain, type SignInClaims, signInEligibility } from './sign-in-eligibility';

const domain = 'example.test';
const valid: SignInClaims = {
  email: 'user-1@example.test',
  email_verified: true,
  hd: 'example.test',
  name: 'Test User',
};

describe('signInEligibility', () => {
  it('accepts verified claims on the company domain', () => {
    expect(signInEligibility(valid, domain)).toMatchObject({
      _tag: 'Eligible',
      email: 'user-1@example.test',
      name: 'Test User',
    });
  });

  it('normalises the email and compares domains case-insensitively', () => {
    const result = signInEligibility(
      { ...valid, email: '  User-1@Example.TEST ', hd: 'EXAMPLE.test' },
      ' Example.Test ',
    );
    expect(result).toMatchObject({ _tag: 'Eligible', email: 'user-1@example.test' });
  });

  it('refuses an unverified email', () => {
    expect(signInEligibility({ ...valid, email_verified: false }, domain)._tag).toBe('Refused');
  });

  it('refuses when email_verified is not the boolean true', () => {
    expect(signInEligibility({ ...valid, email_verified: 'true' }, domain)._tag).toBe('Refused');
    expect(signInEligibility({ ...valid, email_verified: undefined }, domain)._tag).toBe('Refused');
  });

  it('refuses a missing hd', () => {
    const { hd: _, ...claims } = valid;
    expect(signInEligibility(claims, domain)._tag).toBe('Refused');
  });

  it('refuses another hd', () => {
    expect(signInEligibility({ ...valid, hd: 'other.test' }, domain)._tag).toBe('Refused');
  });

  it('refuses an email on another domain', () => {
    expect(signInEligibility({ ...valid, email: 'user-1@other.test' }, domain)._tag).toBe(
      'Refused',
    );
    expect(signInEligibility({ ...valid, email: 'user-1@sub.example.test' }, domain)._tag).toBe(
      'Refused',
    );
  });

  it('refuses a missing email', () => {
    const { email: _, ...claims } = valid;
    expect(signInEligibility(claims, domain)._tag).toBe('Refused');
  });

  it('refuses a missing name', () => {
    const { name: _, ...claims } = valid;
    expect(signInEligibility(claims, domain)._tag).toBe('Refused');
  });

  it('refuses when no company domain is configured', () => {
    expect(signInEligibility(valid, '')._tag).toBe('Refused');
  });

  it('carries nothing about the person when refused', () => {
    expect(signInEligibility({ ...valid, hd: 'other.test' }, domain)).toEqual({ _tag: 'Refused' });
  });

  describe('without the hosted-domain check (local development)', () => {
    const skip = { requireHostedDomain: false };
    const personal: SignInClaims = {
      email: 'someone@gmail.test',
      email_verified: true,
      name: 'Someone',
    };

    it('accepts a verified email on the company domain with no hd claim', () => {
      expect(signInEligibility(personal, 'gmail.test', skip)).toMatchObject({
        _tag: 'Eligible',
        email: 'someone@gmail.test',
      });
    });

    it('still refuses an email on another domain', () => {
      expect(signInEligibility(personal, domain, skip)._tag).toBe('Refused');
    });

    it('still refuses an unverified email', () => {
      expect(
        signInEligibility({ ...personal, email_verified: false }, 'gmail.test', skip)._tag,
      ).toBe('Refused');
    });
  });
});

describe('requiresHostedDomain', () => {
  const local = 'http://localhost:5173/sign-in/return';

  it('requires hd unless the skip flag is set', () => {
    expect(requiresHostedDomain({ signInReturnUrl: local })).toBe(true);
    expect(requiresHostedDomain({ skipHostedDomainCheck: false, signInReturnUrl: local })).toBe(
      true,
    );
  });

  it('skips hd only for a plain-http loopback return URL', () => {
    expect(requiresHostedDomain({ skipHostedDomainCheck: true, signInReturnUrl: local })).toBe(
      false,
    );
    expect(
      requiresHostedDomain({
        skipHostedDomainCheck: true,
        signInReturnUrl: 'http://127.0.0.1:5173/sign-in/return',
      }),
    ).toBe(false);
  });

  it('ignores the flag on a deployed or malformed return URL', () => {
    for (const signInReturnUrl of [
      'https://intranet.example.test/sign-in/return',
      'https://localhost/sign-in/return',
      'http://localhost.evil.test/sign-in/return',
      '',
      'not a url',
    ]) {
      expect(requiresHostedDomain({ skipHostedDomainCheck: true, signInReturnUrl })).toBe(true);
    }
  });
});

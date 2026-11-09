import { describe, expect, it } from 'vitest';
import { type SignInClaims, signInEligibility } from './sign-in-eligibility';

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
});

import { describe, expect, it } from 'vitest';
import { identitySchema, numberSearchSchema, otpSchema } from '@/lib/validation';

describe('identity validation', () => {
  it('accepts valid registration identity', () => {
    const result = identitySchema.safeParse({
      fullName: 'Rezky Maulana',
      whatsapp: '81212345678',
      email: 'rezky@example.com',
      eid: '1'.repeat(32),
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid identity fields', () => {
    const result = identitySchema.safeParse({
      fullName: '',
      whatsapp: '0812',
      email: 'not-an-email',
      eid: '123',
    });

    expect(result.success).toBe(false);
  });
});

describe('flow validation', () => {
  it('accepts an optional 1 to 5 digit pattern and a valid prefix', () => {
    expect(numberSearchSchema.safeParse({ prefix: '6281', pattern: '12345', pageSize: 40 }).success).toBe(true);
    expect(numberSearchSchema.safeParse({ prefix: '6281', pattern: '', pageSize: 40 }).success).toBe(true);
  });

  it('rejects invalid search and final verification values', () => {
    expect(numberSearchSchema.safeParse({ prefix: '62a', pattern: '123456', pageSize: 0 }).success).toBe(false);
    expect(otpSchema.safeParse({ otp: 'A12b34', captcha: 'manual-response' }).success).toBe(true);
    expect(otpSchema.safeParse({ otp: '12345!', captcha: '' }).success).toBe(false);
  });
});

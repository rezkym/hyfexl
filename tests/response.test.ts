import { describe, expect, it } from 'vitest';
import { findNumberCandidates, firstValue, safeExcerpt, summarizeFinal } from '@/lib/hyfe/response';

describe('HYFE response parsing', () => {
  it('gets the first nonempty nested value', () => {
    const response = { result: { data: { csrfToken: 'csrf-value' } } };
    expect(firstValue(response, ['missing'], ['result', 'data', 'csrfToken'])).toBe('csrf-value');
  });

  it('extracts and deduplicates encrypted number candidates', () => {
    const response = {
      result: {
        resources: [
          { encrypt: 'encrypted-a', niceNumber: '0812-1111-2222' },
          { nested: { encrypt: 'encrypted-b', displayNumber: '0812-3333-4444' } },
          { encrypt: 'encrypted-a', msisdn: 'duplicate' },
        ],
      },
    };

    expect(findNumberCandidates(response)).toEqual([
      { encrypted: 'encrypted-a', label: '0812-1111-2222' },
      { encrypted: 'encrypted-b', label: '0812-3333-4444' },
    ]);
  });

  it('returns a safe final summary and normalizes excerpts', () => {
    expect(safeExcerpt('  one\n two\tthree  ')).toBe('one two three');
    expect(
      summarizeFinal({
        statusCode: 200,
        result: { data: { result: { resultCode: 'SUCCESS' }, message: 'Submitted' } },
      }),
    ).toEqual({ statusCode: 200, resultCode: 'SUCCESS', message: 'Submitted' });
  });
});

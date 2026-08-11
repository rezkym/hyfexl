import { describe, expect, it } from 'vitest';
import { createSelectionId, newFlowState, openFlowState, sealFlowState } from '@/lib/flow-state';

const key = Buffer.alloc(32, 7).toString('base64');

describe('encrypted flow state', () => {
  it('round-trips short-lived state without exposing plaintext', () => {
    const state = { ...newFlowState(1_000), csrf: 'csrf-secret' };
    const sealed = sealFlowState(state, key);

    expect(sealed).not.toContain('csrf-secret');
    expect(openFlowState(sealed, key, 1_001)).toMatchObject({ csrf: 'csrf-secret' });
  });

  it('rejects tampered or expired state', () => {
    const sealed = sealFlowState(newFlowState(1_000), key);

    expect(openFlowState(`${sealed}x`, key, 1_001)).toBeNull();
    expect(openFlowState(sealed, key, 1_000 + 20 * 60 * 1_000 + 1)).toBeNull();
  });

  it('keeps an upstream encrypted number behind a random opaque selection ID', () => {
    const state = newFlowState();
    const selectionId = createSelectionId(state, 'upstream-encrypted-number');

    expect(selectionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(selectionId).not.toContain('upstream-encrypted-number');
    expect(state.selections[selectionId]).toBe('upstream-encrypted-number');
  });
});

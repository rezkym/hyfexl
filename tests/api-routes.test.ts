import { describe, expect, it } from 'vitest';
import { POST as consentPost } from '@/app/api/flow/consent/route';
import { POST as numbersPost } from '@/app/api/flow/numbers/route';
import { POST as otpPost } from '@/app/api/flow/otp/route';
import { POST as submitPost } from '@/app/api/flow/submit/route';
import { newFlowState, sealFlowState } from '@/lib/flow-state';

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('flow API route gates', () => {
  it('rejects OTP delivery when no secure session exists', async () => {
    const response = await otpPost(
      jsonRequest('/api/flow/otp', { email: 'rezky@example.com', fullName: 'Rezky Maulana' }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'conflict' }),
    });
  });

  it('requires explicit consent before checking server state', async () => {
    const response = await consentPost(jsonRequest('/api/flow/consent', { email: 'rezky@example.com' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'bad_request' }),
    });
  });

  it('validates number-search input before calling upstream', async () => {
    const response = await numbersPost(jsonRequest('/api/flow/numbers', { prefix: '62a', pattern: '123456' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'bad_request' }),
    });
  });

  it('rejects an unknown number selection without calling upstream', async () => {
    const state = {
      ...newFlowState(),
      token: 'token',
      csrf: 'csrf',
      tncToken: 'tnc',
      consentId: 'consent',
    };
    const key = process.env.FLOW_STATE_ENCRYPTION_KEY!;
    const request = jsonRequest('/api/flow/submit', {
      selectionId: crypto.randomUUID(),
      fullName: 'Rezky Maulana',
      whatsapp: '81212345678',
      email: 'rezky@example.com',
      eid: '1'.repeat(32),
      otp: 'A12b34',
      captcha: 'manual-response',
      confirmed: true,
    });
    request.headers.set('cookie', `hyfe_flow=${sealFlowState(state, key)}`);

    const response = await submitPost(request);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'conflict' }),
    });
  });
});

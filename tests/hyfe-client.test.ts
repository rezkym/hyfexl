import { describe, expect, it, vi } from 'vitest';
import { newFlowState } from '@/lib/flow-state';
import { FlowHttpError } from '@/lib/http';
import { HyfeClient } from '@/lib/hyfe/client';

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
}

describe('HyfeClient', () => {
  it('bootstraps the official session and stores only server-side tokens', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('<html></html>'))
      .mockResolvedValueOnce(new Response('', { headers: { 'set-cookie': 'token=token-value; Path=/; HttpOnly' } }))
      .mockResolvedValueOnce(jsonResponse({ result: { data: { csrfToken: 'csrf-value' } } }));

    const client = new HyfeClient(newFlowState(), fetchMock as typeof fetch);
    const state = await client.bootstrap();

    expect(state).toMatchObject({ token: 'token-value', csrf: 'csrf-value' });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/hyfe-apply/esim-trial'),
      expect.objectContaining({ method: 'GET' }),
    );
    const thirdCall = fetchMock.mock.calls[2];
    expect(thirdCall?.[0]).toEqual(expect.stringContaining('/hyfe/v1/session'));
    expect(new Headers(thirdCall?.[1]?.headers).get('authorization')).toBe('Bearer token-value');
  });

  it('recognizes the Python flow’s known no-match 404 response', async () => {
    const state = { ...newFlowState(), token: 'token', csrf: 'csrf' };
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ statusCode: 404, result: { errorCode: '10' } }, { status: 404 }),
    );

    const result = await new HyfeClient(state, fetchMock as typeof fetch).findNumbers({
      prefix: '6281',
      pattern: '12345',
      pageSize: 40,
    });

    expect(result).toEqual({ candidates: [], noMatch: true, pageNo: 1 });
  });

  it('fails safely when the session endpoint does not return JSON', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('<html></html>'))
      .mockResolvedValueOnce(new Response('', { headers: { 'set-cookie': 'token=token-value; Path=/' } }))
      .mockResolvedValueOnce(new Response('not json', { headers: { 'content-type': 'text/html' } }));

    await expect(new HyfeClient(newFlowState(), fetchMock as typeof fetch).bootstrap()).rejects.toThrow(
      'bukan JSON',
    );
  });

  it('sends final submit only once when the upstream request times out', async () => {
    const state = {
      ...newFlowState(),
      token: 'token',
      csrf: 'csrf',
      tncToken: 'tnc-token',
      consentId: 'consent-id',
    };
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    const fetchMock = vi.fn().mockRejectedValue(timeout);

    await expect(
      new HyfeClient(state, fetchMock as typeof fetch).submit({
        encryptedMsisdn: 'encrypted-msisdn',
        fullName: 'Rezky Maulana',
        whatsapp: '81212345678',
        email: 'rezky@example.com',
        eid: '1'.repeat(32),
        otp: 'A12b34',
        captcha: 'manual-captcha-response',
      }),
    ).rejects.toBeInstanceOf(FlowHttpError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

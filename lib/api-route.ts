import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { getFlowStateKey, openFlowState, sealFlowState, type FlowState } from '@/lib/flow-state';
import { FlowHttpError, toApiError } from '@/lib/http';
import { formatZodIssues } from '@/lib/validation';

const FLOW_COOKIE = 'hyfe_flow';
const COOKIE_MAX_AGE_SECONDS = 20 * 60;

export function flowSuccess(data: Record<string, unknown>, state: FlowState): NextResponse {
  const response = NextResponse.json({ ok: true, data });
  response.cookies.set(FLOW_COOKIE, sealFlowState(state, getFlowStateKey()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}

export function flowSuccessAndClear(data: Record<string, unknown>): NextResponse {
  const response = NextResponse.json({ ok: true, data });
  response.cookies.set(FLOW_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0, sameSite: 'lax' });
  return response;
}

export function flowFailure(error: unknown): NextResponse {
  const apiError = toApiError(error);
  return NextResponse.json(
    { ok: false, error: { code: apiError.code, message: apiError.message } },
    { status: apiError.status },
  );
}

export function readFlowState(request: Request): FlowState {
  const state = openFlowState(readCookie(request.headers.get('cookie'), FLOW_COOKIE), getFlowStateKey());
  if (!state) {
    throw new FlowHttpError('conflict', 'Sesi tidak tersedia atau sudah berakhir. Mulai ulang proses.', 409);
  }
  return state;
}

export async function readValidatedBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw new FlowHttpError('bad_request', 'Isi permintaan tidak valid.', 400);
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new FlowHttpError('bad_request', formatZodIssues(parsed.error.issues), 400);
  }
  return parsed.data;
}

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  const entry = header.split(';').map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : undefined;
}

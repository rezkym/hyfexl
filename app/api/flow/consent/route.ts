import { flowFailure, flowSuccess, readFlowState, readValidatedBody } from '@/lib/api-route';
import { HyfeClient } from '@/lib/hyfe/client';
import { consentSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    const input = await readValidatedBody(request, consentSchema);
    const state = readFlowState(request);
    await new HyfeClient(state).createConsent(input.email);
    return flowSuccess({}, state);
  } catch (error) {
    return flowFailure(error);
  }
}

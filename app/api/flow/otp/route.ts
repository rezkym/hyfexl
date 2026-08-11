import { flowFailure, flowSuccess, readFlowState, readValidatedBody } from '@/lib/api-route';
import { HyfeClient } from '@/lib/hyfe/client';
import { otpRequestSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    const input = await readValidatedBody(request, otpRequestSchema);
    const state = readFlowState(request);
    await new HyfeClient(state).sendOtp(input.email, input.fullName);
    return flowSuccess({}, state);
  } catch (error) {
    return flowFailure(error);
  }
}

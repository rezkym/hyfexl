import { flowFailure, flowSuccess } from '@/lib/api-route';
import { newFlowState } from '@/lib/flow-state';
import { HyfeClient } from '@/lib/hyfe/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  try {
    const state = await new HyfeClient(newFlowState()).bootstrap();
    return flowSuccess({}, state);
  } catch (error) {
    return flowFailure(error);
  }
}

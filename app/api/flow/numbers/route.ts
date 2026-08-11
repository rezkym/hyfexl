import { flowFailure, flowSuccess, readFlowState, readValidatedBody } from '@/lib/api-route';
import { createSelectionId } from '@/lib/flow-state';
import { HyfeClient } from '@/lib/hyfe/client';
import { numberSearchSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    const input = await readValidatedBody(request, numberSearchSchema);
    const state = readFlowState(request);
    const result = await new HyfeClient(state).findNumbers(input);
    const candidates = result.candidates.map((candidate) => ({
      id: createSelectionId(state, candidate.encrypted),
      label: candidate.label,
    }));
    return flowSuccess({ candidates, noMatch: result.noMatch, pageNo: result.pageNo }, state);
  } catch (error) {
    return flowFailure(error);
  }
}

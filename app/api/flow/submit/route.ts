import { flowFailure, flowSuccessAndClear, readFlowState, readValidatedBody } from '@/lib/api-route';
import { HyfeClient } from '@/lib/hyfe/client';
import { summarizeFinal } from '@/lib/hyfe/response';
import { FlowHttpError } from '@/lib/http';
import { finalSubmitSchema, selectionSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const submitSchema = finalSubmitSchema.merge(selectionSchema);

export async function POST(request: Request): Promise<Response> {
  try {
    const input = await readValidatedBody(request, submitSchema);
    const state = readFlowState(request);
    const encryptedMsisdn = state.selections[input.selectionId];
    if (!encryptedMsisdn) {
      throw new FlowHttpError('conflict', 'Pilihan nomor tidak ditemukan pada sesi ini. Cari nomor kembali.', 409);
    }
    const result = await new HyfeClient(state).submit({ ...input, encryptedMsisdn });
    return flowSuccessAndClear(summarizeFinal(result));
  } catch (error) {
    return flowFailure(error);
  }
}

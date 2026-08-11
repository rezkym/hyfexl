export class FlowHttpError extends Error {
  constructor(
    public readonly code: 'bad_request' | 'conflict' | 'upstream' | 'timeout' | 'configuration',
    message: string,
    public readonly status = 502,
  ) {
    super(message);
    this.name = 'FlowHttpError';
  }
}

export function toApiError(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof FlowHttpError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  return {
    status: 500,
    code: 'unexpected',
    message: 'Terjadi masalah tak terduga. Silakan mulai ulang sesi.',
  };
}

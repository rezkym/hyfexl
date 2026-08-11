export class ClientApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ClientApiError';
  }
}

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export async function postFlow<T>(path: string, body: unknown = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
  } catch {
    throw new ClientApiError('network', 'Koneksi ke aplikasi terputus. Periksa internet lalu coba lagi.', 0);
  }

  let payload: ApiEnvelope<T>;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new ClientApiError('invalid_response', 'Aplikasi mengirim respons yang tidak dapat dibaca.', response.status);
  }
  if (!payload.ok) {
    throw new ClientApiError(payload.error.code, payload.error.message, response.status);
  }
  return payload.data;
}

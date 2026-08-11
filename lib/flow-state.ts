import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';

const STATE_VERSION = 1;
const STATE_TTL_MS = 20 * 60 * 1_000;
const ALGORITHM = 'aes-256-gcm';

export type FlowState = {
  version: number;
  expiresAt: number;
  requestId: string;
  upstreamCookies: Record<string, string>;
  token?: string;
  csrf?: string;
  tncToken?: string;
  consentId?: string;
  selections: Record<string, string>;
};

export class FlowStateError extends Error {
  constructor(message = 'Sesi aman tidak dapat digunakan. Mulai ulang proses dari awal.') {
    super(message);
    this.name = 'FlowStateError';
  }
}

export function newFlowState(now = Date.now()): FlowState {
  return {
    version: STATE_VERSION,
    expiresAt: now + STATE_TTL_MS,
    requestId: randomUUID(),
    upstreamCookies: {},
    selections: {},
  };
}

export function createSelectionId(state: FlowState, encryptedNumber: string): string {
  const selectionId = randomUUID();
  state.selections[selectionId] = encryptedNumber;
  return selectionId;
}

export function getFlowStateKey(): string {
  const value = process.env.FLOW_STATE_ENCRYPTION_KEY;
  if (!value) {
    throw new FlowStateError('Konfigurasi sesi aman belum tersedia. Hubungi pengelola aplikasi.');
  }
  return value;
}

function decodeKey(key: string): Buffer {
  const decoded = Buffer.from(key, 'base64');
  if (decoded.length !== 32) {
    throw new FlowStateError('Konfigurasi sesi aman tidak valid. Hubungi pengelola aplikasi.');
  }
  return decoded;
}

export function sealFlowState(state: FlowState, key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, decodeKey(key), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(state), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [STATE_VERSION, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

function isFlowState(value: unknown): value is FlowState {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const state = value as Partial<FlowState>;
  return (
    state.version === STATE_VERSION &&
    typeof state.expiresAt === 'number' &&
    typeof state.requestId === 'string' &&
    Boolean(state.upstreamCookies && typeof state.upstreamCookies === 'object') &&
    Boolean(state.selections && typeof state.selections === 'object')
  );
}

export function openFlowState(token: string | undefined, key: string, now = Date.now()): FlowState | null {
  if (!token) {
    return null;
  }

  try {
    const [version, ivPart, tagPart, encryptedPart, ...rest] = token.split('.');
    if (version !== String(STATE_VERSION) || !ivPart || !tagPart || !encryptedPart || rest.length > 0) {
      return null;
    }
    const decipher = createDecipheriv(ALGORITHM, decodeKey(key), Buffer.from(ivPart, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    const state: unknown = JSON.parse(decrypted);
    return isFlowState(state) && state.expiresAt > now ? state : null;
  } catch {
    return null;
  }
}

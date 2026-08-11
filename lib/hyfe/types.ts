export type JsonObject = Record<string, unknown>;

export type NumberCandidate = {
  encrypted: string;
  label: string;
};

export type FinalSummary = {
  statusCode: unknown;
  resultCode: unknown;
  message: unknown;
};

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

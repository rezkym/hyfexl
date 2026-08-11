import { isJsonObject, type FinalSummary, type NumberCandidate } from './types';

const displayKeys = [
  'msisdn',
  'number',
  'niceNumber',
  'resourceValue',
  'telephoneNumber',
  'displayNumber',
  'value',
] as const;

export function dig(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!isJsonObject(current) || !(key in current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

export function firstValue(value: unknown, ...paths: readonly string[][]): unknown {
  for (const path of paths) {
    const found = dig(value, path);
    if (found !== undefined && found !== null && found !== '' && !(Array.isArray(found) && found.length === 0)) {
      return found;
    }
  }
  return undefined;
}

export function safeExcerpt(value: string, limit = 500): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit)}...`;
}

export function findNumberCandidates(value: unknown): NumberCandidate[] {
  const candidates: NumberCandidate[] = [];
  const seenEncrypted = new Set<string>();
  const seenObjects = new WeakSet<object>();

  const walk = (current: unknown): void => {
    if (Array.isArray(current)) {
      current.forEach(walk);
      return;
    }

    if (!isJsonObject(current) || seenObjects.has(current)) {
      return;
    }
    seenObjects.add(current);

    const encrypted = current.encrypt;
    if (typeof encrypted === 'string' && encrypted && !seenEncrypted.has(encrypted)) {
      const label = displayKeys
        .map((key) => current[key])
        .find((candidate) => candidate !== undefined && candidate !== null && candidate !== '');
      candidates.push({
        encrypted,
        label: label === undefined ? 'nomor tanpa label' : String(label),
      });
      seenEncrypted.add(encrypted);
    }

    Object.values(current).forEach(walk);
  };

  walk(value);
  return candidates;
}

export function summarizeFinal(value: unknown): FinalSummary {
  if (!isJsonObject(value)) {
    return { statusCode: undefined, resultCode: undefined, message: undefined };
  }
  return {
    statusCode: value.statusCode,
    resultCode: firstValue(value, ['result', 'data', 'result', 'resultCode'], ['result', 'data', 'resultCode']),
    message: firstValue(value, ['result', 'data', 'message'], ['result', 'message'], ['message']),
  };
}

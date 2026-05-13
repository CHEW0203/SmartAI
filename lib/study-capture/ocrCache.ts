import { createHash } from "crypto";

type CacheEntry = {
  payload: unknown;
  expires: number;
};

const MAX = 64;
const TTL_MS = 15 * 60 * 1000;

const store = new Map<string, CacheEntry>();

export function hashOcrText(text: string): string {
  return createHash("sha256").update(text.trim(), "utf8").digest("hex");
}

export function getCached<T>(key: string): T | undefined {
  const e = store.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expires) {
    store.delete(key);
    return undefined;
  }
  return e.payload as T;
}

export function setCached(key: string, payload: unknown): void {
  if (store.size >= MAX) {
    const first = store.keys().next().value as string | undefined;
    if (first) store.delete(first);
  }
  store.set(key, { payload, expires: Date.now() + TTL_MS });
}

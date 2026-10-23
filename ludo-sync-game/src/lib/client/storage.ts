/** Versioned, failure-tolerant localStorage. Private windows and full disks must never break the game. */
const PREFIX = "ludo-sync:v1:";

export const readJSON = <T,>(key: string, fallback: T): T => {
  try {
    const raw = globalThis.localStorage?.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

export const writeJSON = (key: string, value: unknown): boolean => {
  try {
    globalThis.localStorage?.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

export const removeKey = (key: string) => {
  try { globalThis.localStorage?.removeItem(PREFIX + key); } catch { /* ignore */ }
};

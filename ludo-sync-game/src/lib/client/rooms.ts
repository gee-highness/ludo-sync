import { isRoomCode } from "../net/crypto";
import { cleanText } from "../net/protocol";
import { parseHostResume, type HostResume } from "../net/resume";
import { readJSON, removeKey, writeJSON } from "./storage";

/** The online room this device was last in, so it can be rejoined (guest) or opened again (host). */
export interface RoomRecord {
  role: "host" | "guest";
  code: string;
  /** The name used in the room. */
  name: string;
  savedAt: number;
  /** Host only: everything needed to open the room again. */
  host?: HostResume;
}

const KEY = "room";

export const saveRoomRecord = (rec: Omit<RoomRecord, "savedAt"> & { savedAt?: number }): boolean =>
  writeJSON(KEY, { ...rec, savedAt: rec.savedAt ?? Date.now() });

export const clearRoomRecord = () => removeKey(KEY);

/** The saved room if it is well-formed and recent enough; anything else is deleted and gives null. */
export const loadRoomRecord = (maxAgeMs = 6 * 3600e3, now = Date.now()): RoomRecord | null => {
  const raw = readJSON<unknown>(KEY, null);
  if (raw === null) return null;
  const bad = () => { clearRoomRecord(); return null; };
  if (typeof raw !== "object" || Array.isArray(raw)) return bad();
  const r = raw as Record<string, unknown>;
  if (r.role !== "host" && r.role !== "guest") return bad();
  if (typeof r.code !== "string" || !isRoomCode(r.code)) return bad();
  if (typeof r.name !== "string" || typeof r.savedAt !== "number" || !Number.isFinite(r.savedAt)) return bad();
  if (now - r.savedAt > maxAgeMs || r.savedAt > now + 60_000) return bad();
  const name = cleanText(r.name, "Player");
  if (r.role === "guest") return { role: "guest", code: r.code, name, savedAt: r.savedAt };
  const host = parseHostResume(r.host);
  if (!host || host.code !== r.code) return bad();
  return { role: "host", code: r.code, name, savedAt: r.savedAt, host };
};

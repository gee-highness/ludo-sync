import { useSyncExternalStore } from "react";
import { readJSON, writeJSON } from "../client/storage";

export interface SkipBoPrefs {
  back: string;
  felt: string;
  /** Shapes on the cards as well as colours, for people who cannot tell the colours apart. */
  marks: boolean;
  /** Bigger cards on the flat table. */
  large: boolean;
}

export const DEFAULT_PREFS: SkipBoPrefs = { back: "classic", felt: "green", marks: false, large: false };

const clean = (r: Partial<SkipBoPrefs> | null | undefined): SkipBoPrefs => ({
  back: typeof r?.back === "string" && /^[a-z]{2,16}$/.test(r.back) ? r.back : DEFAULT_PREFS.back,
  felt: typeof r?.felt === "string" && /^[a-z]{2,16}$/.test(r.felt) ? r.felt : DEFAULT_PREFS.felt,
  marks: r?.marks === true,
  large: r?.large === true,
});

let current: SkipBoPrefs | null = null;
const listeners = new Set<() => void>();
const load = (): SkipBoPrefs => (current ??= clean(readJSON<Partial<SkipBoPrefs> | null>("skipbo-prefs", null)));
const server: SkipBoPrefs = DEFAULT_PREFS;

export const getPrefs = load;
export const updatePrefs = (patch: Partial<SkipBoPrefs>) => {
  current = clean({ ...load(), ...patch });
  writeJSON("skipbo-prefs", current);
  listeners.forEach(l => l());
};
export const usePrefs = (): SkipBoPrefs => useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, load, () => server);
export { clean as cleanPrefs };

import { describe, expect, it } from "vitest";

describe("calm preset", () => {
  it("is made only of real, valid settings", async () => {
    const { CALM_PRESET, sanitizeSettings, DEFAULT_SETTINGS } = await import("./settings");
    const merged = sanitizeSettings({ ...DEFAULT_SETTINGS, ...CALM_PRESET });
    for (const [k, v] of Object.entries(CALM_PRESET)) expect((merged as unknown as Record<string, unknown>)[k]).toEqual(v);
  });
});
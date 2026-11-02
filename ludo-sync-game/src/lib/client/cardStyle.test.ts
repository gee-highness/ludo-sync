import { describe, expect, it } from "vitest";
import { DEFAULT_CARD_STYLE, decodeCardStyle, encodeCardStyle, sanitizeCardStyle } from "./cardStyle";

describe("card style", () => {
  it("falls back to the standard deck for anything unknown", () => {
    expect(sanitizeCardStyle(null)).toEqual(DEFAULT_CARD_STYLE);
    expect(sanitizeCardStyle("nope")).toEqual(DEFAULT_CARD_STYLE);
    const s = sanitizeCardStyle({ back: { design: "bogus", primary: "red", scale: 99, monogram: "<script>" }, court: { style: 4, accent: "#12", chars: { 11: "<b>", 12: "x".repeat(40) } }, faces: { fourColour: "yes" } });
    expect(s.back.design).toBe(DEFAULT_CARD_STYLE.back.design);
    expect(s.back.primary).toBe(DEFAULT_CARD_STYLE.back.primary);
    expect(s.back.scale).toBe(1.6);
    expect(s.back.monogram).toBe("sc");
    expect(s.court.chars[11]).toBe(DEFAULT_CARD_STYLE.court.chars[11]);
    expect(s.court.chars[12]).toBe(DEFAULT_CARD_STYLE.court.chars[12]);
    expect(s.faces.fourColour).toBe(false);
  });
  it("keeps valid choices", () => {
    const s = sanitizeCardStyle({ back: { design: "mandala", primary: "#112233", secondary: "#ABCDEF", ornament: "moon", border: "ornate", monogram: "G", scale: 1.2 }, court: { style: "characters", mirror: false, chars: { 13: "🐉" } }, faces: { fourColour: true, largeIndex: true, paper: "#fffbeb" } });
    expect(s.back).toMatchObject({ design: "mandala", primary: "#112233", secondary: "#abcdef", ornament: "moon", border: "ornate", monogram: "G", scale: 1.2 });
    expect(s.court).toMatchObject({ style: "characters", mirror: false });
    expect(s.court.chars[13]).toBe("🐉");
    expect(s.faces).toEqual({ fourColour: true, largeIndex: true, paper: "#fffbeb" });
  });
  it("round-trips through a share code, and rejects rubbish", () => {
    const s = sanitizeCardStyle({ back: { design: "waves", monogram: "Z" }, court: { chars: { 11: "🦊" } } });
    expect(decodeCardStyle(encodeCardStyle(s))).toEqual(s);
    expect(decodeCardStyle("not a code")).toBeNull();
    expect(decodeCardStyle(encodeCardStyle(DEFAULT_CARD_STYLE))).toEqual(DEFAULT_CARD_STYLE);
  });
});

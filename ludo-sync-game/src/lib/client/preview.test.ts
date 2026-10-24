import { describe, expect, it } from "vitest";
import { pointOf } from "../ludo/board";
import type { MoveOption } from "../ludo/types";
import { previewPath } from "./preview";

const opt = (from: number, to: number, token = 0, die = to - from): MoveOption => ({ token, die, from, to, captures: false, finishes: false, entersBoard: from === -1 });

describe("move preview", () => {
  it("puts a dot on every square crossed and marks the landing square", () => {
    const p = previewPath(0, opt(10, 14));
    expect(p.dots).toHaveLength(3);
    expect(p.dots[0]).toEqual(pointOf(0, 0, 11));
    expect(p.end).toEqual(pointOf(0, 0, 14));
  });
  it("has no dots for a single step or for leaving the yard", () => {
    expect(previewPath(1, opt(5, 6)).dots).toHaveLength(0);
    const out = previewPath(2, opt(-1, 0));
    expect(out.dots).toHaveLength(0);
    expect(out.end).toEqual(pointOf(2, 0, 0));
  });
  it("follows the home column to the centre", () => {
    const p = previewPath(3, opt(54, 57));
    expect(p.dots).toHaveLength(2);
    expect(p.end).toEqual(pointOf(3, 0, 57));
  });
});

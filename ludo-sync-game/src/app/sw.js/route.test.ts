import { describe, expect, it } from "vitest";
import { Script } from "node:vm";
import { GET } from "./route";

describe("the service worker", () => {
  it("is valid JavaScript and stores every page of the app", async () => {
    const body = await GET().text();
    expect(() => new Script(body)).not.toThrow();
    for (const page of ["/", "/ludo", "/play", "/online", "/nearby", "/garage", "/pieces", "/island", "/profile", "/skipbo", "/skipbo/play", "/skipbo/online", "/skipbo/nearby", "/skipbo/learn"]) {
      expect(body, page).toContain(`"${page}"`);
    }
    expect(body).toContain("OFFLINE_STATUS");
    expect(body).toContain("OFFLINE_CHECK");
  });
});

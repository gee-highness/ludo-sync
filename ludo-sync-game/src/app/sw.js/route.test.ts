import { describe, expect, it } from "vitest";
import { Script } from "node:vm";
import { readdirSync } from "node:fs";
import path from "node:path";
import { GET } from "./route";

/** Every fixed screen of the app (a folder with a page.tsx and no [bracket] in its path). */
const screens = (dir = path.join(process.cwd(), "src", "app"), url = ""): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    if (e.isDirectory()) return e.name.startsWith("[") || e.name.startsWith("api") || e.name === "sw.js" ? [] : screens(path.join(dir, e.name), `${url}/${e.name}`);
    return e.name === "page.tsx" ? [url || "/"] : [];
  });

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

  it("stores every screen that exists, so none falls back to the home screen offline", async () => {
    const body = await GET().text();
    const found = screens();
    expect(found.length).toBeGreaterThan(10);
    for (const page of found) expect(body, page).toContain(`"${page}"`);
  });
});

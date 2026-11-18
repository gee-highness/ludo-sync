// Copies the static bundle (../out, made by `npm run build:native`) into ./app for packaging.
import { cpSync, existsSync, rmSync } from "node:fs";
if (!existsSync("../out/index.html")) throw new Error("Run `npm run build:native` in the project folder first (it makes ../out).");
rmSync("app", { recursive: true, force: true });
cpSync("../out", "app", { recursive: true });
console.log("bundle copied to desktop/app");

// Builds the app as plain files (out/) for the Android app, then copies them into the Android project.
// A static export has no server, so the server-only routes (the pairing/mailbox API and the service worker) are set aside while it builds.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";

const SET_ASIDE = ["src/app/api", "src/app/sw.js"];
const STASH = ".native-stash";
const run = (cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", env: { ...process.env, ...env }, shell: process.platform === "win32" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed`);
};

// the deployed site that answers pairing and the friends mailbox; the games themselves never need it
process.env.NEXT_PUBLIC_API_BASE ??= "https://gss-ludo-sync.vercel.app";

mkdirSync(STASH, { recursive: true });
const moved = [];
try {
  for (const p of SET_ASIDE) if (existsSync(p)) { renameSync(p, `${STASH}/${p.replaceAll("/", "__")}`); moved.push(p); }
  rmSync("out", { recursive: true, force: true });
  run("npx", ["next", "build"], { BUILD_TARGET: "capacitor", NEXT_TELEMETRY_DISABLED: "1" });
} finally {
  for (const p of moved) renameSync(`${STASH}/${p.replaceAll("/", "__")}`, p);
  rmSync(STASH, { recursive: true, force: true });
}
if (!existsSync("android")) run("npx", ["cap", "add", "android"]);
run("npx", ["cap", "sync", "android"]);

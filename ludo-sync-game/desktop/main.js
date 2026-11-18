// Ludo Sync for desktop: the same bundle as the Android app (every game works offline) in a window.
const { app, BrowserWindow, protocol, net, shell, session } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

const ROOT = path.join(__dirname, "app");
const SCHEME = "ludosync";

// a standard, secure origin so storage, camera and WebRTC behave as they do on the web
protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

/** Maps a URL path to a file in the bundle: exact file, then folder index, then the page's own .html, then the home page. */
const resolve = (pathname) => {
  const clean = path.normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "");
  const abs = path.join(ROOT, clean);
  if (!abs.startsWith(ROOT)) return path.join(ROOT, "index.html"); // never leave the bundle
  for (const c of [abs, path.join(abs, "index.html"), `${abs}.html`]) {
    try { if (fs.statSync(c).isFile()) return c; } catch { /* next */ }
  }
  const missing = path.join(ROOT, "404.html");
  return fs.existsSync(missing) ? missing : path.join(ROOT, "index.html");
};

const create = () => {
  const win = new BrowserWindow({
    width: 1100, height: 800, minWidth: 360, minHeight: 560, backgroundColor: "#0b1020", title: "Ludo Sync", autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, preload: path.join(__dirname, "preload.js") },
  });
  win.loadURL(`${SCHEME}://app/`);
  // links to other sites open in the browser, never inside the game window
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) void shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(`${SCHEME}://`)) { e.preventDefault(); if (/^https?:/.test(url)) void shell.openExternal(url); } });
};

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { const [w] = BrowserWindow.getAllWindows(); if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
  app.whenReady().then(() => {
    protocol.handle(SCHEME, (req) => net.fetch(pathToFileURL(resolve(new URL(req.url).pathname)).toString()));
    // camera is used to scan pairing QR codes; nothing else is asked for
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === "media"));
    create();
    app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) create(); });
  });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}

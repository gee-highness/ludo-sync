/** The Android app loads from https://localhost (Capacitor) and calls these endpoints on the deployed site, so they must answer cross-origin. */
const ALLOWED = new Set(["https://localhost", "capacitor://localhost", "http://localhost"]);

export const withCors = (req: Request, res: Response): Response => {
  const origin = req.headers.get("origin");
  if (origin && ALLOWED.has(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Vary", "Origin");
  }
  return res;
};

export const preflight = (req: Request): Response =>
  withCors(req, new Response(null, { status: 204, headers: { "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" } }));

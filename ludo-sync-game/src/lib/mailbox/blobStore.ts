import { del, get, list, put } from "@vercel/blob";
import type { MailStore } from "./server";

/** The mailbox kept in a private Vercel Blob store. Needs the BLOB_READ_WRITE_TOKEN that comes with creating the store. */
export const blobConfigured = () => !!process.env.BLOB_READ_WRITE_TOKEN;

export const blobMailStore = (): MailStore => ({
  put: async (path, data) => { await put(path, data, { access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json", cacheControlMaxAge: 60 }); },
  get: async path => {
    try {
      const r = await get(path, { access: "private", useCache: false });
      return r && r.statusCode === 200 ? await new Response(r.stream).text() : null;
    } catch { return null; }
  },
  list: async prefix => (await list({ prefix, limit: 100 })).blobs.map(b => ({ path: b.pathname, url: b.url })),
  del: async urls => { if (urls.length) await del(urls); },
});

/** Photo mode: a picture of the board, saved or shared. The 3D board registers a way to read its canvas; the flat board is an SVG. */
type Snapshot = () => string | null;
let snapshotter: Snapshot | null = null;
export const registerSnapshot = (fn: Snapshot | null) => { snapshotter = fn; };

/** Width and height for a picture of a box of this shape, at this width. */
export const sizeFor = (box: { w: number; h: number }, width: number): { w: number; h: number } => {
  const w = Math.max(64, Math.round(width));
  return { w, h: Math.max(64, Math.round((w * box.h) / Math.max(1, box.w))) };
};

export const photoName = (when = new Date()): string => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `ludo-sync-${when.getFullYear()}${p(when.getMonth() + 1)}${p(when.getDate())}-${p(when.getHours())}${p(when.getMinutes())}${p(when.getSeconds())}.png`;
};

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error("image")); img.src = src; });

const flatBoard = (): SVGSVGElement | null => document.querySelector('svg[aria-label="Ludo board"]');

/** The board as a PNG, with an optional line of text underneath (such as who won). Null if there is no board to photograph. */
export const boardPhoto = async (caption?: string, width = 1080): Promise<Blob | null> => {
  let source: HTMLImageElement | null = null;
  const svg = flatBoard();
  const snap = snapshotter?.() ?? null;
  try {
    if (snap) source = await loadImage(snap);
    else if (svg) {
      const vb = (svg.getAttribute("viewBox") ?? "0 0 15 15").split(/\s+/).map(Number);
      const clone = svg.cloneNode(true) as SVGSVGElement;
      const size = sizeFor({ w: vb[2] || 15, h: vb[3] || 15 }, width);
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("width", String(size.w));
      clone.setAttribute("height", String(size.h));
      clone.removeAttribute("style");
      clone.setAttribute("font-family", "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif");
      clone.querySelectorAll("[role=button]").forEach(el => el.removeAttribute("tabindex"));
      const text = new XMLSerializer().serializeToString(clone);
      source = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`);
    }
  } catch { return null; }
  if (!source) return null;
  const w = width, h = Math.round((source.height * w) / Math.max(1, source.width));
  const bar = caption ? Math.round(w * 0.13) : Math.round(w * 0.06);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h + bar;
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#1a1a1a"; g.fillRect(0, 0, w, h + bar);
  g.drawImage(source, 0, 0, w, h);
  g.textAlign = "center"; g.textBaseline = "middle";
  if (caption) {
    g.fillStyle = "#fff"; g.font = `800 ${Math.round(bar * 0.42)}px system-ui, sans-serif`;
    g.fillText(caption.slice(0, 40), w / 2, h + bar * 0.4);
    g.fillStyle = "#a3a3a3"; g.font = `600 ${Math.round(bar * 0.22)}px system-ui, sans-serif`;
    g.fillText("Ludo Sync", w / 2, h + bar * 0.78);
  } else {
    g.fillStyle = "#a3a3a3"; g.font = `600 ${Math.round(bar * 0.45)}px system-ui, sans-serif`;
    g.fillText("Ludo Sync", w / 2, h + bar / 2);
  }
  return new Promise(resolve => canvas.toBlob(b => resolve(b), "image/png"));
};

export type PhotoOutcome = "shared" | "saved" | "failed";

/** Takes the photo, then opens the share sheet where there is one, or saves the file. */
export const sharePhoto = async (caption?: string): Promise<PhotoOutcome> => {
  const blob = await boardPhoto(caption);
  if (!blob) return "failed";
  const file = new File([blob], photoName(), { type: "image/png" });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: "Ludo Sync", text: caption }); return "shared"; }
  } catch (e) { if ((e as Error).name === "AbortError") return "shared"; }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "saved";
};

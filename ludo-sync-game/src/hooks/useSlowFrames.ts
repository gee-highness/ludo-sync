"use client";

import { useEffect, useState } from "react";

/**
 * Watches the real frame rate and reports true once it has stayed poor for a while (sticky until the page reloads),
 * so decoration can switch itself off and leave the game smooth. Idle pages and hidden tabs are not counted.
 */
export const useSlowFrames = (active: boolean, minFps = 20, windows = 2): boolean => {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active || slow) return;
    let raf = 0, frames = 0, start = 0, bad = 0, lastSeen = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      // a long gap means the tab was hidden or the page was idle, not that rendering is slow
      if (lastSeen && now - lastSeen > 500) { frames = 0; start = now; }
      lastSeen = now;
      if (!start) start = now;
      frames++;
      if (now - start >= 4000) {
        const fps = (frames * 1000) / (now - start);
        bad = fps < minFps ? bad + 1 : 0;
        if (bad >= windows) { setSlow(true); return; }
        frames = 0; start = now;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, slow, minFps, windows]);
  return slow;
};

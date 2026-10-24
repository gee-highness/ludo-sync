"use client";

import { useEffect, useRef } from "react";

/**
 * Stops a game being left by accident. The browser's Back button, a swipe-back gesture or a hardware back key
 * is turned into `onAttempt` (which should ask the person to confirm), and, if asked, closing or reloading the
 * tab shows the browser's own "leave site?" prompt.
 */
export const useLeaveGuard = (active: boolean, onAttempt: () => void, warnOnUnload = false) => {
  const attempt = useRef(onAttempt);
  attempt.current = onAttempt;
  useEffect(() => {
    if (!active) return;
    // one extra history entry that Back can consume instead of leaving the page
    // reuse the router's own history state so Next treats the extra entry as its own and does not reload the page
    const push = () => window.history.pushState(window.history.state, "", window.location.href);
    push();
    const onPop = (e: PopStateEvent) => {
      // handled here: the router must not also act on this Back press
      e.stopImmediatePropagation();
      push();
      attempt.current();
    };
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("popstate", onPop, true);
    if (warnOnUnload) window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("popstate", onPop, true);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [active, warnOnUnload]);
};

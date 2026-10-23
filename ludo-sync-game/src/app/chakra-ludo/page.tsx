"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

/** Old links and home-screen shortcuts pointed here; send them to the new play screen. */
function Redirect() {
  const router = useRouter();
  const mode = useSearchParams().get("mode");
  useEffect(() => {
    router.replace(mode === "local-friends" ? "/play?preset=local&quick=1" : mode === "play-with-bot" ? "/play?preset=bot&quick=1" : "/");
  }, [mode, router]);
  return null;
}

export default function LegacyLudo() {
  return (
    <Suspense fallback={null}>
      <Redirect />
    </Suspense>
  );
}

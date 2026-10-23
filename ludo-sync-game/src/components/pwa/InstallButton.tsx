"use client";

import { Button } from "@chakra-ui/react";
import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Offers to install the app once the browser says it can. Hidden when already installed. */
export const InstallButton = () => {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setEvent(e as InstallPromptEvent); };
    const onInstalled = () => setEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  if (!event) return null;
  return (
    <Button
      variant="outline" colorScheme="green" size="lg" w="100%"
      onClick={async () => { await event.prompt(); await event.userChoice; setEvent(null); }}
    >
      Install app for offline play
    </Button>
  );
};

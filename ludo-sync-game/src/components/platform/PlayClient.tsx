"use client";

import { Button, Center, Heading, Spinner, Text, VStack } from "@chakra-ui/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getSettings } from "@/lib/client/settings";
import { readJSON } from "@/lib/client/storage";
import { loadModule } from "@/lib/platform/registry";
import type { GameModule } from "@/lib/platform/types";
import { BG } from "./Shell";
import { TableFrame } from "./TableFrame";
import { loadSaved, saveKey, setupKey, type LocalSetup, useLocalTable } from "./useLocalTable";
import { writeJSON } from "@/lib/client/storage";

function LocalTable({ mod, initial, onExit }: { mod: GameModule; initial: Parameters<typeof useLocalTable>[1]; onExit: () => void }) {
  const hotseat = "setup" in initial ? initial.setup.hotseat : initial.resume.hotseat;
  const t = useLocalTable(mod, initial, getSettings().speed);
  return (
    <>
      <TableFrame mod={mod} base={t.base} view={t.view} rules={t.rules} frame={t.frame} log={t.log} act={t.act} title={hotseat ? `${mod.driver.name} · pass and play` : mod.driver.name}
        onExit={onExit} onRematch={t.rematch} award={t.award} />
      {t.covered && (
        <Center position="fixed" inset={0} zIndex={100} bg={BG} color="white" p={6} role="dialog" aria-modal="true" aria-label={`Pass the device to ${t.coverName}`}>
          <VStack spacing={4} textAlign="center" maxW="360px">
            <Text fontSize="5xl" aria-hidden>🤫</Text>
            <Heading size="lg">Pass to {t.coverName}</Heading>
            <Text color="whiteAlpha.800">Hand the device over. Nobody else should look at the screen. What you hold is hidden until you tap.</Text>
            <Button colorScheme="yellow" size="lg" w="100%" onClick={t.uncover}>I am {t.coverName}: show my turn</Button>
          </VStack>
        </Center>
      )}
    </>
  );
}

export default function PlayClient({ gameId }: { gameId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [state, setState] = useState<{ mod: GameModule; initial: Parameters<typeof useLocalTable>[1] } | "none" | null>(null);

  useEffect(() => {
    void (async () => {
      const mod = await loadModule(gameId);
      if (!mod) { setState("none"); return; }
      if (params.get("resume") === "1") {
        const saved = loadSaved(gameId);
        if (saved) { try { setState({ mod, initial: { resume: saved } }); return; } catch { /* fall through to the menu */ } }
        router.replace(`/g/${gameId}`);
        return;
      }
      const setup = readJSON<LocalSetup | null>(setupKey(gameId), null);
      if (!setup || !Array.isArray(setup.seats) || setup.seats.length < mod.driver.minPlayers || setup.seats.length > mod.driver.maxPlayers) { router.replace(`/g/${gameId}`); return; }
      window.history.replaceState(null, "", `/g/${gameId}/play?resume=1`); // the address only, so it works with no connection
      writeJSON(saveKey(gameId), null);
      setState({ mod, initial: { setup } });
    })();
    // read once, when the screen opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "none") return <Center minH="100dvh" bg={BG} color="white"><Text>That game does not exist.</Text></Center>;
  if (!state) return <Center minH="100dvh" bg={BG}><Spinner color="white" size="xl" /></Center>;
  return <LocalTable mod={state.mod} initial={state.initial} onExit={() => router.push(`/g/${gameId}`)} />;
}

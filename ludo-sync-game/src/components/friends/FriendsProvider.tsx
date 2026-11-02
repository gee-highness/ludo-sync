"use client";

import { Badge, Box, Button, HStack, Text, VStack } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { sound } from "@/lib/client/audio";
import { getSettings } from "@/lib/client/settings";
import { FriendsService, type FriendsSnapshot } from "@/lib/friends/service";
import { gameName, joinPathFor } from "@/lib/friends/routes";
import { deviceStore, loadMyCode } from "@/lib/friends/store";
import { MailboxClient, fetchMailApi } from "@/lib/mailbox/client";
import { PeerNetwork } from "@/lib/net/peerTransport";

interface Ctx { service: FriendsService | null; snap: FriendsSnapshot | null }
const FriendsContext = createContext<Ctx>({ service: null, snap: null });
export const useFriends = () => useContext(FriendsContext);

const OFFLINE_SNAPSHOT: FriendsSnapshot | null = null;

/** Keeps this device reachable by friends while the app is open, and shows invites and friend requests wherever you are in the app. */
export function FriendsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ctx, setCtx] = useState<Ctx>({ service: null, snap: OFFLINE_SNAPSHOT });
  const announced = useRef(new Set<string>());

  useEffect(() => {
    const mailbox = new MailboxClient(fetchMailApi(), deviceStore, loadMyCode(deviceStore));
    const service = new FriendsService({ network: new PeerNetwork(), store: deviceStore, name: () => getSettings().playerName, mailbox });
    setCtx({ service, snap: service.getSnapshot() });
    const off = service.subscribe(snap => setCtx({ service, snap }));
    void service.start();
    // coming back online, or back to the app, makes sure we are listening again
    const wake = () => { if (navigator.onLine && service.getSnapshot().status !== "ready" && service.getSnapshot().status !== "connecting") void service.start(); };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => { off(); window.removeEventListener("online", wake); document.removeEventListener("visibilitychange", wake); service.stop(); };
  }, []);

  const { service, snap } = ctx;

  // a sound, and a system notification when the app is in the background
  useEffect(() => {
    if (!snap) return;
    for (const i of snap.invites) {
      if (announced.current.has(i.id)) continue;
      announced.current.add(i.id);
      sound.play("turn");
      if (typeof document !== "undefined" && document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
        try { const n = new Notification(`${i.name} invites you to play ${gameName(i.game)}`, { tag: i.id, body: "Tap to join" }); n.onclick = () => { window.focus(); const p = joinPathFor(i.game, i.room); if (p) router.push(p); n.close(); }; } catch { /* notifications blocked */ }
      }
    }
    for (const r of snap.requests) if (!announced.current.has(`r${r.code}${r.at}`)) { announced.current.add(`r${r.code}${r.at}`); sound.play("turn"); }
  }, [snap, router]);

  const invites = snap?.invites.slice(0, 2) ?? [];
  const requests = snap?.requests.slice(0, 1) ?? [];

  return (
    <FriendsContext.Provider value={ctx}>
      {children}
      {(invites.length > 0 || requests.length > 0) && service && (
        <VStack position="fixed" top="max(8px, env(safe-area-inset-top))" left={2} right={2} zIndex={2000} spacing={2} pointerEvents="none" role="region" aria-label="Friends">
          {invites.map(i => {
            const path = joinPathFor(i.game, i.room);
            return (
              <Box key={i.id} pointerEvents="auto" w="100%" maxW="460px" bg="gray.800" color="white" borderRadius="xl" p={3} border="2px solid #eab308" boxShadow="0 8px 24px rgba(0,0,0,.5)" role="alert">
                <Text fontWeight={800}>{i.name} invites you to play {gameName(i.game)}</Text>
                {Date.now() - i.sentAt > 120_000 && <Text fontSize="xs" color="gray.400">Sent {Math.round((Date.now() - i.sentAt) / 60_000)} minutes ago: the room may have closed</Text>}
                <HStack mt={2}>
                  <Button size="sm" colorScheme="yellow" isDisabled={!path} onClick={() => { service.dismissInvite(i.id); if (path) router.push(path); }}>Join now</Button>
                  <Button size="sm" variant="ghost" color="white" onClick={() => service.dismissInvite(i.id)}>Not now</Button>
                </HStack>
              </Box>
            );
          })}
          {requests.map(r => (
            <Box key={r.code} pointerEvents="auto" w="100%" maxW="460px" bg="gray.800" color="white" borderRadius="xl" p={3} border="2px solid #38bdf8" boxShadow="0 8px 24px rgba(0,0,0,.5)" role="alert">
              <Text fontWeight={800}>{r.name} wants to be your friend</Text>
              <Text fontSize="xs" color="gray.400">Check digits <Badge fontFamily="mono">{r.check}</Badge> (they see the same six)</Text>
              <HStack mt={2}>
                <Button size="sm" colorScheme="blue" onClick={() => void service.acceptRequest(r.code)}>Accept</Button>
                <Button size="sm" variant="ghost" color="white" onClick={() => service.declineRequest(r.code)}>Decline</Button>
                <Button size="sm" variant="ghost" color="red.200" onClick={() => service.block(r.code)}>Block</Button>
              </HStack>
            </Box>
          ))}
        </VStack>
      )}
    </FriendsContext.Provider>
  );
}

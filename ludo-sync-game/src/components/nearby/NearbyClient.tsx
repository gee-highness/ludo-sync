"use client";

import {
  Box, Button, Center, Drawer, DrawerBody, DrawerCloseButton, DrawerContent, DrawerHeader, DrawerOverlay, Flex, Heading, HStack, IconButton, Input,
  Modal, ModalBody, ModalContent, ModalHeader, ModalOverlay, Spinner, Text, VStack, useDisclosure,
} from "@chakra-ui/react";
import { ChevronLeftIcon } from "@chakra-ui/icons";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { cleanName } from "@/lib/ludo/engine";
import { getSettings, updateSettings } from "@/lib/client/settings";
import { ManualNetwork, webRtcAvailable } from "@/lib/net/manualTransport";
import { extractSignalText } from "@/lib/net/offerCodec";
import { useGuestClient, useHostSession, usePaletteSync, usePieceSync } from "../online/hooks";
import { Lobby } from "../online/Lobby";
import OnlineGame from "../online/OnlineGame";
import { ConnectionTips, HostInvites } from "./HostInvites";
import { GuestPairing } from "./GuestPairing";

const TITLE = "Nearby game";

const Shell = ({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) => (
  <Flex minH="100dvh" bg="#303030" color="white" justify="center" px={4} pt="max(12px, env(safe-area-inset-top))" pb="max(16px, env(safe-area-inset-bottom))">
    <VStack w="100%" maxW="460px" spacing={4} align="stretch">
      <HStack>
        <IconButton aria-label="Back" icon={<ChevronLeftIcon boxSize={6} />} variant="ghost" color="white" onClick={onBack} />
        <Heading size="md">{title}</Heading>
      </HStack>
      {children}
    </VStack>
  </Flex>
);

const Notice = ({ title, text, onBack }: { title: string; text: string; onBack: () => void }) => (
  <Shell title="Play nearby" onBack={onBack}>
    <VStack bg="whiteAlpha.100" borderRadius="xl" p={6} spacing={3} textAlign="center">
      <Heading size="md">{title}</Heading>
      <Text color="gray.300">{text}</Text>
      <Button colorScheme="teal" onClick={onBack}>Back to menu</Button>
    </VStack>
  </Shell>
);

function HostFlow({ name, onExit }: { name: string; onExit: () => void }) {
  const [network] = useState(() => new ManualNetwork());
  const invites = useDisclosure();
  const { session, snap, endRoom } = useHostSession(name, getSettings().rules, undefined, { network, persist: false });
  usePieceSync(snap?.room ?? null, session ? d => session.setPieces(d) : undefined);
  usePaletteSync(snap?.room ?? null, session ? c => session.setColors(c) : undefined);
  const leave = useCallback(() => { network.desk.close(); onExit(); }, [network, onExit]);

  if (!session || !snap || snap.status === "opening") {
    return <Center minH="100dvh" bg="#303030"><VStack color="white"><Spinner size="xl" /><Text>Getting ready…</Text></VStack></Center>;
  }
  if (snap.status === "error") return <Notice title="Could not start" text={snap.error ?? "Try again."} onBack={leave} />;
  if (snap.status === "closed") return <Notice title="Game closed" text="This game is no longer open." onBack={leave} />;

  const room = snap.room;
  const state = room.state;
  if (room.phase === "playing" && state) {
    return (
      <>
        <OnlineGame
          room={room} state={state} bus={session.bus} act={session.act} isHost onExit={leave} onForfeit={() => { endRoom(); leave(); }}
          onReaction={cb => session.onReaction(cb)} sendReaction={e => session.sendReaction(e)}
          chat={{ items: snap.chat, onSend: t => session.sendChat(t) }}
          onRematch={state.phase === "over" ? session.rematch : undefined}
          title={TITLE}
          headerAction={<Button size="xs" colorScheme="cyan" onClick={invites.onOpen} aria-label="Invite or reconnect a player">Invite</Button>}
        />
        <Drawer isOpen={invites.isOpen} onClose={invites.onClose} placement="right" size="sm">
          <DrawerOverlay />
          <DrawerContent bg="gray.800" color="white">
            <DrawerCloseButton />
            <DrawerHeader>Invite or reconnect a player</DrawerHeader>
            <DrawerBody pb={8}><HostInvites desk={network.desk} /></DrawerBody>
          </DrawerContent>
        </Drawer>
      </>
    );
  }
  return (
    <Shell title="Your nearby game" onBack={leave}>
      <Lobby
        room={room}
        invite={<HostInvites desk={network.desk} ready={snap.status === "ready"} />}
        host={{
          setSlot: (s, k, l) => session.setSlot(s, k, l), kick: s => session.kick(s), setRules: r => session.setRules(r),
          setTurnMs: ms => session.setTurnMs(ms), start: () => session.start(), canStart: session.canStart(), members: snap.members,
        }}
        chat={{ items: snap.chat, onSend: t => session.sendChat(t) }}
      />
    </Shell>
  );
}

function GuestFlow({ name, note, onExit }: { name: string; note?: string; onExit: () => void }) {
  const [network] = useState(() => new ManualNetwork());
  const { client, snap, quitForGood } = useGuestClient("NEARBY", name, false, { network, persist: false });
  usePieceSync(snap?.room ?? null, client ? d => client.setPieces(d) : undefined);
  usePaletteSync(snap?.room ?? null, client ? c => client.setColors(c) : undefined);
  const leave = useCallback(() => { network.desk.close(); onExit(); }, [network, onExit]);

  if (!client || !snap) return <Center minH="100dvh" bg="#303030"><Spinner size="xl" color="white" /></Center>;
  if (snap.status === "kicked") return <Notice title="Removed" text="The host removed you from this game." onBack={leave} />;
  if (snap.status === "host-left") return <Notice title="Host left" text="The host closed the game or lost the connection." onBack={leave} />;
  if (snap.status === "error") return <Notice title="Could not join" text={snap.error ?? "Something went wrong."} onBack={leave} />;

  const room = snap.room;
  const reconnecting = snap.status === "reconnecting";
  if (!room) {
    return (
      <Shell title="Join a nearby game" onBack={leave}>
        <GuestPairing desk={network.desk} initialNote={note} />
      </Shell>
    );
  }
  if (room.phase === "playing" && snap.state) {
    return (
      <>
        <OnlineGame
          room={room} state={snap.state} bus={client.bus} act={client.act} isHost={false} onExit={leave} onForfeit={() => { quitForGood(); leave(); }}
          onReaction={cb => client.onReaction(cb)} sendReaction={e => client.react(e)}
          chat={{ items: snap.chat, onSend: t => client.sendChat(t) }}
          note={reconnecting ? "Reconnecting…" : undefined} title={TITLE}
        />
        <Modal isOpen={reconnecting} onClose={() => undefined} isCentered closeOnOverlayClick={false} closeOnEsc={false} scrollBehavior="inside">
          <ModalOverlay />
          <ModalContent bg="gray.800" color="white" mx={3}>
            <ModalHeader>Connection lost</ModalHeader>
            <ModalBody pb={5}>
              <GuestPairing desk={network.desk} />
              <Button mt={3} w="100%" variant="ghost" color="gray.300" onClick={leave}>Leave the game</Button>
            </ModalBody>
          </ModalContent>
        </Modal>
      </>
    );
  }
  return (
    <Shell title={`${room.hostName}'s game`} onBack={leave}>
      {reconnecting && <GuestPairing desk={network.desk} />}
      <Lobby room={room} check={snap.check} onClaim={s => client.claimSeat(s)} chat={{ items: snap.chat, onSend: t => client.sendChat(t) }} />
    </Shell>
  );
}

type Step = { kind: "choose" } | { kind: "host" } | { kind: "join"; note?: string };

export default function NearbyClient() {
  const router = useRouter();
  const params = useSearchParams();
  const linkNote = extractSignalText(params.get("invite") ?? "");
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [name, setName] = useState("");
  const [ready, setReady] = useState(false);
  const [rtc, setRtc] = useState(true);

  useEffect(() => { setName(getSettings().playerName); setRtc(webRtcAvailable()); setReady(true); }, []);

  const exit = useCallback(() => router.push("/"), [router]);
  const finalName = cleanName(name, "Player");
  const remember = () => updateSettings({ playerName: finalName });

  if (!ready) return <Center minH="100dvh" bg="#303030"><Spinner color="white" size="xl" /></Center>;
  if (step.kind === "host") return <HostFlow name={finalName} onExit={exit} />;
  if (step.kind === "join") return <GuestFlow name={finalName} note={step.note} onExit={exit} />;

  return (
    <Shell title="Play nearby" onBack={exit}>
      <Text color="gray.300">Play with someone in the same room. No internet needed: the two phones connect straight to each other.</Text>
      {!rtc && <Text bg="orange.900" borderRadius="lg" p={3} role="alert">This browser cannot make direct connections. Try Chrome, Edge, Safari or Firefox.</Text>}
      <Box>
        <Text fontSize="sm" color="gray.300" mb={1}>Your name</Text>
        <Input value={name} maxLength={20} onChange={e => setName(e.target.value)} bg="gray.700" border="none" aria-label="Your name" />
      </Box>
      {linkNote && <Text bg="whiteAlpha.100" borderRadius="lg" p={3}>You were sent an invite. Choose <b>Join a nearby game</b> to use it.</Text>}
      <Button colorScheme="cyan" size="lg" isDisabled={!rtc} onClick={() => { remember(); setStep({ kind: "host" }); }}>Host a nearby game</Button>
      <Button colorScheme="blue" size="lg" isDisabled={!rtc} onClick={() => { remember(); setStep({ kind: "join", note: linkNote ?? undefined }); }}>Join a nearby game</Button>
      <ConnectionTips />
    </Shell>
  );
}

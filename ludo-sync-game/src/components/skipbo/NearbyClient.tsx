"use client";

import {
  Box, Button, Center, Drawer, DrawerBody, DrawerCloseButton, DrawerContent, DrawerHeader, DrawerOverlay, Input, Modal, ModalBody, ModalContent, ModalHeader, ModalOverlay,
  Spinner, Text, VStack, useDisclosure,
} from "@chakra-ui/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cleanName } from "@/lib/ludo/engine";
import { getSettings, updateSettings } from "@/lib/client/settings";
import { ManualNetwork, webRtcAvailable } from "@/lib/net/manualTransport";
import { extractSignalText } from "@/lib/net/offerCodec";
import { useReactionLog, useSkipBoGuest, useSkipBoHost } from "@/hooks/useSkipBoOnline";
import { ConnectionTips, HostInvites } from "../nearby/HostInvites";
import { GuestPairing } from "../nearby/GuestPairing";
import { Lobby, Notice, Shell } from "./OnlineClient";
import { Reactions } from "./Reactions";
import { Table } from "./Table";

const TITLE = "Nearby game";

function HostFlow({ name, onExit }: { name: string; onExit: () => void }) {
  const [network] = useState(() => new ManualNetwork());
  const invites = useDisclosure();
  const { session, snap, feed } = useSkipBoHost(name, {}, { network, persist: false });
  const reactions = useReactionLog(session ? cb => session.onReaction(cb) : undefined);
  const leave = useCallback(() => { network.desk.close(); onExit(); }, [network, onExit]);

  if (!session || !snap || snap.status === "opening") return <Center minH="100dvh" bg="#0c3a27"><VStack color="white"><Spinner size="xl" /><Text>Getting ready…</Text></VStack></Center>;
  if (snap.status === "error") return <Notice title="Could not start" text={snap.error ?? "Try again."} onBack={leave} />;
  if (snap.status === "closed") return <Notice title="Game closed" text="This game is no longer open." onBack={leave} />;
  const room = snap.room;
  if (room.phase === "playing" && room.view) {
    return (
      <>
        <Table
          view={room.view} act={session.act} frame={feed.frame} log={feed.log} title={TITLE} onExit={leave} away={new Set(room.away)}
          onRematch={room.view.phase === "over" ? session.rematch : undefined} rematchLabel="Rematch"
          headerExtra={<Button size="xs" colorScheme="cyan" onClick={invites.onOpen} aria-label="Invite or reconnect a player">Invite</Button>}
          footer={<Reactions items={reactions} onSend={e => session.sendReaction(e)} />}
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
        host={{ setSlot: (s, k, l) => session.setSlot(s, k, l), kick: s => session.kick(s), setRules: r => session.setRules(r), setTurnMs: ms => session.setTurnMs(ms), start: () => session.start(), canStart: session.canStart(), members: snap.members }}
      />
    </Shell>
  );
}

function GuestFlow({ name, note, onExit }: { name: string; note?: string; onExit: () => void }) {
  const [network] = useState(() => new ManualNetwork());
  const { client, snap, feed, quitForGood } = useSkipBoGuest("NEARBY", name, false, { network, persist: false });
  const reactions = useReactionLog(client ? cb => client.onReaction(cb) : undefined);
  const away = useMemo(() => new Set(snap?.room?.away ?? []), [snap?.room?.away]);
  const leave = useCallback(() => { network.desk.close(); onExit(); }, [network, onExit]);

  if (!client || !snap) return <Center minH="100dvh" bg="#0c3a27"><Spinner size="xl" color="white" /></Center>;
  if (snap.status === "kicked") return <Notice title="Removed" text="The host removed you from this game." onBack={leave} />;
  if (snap.status === "host-left") return <Notice title="Host left" text="The host closed the game or lost the connection." onBack={leave} />;
  if (snap.status === "error") return <Notice title="Could not join" text={snap.error ?? "Something went wrong."} onBack={leave} />;
  const room = snap.room;
  const reconnecting = snap.status === "reconnecting";
  if (!room) return <Shell title="Join a nearby game" onBack={leave}><GuestPairing desk={network.desk} initialNote={note} /></Shell>;
  if (room.phase === "playing" && snap.view) {
    return (
      <>
        <Table
          view={snap.view} act={client.act} frame={feed.frame} log={feed.log} rejected={snap.rejected} title={TITLE} away={away}
          onExit={() => { quitForGood(); leave(); }} note={reconnecting ? "Reconnecting…" : undefined} waitingText="Waiting for the host to start a rematch…"
          footer={<Reactions items={reactions} onSend={e => client.react(e)} />}
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
      <Lobby room={room} check={snap.check} />
    </Shell>
  );
}

type Step = { kind: "choose" } | { kind: "host" } | { kind: "join"; note?: string };

export default function SkipBoNearbyClient() {
  const router = useRouter();
  const params = useSearchParams();
  const linkNote = extractSignalText(params.get("invite") ?? "");
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [name, setName] = useState("");
  const [ready, setReady] = useState(false);
  const [rtc, setRtc] = useState(true);
  useEffect(() => { setName(getSettings().playerName); setRtc(webRtcAvailable()); setReady(true); }, []);

  const exit = useCallback(() => router.push("/skipbo"), [router]);
  const finalName = cleanName(name, "Player");
  const remember = () => updateSettings({ playerName: finalName });

  if (!ready) return <Center minH="100dvh" bg="#0c3a27"><Spinner color="white" size="xl" /></Center>;
  if (step.kind === "host") return <HostFlow name={finalName} onExit={exit} />;
  if (step.kind === "join") return <GuestFlow name={finalName} note={step.note} onExit={exit} />;
  return (
    <Shell title="Skip-Bo nearby" onBack={exit}>
      <Text color="gray.300">Play with people in the same room. No internet needed: the phones connect straight to each other.</Text>
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

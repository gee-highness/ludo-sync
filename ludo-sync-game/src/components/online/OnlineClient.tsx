"use client";

import { Box, Button, Center, Flex, Heading, HStack, IconButton, Input, Spinner, Text, VStack } from "@chakra-ui/react";
import { ChevronLeftIcon } from "@chakra-ui/icons";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { cleanName } from "@/lib/ludo/engine";
import { cleanRoomCode, isRoomCode } from "@/lib/net/crypto";
import { extractRoomCode } from "@/lib/net/identity";
import { getSettings, updateSettings } from "@/lib/client/settings";
import { loadRoomRecord } from "@/lib/client/rooms";
import type { HostResume } from "@/lib/net/resume";
import { useGuestClient, useHostSession, usePaletteSync, usePieceSync } from "./hooks";
import { Lobby } from "./Lobby";
import OnlineGame from "./OnlineGame";
import { ScanButton } from "./ScanButton";

const Shell = ({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) => (
  <Flex minH="100dvh" bg="#333333" color="white" justify="center" px={4} pt="max(12px, env(safe-area-inset-top))" pb="max(16px, env(safe-area-inset-bottom))">
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
  <Shell title="Online" onBack={onBack}>
    <VStack bg="whiteAlpha.100" borderRadius="xl" p={6} spacing={3} textAlign="center">
      <Heading size="md">{title}</Heading>
      <Text color="gray.300">{text}</Text>
      <Button colorScheme="teal" onClick={onBack}>Back to menu</Button>
    </VStack>
  </Shell>
);

function HostFlow({ name, resume, onExit }: { name: string; resume?: HostResume; onExit: () => void }) {
  const { session, snap, endRoom } = useHostSession(name, getSettings().rules, resume);
  usePieceSync(snap?.room ?? null, session ? d => session.setPieces(d) : undefined);
  usePaletteSync(snap?.room ?? null, session ? c => session.setColors(c) : undefined);
  if (!session || !snap || snap.status === "opening") {
    return <Center minH="100dvh" bg="#333333"><VStack color="white"><Spinner size="xl" /><Text>Opening your room…</Text></VStack></Center>;
  }
  if (snap.status === "error") return <Notice title="Could not open a room" text={snap.error ?? "Try again."} onBack={onExit} />;
  if (snap.status === "closed") return <Notice title="Room closed" text="This room is no longer open." onBack={onExit} />;

  const room = snap.room;
  const state = room.state;
  if (room.phase === "playing" && state) {
    return (
      <OnlineGame
        room={room} state={state} bus={session.bus} act={session.act} isHost onExit={onExit} onForfeit={() => { endRoom(); onExit(); }}
        onReaction={cb => session.onReaction(cb)} sendReaction={e => session.sendReaction(e)}
        chat={{ items: snap.chat, onSend: t => session.sendChat(t) }}
        onRematch={state.phase === "over" ? session.rematch : undefined}
        note={snap.online ? undefined : "Pairing service offline"}
      />
    );
  }
  return (
    <Shell title="Your room" onBack={onExit}>
      <Lobby
        room={room}
        host={{
          setSlot: (s, k, l) => session.setSlot(s, k, l), kick: s => session.kick(s), setRules: r => session.setRules(r),
          setTurnMs: ms => session.setTurnMs(ms), start: () => session.start(), canStart: session.canStart(), members: snap.members,
        }}
        chat={{ items: snap.chat, onSend: t => session.sendChat(t) }}
      />
    </Shell>
  );
}

function GuestFlow({ code, name, rejoin, onExit }: { code: string; name: string; rejoin?: boolean; onExit: () => void }) {
  const { client, snap, quitForGood } = useGuestClient(code, name, rejoin);
  usePieceSync(snap?.room ?? null, client ? d => client.setPieces(d) : undefined);
  usePaletteSync(snap?.room ?? null, client ? c => client.setColors(c) : undefined);
  if (!client || !snap) return <Center minH="100dvh" bg="#333333"><Spinner size="xl" color="white" /></Center>;
  if (snap.status === "kicked") return <Notice title="Removed" text="The host removed you from this room." onBack={onExit} />;
  if (snap.status === "host-left") return <Notice title="Host left" text="The host closed the room or lost their connection." onBack={onExit} />;
  if (snap.status === "error") return <Notice title="Could not join" text={snap.error ?? "Something went wrong."} onBack={onExit} />;
  if (!snap.room) {
    return <Center minH="100dvh" bg="#333333"><VStack color="white"><Spinner size="xl" /><Text>{snap.status === "reconnecting" ? "Reconnecting…" : "Joining room…"}</Text></VStack></Center>;
  }
  const room = snap.room;
  if (room.phase === "playing" && snap.state) {
    return (
      <OnlineGame
        room={room} state={snap.state} bus={client.bus} act={client.act} isHost={false} onExit={onExit} onForfeit={() => { quitForGood(); onExit(); }}
        onReaction={cb => client.onReaction(cb)} sendReaction={e => client.react(e)}
        chat={{ items: snap.chat, onSend: t => client.sendChat(t) }}
        note={snap.status === "reconnecting" ? "Reconnecting…" : undefined}
      />
    );
  }
  return (
    <Shell title={`${room.hostName}'s room`} onBack={onExit}>
      {snap.status === "reconnecting" && <Text color="orange.300">Reconnecting…</Text>}
      <Lobby room={room} check={snap.check} onClaim={s => client.claimSeat(s)} chat={{ items: snap.chat, onSend: t => client.sendChat(t) }} />
    </Shell>
  );
}

type Step = { kind: "choose" } | { kind: "host"; resume?: HostResume } | { kind: "join"; code: string; rejoin?: boolean };

export default function OnlineClient() {
  const router = useRouter();
  const params = useSearchParams();
  const linkCode = extractRoomCode(params.get("join") ?? "");
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [name, setName] = useState("");
  const [typed, setTyped] = useState(linkCode ?? "");
  const [ready, setReady] = useState(false);

  const [noRoom, setNoRoom] = useState(false);
  useEffect(() => {
    setName(getSettings().playerName);
    // coming back to a game that was left: the saved record says which room and whether this device was hosting it
    if (params.get("rejoin") === "1") {
      const rec = loadRoomRecord();
      if (rec) {
        setName(rec.name);
        setStep(rec.role === "host" && rec.host ? { kind: "host", resume: rec.host } : { kind: "join", code: rec.code, rejoin: true });
      } else setNoRoom(true);
    }
    setReady(true);
    // read once, when the screen opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exit = useCallback(() => router.push("/"), [router]);
  const finalName = cleanName(name, "Player");
  const remember = () => updateSettings({ playerName: finalName });

  if (!ready) return <Center minH="100dvh" bg="#333333"><Spinner color="white" size="xl" /></Center>;
  if (step.kind === "host") return <HostFlow name={finalName} resume={step.resume} onExit={exit} />;
  if (step.kind === "join") return <GuestFlow code={step.code} name={finalName} rejoin={step.rejoin} onExit={exit} />;

  const code = cleanRoomCode(typed);
  return (
    <Shell title="Play online" onBack={exit}>
      <Box>
        <Text fontSize="sm" color="gray.300" mb={1}>Your name</Text>
        <Input value={name} maxLength={20} onChange={e => setName(e.target.value)} bg="gray.700" border="none" aria-label="Your name" />
      </Box>
      {noRoom && <Text bg="whiteAlpha.100" borderRadius="lg" p={3}>There is no game to rejoin. It may have ended or been open too long.</Text>}
      {linkCode && (
        <Text bg="whiteAlpha.100" borderRadius="lg" p={3}>You were invited to room <b>{linkCode.slice(0, 3)}-{linkCode.slice(3)}</b>.</Text>
      )}
      <Button colorScheme="teal" size="lg" onClick={() => { remember(); setStep({ kind: "host" }); }}>Create a room</Button>
      <Text textAlign="center" color="gray.400">or join a friend</Text>
      <Input value={typed} onChange={e => setTyped(e.target.value)} placeholder="Room code" bg="gray.700" border="none" textAlign="center" fontFamily="mono"
        fontSize="xl" letterSpacing="0.12em" autoCapitalize="characters" autoComplete="off" aria-label="Room code" />
      <Button colorScheme="blue" size="lg" isDisabled={!isRoomCode(code)} onClick={() => { remember(); setStep({ kind: "join", code }); }}>Join room</Button>
      <ScanButton onCode={c => { setTyped(c); }} />
    </Shell>
  );
}

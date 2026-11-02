"use client";

import { Badge, Box, Button, Center, Flex, Heading, HStack, IconButton, Input, Select, Spinner, Switch, Text, VStack } from "@chakra-ui/react";
import { ChevronLeftIcon } from "@chakra-ui/icons";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useOnline } from "@/lib/client/device";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cleanName } from "@/lib/ludo/engine";
import { cleanRoomCode, isRoomCode } from "@/lib/net/crypto";
import { extractRoomCode, skipBoShareLink } from "@/lib/net/identity";
import { getSettings, updateSettings } from "@/lib/client/settings";
import { officialStock } from "@/lib/skipbo/engine";
import type { RoomView, SlotView } from "@/lib/skipbo/net/protocol";
import type { HostResume, MemberView } from "@/lib/skipbo/net/host";
import type { BotLevel } from "@/lib/skipbo/types";
import { loadSkipBoRoom, useReactionLog, useSkipBoGuest, useSkipBoHost } from "@/hooks/useSkipBoOnline";
import { ShareCard } from "../online/Lobby";
import { ScanButton } from "../online/ScanButton";
import { Reactions } from "./Reactions";
import { ChatBox, ChatButton, type ChatSource } from "./ChatBox";
import { Table } from "./Table";

export const Shell = ({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) => (
  <Flex minH="100dvh" bg="#0c3a27" color="white" justify="center" px={4} pt="max(12px, env(safe-area-inset-top))" pb="max(16px, env(safe-area-inset-bottom))">
    <VStack w="100%" maxW="460px" spacing={4} align="stretch">
      <HStack>
        <IconButton aria-label="Back" icon={<ChevronLeftIcon boxSize={6} />} variant="ghost" color="white" onClick={onBack} />
        <Heading as="h1" size="md">{title}</Heading>
      </HStack>
      {children}
    </VStack>
  </Flex>
);

export const Notice = ({ title, text, onBack }: { title: string; text: string; onBack: () => void }) => (
  <Shell title="Skip-Bo online" onBack={onBack}>
    <VStack bg="whiteAlpha.100" borderRadius="xl" p={6} spacing={3} textAlign="center">
      <Heading size="md">{title}</Heading>
      <Text color="gray.300">{text}</Text>
      <Button colorScheme="yellow" onClick={onBack}>Back to Skip-Bo</Button>
    </VStack>
  </Shell>
);

const TURN_CHOICES = [{ ms: 0, label: "No limit" }, { ms: 30_000, label: "30 seconds" }, { ms: 60_000, label: "60 seconds" }, { ms: 120_000, label: "2 minutes" }];

export interface HostControls {
  setSlot: (slot: number, kind: "empty" | "bot", level?: BotLevel) => void;
  kick: (slot: number) => void;
  setRules: (r: { stockSize?: number; tournament?: boolean; target?: number }) => void;
  setTurnMs: (ms: number) => void;
  start: () => void;
  canStart: boolean;
  members: MemberView[];
}

const SlotRow = ({ s, room, host }: { s: SlotView; room: RoomView; host?: HostControls }) => {
  const mine = room.you.slot === s.slot;
  const member = host?.members.find(m => m.slot === s.slot);
  return (
    <HStack bg="whiteAlpha.100" borderRadius="lg" p={2} pl={3} minH="52px">
      <Box flex={1} minW={0}>
        <Text fontWeight={700} noOfLines={1}>
          {s.kind === "empty" ? `Seat ${s.slot + 1}: open` : s.name}
          {mine && <Badge ml={2} colorScheme="teal">You</Badge>}
          {s.kind === "human" && s.host && <Badge ml={2} colorScheme="purple">Host</Badge>}
          {s.kind === "bot" && <Badge ml={2}>{s.level} bot</Badge>}
          {s.kind === "human" && !s.connected && <Badge ml={2} colorScheme="orange">Away</Badge>}
        </Text>
        {host && member && !member.host && <Text fontSize="xs" color="gray.400">Check digits {member.check}</Text>}
      </Box>
      {host && room.phase === "lobby" && s.kind !== "human" && (
        <Select size="sm" w="140px" bg="gray.700" aria-label={`Seat ${s.slot + 1}`} value={s.kind === "bot" ? s.level : "empty"}
          onChange={e => (e.target.value === "empty" ? host.setSlot(s.slot, "empty") : host.setSlot(s.slot, "bot", e.target.value as BotLevel))}>
          <option value="empty">Open for a friend</option><option value="easy">Bot: easy</option><option value="normal">Bot: normal</option><option value="hard">Bot: hard</option>
        </Select>
      )}
      {host && s.kind === "human" && !s.host && <Button size="sm" colorScheme="red" variant="outline" onClick={() => host.kick(s.slot)}>Remove</Button>}
    </HStack>
  );
};

export const Lobby = ({ room, host, check, invite, chat }: { room: RoomView; host?: HostControls; check?: string; invite?: React.ReactNode; chat?: ChatSource }) => {
  const players = room.slots.filter(s => s.kind !== "empty").length;
  const stock = room.rules.stockSize;
  return (
    <VStack align="stretch" spacing={4}>
      {host && (invite ?? <ShareCard code={room.code} link={skipBoShareLink(room.code)} game="Skip-Bo" gameId="skipbo" />)}
      {check && (
        <Box bg="whiteAlpha.100" borderRadius="xl" p={3} textAlign="center">
          <Text fontSize="xs" textTransform="uppercase" color="gray.400">Security check</Text>
          <Text fontSize="2xl" fontFamily="mono" letterSpacing="0.15em" fontWeight={700}>{check}</Text>
          <Text fontSize="xs" color="gray.400">The host sees the same six digits next to your name.</Text>
        </Box>
      )}
      <VStack align="stretch" spacing={2} as="section" aria-label="Seats">
        {room.slots.map(s => <SlotRow key={s.slot} s={s} room={room} host={host} />)}
        {room.spectators > 0 && <Text fontSize="sm" color="gray.400">{room.spectators} watching</Text>}
      </VStack>
      <VStack align="stretch" spacing={2} as="section" aria-label="Rules">
        <Text fontSize="xs" textTransform="uppercase" color="gray.400">Rules</Text>
        <HStack justify="space-between">
          <Text fontSize="sm">Stock pile</Text>
          {host ? (
            <Select size="sm" w="150px" bg="gray.700" aria-label="Stock pile size" value={stock} onChange={e => host.setRules({ ...room.rules, stockSize: Number(e.target.value) })}>
              {[30, 20, 15, 10].map(n => <option key={n} value={n}>{n} cards{n === officialStock(Math.max(2, players)) ? " (official)" : ""}</option>)}
            </Select>
          ) : <Text fontSize="sm" color="gray.300">{stock} cards</Text>}
        </HStack>
        <HStack justify="space-between">
          <Text fontSize="sm">Tournament (first to {room.rules.target})</Text>
          {host ? <Switch isChecked={room.rules.tournament} colorScheme="yellow" aria-label="Tournament" onChange={e => host.setRules({ ...room.rules, tournament: e.target.checked })} />
            : <Text fontSize="sm" color={room.rules.tournament ? "yellow.200" : "gray.500"}>{room.rules.tournament ? "On" : "Off"}</Text>}
        </HStack>
        <HStack justify="space-between">
          <Text fontSize="sm">Turn limit (then auto-play)</Text>
          {host ? (
            <Select size="sm" w="150px" bg="gray.700" aria-label="Turn limit" value={room.turnMs} onChange={e => host.setTurnMs(Number(e.target.value))}>
              {TURN_CHOICES.map(c => <option key={c.ms} value={c.ms}>{c.label}</option>)}
            </Select>
          ) : <Text fontSize="sm" color="gray.300">{TURN_CHOICES.find(c => c.ms === room.turnMs)?.label ?? `${room.turnMs / 1000}s`}</Text>}
        </HStack>
      </VStack>
      {chat && (
        <VStack align="stretch" spacing={2} as="section" aria-label="Chat">
          <Text fontSize="xs" textTransform="uppercase" color="gray.400">Chat</Text>
          <ChatBox chat={chat} height="200px" />
        </VStack>
      )}
      {host ? (
        <>
          {!room.slots.some(s => s.kind === "human" && !s.host) && <Text textAlign="center" color="gray.300" fontSize="sm" role="status">Waiting for friends to join. You can start with bots if you like.</Text>}
          <Button colorScheme="yellow" size="lg" isDisabled={!host.canStart} onClick={host.start}>{host.canStart ? "Deal the cards" : "Add a friend or a bot to start"}</Button>
        </>
      ) : <Text textAlign="center" color="gray.300">Waiting for {room.hostName} to deal…</Text>}
    </VStack>
  );
};

function HostFlow({ name, resume, onExit }: { name: string; resume?: HostResume; onExit: () => void }) {
  const { session, snap, feed, endRoom } = useSkipBoHost(name, {}, {}, resume);
  const chat: ChatSource | null = session && snap ? { items: snap.chat, onSend: t => session.sendChat(t), mySlot: snap.room.you.slot } : null;
  const reactions = useReactionLog(session ? cb => session.onReaction(cb) : undefined);
  if (!session || !snap || snap.status === "opening") return <Center minH="100dvh" bg="#0c3a27"><VStack color="white"><Spinner size="xl" /><Text>Opening your room…</Text></VStack></Center>;
  if (snap.status === "error") return <Notice title="Could not open a room" text={snap.error ?? "Try again."} onBack={onExit} />;
  if (snap.status === "closed") return <Notice title="Room closed" text="This room is no longer open." onBack={onExit} />;
  const room = snap.room;
  if (room.phase === "playing" && room.view) {
    const over = room.view.phase === "over";
    return (
      <Table
        record={room.slots.filter(x => x.kind === "human").length > 1 ? { withFriends: true } : undefined}
        view={room.view} act={session.act} frame={feed.frame} log={feed.log} title={`Room ${room.code.slice(0, 3)}-${room.code.slice(3)}`} onExit={onExit}
        note={snap.online ? undefined : "Pairing service offline"} away={new Set(room.away)}
        onRematch={over ? session.rematch : undefined} rematchLabel="Rematch" headerExtra={<>{chat && <ChatButton chat={chat} />}<Button size="sm" variant="outline" color="red.200" onClick={() => { endRoom(); onExit(); }} aria-label="Close the room for everyone">Close</Button></>}
        footer={<Reactions items={reactions} onSend={e => session.sendReaction(e)} />}
      />
    );
  }
  return (
    <Shell title="Your room" onBack={onExit}>
      <Lobby room={room} host={{ setSlot: (s, k, l) => session.setSlot(s, k, l), kick: s => session.kick(s), setRules: r => session.setRules(r), setTurnMs: ms => session.setTurnMs(ms), start: () => session.start(), canStart: session.canStart(), members: snap.members }} chat={chat ?? undefined} />
    </Shell>
  );
}

function GuestFlow({ code, name, rejoin, onExit }: { code: string; name: string; rejoin?: boolean; onExit: () => void }) {
  const { client, snap, feed, quitForGood } = useSkipBoGuest(code, name, rejoin);
  const chat: ChatSource | null = client && snap ? { items: snap.chat, onSend: t => client.sendChat(t), mySlot: snap.room?.you.slot ?? null } : null;
  const reactions = useReactionLog(client ? cb => client.onReaction(cb) : undefined);
  const away = useMemo(() => new Set(snap?.room?.away ?? []), [snap?.room?.away]);
  if (!client || !snap) return <Center minH="100dvh" bg="#0c3a27"><Spinner size="xl" color="white" /></Center>;
  if (snap.status === "kicked") return <Notice title="Removed" text="The host removed you from this room." onBack={onExit} />;
  if (snap.status === "host-left") return <Notice title="Host left" text="The host closed the room or lost their connection." onBack={onExit} />;
  if (snap.status === "error") return <Notice title="Could not join" text={snap.error ?? "Something went wrong."} onBack={onExit} />;
  if (!snap.room) return <Center minH="100dvh" bg="#0c3a27"><VStack color="white"><Spinner size="xl" /><Text>{snap.status === "reconnecting" ? "Reconnecting…" : "Joining room…"}</Text></VStack></Center>;
  const room = snap.room;
  if (room.phase === "playing" && snap.view) {
    return (
      <Table
        record={{ withFriends: true }}
        view={snap.view} act={client.act} frame={feed.frame} log={feed.log} rejected={snap.rejected} title={`${room.hostName}'s room`} away={away}
        onExit={() => { quitForGood(); onExit(); }} note={snap.status === "reconnecting" ? "Reconnecting…" : undefined} waitingText="Waiting for the host to start a rematch…" headerExtra={chat ? <ChatButton chat={chat} /> : undefined}
        footer={<Reactions items={reactions} onSend={e => client.react(e)} />}
      />
    );
  }
  return (
    <Shell title={`${room.hostName}'s room`} onBack={onExit}>
      {snap.status === "reconnecting" && <Text color="orange.300">Reconnecting…</Text>}
      <Lobby room={room} check={snap.check} chat={chat ?? undefined} />
    </Shell>
  );
}

type Step = { kind: "choose" } | { kind: "host"; resume?: HostResume } | { kind: "join"; code: string; rejoin?: boolean };

export default function SkipBoOnlineClient() {
  const router = useRouter();
  const params = useSearchParams();
  const linkCode = extractRoomCode(params.get("join") ?? "");
  const online = useOnline();
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [name, setName] = useState("");
  const [typed, setTyped] = useState(linkCode ?? "");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setName(getSettings().playerName);
    if (params.get("rejoin") === "1") {
      const rec = loadSkipBoRoom();
      if (rec) { setName(rec.name); setStep(rec.role === "host" && rec.host ? { kind: "host", resume: rec.host } : { kind: "join", code: rec.code, rejoin: true }); }
    }
    if (params.get("host") === "1" && params.get("rejoin") !== "1") setStep({ kind: "host" }); // "Play with a friend" opens the room straight away
    setReady(true);
    // read once, when the screen opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exit = useCallback(() => router.push("/skipbo"), [router]);
  const finalName = cleanName(name, "Player");
  const remember = () => updateSettings({ playerName: finalName });

  if (!ready) return <Center minH="100dvh" bg="#0c3a27"><Spinner color="white" size="xl" /></Center>;
  if (step.kind === "host") return <HostFlow name={finalName} resume={step.resume} onExit={exit} />;
  if (step.kind === "join") return <GuestFlow code={step.code} name={finalName} rejoin={step.rejoin} onExit={exit} />;

  const code = cleanRoomCode(typed);
  return (
    <Shell title="Skip-Bo online" onBack={exit}>
      <Box>
        <Text fontSize="sm" color="gray.300" mb={1}>Your name</Text>
        <Input value={name} maxLength={20} onChange={e => setName(e.target.value)} bg="gray.700" border="none" aria-label="Your name" />
      </Box>
      {!online && (
        <VStack align="stretch" spacing={2} bg="orange.900" borderRadius="lg" p={3} role="alert">
          <Text fontWeight={800}>You are offline</Text>
          <Text fontSize="sm">Online rooms need an internet connection. You can still play against bots or pass and play, and two phones in the same room can play nearby with no internet at all.</Text>
          <HStack><Button as={Link} href="/skipbo/nearby" size="sm" colorScheme="cyan">Play nearby</Button><Button as={Link} href="/skipbo" size="sm" variant="outline" color="white">Back to the menu</Button></HStack>
        </VStack>
      )}
      {linkCode && <Text bg="whiteAlpha.100" borderRadius="lg" p={3}>You were invited to room <b>{linkCode.slice(0, 3)}-{linkCode.slice(3)}</b>.</Text>}
      <Button colorScheme="yellow" size="lg" isDisabled={!online} onClick={() => { remember(); setStep({ kind: "host" }); }}>Create a room</Button>
      <Text textAlign="center" color="gray.400">or join a friend</Text>
      <Input value={typed} onChange={e => setTyped(e.target.value)} placeholder="Room code" bg="gray.700" border="none" textAlign="center" fontFamily="mono"
        fontSize="xl" letterSpacing="0.12em" autoCapitalize="characters" autoComplete="off" aria-label="Room code" />
      <Button colorScheme="blue" size="lg" isDisabled={!online || !isRoomCode(code)} onClick={() => { remember(); setStep({ kind: "join", code }); }}>Join room</Button>
      <ScanButton onCode={c => setTyped(c)} />
      <Text fontSize="xs" color="gray.400" textAlign="center">Everyone sees only their own hand. The table lives on the host&apos;s phone, so the host should keep this screen open.</Text>
    </Shell>
  );
}

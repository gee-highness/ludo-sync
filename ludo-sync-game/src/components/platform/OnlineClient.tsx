"use client";

import { Badge, Box, Button, Center, HStack, Input, Select, Spinner, Text, VStack } from "@chakra-ui/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOnline } from "@/lib/client/device";
import { getSettings, updateSettings } from "@/lib/client/settings";
import { cleanName } from "@/lib/ludo/engine";
import { cleanRoomCode, isRoomCode } from "@/lib/net/crypto";
import { extractRoomCode } from "@/lib/net/identity";
import type { MemberView } from "@/lib/platform/net/host";
import type { RoomView, SlotView } from "@/lib/platform/net/protocol";
import { loadModule } from "@/lib/platform/registry";
import { describeRules, loadLastRules, type RuleValues } from "@/lib/platform/rules";
import type { BotLevel, GameModule } from "@/lib/platform/types";
import { ShareCard } from "../online/Lobby";
import { ScanButton } from "../online/ScanButton";
import { ChatBox, ChatButton, type ChatSource } from "../skipbo/ChatBox";
import { Reactions } from "../skipbo/Reactions";
import { RulesPanel } from "./RulesPanel";
import { Notice, Shell, BG } from "./Shell";
import { TableFrame } from "./TableFrame";
import { clearRoom, loadRoom, useGameGuest, useGameHost, useOnlineAward, useReactionLog } from "./useGameOnline";

const TURN_CHOICES = [{ ms: 0, label: "No limit" }, { ms: 30_000, label: "30 seconds" }, { ms: 60_000, label: "60 seconds" }, { ms: 120_000, label: "2 minutes" }];

interface HostControls { setSlot: (s: number, k: "empty" | "bot", l?: BotLevel) => void; kick: (s: number) => void; setRules: (r: RuleValues) => void; setTurnMs: (ms: number) => void; start: () => void; canStart: boolean; members: MemberView[] }

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

const Lobby = ({ mod, room, host, check, chat }: { mod: GameModule; room: RoomView; host?: HostControls; check?: string; chat?: ChatSource }) => {
  const d = mod.driver;
  const seated = room.slots.filter(s => s.kind !== "empty").length;
  return (
    <VStack align="stretch" spacing={4}>
      {host && <ShareCard code={room.code} link={`${typeof location !== "undefined" ? location.origin : ""}/g/${d.id}/online?join=${room.code}`} game={d.name} />}
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
        <Text fontSize="xs" color="gray.500">{d.minPlayers} to {d.maxPlayers} players</Text>
      </VStack>
      <VStack align="stretch" spacing={2} as="section" aria-label="Room rules">
        <Text fontSize="xs" textTransform="uppercase" color="gray.400">{host ? "You choose the rules" : `${room.hostName} chose these rules`}</Text>
        <RulesPanel gameId={d.id} schema={d.schema} values={room.rules} readOnly={!host} onChange={v => host?.setRules(v)} />
        <HStack justify="space-between">
          <Text fontSize="sm">Turn limit (then auto-play)</Text>
          {host ? (
            <Select size="sm" w="150px" bg="gray.700" aria-label="Turn limit" value={room.turnMs} onChange={e => host.setTurnMs(Number(e.target.value))}>
              {TURN_CHOICES.map(c => <option key={c.ms} value={c.ms}>{c.label}</option>)}
            </Select>
          ) : <Text fontSize="sm" color="gray.300">{TURN_CHOICES.find(c => c.ms === room.turnMs)?.label ?? `${room.turnMs / 1000}s`}</Text>}
        </HStack>
        {!host && <Text fontSize="xs" color="gray.500">{describeRules(d.schema, room.rules).length} rule{describeRules(d.schema, room.rules).length === 1 ? "" : "s"} changed from the defaults.</Text>}
      </VStack>
      {chat && <VStack align="stretch" spacing={2} as="section" aria-label="Chat"><Text fontSize="xs" textTransform="uppercase" color="gray.400">Chat</Text><ChatBox chat={chat} height="160px" /></VStack>}
      {host ? (
        <>
          {!room.slots.some(s => s.kind === "human" && !s.host) && <Text textAlign="center" color="gray.300" fontSize="sm" role="status">Waiting for friends to join. You can start with bots if you like.</Text>}
          <Button colorScheme="yellow" size="lg" isDisabled={!host.canStart} onClick={host.start}>{host.canStart ? "Start the game" : seated < d.minPlayers ? `Need ${d.minPlayers - seated} more player${d.minPlayers - seated === 1 ? "" : "s"}` : "Too many players"}</Button>
        </>
      ) : <Text textAlign="center" color="gray.300">Waiting for {room.hostName} to start…</Text>}
    </VStack>
  );
};

const Loading = ({ text }: { text: string }) => <Center minH="100dvh" bg={BG}><VStack color="white"><Spinner size="xl" /><Text>{text}</Text></VStack></Center>;

function HostFlow({ mod, name, rules, onExit }: { mod: GameModule; name: string; rules: RuleValues; onExit: () => void }) {
  const { session, snap, feed, endRoom } = useGameHost(mod.driver, name, rules);
  const chat: ChatSource | null = session && snap ? { items: snap.chat, onSend: t => session.sendChat(t), mySlot: snap.room.you.slot } : null;
  const reactions = useReactionLog(session ? cb => session.onReaction(cb) : undefined);
  const humans = snap?.room.slots.filter(s => s.kind === "human").length ?? 0;
  const award = useOnlineAward(mod.driver, snap?.room.frame, humans);
  if (!session || !snap || snap.status === "opening") return <Loading text="Opening your room…" />;
  if (snap.status === "error") return <Notice title="Could not open a room" text={snap.error ?? "Try again."} onBack={onExit} />;
  if (snap.status === "closed") return <Notice title="Room closed" text="This room is no longer open." onBack={onExit} />;
  const room = snap.room;
  if (room.phase === "playing" && room.frame) {
    const over = room.frame.base.over;
    return (
      <TableFrame mod={mod} base={room.frame.base} view={room.frame.view} rules={room.rules} frame={feed.frame} log={feed.log} act={a => session.act(a)} title={`Room ${room.code.slice(0, 3)}-${room.code.slice(3)}`}
        onExit={() => { endRoom(); onExit(); }} exitLabel="Close the room" note={snap.online ? undefined : "Pairing service offline"} away={new Set(room.away)} award={award}
        onRematch={over ? session.rematch : undefined} rematchLabel="Rematch" headerExtra={chat ? <ChatButton chat={chat} /> : undefined}
        footer={<Reactions items={reactions} onSend={e => session.sendReaction(e)} />} />
    );
  }
  return (
    <Shell title="Your room" onBack={() => { endRoom(); onExit(); }} accent={mod.accent}>
      <Lobby mod={mod} room={room} chat={chat ?? undefined}
        host={{ setSlot: (s, k, l) => session.setSlot(s, k, l), kick: s => session.kick(s), setRules: r => session.setRules(r), setTurnMs: ms => session.setTurnMs(ms), start: () => session.start(), canStart: session.canStart(), members: snap.members }} />
    </Shell>
  );
}

function GuestFlow({ mod, code, name, rejoin, onExit }: { mod: GameModule; code: string; name: string; rejoin?: boolean; onExit: () => void }) {
  const { client, snap, feed, quitForGood } = useGameGuest(mod.driver, code, name, rejoin);
  const chat: ChatSource | null = client && snap ? { items: snap.chat, onSend: t => client.sendChat(t), mySlot: snap.room?.you.slot ?? null } : null;
  const reactions = useReactionLog(client ? cb => client.onReaction(cb) : undefined);
  const away = useMemo(() => new Set(snap?.room?.away ?? []), [snap?.room?.away]);
  const award = useOnlineAward(mod.driver, snap?.frame, 2);
  if (!client || !snap) return <Loading text="Joining…" />;
  if (snap.status === "kicked") return <Notice title="Removed" text="The host removed you from this room." onBack={onExit} />;
  if (snap.status === "host-left") return <Notice title="Host left" text="The host closed the room or lost their connection." onBack={onExit} />;
  if (snap.status === "error") return <Notice title="Could not join" text={snap.error ?? "Something went wrong."} onBack={onExit} />;
  if (!snap.room) return <Loading text={snap.status === "reconnecting" ? "Reconnecting…" : "Joining room…"} />;
  const room = snap.room;
  if (room.phase === "playing" && snap.frame) {
    return (
      <TableFrame mod={mod} base={snap.frame.base} view={snap.frame.view} rules={room.rules} frame={feed.frame} log={feed.log} act={a => client.act(a)} rejected={snap.rejected} title={`${room.hostName}'s room`} away={away}
        onExit={() => { quitForGood(); onExit(); }} exitLabel="Leave the room" note={snap.status === "reconnecting" ? "Reconnecting…" : undefined} waitingText="Waiting for the host to start a rematch…" award={award}
        headerExtra={chat ? <ChatButton chat={chat} /> : undefined} footer={<Reactions items={reactions} onSend={e => client.react(e)} />} />
    );
  }
  return (
    <Shell title={`${room.hostName}'s room`} onBack={onExit} accent={mod.accent}>
      {snap.status === "reconnecting" && <Text color="orange.300">Reconnecting…</Text>}
      <Lobby mod={mod} room={room} check={snap.check} chat={chat ?? undefined} />
    </Shell>
  );
}

type Step = { kind: "choose" } | { kind: "host" } | { kind: "join"; code: string; rejoin?: boolean };

export default function OnlineClient({ gameId }: { gameId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const linkCode = extractRoomCode(params.get("join") ?? "");
  const online = useOnline();
  const [mod, setMod] = useState<GameModule | null | undefined>(undefined);
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [name, setName] = useState("");
  const [typed, setTyped] = useState(linkCode ?? "");
  const [rules, setRules] = useState<RuleValues>({});

  useEffect(() => {
    void loadModule(gameId).then(m => {
      setMod(m);
      if (!m) return;
      setRules(loadLastRules(gameId, m.driver.schema));
      setName(getSettings().playerName);
      if (params.get("rejoin") === "1") { const rec = loadRoom(gameId); if (rec) { setName(rec.name); setStep({ kind: "join", code: rec.code, rejoin: true }); } }
    });
    // read once, when the screen opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exit = useCallback(() => router.push(`/g/${gameId}`), [router, gameId]);
  const finalName = cleanName(name, "Player");
  const remember = () => updateSettings({ playerName: finalName });

  if (mod === undefined) return <Loading text="Loading…" />;
  if (mod === null) return <Notice title="Unknown game" text="That game does not exist." onBack={() => router.push("/")} />;
  if (step.kind === "host") return <HostFlow mod={mod} name={finalName} rules={rules} onExit={exit} />;
  if (step.kind === "join") return <GuestFlow mod={mod} code={step.code} name={finalName} rejoin={step.rejoin} onExit={() => { clearRoom(gameId); exit(); }} />;

  const code = cleanRoomCode(typed);
  return (
    <Shell title={`${mod.driver.name} online`} onBack={exit} accent={mod.accent}>
      <Box>
        <Text fontSize="sm" color="gray.300" mb={1}>Your name</Text>
        <Input value={name} maxLength={20} onChange={e => setName(e.target.value)} bg="gray.700" border="none" aria-label="Your name" />
      </Box>
      {!online && (
        <VStack align="stretch" spacing={2} bg="orange.900" borderRadius="lg" p={3} role="alert">
          <Text fontWeight={800}>You are offline</Text>
          <Text fontSize="sm">Online rooms need an internet connection. You can still play against bots or pass and play.</Text>
          <Button as={Link} href={`/g/${gameId}`} size="sm" variant="outline" color="white">Back to the menu</Button>
        </VStack>
      )}
      {linkCode && <Text bg="whiteAlpha.100" borderRadius="lg" p={3}>You were invited to room <b>{linkCode.slice(0, 3)}-{linkCode.slice(3)}</b>.</Text>}
      <Button colorScheme="yellow" size="lg" isDisabled={!online} onClick={() => { remember(); setStep({ kind: "host" }); }}>Create a room</Button>
      <Text textAlign="center" color="gray.400">or join a friend</Text>
      <Input value={typed} onChange={e => setTyped(e.target.value)} placeholder="Room code" bg="gray.700" border="none" textAlign="center" fontFamily="mono" fontSize="xl" letterSpacing="0.12em" autoCapitalize="characters" autoComplete="off" aria-label="Room code" />
      <Button colorScheme="blue" size="lg" isDisabled={!online || !isRoomCode(code)} onClick={() => { remember(); setStep({ kind: "join", code }); }}>Join room</Button>
      <ScanButton onCode={c => setTyped(c)} />
      <Text fontSize="xs" color="gray.400" textAlign="center">The host picks every rule in the room. The game lives on the host&apos;s device, so the host should keep this screen open.</Text>
    </Shell>
  );
}

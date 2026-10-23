"use client";

import { Badge, Box, Button, Divider, HStack, Select, Switch, Text, VStack } from "@chakra-ui/react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { SEAT_INFO, type Seat } from "@/lib/ludo/board";
import { DEFAULT_RULES, type BotLevel, type Rules } from "@/lib/ludo/types";
import { formatRoomCode } from "@/lib/net/crypto";
import { shareLink } from "@/lib/net/identity";
import type { MemberView } from "@/lib/net/host";
import type { RoomView } from "@/lib/net/protocol";
import { ChatPanel, type ChatSource } from "./ChatPanel";

const RULE_LABELS: Record<string, string> = {
  tycoon: "Tycoon mode",
  twoDice: "Two dice",
  threeSixes: "Three sixes lose the turn",
  captureBonus: "Capture bonus",
  finishBonus: "Finish bonus",
  blockades: "Blockades",
  safeSquares: "Safe squares",
};
const RULE_ORDER = ["tycoon", "twoDice", "threeSixes", "captureBonus", "finishBonus", "blockades", "safeSquares"];
const TURN_CHOICES = [{ ms: 0, label: "No limit" }, { ms: 20_000, label: "20 seconds" }, { ms: 45_000, label: "45 seconds" }, { ms: 90_000, label: "90 seconds" }];

const ruleKeys = (rules: Rules): string[] => {
  const keys = new Set([...RULE_ORDER, ...Object.keys(DEFAULT_RULES)]);
  Object.keys(rules).forEach(k => keys.add(k));
  return [...keys].filter(k => typeof (rules as unknown as Record<string, unknown>)[k] === "boolean" || k in DEFAULT_RULES || k === "tycoon");
};

interface HostControls {
  setSlot: (seat: Seat, kind: "empty" | "bot", level?: BotLevel) => void;
  kick: (seat: Seat) => void;
  setRules: (rules: Rules) => void;
  setTurnMs: (ms: number) => void;
  start: () => void;
  canStart: boolean;
  members: MemberView[];
}

interface Props {
  room: RoomView;
  /** Present on the host. */
  host?: HostControls;
  onClaim?: (seat: Seat) => void;
  /** Six digits the guest should match with the host's screen. */
  check?: string;
  chat?: ChatSource;
}

export const ShareCard = ({ code }: { code: string }) => {
  const [copied, setCopied] = useState(false);
  const link = shareLink(code);
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  };
  const share = () => { void navigator.share?.({ title: "Ludo Sync", text: `Join my Ludo game: ${formatRoomCode(code)}`, url: link }).catch(() => undefined); };
  return (
    <VStack bg="whiteAlpha.100" borderRadius="xl" p={4} spacing={3}>
      <Text fontSize="xs" textTransform="uppercase" color="gray.400">Room code</Text>
      <Text fontSize="4xl" fontWeight={800} letterSpacing="0.12em" fontFamily="mono" aria-label={`Room code ${code.split("").join(" ")}`}>{formatRoomCode(code)}</Text>
      <Box bg="white" p={2} borderRadius="md" lineHeight={0}><QRCodeSVG value={link} size={150} role="img" aria-label="QR code to join this room" /></Box>
      <HStack w="100%">
        <Button flex={1} onClick={copy}>{copied ? "Copied" : "Copy link"}</Button>
        {typeof navigator !== "undefined" && "share" in navigator && <Button flex={1} colorScheme="blue" onClick={share}>Share</Button>}
      </HStack>
    </VStack>
  );
};

export const Lobby = ({ room, host, onClaim, check, chat }: Props) => {
  const rules = room.rules;
  return (
    <VStack align="stretch" spacing={4} w="100%">
      {host && <ShareCard code={room.code} />}
      {check && (
        <Box bg="whiteAlpha.100" borderRadius="xl" p={3} textAlign="center">
          <Text fontSize="xs" textTransform="uppercase" color="gray.400">Security check</Text>
          <Text fontSize="2xl" fontFamily="mono" letterSpacing="0.15em" fontWeight={700}>{check}</Text>
          <Text fontSize="xs" color="gray.400">The host sees the same six digits next to your name.</Text>
        </Box>
      )}

      <VStack align="stretch" spacing={2} as="section" aria-label="Seats">
        {room.slots.map(s => {
          const info = SEAT_INFO[s.seat];
          const mine = room.you.seat === s.seat;
          const member = host?.members.find(m => m.seat === s.seat);
          return (
            <HStack key={s.seat} bg="whiteAlpha.100" borderRadius="lg" p={2} pl={3} borderLeft="6px solid" borderColor={info.main} minH="52px">
              <Box flex={1} minW={0}>
                <Text fontWeight={700} noOfLines={1}>
                  {s.kind === "empty" ? `${info.name}: open seat` : s.name}
                  {mine && <Badge ml={2} colorScheme="teal">You</Badge>}
                  {s.kind === "human" && s.host && <Badge ml={2} colorScheme="purple">Host</Badge>}
                  {s.kind === "bot" && <Badge ml={2}>{s.level} bot</Badge>}
                  {s.kind === "human" && !s.connected && <Badge ml={2} colorScheme="orange">Away</Badge>}
                </Text>
                {host && member && !member.host && <Text fontSize="xs" color="gray.400">Check digits {member.check}</Text>}
              </Box>
              {host && room.phase === "lobby" && s.kind !== "human" && (
                <Select size="sm" w="130px" bg="gray.700" aria-label={`${info.name} seat`} value={s.kind === "bot" ? s.level : "empty"}
                  onChange={e => e.target.value === "empty" ? host.setSlot(s.seat, "empty") : host.setSlot(s.seat, "bot", e.target.value as BotLevel)}>
                  <option value="empty">Open for a friend</option>
                  <option value="easy">Bot: easy</option>
                  <option value="normal">Bot: normal</option>
                  <option value="hard">Bot: hard</option>
                </Select>
              )}
              {host && s.kind === "human" && !s.host && <Button size="sm" colorScheme="red" variant="outline" onClick={() => host.kick(s.seat)}>Remove</Button>}
              {!host && onClaim && s.kind === "empty" && room.you.seat !== s.seat && <Button size="sm" onClick={() => onClaim(s.seat)}>Sit here</Button>}
            </HStack>
          );
        })}
        {room.spectators > 0 && <Text fontSize="sm" color="gray.400">{room.spectators} watching</Text>}
      </VStack>

      <Divider borderColor="whiteAlpha.300" />
      <VStack align="stretch" spacing={2} as="section" aria-label="Rules">
        <Text fontSize="xs" textTransform="uppercase" color="gray.400">Rules</Text>
        {ruleKeys(rules).map(k => {
          const on = !!(rules as unknown as Record<string, unknown>)[k];
          return (
            <HStack key={k} justify="space-between">
              <Text fontSize="sm">{RULE_LABELS[k] ?? k}</Text>
              {host ? (
                <Switch isChecked={on} colorScheme="teal" aria-label={RULE_LABELS[k] ?? k}
                  onChange={e => host.setRules({ ...rules, [k]: e.target.checked })} />
              ) : <Text fontSize="sm" color={on ? "teal.200" : "gray.500"}>{on ? "On" : "Off"}</Text>}
            </HStack>
          );
        })}
        <HStack justify="space-between">
          <Text fontSize="sm">Turn limit (then auto-play)</Text>
          {host ? (
            <Select size="sm" w="130px" bg="gray.700" aria-label="Turn limit" value={room.turnMs} onChange={e => host.setTurnMs(Number(e.target.value))}>
              {TURN_CHOICES.map(c => <option key={c.ms} value={c.ms}>{c.label}</option>)}
            </Select>
          ) : <Text fontSize="sm" color="gray.300">{TURN_CHOICES.find(c => c.ms === room.turnMs)?.label ?? `${room.turnMs / 1000}s`}</Text>}
        </HStack>
      </VStack>

      {chat && (
        <VStack align="stretch" spacing={2} as="section" aria-label="Chat">
          <Text fontSize="xs" textTransform="uppercase" color="gray.400">Chat</Text>
          <ChatPanel items={chat.items} onSend={chat.onSend} mySeat={room.you.seat} height="280px" />
        </VStack>
      )}

      {host ? (
        <Button colorScheme="teal" size="lg" isDisabled={!host.canStart} onClick={host.start}>
          {host.canStart ? "Start game" : "Add a friend or a bot to start"}
        </Button>
      ) : <Text textAlign="center" color="gray.300">Waiting for {room.hostName} to start…</Text>}
    </VStack>
  );
};

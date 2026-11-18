"use client";

import { ChevronLeftIcon } from "@chakra-ui/icons";
import {
  Alert, AlertIcon, Box, Button, Flex, HStack, Heading, IconButton, Input, SimpleGrid, Spinner, Tab, TabList, TabPanel, TabPanels, Tabs, Text, VStack,
} from "@chakra-ui/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import { sound } from "@/lib/client/audio";
import { getSettings, updateSettings } from "@/lib/client/settings";
import { GAMES } from "@/lib/games";
import { cleanRoomCode, formatRoomCode, isRoomCode } from "@/lib/net/crypto";
import { extractRoomCode } from "@/lib/net/identity";
import type { PartyLeader, PartyState } from "@/lib/party/session";
import { gameTitle, partyStore } from "@/lib/party/store";
import { useFriends } from "@/components/friends/FriendsProvider";
import { ConnectionTips, HostInvites } from "@/components/nearby/HostInvites";
import { GuestPairing } from "@/components/nearby/GuestPairing";
import { ScanButton } from "@/components/online/ScanButton";
import { NearbyPeople } from "@/components/nearby/NearbyPeople";
import { useNearby } from "@/components/nearby/NearbyPlayersProvider";
import { nearbyPlayers, type NearbyPeer } from "@/lib/native/nearbyPlayers";
import { Members, partyMe, useParty } from "./PartyProvider";

const Panel = ({ children, title, sub, tone }: { children?: React.ReactNode; title?: string; sub?: string; tone?: string }) => (
  <Box w="100%" p={4} borderRadius="2xl" bg={tone ? `linear-gradient(135deg, ${tone}33, rgba(255,255,255,.04) 70%)` : "whiteAlpha.100"} border="1px solid" borderColor="whiteAlpha.200" boxShadow="card">
    {title && <Text fontWeight={900} fontSize="lg">{title}</Text>}
    {sub && <Text fontSize="sm" color="gray.300" mt={0.5}>{sub}</Text>}
    {children}
  </Box>
);

const Step = ({ n, text }: { n: number; text: string }) => (
  <HStack align="start" spacing={3}>
    <Flex w="26px" h="26px" borderRadius="full" bg="whiteAlpha.300" align="center" justify="center" fontWeight={900} fontSize="sm" flexShrink={0}>{n}</Flex>
    <Text fontSize="sm" color="gray.200" pt="2px">{text}</Text>
  </HStack>
);

/** One tap on a game: going there tells the party what you want to play. */
const GamePicker = ({ s }: { s: PartyState }) => (
  <Panel title="Pick a game" sub="Open any game. The party plays the one most people pick; a tie goes to a quick vote.">
    <SimpleGrid columns={2} spacing={2} mt={3}>
      {GAMES.map(g => {
        const here = s.members.filter(m => m.game === g.id);
        const chosen = (s.room?.game ?? s.target) === g.id;
        return (
          <Flex key={g.id} as={Link} href={g.href} onClick={() => sound.play("click")} direction="column" p={3} borderRadius="xl" minH="72px" position="relative"
            bg={`linear-gradient(135deg, ${g.accent}${chosen ? "88" : "40"}, rgba(255,255,255,.04) 80%)`} border="2px solid" borderColor={chosen ? "white" : "whiteAlpha.200"}
            _hover={{ borderColor: g.accent, transform: "translateY(-2px)" }} transition="all .15s" _focusVisible={{ outline: "3px solid #fde047" }}>
            <Text fontWeight={800} noOfLines={1}>{g.icon ? `${g.icon} ` : ""}{g.name}</Text>
            <Text fontSize="xs" color="gray.200" mt="auto">{chosen ? "Party's choice ✓" : here.length ? `${here.map(m => m.name).join(", ")}` : g.players}</Text>
            {here.length > 0 && <Text position="absolute" top={2} right={2} fontSize="xs" fontWeight={900} bg="white" color="black" borderRadius="full" px={2} aria-label={`${here.length} in this game`}>{here.length}</Text>}
          </Flex>
        );
      })}
    </SimpleGrid>
  </Panel>
);

/** Friends in the list get an invite in one tap; it opens this party on their phone. */
const InviteFriends = ({ code }: { code: string }) => {
  const { service, snap } = useFriends();
  const [sent, setSent] = useState<Record<string, string>>({});
  const friends = snap?.friends.filter(f => f.confirmed) ?? [];
  if (!service) return null;
  if (!friends.length) return <Text fontSize="sm" color="gray.400" mt={3}>Add friends on the <Link href="/friends" style={{ textDecoration: "underline" }}>Friends</Link> screen to invite them here in one tap.</Text>;
  const label: Record<string, string> = { delivered: "Invited ✓", queued: "Will get it soon", offline: "Offline", "not-friend": "Not a friend" };
  return (
    <VStack align="stretch" spacing={2} mt={3}>
      {friends.map(f => (
        <HStack key={f.code} p={2} pl={3} borderRadius="lg" bg="whiteAlpha.100">
          <Text flex={1} fontWeight={700} noOfLines={1}>{f.name}</Text>
          <Button size="sm" colorScheme={sent[f.code] === "delivered" ? "green" : "yellow"} isLoading={sent[f.code] === "…"} isDisabled={sent[f.code] === "delivered"}
            onClick={async () => { sound.play("click"); setSent(x => ({ ...x, [f.code]: "…" })); const r = await service.invite(f.code, "party", code); setSent(x => ({ ...x, [f.code]: r })); }}>
            {sent[f.code] && sent[f.code] !== "…" ? label[sent[f.code]] ?? "Invite" : "Invite"}
          </Button>
        </HStack>
      ))}
    </VStack>
  );
};

const ShareCode = ({ code }: { code: string }) => {
  const [copied, setCopied] = useState(false);
  const link = typeof window !== "undefined" ? `${window.location.origin}/party?join=${code}` : `/party?join=${code}`;
  const share = async () => {
    sound.play("click");
    const text = `Join my party in Ludo Sync: ${formatRoomCode(code)}`;
    try {
      if (navigator.share) await navigator.share({ title: "Ludo Sync party", text, url: link });
      else { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    } catch { /* share closed */ }
  };
  return (
    <Panel title="Invite people" sub="They scan this, open the link, or type the code under Join a party.">
      <Flex mt={3} gap={4} align="center" direction={{ base: "column", sm: "row" }}>
        <Box bg="white" p={2} borderRadius="xl" flexShrink={0}><QRCodeSVG value={link} size={150} level="M" role="img" aria-label="QR code that opens this party" /></Box>
        <VStack flex={1} align="stretch" spacing={2} w="100%">
          <Text fontSize="xs" color="gray.400" textTransform="uppercase" letterSpacing=".12em" fontWeight={800}>Party code</Text>
          <Text fontFamily="mono" fontSize="4xl" fontWeight={900} letterSpacing=".12em" lineHeight={1} aria-label={`Party code ${code.split("").join(" ")}`}>{formatRoomCode(code)}</Text>
          <Button colorScheme="blue" onClick={share}>{copied ? "Link copied ✓" : "Share invite"}</Button>
        </VStack>
      </Flex>
      <InviteFriends code={code} />
    </Panel>
  );
};

/** Before a party: start one or join one, online or nearby. */
const Lobby = ({ joinCode }: { joinCode: string | null }) => {
  const v = useParty();
  const [name, setName] = useState(() => getSettings().playerName);
  const [code, setCode] = useState(joinCode ?? "");
  const [tab, setTab] = useState(0);
  const tried = useRef(false);
  const nearbySupported = useNearby().supported;
  const me = () => { const n = name.trim(); if (n && n !== getSettings().playerName) updateSettings({ playerName: n.slice(0, 20) }); return partyMe(); };
  const join = (c: string) => { sound.unlock(); sound.play("click"); void partyStore.joinOnline(me(), c); };

  // an invite link joins straight away
  useEffect(() => { if (joinCode && !tried.current) { tried.current = true; join(joinCode); } }, [joinCode]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <VStack spacing={4} w="100%">
      <Panel tone="#a855f7">
        <HStack spacing={3} align="center">
          <Flex w="52px" h="52px" borderRadius="16px" bg="linear-gradient(135deg,#a855f7,#2563eb)" align="center" justify="center" fontSize="28px" flexShrink={0} aria-hidden>🎉</Flex>
          <Box><Heading size="md">Play together</Heading><Text fontSize="sm" color="gray.200">Get everyone in first. Pick games after.</Text></Box>
        </HStack>
        <VStack align="stretch" spacing={2} mt={4}>
          <Step n={1} text="Start a party, or join a friend's." />
          <Step n={2} text="Everyone opens whichever game they like." />
          <Step n={3} text="The party plays the game most people picked, and a tie goes to a quick vote. Rooms open and fill by themselves." />
        </VStack>
      </Panel>

      <Box w="100%">
        <Text as="label" htmlFor="party-name" fontSize="xs" color="gray.400" textTransform="uppercase" letterSpacing=".12em" fontWeight={800}>Your name</Text>
        <Input id="party-name" mt={1} value={name} onChange={e => setName(e.target.value)} maxLength={20} placeholder="e.g. Sam" bg="whiteAlpha.100" size="lg" />
      </Box>

      {v.error && <Alert status="error" borderRadius="xl" bg="red.900" color="white"><AlertIcon />{v.error}</Alert>}

      <Tabs index={tab} onChange={setTab} variant="soft-rounded" colorScheme="purple" w="100%" isFitted>
        <TabList bg="whiteAlpha.100" p={1} borderRadius="full">
          <Tab color="gray.200" _selected={{ bg: "purple.500", color: "white" }}>🌐 Online</Tab>
          <Tab color="gray.200" _selected={{ bg: "purple.500", color: "white" }}>📶 Nearby</Tab>
        </TabList>
        <TabPanels>
          <TabPanel px={0}>
            <VStack spacing={4}>
              <Button w="100%" size="lg" h="60px" colorScheme="purple" isLoading={v.busy && !code} loadingText="Starting…" isDisabled={v.busy} onClick={() => { sound.unlock(); sound.play("click"); void partyStore.startOnline(me()); }}>Start a party</Button>
              <HStack w="100%" color="gray.500"><Box flex={1} h="1px" bg="whiteAlpha.300" /><Text fontSize="xs" textTransform="uppercase" letterSpacing=".12em">or join one</Text><Box flex={1} h="1px" bg="whiteAlpha.300" /></HStack>
              <HStack w="100%">
                <Input value={code.length > 3 ? `${code.slice(0, 3)}-${code.slice(3)}` : code} onChange={e => setCode(cleanRoomCode(e.target.value).slice(0, 6))} placeholder="ABC-123" aria-label="Party code"
                  fontFamily="mono" fontSize="xl" letterSpacing=".15em" textAlign="center" textTransform="uppercase" size="lg" bg="whiteAlpha.100" autoCapitalize="characters" autoComplete="off"
                  onKeyDown={e => { if (e.key === "Enter" && isRoomCode(code)) join(code); }} />
                <Button size="lg" colorScheme="blue" isDisabled={!isRoomCode(code) || v.busy} isLoading={v.busy && !!code} onClick={() => join(code)}>Join</Button>
              </HStack>
              <ScanButton onCode={c => { setCode(c); join(c); }} parse={extractRoomCode} label="Scan a party QR code" />
            </VStack>
          </TabPanel>
          <TabPanel px={0}>
            <VStack spacing={4}>
              <Text fontSize="sm" color="gray.300" w="100%">{nearbySupported
                ? "No internet needed. Phones with the app open find each other over Bluetooth or the same Wi-Fi: the leader taps a name, they tap Join."
                : "No internet needed. One phone shares a hotspot (or everyone is on the same Wi-Fi), and the leader pairs each phone once by swapping two QR codes."}</Text>
              <Button w="100%" size="lg" h="60px" colorScheme="cyan" onClick={() => { sound.unlock(); sound.play("click"); void partyStore.startNearby(me()); }}>Start a nearby party</Button>
              {nearbySupported && (
                <HStack w="100%" p={3} borderRadius="xl" bg="rgba(34,211,238,.08)" border="1px solid" borderColor="cyan.800" spacing={3}>
                  <Text fontSize="xl" aria-hidden>📡</Text>
                  <Text fontSize="sm" color="gray.200">To join, just keep the app open: the leader sees you nearby and invites you with one tap.</Text>
                </HStack>
              )}
              <Button w="100%" size="lg" h="60px" colorScheme="blue" variant="outline" color="white" onClick={() => { sound.unlock(); sound.play("click"); void partyStore.joinNearby(me()); }}>{nearbySupported ? "Join with QR codes instead" : "Join a nearby party"}</Button>
            </VStack>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </VStack>
  );
};

export default function PartyClient() {
  const v = useParty();
  const nearbySupported = useNearby().supported;
  const router = useRouter();
  const params = useSearchParams();
  const joinCode = extractRoomCode(params.get("join") ?? "");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const party = v.party;
  const s = party?.state ?? null;
  const me = partyMe();

  const back = () => { sound.play("click"); router.push("/"); };

  let body: React.ReactNode;
  if (!party && v.mode === "nearby" && v.desk) {
    body = (
      <VStack spacing={4} w="100%">
        <Panel title="Join a nearby party" sub="On the leader's phone: Party → Nearby → Start, then Add a player. Scan the code it shows, then let the leader scan yours.">
          <Box mt={3}><GuestPairing desk={v.desk} /></Box>
        </Panel>
        <Button variant="ghost" color="gray.300" onClick={() => partyStore.cancel()}>Cancel</Button>
      </VStack>
    );
  } else if (!party && v.busy) {
    body = <VStack py={16} spacing={4}><Spinner size="xl" color="purple.300" thickness="4px" /><Text color="gray.300">Connecting to the party…</Text></VStack>;
  } else if (!party || !s) {
    body = <Lobby joinCode={joinCode} />;
  } else {
    const leaderName = s.members.find(m => m.leader)?.name ?? "the leader";
    const invitePeer = async (peer: NearbyPeer) => partyStore.addLink(await nearbyPlayers().invite(peer, { k: "party", p: (party as PartyLeader).code }));
    const kept = partyStore.keptGame();
    body = (
      <VStack spacing={4} w="100%">
        {kept && (
          <Button as={Link} href={kept.href} w="100%" h="64px" colorScheme="teal" fontSize="lg" onClick={() => sound.play("click")} leftIcon={<span aria-hidden>↩</span>}>
            Back to {gameTitle(kept.game)}
          </Button>
        )}
        <Panel tone="#a855f7" title={party.leader ? "Your party" : `${leaderName}'s party`} sub={`${s.members.length} ${s.members.length === 1 ? "person" : "people"} · ${v.mode === "nearby" ? "nearby, no internet" : "online"}`}>
          {s.vote
            ? <Text mt={3} fontWeight={800} color="purple.200">Voting on the next game…</Text>
            : s.room ? <Text mt={3} fontWeight={800} color="teal.200">Playing {gameTitle(s.room.game)}</Text>
            : s.target ? <Text mt={3} fontWeight={800} color="teal.200">{party.leader ? "Opening" : `${leaderName} is opening`} {gameTitle(s.target)}…</Text>
            : <Text mt={3} fontWeight={800} color="gray.200">{s.members.length < 2 ? "Waiting for people to join…" : "Waiting for everyone to pick a game"}</Text>}
          <Members s={s} myId={me.id} />
        </Panel>

        {party.leader && v.mode === "online" && <ShareCode code={(party as PartyLeader).code} />}
        {party.leader && v.mode === "online" && nearbySupported && (
          <Panel title="People nearby" sub="Friends with the app open nearby can join in one tap, no code needed.">
            <Box mt={3}><NearbyPeople title="Nearby now" onInvite={invitePeer} exclude={s.members.map(m => m.id)} /></Box>
          </Panel>
        )}
        {party.leader && v.mode === "nearby" && v.desk && (
          <Panel title="Add players" sub={nearbySupported ? "Tap someone nearby to invite them. Each phone joins once." : "Each phone pairs once. Make an invite, let them scan it, then scan their reply."}>
            <Box mt={3}><HostInvites desk={v.desk} nearby={{ onInvite: invitePeer, exclude: s.members.map(m => m.id) }} /></Box>
            <Box mt={3}><ConnectionTips /></Box>
          </Panel>
        )}

        <GamePicker s={s} />

        {confirmEnd ? (
          <HStack w="100%">
            <Button flex={1} colorScheme="red" onClick={() => { sound.play("click"); partyStore.leave(); setConfirmEnd(false); }}>{party.leader ? "End it for everyone" : "Leave"}</Button>
            <Button flex={1} variant="ghost" color="gray.200" onClick={() => setConfirmEnd(false)}>Keep the party</Button>
          </HStack>
        ) : (
          <Button w="100%" variant="ghost" color="red.300" onClick={() => setConfirmEnd(true)}>{party.leader ? "End party" : "Leave party"}</Button>
        )}
      </VStack>
    );
  }

  return (
    <Flex minH="100dvh" color="white" justify="center" px={4} pt="max(12px, env(safe-area-inset-top))" pb="max(96px, env(safe-area-inset-bottom))">
      <VStack w="100%" maxW="520px" spacing={4} align="stretch">
        <HStack>
          <IconButton aria-label="Back" icon={<ChevronLeftIcon boxSize={6} />} variant="ghost" color="white" onClick={back} />
          <Heading size="md">Party</Heading>
        </HStack>
        {body}
      </VStack>
    </Flex>
  );
}

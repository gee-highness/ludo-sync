"use client";

import { Box, Flex, HStack, Heading, IconButton, Image, Progress, Text, VStack } from "@chakra-ui/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sound } from "@/lib/client/audio";
import { GAMES } from "@/lib/games";
import { hasSaved } from "@/components/platform/useLocalTable";
import { orderByPins, usePins } from "@/lib/client/pins";
import { Credit } from "@/components/platform/Credit";
import { useFriends } from "@/components/friends/FriendsProvider";
import { headline, loadBook } from "@/lib/client/streak";
import { dailyChallenge, dailyDone, dateKey, loadDailyRecord } from "@/lib/client/daily";
import { levelFor, lifetimeTotal, loadProfile, rankFor, type LevelInfo, type RankInfo } from "@/lib/client/profile";
import { loadGame as loadLudo } from "@/lib/client/save";
import { loadGame as loadSkipBo } from "@/lib/skipbo/save";
import { dailyDone as sbDailyDone, loadDailyRecord as loadSbDaily, skipBoDaily } from "@/lib/skipbo/daily";
import { loadSkipBoRoom } from "@/hooks/useSkipBoOnline";
import { loadRoomRecord } from "@/lib/client/rooms";
import { loadHostRoom, loadRoom as loadGameRoom } from "@/components/platform/useGameOnline";
import { CardFace } from "@/components/skipbo/CardFace";
import { InstallButton } from "@/components/pwa/InstallButton";
import { OfflineBadge } from "@/components/pwa/OfflineBadge";

const Art = ({ id, icon }: { id: string; icon?: string }) =>
  icon ? <Box fontSize="52px" lineHeight="72px" w="72px" h="72px" textAlign="center" bg="whiteAlpha.200" borderRadius="18px" aria-hidden>{icon}</Box> : id === "skipbo" ? (
    <HStack spacing="-14px" aria-hidden>{[3, 0, 11].map((v, i) => <Box key={v} transform={`rotate(${(i - 1) * 14}deg) translateY(${i === 1 ? -3 : 2}px)`}><CardFace value={v} size="xs" /></Box>)}</HStack>
  ) : <Image src="/icons/icon-192x192.png" alt="" w="72px" h="72px" borderRadius="18px" boxShadow="0 6px 18px rgba(0,0,0,.45)" />;

interface Tile { key: string; href: string; accent: string; title: string; sub: string; tag?: string }

const Section = ({ label, tone = "gray.400", children, as = "section" }: { label: string; tone?: string; children: React.ReactNode; as?: "section" }) => (
  <VStack w="100%" align="stretch" spacing={3} as={as} aria-label={label}>
    <Text fontSize="xs" textTransform="uppercase" letterSpacing=".12em" color={tone} fontWeight={800} px={1}>{label}</Text>
    {children}
  </VStack>
);

const TileLink = ({ t }: { t: Tile }) => (
  <Flex as={Link} href={t.href} direction="column" gap={1} p={4} borderRadius="2xl" bg={`linear-gradient(135deg, ${t.accent}38, rgba(255,255,255,.04) 70%)`} border="1px solid" borderColor="whiteAlpha.200" boxShadow="card" flex="1 1 200px" minW={0}
    transition="transform .15s, border-color .15s" _hover={{ transform: "translateY(-2px)", borderColor: t.accent }} _focusVisible={{ outline: "3px solid #fde047" }} onClick={() => { sound.unlock(); sound.play("click"); }}>
    {t.tag && <Text fontSize="2xs" fontWeight={800} letterSpacing=".1em" textTransform="uppercase" color="yellow.200">{t.tag}</Text>}
    <Text fontWeight={800} noOfLines={1}>{t.title}</Text>
    <Text fontSize="xs" color="gray.300" noOfLines={2}>{t.sub}</Text>
  </Flex>
);

const QuickTile = ({ href, icon, title, sub, badge }: { href: string; icon: string; title: string; sub: string; badge?: number }) => (
  <Flex as={Link} href={href} flex="1 1 160px" minW={0} align="center" gap={3} p={3} borderRadius="2xl" bg="whiteAlpha.100" border="1px solid" borderColor={badge ? "sky.400" : "whiteAlpha.200"} boxShadow="card"
    transition="all .15s" _hover={{ bg: "whiteAlpha.200", transform: "translateY(-2px)" }} _focusVisible={{ outline: "3px solid #fde047" }} onClick={() => sound.play("click")}>
    <Flex w="44px" h="44px" borderRadius="14px" bg="whiteAlpha.200" align="center" justify="center" fontSize="22px" flexShrink={0} aria-hidden>{icon}</Flex>
    <Box minW={0} flex={1}><Text fontWeight={800}>{title}</Text><Text fontSize="xs" color="gray.300" noOfLines={2}>{sub}</Text></Box>
    {!!badge && <Text as="span" fontSize="xs" fontWeight={800} bg="sky.400" color="black" borderRadius="full" px={2} py="1px" aria-label={`${badge} waiting`}>{badge}</Text>}
  </Flex>
);

export default function HubScreen() {
  const [level, setLevel] = useState<LevelInfo | null>(null);
  const [rank, setRank] = useState<RankInfo | null>(null);
  const [resume, setResume] = useState<Record<string, boolean>>({});
  const [streaks, setStreaks] = useState<Record<string, { n: number; level: string }>>({});
  const [tiles, setTiles] = useState<{ continue: Tile[]; today: Tile[] }>({ continue: [], today: [] });

  const { pins, isPinned, toggle } = usePins();
  const friendsCtx = useFriends();
  const friendAlerts = (friendsCtx.snap?.requests.length ?? 0) + (friendsCtx.snap?.invites.length ?? 0);
  const friendCount = friendsCtx.snap?.friends.filter(f => f.confirmed).length ?? 0;
  const { pinned, others } = orderByPins(GAMES, pins);

  const renderCard = (g: (typeof GAMES)[number]) => (
    <Box as="li" key={g.id} w="100%" position="relative">
      <Flex as={Link} href={g.href} prefetch w="100%" textAlign="left" align="center" gap={4} p={4} pr={14} borderRadius="3xl" overflow="hidden" position="relative"
        bg={`linear-gradient(135deg, ${g.accent}40 0%, rgba(255,255,255,.05) 55%, rgba(255,255,255,.02) 100%)`} border="1px solid" borderColor="whiteAlpha.200" boxShadow="card"
        _hover={{ transform: "translateY(-3px)", boxShadow: "lift", borderColor: g.accent }} _active={{ transform: "scale(.99)" }} _focusVisible={{ outline: "3px solid #fde047" }} transition="all .18s"
        onClick={() => { sound.unlock(); sound.play("click"); }}>
        <Box position="absolute" left={0} top="14%" bottom="14%" w="4px" borderRightRadius="full" bg={g.accent} aria-hidden />
        <Box w="84px" display="grid" placeItems="center" flexShrink={0}><Art id={g.id} icon={g.icon} /></Box>
        <VStack align="start" spacing={1} flex={1} minW={0}>
          <HStack wrap="wrap" spacing={2}><Heading size="md" letterSpacing="-0.01em">{g.name}</Heading>{resume[g.id] && <Text as="span" fontSize="xs" fontWeight={800} bg="orange.400" color="black" borderRadius="full" px={2} py="1px">Saved game</Text>}{(streaks[g.id]?.n ?? 0) >= 2 && <Text as="span" fontSize="xs" fontWeight={800} bg="red.500" color="white" borderRadius="full" px={2} py="1px" aria-label={`${streaks[g.id].n} wins in a row against ${streaks[g.id].level} bots`}>🔥 {streaks[g.id].n}</Text>}</HStack>
          <Text fontSize="sm" color="gray.200" lineHeight="1.4" noOfLines={3}>{g.tagline}</Text>
          <Text fontSize="xs" color="gray.400" fontWeight={600}>{g.players}</Text>
        </VStack>
      </Flex>
      <IconButton aria-label={isPinned(g.id) ? `Unpin ${g.name}` : `Pin ${g.name} to the top`} aria-pressed={isPinned(g.id)} title={isPinned(g.id) ? "Unpin" : "Pin to the top"}
        position="absolute" top={2} right={2} size="md" variant="ghost" fontSize="xl" color={isPinned(g.id) ? "yellow.300" : "gray.400"} icon={<span aria-hidden>{isPinned(g.id) ? "★" : "☆"}</span>}
        _hover={{ bg: "whiteAlpha.300", color: "yellow.200" }} onClick={() => { sound.play("click"); toggle(g.id); }} />
    </Box>
  );

  useEffect(() => {
    const prof = loadProfile();
    setLevel(levelFor(prof.xp));
    setRank(rankFor(lifetimeTotal(prof)));
    const book = loadBook();
    setStreaks(Object.fromEntries(GAMES.map(g => { const h = headline(book, g.id); return [g.id, { n: h.record.current, level: h.level }]; })));
    const ludo = loadLudo(), sb = loadSkipBo(), room = loadSkipBoRoom();
    setResume({ ludo: !!ludo, skipbo: !!sb, ...Object.fromEntries(GAMES.filter(g => g.icon).map(g => [g.id, hasSaved(g.id)])) });
    const cont: Tile[] = [];
    if (ludo) cont.push({ key: "c-ludo", href: "/play?resume=1", accent: "#E53E3E", title: "Continue Ludo", sub: ludo.state.players.map(p => p.name).join(" · ") });
    if (sb) cont.push({ key: "c-sb", href: "/skipbo/play?resume=1", accent: "#2563eb", title: "Continue Skip-Bo", sub: sb.state.players.map(p => p.name).join(" · ") });
    if (room) cont.push({ key: "c-room", href: "/skipbo/online?rejoin=1", accent: "#2563eb", title: room.role === "host" ? "Reopen your Skip-Bo room" : "Rejoin Skip-Bo room", sub: `Room ${room.code.slice(0, 3)}-${room.code.slice(3)}` });
    const ludoRoom = loadRoomRecord();
    if (ludoRoom) cont.push({ key: "c-ludo-room", href: "/online?rejoin=1", accent: "#E53E3E", title: ludoRoom.role === "host" ? "Reopen your Ludo room" : "Rejoin Ludo room", sub: `Room ${ludoRoom.code.slice(0, 3)}-${ludoRoom.code.slice(3)}` });
    for (const g of GAMES.filter(x => x.icon)) {
      const h = loadHostRoom(g.id), r = loadGameRoom(g.id);
      if (h) cont.push({ key: `c-${g.id}-host`, href: `/g/${g.id}/online?reopen=1`, accent: g.accent, title: `Reopen your ${g.name} room`, sub: `Room ${h.save.code.slice(0, 3)}-${h.save.code.slice(3)}` });
      if (r) cont.push({ key: `c-${g.id}-room`, href: `/g/${g.id}/online?rejoin=1`, accent: g.accent, title: `Rejoin ${g.name} room`, sub: `Room ${r.code.slice(0, 3)}-${r.code.slice(3)}` });
    }
    const key = dateKey();
    const l = dailyChallenge(key), lr = loadDailyRecord(), s = skipBoDaily(key), sr = loadSbDaily();
    const state = (done: boolean, won: boolean, streak: number, blurb: string) => (done ? (won ? `Won today ✓${streak > 1 ? ` · ${streak} days in a row` : ""}` : "Played today. Try again for fun") : blurb);
    setTiles({
      continue: cont,
      today: [
        { key: "d-ludo", href: "/play?daily=1", accent: "#E53E3E", tag: "Today in Ludo", title: l.title, sub: state(dailyDone(lr, key), lr.won, lr.streakDays, l.blurb) },
        { key: "d-sb", href: "/skipbo/play?daily=1", accent: "#2563eb", tag: "Today in Skip-Bo", title: s.title, sub: state(sbDailyDone(sr, key), sr.won, sr.streakDays, s.blurb) },
      ],
    });
  }, []);

  return (
    <Flex minH="100dvh" color="white" justify="center" px={4} pt="max(16px, env(safe-area-inset-top))" pb="max(24px, env(safe-area-inset-bottom))">
      <VStack w="100%" maxW="520px" spacing={6} py={4}>
        {level && (
          <Flex as={Link} href="/profile" w="100%" align="center" gap={3} p={2} pr={4} borderRadius="full" bg="whiteAlpha.100" border="1px solid" borderColor="whiteAlpha.200" _hover={{ bg: "whiteAlpha.200" }} _focusVisible={{ outline: "3px solid #fde047" }} title={`${level.into} of ${level.need} experience to the next level`}>
            <Flex w="42px" h="42px" borderRadius="full" bg="linear-gradient(135deg,#6d28d9,#2563eb)" border="3px solid #fde047" align="center" justify="center" fontWeight={900} flexShrink={0}>{level.level}</Flex>
            <Box flex={1} minW={0}>
              <Text fontSize="sm" fontWeight={800}>Level {level.level}{rank ? ` · ${rank.rank.icon} ${rank.rank.name} · ★ ${rank.points.toLocaleString()}` : ""}</Text>
              <Progress value={level.fraction * 100} size="xs" borderRadius="full" colorScheme="yellow" bg="whiteAlpha.300" aria-hidden />
            </Box>
            <Text fontSize="xs" color="gray.300">Profile ›</Text>
          </Flex>
        )}
        <VStack spacing={3} pt={2}>
          <Image src="/icons/icon-192x192.png" alt="" w="72px" h="72px" borderRadius="22px" boxShadow="0 12px 34px -8px rgba(99,102,241,.7)" />
          <Heading as="h1" fontSize={{ base: "4xl", sm: "5xl" }} fontWeight={900} letterSpacing="-0.03em" bgGradient="linear(to-r, #fff, #c7d2fe 60%, #f0abfc)" bgClip="text">Ludo Sync</Heading>
          <Text color="gray.300" textAlign="center" maxW="360px" lineHeight="1.5">Classic games for you and your friends. Play on your own, with friends online, or with no internet at all.</Text>
          <OfflineBadge />
        </VStack>

        {tiles.continue.length > 0 && (
          <Section label="Pick up where you left off"><Flex gap={3} wrap="wrap">{tiles.continue.map(t => <TileLink key={t.key} t={t} />)}</Flex></Section>
        )}

        <Flex w="100%" gap={3} wrap="wrap">
          <QuickTile href="/friends" icon="👥" title="Friends" sub={friendCount ? `${friendCount} friend${friendCount === 1 ? "" : "s"} · invite in a tap` : "Invite in one tap"} badge={friendAlerts} />
          <QuickTile href="/cards" icon="🎴" title="Cards" sub="Card backs and courts" />
        </Flex>

        {pinned.length > 0 && (
          <Section label="★ Your favourites" tone="yellow.200"><VStack w="100%" spacing={4} as="ul" m={0} p={0} listStyleType="none">{pinned.map(renderCard)}</VStack></Section>
        )}
        <Section label={pinned.length > 0 ? "All games" : "Games"}>
          <VStack w="100%" spacing={4} as="ul" m={0} p={0} listStyleType="none" aria-label="Games">{others.map(renderCard)}</VStack>
        </Section>

        {tiles.today.length > 0 && (
          <Section label="Today's challenges"><Flex gap={3} wrap="wrap">{tiles.today.map(t => <TileLink key={t.key} t={t} />)}</Flex></Section>
        )}

        <Text fontSize="sm" color="gray.500">More games are on the way.</Text>
        <InstallButton />
        <Credit />
      </VStack>
    </Flex>
  );
}

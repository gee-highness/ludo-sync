"use client";

import { Box, Flex, HStack, Heading, Image, Progress, Text, VStack } from "@chakra-ui/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sound } from "@/lib/client/audio";
import { GAMES } from "@/lib/games";
import { dailyChallenge, dailyDone, dateKey, loadDailyRecord } from "@/lib/client/daily";
import { levelFor, lifetimeTotal, loadProfile, rankFor, type LevelInfo, type RankInfo } from "@/lib/client/profile";
import { loadGame as loadLudo } from "@/lib/client/save";
import { loadGame as loadSkipBo } from "@/lib/skipbo/save";
import { dailyDone as sbDailyDone, loadDailyRecord as loadSbDaily, skipBoDaily } from "@/lib/skipbo/daily";
import { loadSkipBoRoom } from "@/hooks/useSkipBoOnline";
import { CardFace } from "@/components/skipbo/CardFace";
import { InstallButton } from "@/components/pwa/InstallButton";
import { OfflineBadge } from "@/components/pwa/OfflineBadge";

const Art = ({ id }: { id: string }) =>
  id === "skipbo" ? (
    <HStack spacing="-14px" aria-hidden>{[3, 0, 11].map((v, i) => <Box key={v} transform={`rotate(${(i - 1) * 14}deg) translateY(${i === 1 ? -3 : 2}px)`}><CardFace value={v} size="xs" /></Box>)}</HStack>
  ) : <Image src="/icons/icon-192x192.png" alt="" w="72px" h="72px" borderRadius="18px" boxShadow="0 6px 18px rgba(0,0,0,.45)" />;

interface Tile { key: string; href: string; accent: string; title: string; sub: string; tag?: string }

const TileLink = ({ t }: { t: Tile }) => (
  <Flex as={Link} href={t.href} direction="column" gap={0} p={3} borderRadius="xl" bg="whiteAlpha.100" borderLeft="5px solid" borderLeftColor={t.accent} flex="1 1 200px" minW={0}
    _hover={{ bg: "whiteAlpha.200" }} _focusVisible={{ outline: "3px solid #fde047" }} onClick={() => { sound.unlock(); sound.play("click"); }}>
    {t.tag && <Text fontSize="2xs" fontWeight={800} textTransform="uppercase" color="yellow.200">{t.tag}</Text>}
    <Text fontWeight={800} noOfLines={1}>{t.title}</Text>
    <Text fontSize="xs" color="gray.300" noOfLines={2}>{t.sub}</Text>
  </Flex>
);

export default function HubScreen() {
  const [level, setLevel] = useState<LevelInfo | null>(null);
  const [rank, setRank] = useState<RankInfo | null>(null);
  const [resume, setResume] = useState<Record<string, boolean>>({});
  const [tiles, setTiles] = useState<{ continue: Tile[]; today: Tile[] }>({ continue: [], today: [] });

  useEffect(() => {
    const prof = loadProfile();
    setLevel(levelFor(prof.xp));
    setRank(rankFor(lifetimeTotal(prof)));
    const ludo = loadLudo(), sb = loadSkipBo(), room = loadSkipBoRoom();
    setResume({ ludo: !!ludo, skipbo: !!sb });
    const cont: Tile[] = [];
    if (ludo) cont.push({ key: "c-ludo", href: "/play?resume=1", accent: "#E53E3E", title: "Continue Ludo", sub: ludo.state.players.map(p => p.name).join(" · ") });
    if (sb) cont.push({ key: "c-sb", href: "/skipbo/play?resume=1", accent: "#2563eb", title: "Continue Skip-Bo", sub: sb.state.players.map(p => p.name).join(" · ") });
    if (room) cont.push({ key: "c-room", href: "/skipbo/online?rejoin=1", accent: "#2563eb", title: room.role === "host" ? "Reopen your Skip-Bo room" : "Rejoin Skip-Bo room", sub: `Room ${room.code.slice(0, 3)}-${room.code.slice(3)}` });
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
    <Flex minH="100dvh" bg="radial-gradient(circle at 50% 0%, #444444 0%, #303030 60%)" color="white" justify="center" px={4}
      pt="max(16px, env(safe-area-inset-top))" pb="max(16px, env(safe-area-inset-bottom))">
      <VStack w="100%" maxW="500px" spacing={5} py={4}>
        {level && (
          <Flex as={Link} href="/profile" w="100%" align="center" gap={3} p={2} pr={4} borderRadius="full" bg="whiteAlpha.100" _hover={{ bg: "whiteAlpha.200" }} _focusVisible={{ outline: "3px solid #fde047" }} title={`${level.into} of ${level.need} experience to the next level`}>
            <Flex w="42px" h="42px" borderRadius="full" bg="linear-gradient(135deg,#4c1d95,#1e3a8a)" border="3px solid #fde047" align="center" justify="center" fontWeight={900} flexShrink={0}>{level.level}</Flex>
            <Box flex={1} minW={0}>
              <Text fontSize="sm" fontWeight={800}>Level {level.level}{rank ? ` · ${rank.rank.icon} ${rank.rank.name} · ★ ${rank.points.toLocaleString()}` : ""}</Text>
              <Progress value={level.fraction * 100} size="xs" borderRadius="full" colorScheme="yellow" bg="whiteAlpha.300" aria-hidden />
            </Box>
            <Text fontSize="xs" color="gray.300">Profile ›</Text>
          </Flex>
        )}
        <Heading as="h1" size="2xl" letterSpacing="-0.02em">Ludo Sync</Heading>
        <Text color="gray.300" textAlign="center">Classic games for you and your friends. Play on your own, with friends online, or with no internet at all.</Text>
        <OfflineBadge />

        {tiles.continue.length > 0 && (
          <VStack w="100%" align="stretch" spacing={2} as="section" aria-label="Continue">
            <Text fontSize="xs" textTransform="uppercase" color="gray.400" fontWeight={800}>Pick up where you left off</Text>
            <Flex gap={2} wrap="wrap">{tiles.continue.map(t => <TileLink key={t.key} t={t} />)}</Flex>
          </VStack>
        )}

        <VStack w="100%" spacing={3} as="ul" m={0} p={0} listStyleType="none" aria-label="Games">
          {GAMES.map(g => (
            <Box as="li" key={g.id} w="100%">
              <Flex as={Link} href={g.href} prefetch w="100%" textAlign="left" align="center" gap={4} p={4} borderRadius="2xl" bg="whiteAlpha.100" border="2px solid" borderColor="whiteAlpha.200" borderLeftColor={g.accent} borderLeftWidth="6px"
                _hover={{ bg: "whiteAlpha.200", transform: "translateY(-2px)" }} _focusVisible={{ outline: "3px solid #fde047" }} transition="all .15s"
                onClick={() => { sound.unlock(); sound.play("click"); }}>
                <Box w="84px" display="grid" placeItems="center" flexShrink={0}><Art id={g.id} /></Box>
                <VStack align="start" spacing={1} flex={1} minW={0}>
                  <HStack><Heading size="md">{g.name}</Heading>{resume[g.id] && <Text as="span" fontSize="xs" fontWeight={800} bg="orange.400" color="black" borderRadius="full" px={2} py="1px">Saved game</Text>}</HStack>
                  <Text fontSize="sm" color="gray.300">{g.tagline}</Text>
                  <Text fontSize="xs" color="gray.400">{g.players}</Text>
                </VStack>
              </Flex>
            </Box>
          ))}
        </VStack>

        {tiles.today.length > 0 && (
          <VStack w="100%" align="stretch" spacing={2} as="section" aria-label="Today's challenges">
            <Text fontSize="xs" textTransform="uppercase" color="gray.400" fontWeight={800}>Today&apos;s challenges</Text>
            <Flex gap={2} wrap="wrap">{tiles.today.map(t => <TileLink key={t.key} t={t} />)}</Flex>
          </VStack>
        )}

        <Text fontSize="sm" color="gray.500">More games are on the way.</Text>
        <InstallButton />
        <Text fontSize="sm" color="gray.500">Made by <a href="https://synapse-digital.vercel.app" style={{ fontWeight: 700, display: "inline-block", padding: "10px 4px" }}>Synapse Digital</a></Text>
      </VStack>
    </Flex>
  );
}

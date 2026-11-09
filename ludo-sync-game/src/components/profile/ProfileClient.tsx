"use client";

import { Box, Button, Flex, Grid, HStack, Heading, IconButton, Progress, SimpleGrid, Switch, Text, VStack } from "@chakra-ui/react";
import { ChevronLeftIcon } from "@chakra-ui/icons";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ACHIEVEMENTS, evaluate as evaluateLudo } from "@/lib/client/achievements";
import { levelFor, lifetimeTotal, loadProfile, rankFor, RANKS, type Profile } from "@/lib/client/profile";
import { loadStats as loadLudoStats, type Stats } from "@/lib/client/stats";
import { CARD_BACKS, FELTS, isUnlocked } from "@/lib/client/unlocks";
import { evaluate as evaluateSkipBo } from "@/lib/skipbo/achievements";
import { loadDailyRecord, type SkipBoDailyRecord } from "@/lib/skipbo/daily";
import { updatePrefs, usePrefs } from "@/lib/skipbo/prefs";
import { loadStats as loadSkipBoStats, type SkipBoStats } from "@/lib/skipbo/stats";
import { CardFace } from "../skipbo/CardFace";
import { bestOf, loadBook, type StreakBook } from "@/lib/client/streak";

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "-");

const Medal = ({ icon, title, blurb, value, goal, done }: { icon: string; title: string; blurb: string; value: number; goal: number; done: boolean }) => (
  <Flex gap={3} align="center" p={3} borderRadius="xl" bg={done ? "whiteAlpha.200" : "whiteAlpha.100"} border="1px solid" borderColor={done ? "yellow.400" : "transparent"}>
    <Text fontSize="2xl" filter={done ? undefined : "grayscale(1)"} aria-hidden>{icon}</Text>
    <Box flex={1} minW={0}>
      <Text fontWeight={800} noOfLines={1}>{title}{done ? " ✓" : ""}</Text>
      <Text fontSize="xs" color="gray.300">{blurb}</Text>
      {!done && <Progress mt={1} size="xs" value={(value / goal) * 100} borderRadius="full" colorScheme="yellow" bg="whiteAlpha.200" aria-label={`${value} of ${goal}`} />}
    </Box>
    {!done && <Text fontSize="xs" color="gray.300">{value}/{goal}</Text>}
  </Flex>
);

export default function ProfileClient() {
  const prefs = usePrefs();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ludo, setLudo] = useState<Stats | null>(null);
  const [sb, setSb] = useState<SkipBoStats | null>(null);
  const [daily, setDaily] = useState<SkipBoDailyRecord | null>(null);
  const [book, setBook] = useState<StreakBook>({});
  useEffect(() => { setBook(loadBook()); setProfile(loadProfile()); setLudo(loadLudoStats()); setSb(loadSkipBoStats()); setDaily(loadDailyRecord()); }, []);
  if (!profile || !ludo || !sb) return null;
  const lv = levelFor(profile.xp);
  const life = lifetimeTotal(profile);
  const rk = rankFor(life);
  const ludoAch = evaluateLudo(ludo), sbAch = evaluateSkipBo(sb);
  const doneCount = ludoAch.filter(a => a.done).length + sbAch.filter(a => a.done).length;
  const total = ACHIEVEMENTS.length + sbAch.length;

  return (
    <Flex minH="100dvh" bg="transparent" color="white" justify="center" px={4} pt="max(12px, env(safe-area-inset-top))" pb="max(24px, env(safe-area-inset-bottom))">
      <VStack w="100%" maxW="680px" spacing={5} align="stretch">
        <HStack>
          <IconButton as={Link} href="/" aria-label="Back to games" icon={<ChevronLeftIcon boxSize={6} />} variant="ghost" color="white" />
          <Heading as="h1" size="md">Your profile</Heading>
        </HStack>

        <Flex gap={4} align="center" p={4} borderRadius="2xl" bg="linear-gradient(135deg,#4c1d95,#1e3a8a)" boxShadow="0 10px 30px rgba(0,0,0,.35)">
          <Flex w="84px" h="84px" borderRadius="full" bg="rgba(0,0,0,.35)" border="4px solid #fde047" align="center" justify="center" direction="column" flexShrink={0} aria-label={`Level ${lv.level}`}>
            <Text fontSize="xs" color="yellow.200" lineHeight={1}>LEVEL</Text>
            <Text fontSize="3xl" fontWeight={900} lineHeight={1}>{lv.level}</Text>
          </Flex>
          <Box flex={1} minW={0}>
            <Text fontWeight={800}>{lv.xp.toLocaleString()} XP in total</Text>
            <Progress mt={2} value={lv.fraction * 100} borderRadius="full" h="10px" colorScheme="yellow" bg="blackAlpha.400" aria-label={`${lv.into} of ${lv.need} to level ${lv.level + 1}`} />
            <Text fontSize="sm" color="whiteAlpha.800" mt={1}>{lv.need - lv.into} XP to level {lv.level + 1}</Text>
            <Text fontSize="xs" color="whiteAlpha.700">Every point you score in a game becomes XP when it ends. {profile.today.date && profile.today.played ? `${profile.today.played} game${profile.today.played === 1 ? "" : "s"} today.` : ""}</Text>
          </Box>
        </Flex>

        <Box as="section" aria-label="Lifetime points" p={4} borderRadius="2xl" bg="whiteAlpha.100" border="1px solid" borderColor="whiteAlpha.300">
          <Flex align="center" gap={3} wrap="wrap">
            <Text fontSize="3xl" aria-hidden>{rk.rank.icon}</Text>
            <Box flex={1} minW="180px">
              <Text fontSize="xs" textTransform="uppercase" color="gray.300" fontWeight={800}>Lifetime points</Text>
              <Text fontSize="3xl" fontWeight={900} lineHeight={1.1}>★ {life.toLocaleString()}</Text>
              <Text fontWeight={800} color="yellow.200">{rk.rank.name}</Text>
            </Box>
            <Box textAlign="right" fontSize="sm" color="gray.200">
              <Text>Ludo: ★ {profile.lifetime.ludo.toLocaleString()}</Text>
              <Text>Skip-Bo: ★ {profile.lifetime.skipbo.toLocaleString()}</Text>
              <Text color="gray.300">Best game: ★ {Math.max(profile.best.ludo, profile.best.skipbo)}</Text>
            </Box>
          </Flex>
          {rk.next ? (
            <>
              <Progress mt={3} value={rk.fraction * 100} borderRadius="full" h="8px" colorScheme="orange" bg="blackAlpha.400" aria-label={`${rk.into} of ${rk.need} points to ${rk.next.name}`} />
              <Text fontSize="sm" color="gray.200" mt={1}>{(rk.next.at - life).toLocaleString()} more points to reach {rk.next.icon} {rk.next.name}</Text>
            </>
          ) : <Text fontSize="sm" color="gray.200" mt={2}>You have reached the top rank. Thank you for playing.</Text>}
          <HStack mt={3} spacing={2} wrap="wrap" aria-label="All ranks">
            {RANKS.map((r, i) => (
              <Text key={r.name} fontSize="xs" px={2} py="2px" borderRadius="full" bg={i <= rk.index ? "yellow.400" : "whiteAlpha.200"} color={i <= rk.index ? "black" : "gray.200"} fontWeight={700}>{r.icon} {r.name} · {r.at.toLocaleString()}</Text>
            ))}
          </HStack>
          <Text fontSize="xs" color="gray.300" mt={2}>Every point you score in a game is added here and never taken away. Experience (above) is made from the same points.</Text>
        </Box>

        <SimpleGrid columns={{ base: 1, sm: 2 }} gap={3}>
          <Box p={4} borderRadius="xl" bg="whiteAlpha.100" borderLeft="6px solid #E53E3E">
            <Heading size="sm" mb={2}>Ludo</Heading>
            <Text fontSize="sm">{profile.games.ludo.played} played · {profile.games.ludo.won} won ({pct(profile.games.ludo.won, profile.games.ludo.played)})</Text>
            <Text fontSize="sm" color="gray.300">{ludo.captures} sent home · best streak {Math.max(ludo.bestStreak, bestOf(book, "ludo"))} · {ludo.vehicles.length} vehicles raced</Text>
          </Box>
          <Box p={4} borderRadius="xl" bg="whiteAlpha.100" borderLeft="6px solid #2563eb">
            <Heading size="sm" mb={2}>Skip-Bo</Heading>
            <Text fontSize="sm">{profile.games.skipbo.played} played · {profile.games.skipbo.won} won ({pct(profile.games.skipbo.won, profile.games.skipbo.played)})</Text>
            <Text fontSize="sm" color="gray.300">{sb.piles} piles cleared · best turn {sb.bestTurn} cards · {sb.tournamentsWon} tournaments · best bot streak {bestOf(book, "skipbo")}{daily && daily.streakDays > 1 ? ` · daily streak ${daily.streakDays}` : ""}</Text>
          </Box>
        </SimpleGrid>

        <VStack align="stretch" spacing={3} as="section" aria-label="Card backs and tables">
          <Heading size="sm">Skip-Bo look</Heading>
          <Text fontSize="sm" color="gray.300">Unlock new card backs and table cloths as you level up.</Text>
          <HStack spacing={3} overflowX="auto" py={2} role="radiogroup" aria-label="Card back">
            {CARD_BACKS.map(b => {
              const open = isUnlocked(b, lv.level);
              return (
                <VStack key={b.id} as="button" spacing={1} flexShrink={0} role="radio" aria-checked={prefs.back === b.id} aria-label={`${b.name}${open ? "" : `, unlocks at level ${b.level}`}`} disabled={!open}
                  onClick={() => open && updatePrefs({ back: b.id })} opacity={open ? 1 : 0.5} outline={prefs.back === b.id ? "3px solid #fde047" : "none"} outlineOffset="3px" borderRadius="10px" p={1}>
                  <CardFace faceDown size="sm" backId={b.id} />
                  <Text fontSize="xs">{open ? b.name : `🔒 Lv ${b.level}`}</Text>
                </VStack>
              );
            })}
          </HStack>
          <HStack spacing={3} overflowX="auto" py={2} role="radiogroup" aria-label="Table cloth">
            {FELTS.map(f => {
              const open = isUnlocked(f, lv.level);
              return (
                <VStack key={f.id} as="button" spacing={1} flexShrink={0} role="radio" aria-checked={prefs.felt === f.id} aria-label={`${f.name}${open ? "" : `, unlocks at level ${f.level}`}`} disabled={!open}
                  onClick={() => open && updatePrefs({ felt: f.id })} opacity={open ? 1 : 0.5} outline={prefs.felt === f.id ? "3px solid #fde047" : "none"} outlineOffset="3px" borderRadius="10px" p={1}>
                  <Box w="64px" h="44px" borderRadius="8px" bg={`radial-gradient(circle at 50% 30%, ${f.base}, ${f.dark})`} border="2px solid rgba(255,255,255,.4)" />
                  <Text fontSize="xs">{open ? f.name : `🔒 Lv ${f.level}`}</Text>
                </VStack>
              );
            })}
          </HStack>
          <Flex justify="space-between" align="center"><Text fontSize="sm">Shapes on the cards (for colour blindness)</Text><Switch isChecked={prefs.marks} onChange={e => updatePrefs({ marks: e.target.checked })} colorScheme="yellow" aria-label="Shapes on the cards" /></Flex>
          <Flex justify="space-between" align="center"><Text fontSize="sm">Larger cards on the flat table</Text><Switch isChecked={prefs.large} onChange={e => updatePrefs({ large: e.target.checked })} colorScheme="yellow" aria-label="Larger cards" /></Flex>
        </VStack>

        <VStack align="stretch" spacing={2} as="section" aria-label="Achievements">
          <Heading size="sm">Achievements · {doneCount} of {total}</Heading>
          <Text fontSize="xs" color="gray.300" textTransform="uppercase">Ludo</Text>
          <Grid templateColumns={{ base: "1fr", sm: "1fr 1fr" }} gap={2}>
            {ludoAch.map(a => <Medal key={a.achievement.id} icon={a.achievement.icon} title={a.achievement.title} blurb={a.achievement.blurb} value={a.value} goal={a.achievement.goal} done={a.done} />)}
          </Grid>
          <Text fontSize="xs" color="gray.300" textTransform="uppercase" mt={2}>Skip-Bo</Text>
          <Grid templateColumns={{ base: "1fr", sm: "1fr 1fr" }} gap={2}>
            {sbAch.map(a => <Medal key={a.achievement.id} icon={a.achievement.icon} title={a.achievement.title} blurb={a.achievement.blurb} value={a.value} goal={a.achievement.goal} done={a.done} />)}
          </Grid>
        </VStack>

        <VStack align="stretch" spacing={2} as="section" aria-label="Recent games">
          <Heading size="sm">Recent games</Heading>
          {profile.recent.length === 0 && <Text fontSize="sm" color="gray.300">Play a game and it will show up here.</Text>}
          {profile.recent.map((g, i) => (
            <HStack key={i} p={3} borderRadius="lg" bg="whiteAlpha.100" justify="space-between">
              <Text fontSize="sm" fontWeight={700}>{g.game === "ludo" ? "Ludo" : "Skip-Bo"} · {g.won ? "won" : "played"}</Text>
              <Text fontSize="sm" color="gray.300">{g.date} · ★ {g.points} · <b>+{g.xp} XP</b></Text>
            </HStack>
          ))}
        </VStack>
        <Button as={Link} href="/" variant="outline" color="white">Back to games</Button>
      </VStack>
    </Flex>
  );
}

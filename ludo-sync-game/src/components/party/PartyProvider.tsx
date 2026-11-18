"use client";

import { Avatar, AvatarGroup, Box, Button, Collapse, Flex, HStack, Progress, Text, VStack } from "@chakra-ui/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { sound } from "@/lib/client/audio";
import { getSettings } from "@/lib/client/settings";
import { getClientId } from "@/lib/net/identity";
import type { Party, PartyState } from "@/lib/party/session";
import { gameAccent, gameForPath, gameTitle, onlinePathFor, partyStore } from "@/lib/party/store";

/** This device's identity in a party. */
export const partyMe = () => ({ id: getClientId(), name: getSettings().playerName.trim() || "Player" });
export const useParty = () => useSyncExternalStore(partyStore.subscribe, partyStore.get, partyStore.get);

const AUTO_MS = 4000;

/** Counts down to an automatic move, which the player can take at once or put off. */
const useCountdown = (key: string | null, ms: number, go: () => void) => {
  const [left, setLeft] = useState(ms);
  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    if (!key) return;
    const end = Date.now() + ms;
    setLeft(ms);
    const t = setInterval(() => {
      const l = end - Date.now();
      setLeft(Math.max(0, l));
      if (l <= 0) { clearInterval(t); goRef.current(); }
    }, 100);
    return () => clearInterval(t);
  }, [key, ms]);
  return left;
};

const Card = ({ accent, children, label }: { accent: string; children: React.ReactNode; label: string }) => (
  <Box pointerEvents="auto" w="100%" maxW="460px" bg="rgba(17,24,39,.96)" backdropFilter="blur(10px)" color="white" borderRadius="2xl" p={4} border="1px solid" borderColor="whiteAlpha.300"
    boxShadow={`0 18px 40px -12px rgba(0,0,0,.7), 0 0 0 1px ${accent}55 inset`} role="region" aria-label={label} aria-live="polite">
    {children}
  </Box>
);

const statusLine = (party: Party, s: PartyState, mine: string | null): string => {
  const leaderName = s.members.find(m => m.leader)?.name ?? "The leader";
  if (s.vote) return "Vote for the next game";
  if (s.room) return mine === s.room.game ? `Playing ${gameTitle(s.room.game)}` : `Playing ${gameTitle(s.room.game)} · tap Join`;
  if (s.target) return party.leader ? `Opening ${gameTitle(s.target)}…` : `${leaderName} is opening ${gameTitle(s.target)}…`;
  const inGames = s.members.filter(m => m.game).length;
  return inGames ? "Choosing the game…" : "Everyone pick any game";
};

/** Who is where, as a short list. */
export const Members = ({ s, myId }: { s: PartyState; myId: string }) => (
  <VStack align="stretch" spacing={1.5} mt={3}>
    {s.members.map(m => (
      <HStack key={m.id} spacing={3} p={2} borderRadius="lg" bg="whiteAlpha.100">
        <Avatar size="xs" name={m.name} bg={gameAccent(m.game)} color="white" />
        <Text fontWeight={700} flex={1} noOfLines={1}>{m.name}{m.id === myId ? " (you)" : ""}{m.leader ? " 👑" : ""}</Text>
        <Text fontSize="xs" color={m.game ? "white" : "gray.400"} bg={m.game ? `${gameAccent(m.game)}55` : "transparent"} px={2} py="1px" borderRadius="full">{m.game ? gameTitle(m.game) : "Not in a game"}</Text>
      </HStack>
    ))}
  </VStack>
);

function PartyLayer() {
  const v = useParty();
  const router = useRouter();
  const path = usePathname() ?? "/";
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const party = v.party;
  const s = party?.state ?? null;
  const me = useMemo(partyMe, []);
  const mine = gameForPath(path);
  const inParty = params?.get("party") === "1";
  // a party game still running in the background after its screen was left
  const kept = party ? partyStore.keptGame() : null;
  const onKept = !!kept && mine === kept.game && inParty && path.startsWith(onlinePathFor(kept.game));
  const back = kept && !onKept ? kept : null;

  // an online party this device was in before a reload carries on
  useEffect(() => { partyStore.restore(partyMe()); }, []);
  // tell the party which game is open on this screen
  useEffect(() => { party?.setGame(mine); }, [party, mine, party?.status]);

  // what the party wants this phone to do next, if anything
  const next = useMemo((): { key: string; text: string; href: string } | null => {
    if (!party || !s || s.vote) return null;
    // you left a party game that is still running: offer the way back instead of pulling you in
    if (kept && kept.game === (party.leader ? s.target : s.room?.game)) return null;
    if (party.leader && s.target) {
      const here = mine === s.target && inParty && path.startsWith(onlinePathFor(s.target));
      return here ? null : { key: `host:${s.round}:${s.target}`, text: `Starting ${gameTitle(s.target)} for the party`, href: `${onlinePathFor(s.target)}?party=1` };
    }
    if (!party.leader && s.room) {
      const here = mine === s.room.game && inParty && params?.get("join") === s.room.code;
      return here ? null : { key: `join:${s.round}:${s.room.code}`, text: `Joining ${s.members.find(m => m.leader)?.name ?? "the leader"}'s ${gameTitle(s.room.game)}`, href: `${onlinePathFor(s.room.game)}?join=${s.room.code}&party=1` };
    }
    return null;
  }, [party, s, mine, inParty, path, params, kept]);

  const autoKey = next && next.key !== dismissed ? next.key : null;
  const go = () => { if (next) { sound.play("click"); setDismissed(next.key); router.push(next.href); } };
  const left = useCountdown(autoKey, AUTO_MS, go);

  // the vote clock
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!s?.vote) return; const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, [s?.vote]);
  const myVote = s?.vote?.votes[me.id];
  useEffect(() => { if (s?.vote) sound.play("turn"); }, [s?.vote?.deadline]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!party || !s) return null;
  const onPartyPage = path.startsWith("/party");
  const accent = gameAccent(s.room?.game ?? s.target ?? mine);

  return (
    <VStack position="fixed" left={2} right={2} bottom="max(10px, env(safe-area-inset-bottom))" zIndex={1900} spacing={2} pointerEvents="none" align="center">
      {s.vote && (
        <Card accent="#a855f7" label="Vote for the next game">
          <HStack justify="space-between"><Text fontWeight={900} fontSize="lg">Which game next?</Text><Text fontSize="sm" color="gray.300" aria-label="Seconds left">{Math.max(0, Math.ceil((s.vote.deadline - now) / 1000))}s</Text></HStack>
          <Text fontSize="sm" color="gray.300">It&apos;s a tie. Tap the game you want — most votes wins.</Text>
          <Progress mt={2} value={Math.max(0, (s.vote.deadline - now) / 200)} size="xs" borderRadius="full" colorScheme="purple" bg="whiteAlpha.200" aria-hidden />
          <VStack mt={3} spacing={2} align="stretch">
            {s.vote.options.map(g => {
              const votes = Object.values(s.vote!.votes).filter(x => x === g).length;
              const picked = myVote === g;
              return (
                <Button key={g} size="lg" h="56px" justifyContent="space-between" onClick={() => { sound.play("click"); party.vote(g); }} aria-pressed={picked}
                  bg={picked ? gameAccent(g) : `${gameAccent(g)}33`} border="2px solid" borderColor={picked ? "white" : `${gameAccent(g)}88`} color="white" _hover={{ bg: `${gameAccent(g)}aa` }}>
                  <Text>{gameTitle(g)}{picked ? " ✓" : ""}</Text>
                  <Text fontSize="sm" opacity={0.9}>{votes} vote{votes === 1 ? "" : "s"}</Text>
                </Button>
              );
            })}
          </VStack>
        </Card>
      )}

      {next && autoKey && (
        <Card accent={accent} label="Party">
          <Text fontWeight={900}>{next.text}</Text>
          <Text fontSize="sm" color="gray.300">Going in {Math.ceil(left / 1000)}…</Text>
          <Progress mt={2} value={(left / AUTO_MS) * 100} size="xs" borderRadius="full" bg="whiteAlpha.200" sx={{ "& > div": { background: accent } }} aria-hidden />
          <HStack mt={3}>
            <Button flex={1} colorScheme="teal" onClick={go}>{party.leader ? "Start now" : "Join now"}</Button>
            <Button flex={1} variant="ghost" color="gray.200" onClick={() => setDismissed(next.key)}>Not now</Button>
          </HStack>
        </Card>
      )}

      {!onPartyPage && (
        <Box pointerEvents="auto" w={open || back ? "100%" : "auto"} maxW="460px" bg="rgba(17,24,39,.92)" backdropFilter="blur(10px)" color="white" borderRadius={open || back || (next && !autoKey) ? "2xl" : "full"} border="1px solid" borderColor="whiteAlpha.300" boxShadow="0 10px 30px -10px rgba(0,0,0,.7)">
          <Flex as="button" w="100%" align="center" gap={2} px={3} py={2} onClick={() => { sound.play("click"); setOpen(o => !o); }} aria-expanded={open} aria-label={`Party: ${s.members.length} people. ${statusLine(party, s, mine)}`} _focusVisible={{ outline: "3px solid #fde047" }} borderRadius="full">
            <Text as="span" aria-hidden>🎉</Text>
            <AvatarGroup size="2xs" max={4} spacing="-6px">{s.members.map(m => <Avatar key={m.id} name={m.name} bg={gameAccent(m.game)} color="white" />)}</AvatarGroup>
            <Text fontSize="sm" fontWeight={700} noOfLines={1} textAlign="left" flex={open ? 1 : undefined}>{statusLine(party, s, mine)}</Text>
            <Text fontSize="xs" color="gray.400" aria-hidden>{open ? "▾" : "▴"}</Text>
          </Flex>
          {back && (
            <Box px={2} pb={2}>
              <Button size="md" w="100%" colorScheme="teal" onClick={() => { sound.play("click"); router.push(back.href); }} leftIcon={<span aria-hidden>↩</span>}>
                Back to {gameTitle(back.game)}
              </Button>
              <Text fontSize="xs" color="gray.400" textAlign="center" mt={1}>You&apos;re still in the game{back.host ? " — it keeps running for everyone" : ""}.</Text>
            </Box>
          )}
          {next && !autoKey && !open && !back && (
            <Box px={2} pb={2}><Button size="sm" w="100%" colorScheme="teal" onClick={go}>{party.leader ? `Start ${gameTitle(s.target)}` : `Join ${gameTitle(s.room?.game)}`}</Button></Box>
          )}
          <Collapse in={open} animateOpacity>
            <Box px={3} pb={3}>
              <Members s={s} myId={me.id} />
              <HStack mt={3}>
                <Button as={Link} href="/party" size="sm" flex={1} onClick={() => setOpen(false)}>Party screen</Button>
                {next && !autoKey && <Button size="sm" flex={1} colorScheme="teal" onClick={go}>{party.leader ? `Start ${gameTitle(s.target)}` : `Join ${gameTitle(s.room?.game)}`}</Button>}
              </HStack>
            </Box>
          </Collapse>
        </Box>
      )}
    </VStack>
  );
}

/** Keeps the party running on every screen: the party pill, votes, and moving everyone into the chosen game. */
export function PartyProvider({ children }: { children: React.ReactNode }) {
  return <>{children}<Suspense fallback={null}><PartyLayer /></Suspense></>;
}

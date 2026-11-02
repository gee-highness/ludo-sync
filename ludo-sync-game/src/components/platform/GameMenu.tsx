"use client";

import { Badge, Box, Button, Center, Collapse, HStack, Input, Select, Spinner, Text, VStack, useDisclosure } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { sound } from "@/lib/client/audio";
import { getSettings, updateSettings } from "@/lib/client/settings";
import { writeJSON } from "@/lib/client/storage";
import { headline, loadBook } from "@/lib/client/streak";
import { cleanName } from "@/lib/ludo/engine";
import { loadModule } from "@/lib/platform/registry";
import { describeRules, loadLastRules, saveLastRules, type RuleValues } from "@/lib/platform/rules";
import type { BotLevel, GameModule, SeatInfo } from "@/lib/platform/types";
import { OfflineBadge } from "../pwa/OfflineBadge";
import { RulesPanel } from "./RulesPanel";
import { Shell, Notice, BG } from "./Shell";
import { HowTo } from "./TableFrame";
import { loadSaved, setupKey, type LocalSetup } from "./useLocalTable";

const BOT_NAMES = ["Mia", "Leo", "Ava", "Max", "Zoe", "Kai", "Ivy", "Sam", "Eli"];

export default function GameMenu({ gameId }: { gameId: string }) {
  const router = useRouter();
  const help = useDisclosure();
  const rulesBox = useDisclosure();
  const [mod, setMod] = useState<GameModule | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [bots, setBots] = useState(1);
  const [level, setLevel] = useState<BotLevel>("normal");
  const [rules, setRules] = useState<RuleValues>({});
  const [passNames, setPassNames] = useState<string[]>(["", ""]);
  const [resume, setResume] = useState<string | null>(null);
  const [streak, setStreak] = useState<{ n: number; level: string; best: number } | null>(null);

  useEffect(() => {
    void loadModule(gameId).then(m => {
      setMod(m);
      if (!m) return;
      setRules(loadLastRules(gameId, m.driver.schema));
      setName(getSettings().playerName);
      setBots(Math.min(Math.max(m.driver.minPlayers === 1 ? 1 : 1, m.driver.minPlayers - 1), m.driver.maxPlayers - 1));
      setPassNames(Array.from({ length: m.driver.minPlayers }, () => ""));
      const s = loadSaved(gameId);
      setResume(s ? s.seats.map(x => x.name).join(" · ") : null);
      const h = headline(loadBook(), gameId);
      setStreak({ n: h.record.current, level: h.level, best: h.record.best });
    });
  }, [gameId]);

  if (mod === undefined) return <Center minH="100dvh" bg={BG}><Spinner color="white" size="xl" /></Center>;
  if (mod === null) return <Notice title="Unknown game" text="That game does not exist." onBack={() => router.push("/")} label="Back to the games" />;
  const d = mod.driver;

  const begin = (seats: SeatInfo[], hotseat: boolean) => {
    saveLastRules(gameId, rules);
    writeJSON(setupKey(gameId), { seats, rules, hotseat } satisfies LocalSetup);
    sound.unlock(); sound.play("click");
    router.push(`/g/${gameId}/play`);
  };
  const clean = cleanName(name, "Player");
  const playBots = () => {
    updateSettings({ playerName: clean });
    begin([{ name: clean, kind: "human" }, ...Array.from({ length: bots }, (_, i) => ({ name: BOT_NAMES[i % BOT_NAMES.length], kind: "bot" as const, level }))], false);
  };
  const playPass = () => begin(passNames.map((n, i) => ({ name: cleanName(n, `Player ${i + 1}`), kind: "human" as const })), true);
  const go = (path: string) => () => { sound.unlock(); sound.play("click"); router.push(path); };
  const lines = describeRules(d.schema, rules);

  return (
    <Shell title={d.name} onBack={() => router.push("/")} accent={mod.accent} pinId={gameId}>
      <Text color="gray.300">{mod.tagline}</Text>
      <HStack wrap="wrap">
        <Badge colorScheme="purple">{d.minPlayers} to {d.maxPlayers} players</Badge>
        {d.hidden && <Badge>hidden hands</Badge>}
        {streak && streak.n >= 2 && <Badge colorScheme="red" aria-label={`${streak.n} wins in a row against ${streak.level} bots`}>🔥 {streak.n} in a row</Badge>}
        {streak && streak.best >= 3 && <Badge colorScheme="orange">best streak {streak.best}</Badge>}
        <OfflineBadge />
      </HStack>

      {resume && <Button colorScheme="orange" size="lg" onClick={go(`/g/${gameId}/play?resume=1`)}>Resume game<Text as="span" fontSize="xs" ml={2} noOfLines={1}>{resume}</Text></Button>}

      <VStack align="stretch" spacing={3} bg="whiteAlpha.100" borderRadius="xl" p={4} as="section" aria-label="Play against bots">
        <Text fontWeight={800}>Play against bots</Text>
        <Input value={name} maxLength={20} onChange={e => setName(e.target.value)} bg="gray.700" border="none" aria-label="Your name" placeholder="Your name" />
        <HStack>
          <Select bg="gray.700" aria-label="Number of bots" value={bots} onChange={e => setBots(Number(e.target.value))}>
            {Array.from({ length: d.maxPlayers }, (_, i) => i).filter(n => n + 1 >= d.minPlayers && n <= d.maxPlayers - 1).map(n => <option key={n} value={n}>{n === 0 ? "No bots (solo)" : `${n} bot${n === 1 ? "" : "s"}`}</option>)}
          </Select>
          <Select bg="gray.700" aria-label="Bot level" value={level} onChange={e => setLevel(e.target.value as BotLevel)}>
            <option value="easy">Easy</option><option value="normal">Normal</option><option value="hard">Hard</option>
          </Select>
        </HStack>
        <Button colorScheme="yellow" size="lg" onClick={playBots}>Play</Button>
      </VStack>

      <VStack align="stretch" spacing={2} bg="whiteAlpha.100" borderRadius="xl" p={4} as="section" aria-label="Rules">
        <HStack justify="space-between">
          <Box minW={0}><Text fontWeight={800}>Rules: you decide</Text><Text fontSize="xs" color="gray.400" noOfLines={2}>{lines.length ? lines.join(" · ") : "Standard rules"}</Text></Box>
          <Button size="sm" variant="outline" color="white" onClick={rulesBox.onToggle} aria-expanded={rulesBox.isOpen}>{rulesBox.isOpen ? "Done" : "Change"}</Button>
        </HStack>
        <Collapse in={rulesBox.isOpen} animateOpacity unmountOnExit>
          <Box pt={2}><RulesPanel gameId={gameId} schema={d.schema} values={rules} onChange={v => { setRules(v); saveLastRules(gameId, v); }} /></Box>
        </Collapse>
      </VStack>

      <VStack align="stretch" spacing={2} bg="whiteAlpha.100" borderRadius="xl" p={4} as="section" aria-label="Pass and play">
        <Text fontWeight={800}>Pass and play on one device</Text>
        {passNames.map((n, i) => <Input key={i} value={n} maxLength={20} placeholder={`Player ${i + 1}`} bg="gray.700" border="none" aria-label={`Player ${i + 1} name`} onChange={e => setPassNames(l => l.map((x, j) => (j === i ? e.target.value : x)))} />)}
        <HStack>
          <Button size="sm" variant="outline" color="white" isDisabled={passNames.length >= d.maxPlayers} onClick={() => setPassNames(l => [...l, ""])}>Add a player</Button>
          <Button size="sm" variant="outline" color="white" isDisabled={passNames.length <= d.minPlayers} onClick={() => setPassNames(l => l.slice(0, -1))}>Remove one</Button>
        </HStack>
        <Button colorScheme="blue" onClick={playPass}>Start pass and play</Button>
      </VStack>

      <Button colorScheme="teal" size="lg" onClick={go(`/g/${gameId}/online`)}>Play with friends online</Button>
      <Button variant="outline" color="white" onClick={help.onOpen}>How to play</Button>
      <HowTo mod={mod} isOpen={help.isOpen} onClose={help.onClose} />
    </Shell>
  );
}

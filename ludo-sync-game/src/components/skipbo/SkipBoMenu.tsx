"use client";

import { Badge, Box, Button, HStack, Select, Text, VStack, useDisclosure, Input } from "@chakra-ui/react";
import { Shell } from "@/components/platform/Shell";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { sound } from "@/lib/client/audio";
import { getSettings, updateSettings } from "@/lib/client/settings";
import { cleanName } from "@/lib/ludo/engine";
import { loadGame } from "@/lib/skipbo/save";
import { loadStats, type SkipBoStats } from "@/lib/skipbo/stats";
import { clearSkipBoRoom, loadSkipBoRoom, type RoomRecord } from "@/hooks/useSkipBoOnline";
import { SettingsDrawer } from "@/components/game/SettingsDrawer";
import { OfflineBadge } from "@/components/pwa/OfflineBadge";
import { SkipBoHowToPlay } from "./HowToPlay";
import { lessonDone } from "@/lib/skipbo/lessonStore";
import { dailyDone, dateKey, loadDailyRecord, skipBoDaily, type SkipBoDaily, type SkipBoDailyRecord } from "@/lib/skipbo/daily";

type Level = "easy" | "normal" | "hard";

export default function SkipBoMenu() {
  const router = useRouter();
  const help = useDisclosure();
  const prefs = useDisclosure();
  const [name, setName] = useState("");
  const [bots, setBots] = useState(1);
  const [level, setLevel] = useState<Level>("normal");
  const [mode, setMode] = useState<"quick" | "tournament">("quick");
  const [stock, setStock] = useState<"official" | "20" | "10">("official");
  const [resume, setResume] = useState<string | null>(null);
  const [stats, setStats] = useState<SkipBoStats | null>(null);
  const [room, setRoom] = useState<RoomRecord | null>(null);
  const [learned, setLearned] = useState(true);
  const [today, setToday] = useState<{ d: SkipBoDaily; rec: SkipBoDailyRecord; done: boolean } | null>(null);
  const [passNames, setPassNames] = useState<string[]>(["", ""]);

  useEffect(() => {
    setName(getSettings().playerName);
    const saved = loadGame();
    setResume(saved ? saved.state.players.map(p => p.name).join(" · ") : null);
    setStats(loadStats());
    setRoom(loadSkipBoRoom());
    setLearned(lessonDone());
    const key = dateKey(), rec = loadDailyRecord();
    setToday({ d: skipBoDaily(key), rec, done: dailyDone(rec, key) });
  }, []);

  const go = (path: string) => () => { sound.unlock(); sound.play("click"); router.push(path); };
  const start = () => {
    const clean = cleanName(name, "Player");
    updateSettings({ playerName: clean });
    const q = new URLSearchParams({ name: clean, bots: String(bots), level, mode, stock });
    sound.unlock(); sound.play("click");
    router.push(`/skipbo/play?${q.toString()}`);
  };

  const startPass = () => {
    const names = passNames.map((n, i) => cleanName(n, `Player ${i + 1}`));
    const q = new URLSearchParams({ mode: "pass", names: names.join(","), game: mode, stock });
    sound.unlock(); sound.play("click");
    router.push(`/skipbo/play?${q.toString()}`);
  };

  return (
    <Shell title="Skip-Bo" onBack={go("/")} accent="#2563eb" pinId="skipbo">
        <Text color="gray.300" fontSize="md" lineHeight="1.5">Empty your stock pile first. Build 1 to 12, discard wisely, and block your rivals.</Text>
        <HStack wrap="wrap"><Badge colorScheme="purple">2 to 6 players</Badge><OfflineBadge /></HStack>

        <Button colorScheme={learned ? "gray" : "green"} variant={learned ? "outline" : "solid"} color={learned ? "white" : undefined} size={learned ? "md" : "lg"} h="auto" py={3} onClick={go("/skipbo/learn")}>
          <VStack spacing={0}><Text>{learned ? "Learn to play again" : "Learn to play: a quick guided lesson"}</Text>{!learned && <Text fontSize="xs" fontWeight={400}>Five minutes, and you earn XP</Text>}</VStack>
        </Button>

        {resume && <Button colorScheme="orange" size="lg" h="auto" py={3} onClick={go("/skipbo/play?resume=1")}><VStack spacing={0}><Text>Resume game</Text><Text fontSize="xs" fontWeight={400}>{resume}</Text></VStack></Button>}

        {today && (
          <Button colorScheme="orange" variant="outline" color="white" borderColor="orange.300" size="lg" h="auto" py={3} onClick={go("/skipbo/play?daily=1")}>
            <VStack spacing={0}>
              <Text>Daily challenge: {today.d.title}</Text>
              <Text fontSize="xs" fontWeight={400}>{today.done ? (today.rec.won ? `Won today ✓ · ${today.rec.streakDays} day${today.rec.streakDays === 1 ? "" : "s"} in a row` : "Played today. Try again for fun") : today.d.blurb}</Text>
            </VStack>
          </Button>
        )}

        <VStack align="stretch" spacing={3} bg="whiteAlpha.100" p={4} borderRadius="2xl" border="1px solid" borderColor="whiteAlpha.200" boxShadow="card">
          <Text fontWeight={800}>Play against bots</Text>
          <Box>
            <Text fontSize="sm" color="gray.300" mb={1}>Your name</Text>
            <Input value={name} placeholder="Player" maxLength={16} onChange={e => setName(e.target.value)} aria-label="Your name" />
          </Box>
          <HStack>
            <Box flex={1}>
              <Text fontSize="sm" color="gray.300" mb={1}>Opponents</Text>
              <Select value={bots} onChange={e => setBots(Number(e.target.value))} aria-label="Number of opponents">
                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n} style={{ color: "black" }}>{n}</option>)}
              </Select>
            </Box>
            <Box flex={1}>
              <Text fontSize="sm" color="gray.300" mb={1}>Skill</Text>
              <Select value={level} onChange={e => setLevel(e.target.value as Level)} aria-label="Bot skill">
                <option value="easy" style={{ color: "black" }}>Easy</option><option value="normal" style={{ color: "black" }}>Normal</option><option value="hard" style={{ color: "black" }}>Hard</option>
              </Select>
            </Box>
          </HStack>
          <HStack>
            <Box flex={1}>
              <Text fontSize="sm" color="gray.300" mb={1}>Game</Text>
              <Select value={mode} onChange={e => setMode(e.target.value as typeof mode)} aria-label="Game type">
                <option value="quick" style={{ color: "black" }}>One round</option><option value="tournament" style={{ color: "black" }}>Tournament to 500</option>
              </Select>
            </Box>
            <Box flex={1}>
              <Text fontSize="sm" color="gray.300" mb={1}>Stock pile</Text>
              <Select value={stock} onChange={e => setStock(e.target.value as typeof stock)} aria-label="Stock pile size">
                <option value="official" style={{ color: "black" }}>Official ({bots + 1 <= 4 ? 30 : 20})</option>
                <option value="20" style={{ color: "black" }}>20 cards</option><option value="10" style={{ color: "black" }}>10 (quick)</option>
              </Select>
            </Box>
          </HStack>
          <Button colorScheme="yellow" size="lg" onClick={start}>Deal the cards</Button>
        </VStack>

        <VStack align="stretch" spacing={3} bg="whiteAlpha.100" p={4} borderRadius="2xl" border="1px solid" borderColor="whiteAlpha.200" boxShadow="card">
          <Text fontWeight={800}>Pass and play</Text>
          <Text fontSize="sm" color="gray.300">Two to four people share one device. Each turn starts with a screen that hides the cards until the right person taps. It uses the game type and stock pile chosen above.</Text>
          {passNames.map((n, i) => (
            <Input key={i} value={n} placeholder={`Player ${i + 1}`} maxLength={16} aria-label={`Name of player ${i + 1}`}
              onChange={e => setPassNames(l => l.map((x, j) => (j === i ? e.target.value : x)))} />
          ))}
          <HStack>
            {passNames.length < 4 && <Button size="sm" variant="outline" color="white" onClick={() => setPassNames(l => [...l, ""])}>Add a player</Button>}
            {passNames.length > 2 && <Button size="sm" variant="outline" color="white" onClick={() => setPassNames(l => l.slice(0, -1))}>Remove one</Button>}
          </HStack>
          <Button colorScheme="purple" size="lg" onClick={startPass}>Deal the cards</Button>
        </VStack>

        {room && (
          <HStack w="100%" spacing={2} align="stretch">
            <Button colorScheme="orange" size="lg" flex={1} h="auto" py={3} onClick={go("/skipbo/online?rejoin=1")}>
              <VStack spacing={0}><Text>{room.role === "host" ? "Reopen your room" : "Rejoin online game"}</Text><Text fontSize="xs" fontWeight={400}>Room {room.code.slice(0, 3)}-{room.code.slice(3)}{room.role === "host" ? " · you are hosting" : ""}</Text></VStack>
            </Button>
            <Button variant="outline" color="white" h="auto" aria-label="Forget this online game" onClick={() => { clearSkipBoRoom(); setRoom(null); }}>✕</Button>
          </HStack>
        )}
        <Button colorScheme="blue" size="lg" onClick={go("/skipbo/online")}>Play with friends online</Button>
        <Button colorScheme="cyan" size="lg" h="auto" py={3} onClick={go("/skipbo/nearby")}><VStack spacing={0}><Text>Play nearby</Text><Text fontSize="xs" fontWeight={400}>Phones in the same room, no internet needed</Text></VStack></Button>
        <Button variant="outline" color="white" onClick={go("/profile")}>Profile, card backs and achievements</Button>
        <HStack spacing={3}><Button variant="outline" color="white" flex={1} onClick={help.onOpen}>How to play</Button><Button variant="outline" color="white" flex={1} onClick={prefs.onOpen}>Settings</Button></HStack>
        {stats && stats.played > 0 && <Text fontSize="sm" color="gray.400" textAlign="center">{stats.played} played · {stats.won} won · {stats.piles} piles completed</Text>}
      <SkipBoHowToPlay isOpen={help.isOpen} onClose={help.onClose} />
      <SettingsDrawer isOpen={prefs.isOpen} onClose={prefs.onClose} />
    </Shell>
  );
}

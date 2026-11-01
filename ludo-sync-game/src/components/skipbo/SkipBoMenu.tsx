"use client";

import { Box, Button, Flex, HStack, Heading, IconButton, Select, Text, VStack, useDisclosure, Input } from "@chakra-ui/react";
import { ChevronLeftIcon } from "@chakra-ui/icons";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { sound } from "@/lib/client/audio";
import { getSettings, updateSettings } from "@/lib/client/settings";
import { cleanName } from "@/lib/ludo/engine";
import { loadGame, loadStats, type SkipBoStats } from "@/lib/skipbo/save";
import { clearSkipBoRoom, loadSkipBoRoom, type RoomRecord } from "@/hooks/useSkipBoOnline";
import { CardFace } from "./CardFace";
import { SettingsDrawer } from "@/components/game/SettingsDrawer";
import { SkipBoHowToPlay } from "./HowToPlay";

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
  const [passNames, setPassNames] = useState<string[]>(["", ""]);

  useEffect(() => {
    setName(getSettings().playerName);
    const saved = loadGame();
    setResume(saved ? saved.state.players.map(p => p.name).join(" · ") : null);
    setStats(loadStats());
    setRoom(loadSkipBoRoom());
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
    <Flex minH="100dvh" bg="radial-gradient(ellipse at 50% 0%, #1f7a4d 0%, #14573a 55%, #0c3a27 100%)" color="white" justify="center" px={4}
      pt="max(12px, env(safe-area-inset-top))" pb="max(16px, env(safe-area-inset-bottom))">
      <VStack w="100%" maxW="440px" spacing={4} align="stretch" py={2}>
        <HStack>
          <IconButton aria-label="All games" icon={<ChevronLeftIcon boxSize={6} />} variant="ghost" color="white" onClick={go("/")} />
          <Text color="whiteAlpha.800" fontSize="sm">All games</Text>
        </HStack>
        <VStack spacing={2} pt={2}>
          <HStack spacing={-3} aria-hidden>
            {[0, 7, 12].map((v, i) => <Box key={v} transform={`rotate(${(i - 1) * 14}deg) translateY(${i === 1 ? -6 : 0}px)`}><CardFace value={v} size="md" /></Box>)}
          </HStack>
          <Heading size="2xl" letterSpacing="-0.02em">Skip-Bo</Heading>
          <Text color="whiteAlpha.800" textAlign="center">Empty your stock pile first. Build 1 to 12, discard wisely, and block your rivals.</Text>
        </VStack>

        {resume && <Button colorScheme="orange" size="lg" h="auto" py={3} onClick={go("/skipbo/play?resume=1")}><VStack spacing={0}><Text>Resume game</Text><Text fontSize="xs" fontWeight={400}>{resume}</Text></VStack></Button>}

        <VStack align="stretch" spacing={3} bg="blackAlpha.300" p={4} borderRadius="2xl" border="1px solid rgba(255,255,255,.15)">
          <Text fontWeight={800}>Play against bots</Text>
          <Box>
            <Text fontSize="sm" color="whiteAlpha.800" mb={1}>Your name</Text>
            <Input value={name} placeholder="Player" maxLength={16} onChange={e => setName(e.target.value)} bg="blackAlpha.400" border="none" aria-label="Your name" />
          </Box>
          <HStack>
            <Box flex={1}>
              <Text fontSize="sm" color="whiteAlpha.800" mb={1}>Opponents</Text>
              <Select value={bots} onChange={e => setBots(Number(e.target.value))} bg="blackAlpha.400" border="none" aria-label="Number of opponents">
                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n} style={{ color: "black" }}>{n}</option>)}
              </Select>
            </Box>
            <Box flex={1}>
              <Text fontSize="sm" color="whiteAlpha.800" mb={1}>Skill</Text>
              <Select value={level} onChange={e => setLevel(e.target.value as Level)} bg="blackAlpha.400" border="none" aria-label="Bot skill">
                <option value="easy" style={{ color: "black" }}>Easy</option><option value="normal" style={{ color: "black" }}>Normal</option><option value="hard" style={{ color: "black" }}>Hard</option>
              </Select>
            </Box>
          </HStack>
          <HStack>
            <Box flex={1}>
              <Text fontSize="sm" color="whiteAlpha.800" mb={1}>Game</Text>
              <Select value={mode} onChange={e => setMode(e.target.value as typeof mode)} bg="blackAlpha.400" border="none" aria-label="Game type">
                <option value="quick" style={{ color: "black" }}>One round</option><option value="tournament" style={{ color: "black" }}>Tournament to 500</option>
              </Select>
            </Box>
            <Box flex={1}>
              <Text fontSize="sm" color="whiteAlpha.800" mb={1}>Stock pile</Text>
              <Select value={stock} onChange={e => setStock(e.target.value as typeof stock)} bg="blackAlpha.400" border="none" aria-label="Stock pile size">
                <option value="official" style={{ color: "black" }}>Official ({bots + 1 <= 4 ? 30 : 20})</option>
                <option value="20" style={{ color: "black" }}>20 cards</option><option value="10" style={{ color: "black" }}>10 (quick)</option>
              </Select>
            </Box>
          </HStack>
          <Button colorScheme="yellow" size="lg" onClick={start}>Deal the cards</Button>
        </VStack>

        <VStack align="stretch" spacing={3} bg="blackAlpha.300" p={4} borderRadius="2xl" border="1px solid rgba(255,255,255,.15)">
          <Text fontWeight={800}>Pass and play</Text>
          <Text fontSize="sm" color="whiteAlpha.800">Two to four people share one device. Each turn starts with a screen that hides the cards until the right person taps. It uses the game type and stock pile chosen above.</Text>
          {passNames.map((n, i) => (
            <Input key={i} value={n} placeholder={`Player ${i + 1}`} maxLength={16} bg="blackAlpha.400" border="none" aria-label={`Name of player ${i + 1}`}
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
              <VStack spacing={0}><Text>Rejoin online game</Text><Text fontSize="xs" fontWeight={400}>Room {room.code.slice(0, 3)}-{room.code.slice(3)}</Text></VStack>
            </Button>
            <Button variant="outline" color="white" h="auto" aria-label="Forget this online game" onClick={() => { clearSkipBoRoom(); setRoom(null); }}>✕</Button>
          </HStack>
        )}
        <Button colorScheme="blue" size="lg" onClick={go("/skipbo/online")}>Play with friends online</Button>
        <Button colorScheme="cyan" size="lg" h="auto" py={3} onClick={go("/skipbo/nearby")}><VStack spacing={0}><Text>Play nearby</Text><Text fontSize="xs" fontWeight={400}>Phones in the same room, no internet needed</Text></VStack></Button>
        <HStack spacing={3}><Button variant="outline" color="white" flex={1} onClick={help.onOpen}>How to play</Button><Button variant="outline" color="white" flex={1} onClick={prefs.onOpen}>Settings</Button></HStack>
        {stats && stats.played > 0 && <Text fontSize="sm" color="whiteAlpha.700" textAlign="center">{stats.played} played · {stats.won} won · {stats.piles} piles completed</Text>}
      </VStack>
      <SkipBoHowToPlay isOpen={help.isOpen} onClose={help.onClose} />
      <SettingsDrawer isOpen={prefs.isOpen} onClose={prefs.onClose} />
    </Flex>
  );
}

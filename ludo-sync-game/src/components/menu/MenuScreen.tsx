"use client";

import { Box, Button, Flex, HStack, Heading, Image, Text, VStack, useDisclosure } from "@chakra-ui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { loadGame, type SavedGame } from "@/lib/client/save";
import { loadStats, type Stats } from "@/lib/client/stats";
import { sound } from "@/lib/client/audio";
import { HowToPlay } from "@/components/game/HowToPlay";
import { SettingsDrawer } from "@/components/game/SettingsDrawer";
import { InstallButton } from "@/components/pwa/InstallButton";
import { OfflineBadge } from "@/components/pwa/OfflineBadge";

export default function MenuScreen() {
  const router = useRouter();
  const help = useDisclosure();
  const prefs = useDisclosure();
  const [saved, setSaved] = useState<SavedGame | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => { setSaved(loadGame()); setStats(loadStats()); }, []);

  const go = (path: string) => () => { sound.unlock(); sound.play("click"); router.push(path); };

  return (
    <Flex minH="100dvh" bg="radial-gradient(circle at 50% 0%, #26335f 0%, #10172E 60%)" color="white" justify="center" align="center"
      px={4} pt="max(16px, env(safe-area-inset-top))" pb="max(16px, env(safe-area-inset-bottom))">
      <VStack w="100%" maxW="420px" spacing={4} py={6}>
        <Image src="/icons/icon-192x192.png" alt="" w="96px" h="96px" borderRadius="22px" boxShadow="0 10px 30px rgba(0,0,0,.45)" />
        <Heading size="2xl" letterSpacing="-0.02em">Ludo Sync</Heading>
        <Text color="gray.300" textAlign="center">Classic Ludo for 2 to 4 players. Works fully offline.</Text>
        <OfflineBadge />

        <VStack w="100%" spacing={3} pt={2}>
          {saved && (
            <Button colorScheme="orange" size="lg" w="100%" h="auto" py={3} onClick={go("/play?resume=1")}>
              <VStack spacing={0}>
                <Text>Resume game</Text>
                <Text fontSize="xs" fontWeight={400}>{saved.state.players.map(p => p.name).join(" · ")}</Text>
              </VStack>
            </Button>
          )}
          <Button colorScheme="teal" size="lg" w="100%" onClick={go("/play?preset=bot")}>Play vs bots</Button>
          <Button colorScheme="purple" size="lg" w="100%" onClick={go("/play?preset=local")}>Pass and play</Button>
          <Button colorScheme="blue" size="lg" w="100%" onClick={go("/online")}>Play with friends online</Button>
          <Button variant="outline" color="white" w="100%" onClick={go("/pieces")}>Piece maker</Button>
          <InstallButton />
          <HStack w="100%" spacing={3}>
            <Button variant="outline" color="white" flex={1} onClick={help.onOpen}>How to play</Button>
            <Button variant="outline" color="white" flex={1} onClick={prefs.onOpen}>Settings</Button>
          </HStack>
        </VStack>

        {stats && stats.played > 0 && (
          <Text fontSize="sm" color="gray.400" textAlign="center">
            {stats.played} played · {stats.won} won · {stats.captures} captures
          </Text>
        )}
        <Box pt={4}>
          <Text fontSize="sm" color="gray.500">
            Made by <Link href="https://synapse-digital.vercel.app" style={{ fontWeight: 700 }}>Synapse Digital</Link>
          </Text>
        </Box>
      </VStack>
      <HowToPlay isOpen={help.isOpen} onClose={help.onClose} />
      <SettingsDrawer isOpen={prefs.isOpen} onClose={prefs.onClose} />
    </Flex>
  );
}

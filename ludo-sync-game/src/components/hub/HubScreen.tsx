"use client";

import { Box, Flex, HStack, Heading, Image, Text, VStack } from "@chakra-ui/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sound } from "@/lib/client/audio";
import { GAMES } from "@/lib/games";
import { loadGame as loadLudo } from "@/lib/client/save";
import { loadGame as loadSkipBo } from "@/lib/skipbo/save";
import { CardFace } from "@/components/skipbo/CardFace";
import { InstallButton } from "@/components/pwa/InstallButton";
import { OfflineBadge } from "@/components/pwa/OfflineBadge";

const Art = ({ id }: { id: string }) =>
  id === "skipbo" ? (
    <HStack spacing="-14px" aria-hidden>{[3, 0, 11].map((v, i) => <Box key={v} transform={`rotate(${(i - 1) * 14}deg) translateY(${i === 1 ? -3 : 2}px)`}><CardFace value={v} size="xs" /></Box>)}</HStack>
  ) : <Image src="/icons/icon-192x192.png" alt="" w="72px" h="72px" borderRadius="18px" boxShadow="0 6px 18px rgba(0,0,0,.45)" />;

export default function HubScreen() {
  const [resume, setResume] = useState<Record<string, boolean>>({});
  useEffect(() => { setResume({ ludo: !!loadLudo(), skipbo: !!loadSkipBo() }); }, []);
  return (
    <Flex minH="100dvh" bg="radial-gradient(circle at 50% 0%, #444444 0%, #303030 60%)" color="white" justify="center" align="center" px={4}
      pt="max(16px, env(safe-area-inset-top))" pb="max(16px, env(safe-area-inset-bottom))">
      <VStack w="100%" maxW="460px" spacing={5} py={6}>
        <Heading size="2xl" letterSpacing="-0.02em">Ludo Sync</Heading>
        <Text color="gray.300" textAlign="center">Classic games for you and your friends. Play on your own, with friends online, or with no internet at all.</Text>
        <OfflineBadge />
        <VStack w="100%" spacing={3} as="ul" m={0} p={0} listStyleType="none" aria-label="Games">
          {GAMES.map(g => (
            <Box as="li" key={g.id} w="100%">
              <Flex as={Link} href={g.href} prefetch w="100%" textAlign="left" align="center" gap={4} p={4} borderRadius="2xl" bg="whiteAlpha.100" border="2px solid" borderColor="whiteAlpha.200" borderLeftColor={g.accent} borderLeftWidth="6px"
                _hover={{ bg: "whiteAlpha.200", transform: "translateY(-2px)" }} _focusVisible={{ outline: "3px solid #fde047" }} transition="all .15s"
                onClick={() => { sound.unlock(); sound.play("click"); }} aria-label={`${g.name}. ${g.tagline} ${g.players}${resume[g.id] ? ". A saved game is waiting." : ""}`}>
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
        <Text fontSize="sm" color="gray.500">More games are on the way.</Text>
        <InstallButton />
        <Text fontSize="sm" color="gray.500">Made by <a href="https://synapse-digital.vercel.app" style={{ fontWeight: 700, display: "inline-block", padding: "10px 4px" }}>Synapse Digital</a></Text>
      </VStack>
    </Flex>
  );
}

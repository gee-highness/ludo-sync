"use client";

import { Box, Button, Flex, Heading, HStack, IconButton, Progress, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import { ChevronLeftIcon } from "@chakra-ui/icons";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { evaluate } from "@/lib/client/achievements";
import { VEHICLES, resolveDesign, sanitizeDesign } from "@/lib/client/pieces";
import { emptyStats, loadStats, type Stats } from "@/lib/client/stats";
import { PieceShape } from "../board/PieceShape";
import { VEHICLE_LABEL } from "../board/VehicleShape";

const Tile = ({ label, value }: { label: string; value: string | number }) => (
  <VStack bg="whiteAlpha.100" borderRadius="xl" py={3} spacing={0}>
    <Text fontSize="2xl" fontWeight={800} lineHeight={1.1}>{value}</Text>
    <Text fontSize="xs" color="gray.400">{label}</Text>
  </VStack>
);

/** Your record: wins and streaks, the achievements you have earned and are working towards, and the vehicles you have raced with. */
export default function GarageClient() {
  const [stats, setStats] = useState<Stats>(emptyStats);
  useEffect(() => { setStats(loadStats()); }, []);
  const status = useMemo(() => evaluate(stats), [stats]);
  const done = status.filter(s => s.done).length;
  const cars = VEHICLES.filter(v => v !== "none");
  return (
    <Flex minH="100dvh" bg="#303030" color="white" justify="center" px={3} pt="max(12px, env(safe-area-inset-top))" pb="max(24px, env(safe-area-inset-bottom))">
      <VStack w="100%" maxW="640px" align="stretch" spacing={5} as="main">
        <HStack>
          <IconButton as={Link} href="/" aria-label="Back to menu" icon={<ChevronLeftIcon boxSize={6} />} variant="ghost" color="white" />
          <Heading as="h1" size="md">Garage</Heading>
        </HStack>

        <SimpleGrid columns={{ base: 3, sm: 5 }} gap={2}>
          <Tile label="Played" value={stats.played} />
          <Tile label="Won" value={stats.won} />
          <Tile label="Win streak" value={stats.streak} />
          <Tile label="Best streak" value={stats.bestStreak} />
          <Tile label="Sent home" value={stats.captures} />
        </SimpleGrid>

        <VStack align="stretch" spacing={2} as="section" aria-label="Achievements">
          <HStack justify="space-between"><Heading size="sm">Achievements</Heading><Text fontSize="sm" color="gray.300">{done} of {status.length}</Text></HStack>
          {status.map(({ achievement: a, value, done: ok }) => (
            <HStack key={a.id} bg={ok ? "rgba(34,197,94,.14)" : "whiteAlpha.100"} border="1px solid" borderColor={ok ? "green.500" : "transparent"} borderRadius="xl" p={3} spacing={3} opacity={ok ? 1 : 0.9}>
              <Text fontSize="2xl" aria-hidden filter={ok ? undefined : "grayscale(1)"}>{a.icon}</Text>
              <Box flex={1} minW={0}>
                <Text fontWeight={800} noOfLines={1}>{a.title}{ok && <Text as="span" color="green.300" fontSize="xs" ml={2}>Earned</Text>}</Text>
                <Text fontSize="xs" color="gray.300">{a.blurb}</Text>
                {!ok && <Progress value={(value / a.goal) * 100} size="xs" mt={2} borderRadius="full" colorScheme="teal" bg="whiteAlpha.200" aria-label={`${a.title}: ${value} of ${a.goal}`} />}
              </Box>
              {!ok && <Text fontSize="xs" color="gray.400" whiteSpace="nowrap">{value}/{a.goal}</Text>}
            </HStack>
          ))}
        </VStack>

        <VStack align="stretch" spacing={2} as="section" aria-label="Vehicles">
          <HStack justify="space-between"><Heading size="sm">Vehicles raced</Heading><Text fontSize="sm" color="gray.300">{cars.filter(v => stats.vehicles.includes(v)).length} of {cars.length}</Text></HStack>
          <SimpleGrid columns={{ base: 3, sm: 4 }} gap={2}>
            {cars.map(v => {
              const used = stats.vehicles.includes(v);
              const d = resolveDesign(sanitizeDesign({ vehicle: v, headlights: false }), 0);
              return (
                <VStack key={v} bg="whiteAlpha.100" borderRadius="xl" py={2} spacing={0} opacity={used ? 1 : 0.5}>
                  <svg viewBox="-0.55 -0.55 1.1 1.1" width="54" height="54" aria-hidden style={{ filter: used ? undefined : "grayscale(1)" }}><PieceShape design={d} id={`g-${v}`} /></svg>
                  <Text fontSize="xs" fontWeight={700}>{VEHICLE_LABEL[v]}</Text>
                  <Text fontSize="2xs" color={used ? "green.300" : "gray.400"}>{used ? "Raced" : "Not yet"}</Text>
                </VStack>
              );
            })}
          </SimpleGrid>
          <Button as={Link} href="/pieces" colorScheme="teal" variant="outline" color="white">Choose your vehicles</Button>
        </VStack>
      </VStack>
    </Flex>
  );
}

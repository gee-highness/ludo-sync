"use client";

import { Button, Flex, HStack, Heading, IconButton, Text, VStack } from "@chakra-ui/react";
import { ChevronLeftIcon } from "@chakra-ui/icons";
import type { ReactNode } from "react";

import { usePins } from "@/lib/client/pins";

export const BG = "transparent";

/** Pins or unpins a game; pinned games sit at the top of the home screen. */
export const PinButton = ({ id, name }: { id: string; name: string }) => {
  const { isPinned, toggle } = usePins();
  const on = isPinned(id);
  return (
    <IconButton aria-label={on ? `Unpin ${name}` : `Pin ${name} to the top of the home screen`} aria-pressed={on} title={on ? "Unpin" : "Pin to the top"} variant="ghost" fontSize="2xl" color={on ? "yellow.300" : "gray.400"}
      icon={<span aria-hidden>{on ? "★" : "☆"}</span>} _hover={{ bg: "whiteAlpha.300", color: "yellow.200" }} onClick={() => toggle(id)} />
  );
};

export const Shell = ({ title, onBack, children, accent = "#eab308", pinId }: { title: string; onBack: () => void; children: ReactNode; accent?: string; pinId?: string }) => (
  <Flex minH="100dvh" bg={BG} color="white" justify="center" px={4} pt="max(12px, env(safe-area-inset-top))" pb="max(16px, env(safe-area-inset-bottom))" bgGradient={`linear(to-b, ${accent}2e, transparent 240px)`}>
    <VStack w="100%" maxW="480px" spacing={4} align="stretch" as="main">
      <HStack>
        <IconButton aria-label="Back" icon={<ChevronLeftIcon boxSize={6} />} variant="ghost" color="white" onClick={onBack} />
        <Heading as="h1" size="md" flex={1} letterSpacing="-0.01em">{title}</Heading>
        {pinId && <PinButton id={pinId} name={title} />}
      </HStack>
      {children}
    </VStack>
  </Flex>
);

export const Notice = ({ title, text, onBack, label = "Back" }: { title: string; text: string; onBack: () => void; label?: string }) => (
  <Shell title={title} onBack={onBack}>
    <VStack bg="whiteAlpha.100" borderRadius="xl" p={6} spacing={3} textAlign="center">
      <Text color="gray.300">{text}</Text>
      <Button colorScheme="yellow" onClick={onBack}>{label}</Button>
    </VStack>
  </Shell>
);

"use client";

import { Button, Flex, HStack, Heading, IconButton, Text, VStack } from "@chakra-ui/react";
import { ChevronLeftIcon } from "@chakra-ui/icons";
import type { ReactNode } from "react";

export const BG = "#0f172a";

export const Shell = ({ title, onBack, children, accent = "#eab308" }: { title: string; onBack: () => void; children: ReactNode; accent?: string }) => (
  <Flex minH="100dvh" bg={BG} color="white" justify="center" px={4} pt="max(12px, env(safe-area-inset-top))" pb="max(16px, env(safe-area-inset-bottom))" borderTop="4px solid" borderTopColor={accent}>
    <VStack w="100%" maxW="480px" spacing={4} align="stretch" as="main">
      <HStack>
        <IconButton aria-label="Back" icon={<ChevronLeftIcon boxSize={6} />} variant="ghost" color="white" onClick={onBack} />
        <Heading as="h1" size="md">{title}</Heading>
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

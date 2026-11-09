"use client";

import { Button, Center, Heading, Text, VStack } from "@chakra-ui/react";
import Link from "next/link";

/** Shown when a screen crashes: a way to try again, and a way home. Saved games are not touched. */
export default function ErrorScreen({ reset }: { error: Error; reset: () => void }) {
  return (
    <Center minH="100dvh" bg="#0b1020" color="white" p={6}>
      <VStack spacing={4} textAlign="center" maxW="360px" role="alert">
        <Text fontSize="5xl" aria-hidden>🎲</Text>
        <Heading as="h1" size="lg">Something went wrong</Heading>
        <Text color="gray.300">The game hit a snag. Your saved games are safe on this device.</Text>
        <Button colorScheme="teal" w="100%" onClick={reset}>Try again</Button>
        <Button as={Link} href="/" variant="outline" color="white" w="100%">Back to the games</Button>
      </VStack>
    </Center>
  );
}

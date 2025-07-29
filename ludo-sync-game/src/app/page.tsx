"use client";

import { VStack, Button, Text, Center, Box } from "@chakra-ui/react";
import React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Home() {
  const router = useRouter();

  const handleBotOnly = () => {
    console.log("Starting game: Play with Bot");
    router.push('/chakra-ludo?mode=play-with-bot');
  };

  const handlePlayWithFriendsLocal = () => {
    console.log("Starting game: Play with Friends (Over the Table)");
    router.push('/chakra-ludo?mode=local-friends');
  };

  const handlePlayMultiplayer = () => {
    console.log("Starting game: Play Multiplayer");
    router.push('/chakra-ludo?mode=multiplayer');
  };

  return (
    <Center h="100vh" bg="gray.900">
      <VStack spacing={8}>
        <Text fontSize="5xl" color="white" fontWeight="bold">
          Ludo Sync
        </Text>
        <Button
          colorScheme="teal"
          size="lg"
          onClick={handleBotOnly}
        >
          Play with Bot
        </Button>
        <Button
          colorScheme="purple"
          size="lg"
          onClick={handlePlayWithFriendsLocal}
        >
          Play with Friends (Over the Table)
        </Button>
        <Button
          colorScheme="blue" // New color for multiplayer button
          size="lg"
          onClick={handlePlayMultiplayer}
        >
          Play Multiplayer
        </Button>
      </VStack>
      {/* "Made by Synapse Digital" link */}
      <Box
        position="absolute"
        bottom="4"
        right="4"
        zIndex="10"
      >
        <Text fontSize="sm" color="gray.400">
          Made by <Text as="span" fontWeight="bold"><Link href='https://synapse-digital.vercel.app'> Synapse Digital</Link></Text>
        </Text>
      </Box>
    </Center>
  );
}
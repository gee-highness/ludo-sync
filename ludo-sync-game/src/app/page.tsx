"use client";

import { VStack, Button, Text, Center } from "@chakra-ui/react";
import React from "react";
import { useRouter } from "next/navigation";

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
    </Center>
  );
}
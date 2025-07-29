"use client";

import { VStack, Button, Text, Center, Box, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton, useDisclosure } from "@chakra-ui/react";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Home() {
  const router = useRouter();
  const { isOpen, onOpen, onClose } = useDisclosure(); // For the multiplayer coming soon modal

  // PWA related state
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null); // Stores the beforeinstallprompt event

  // PWA: Event listener for beforeinstallprompt
  useEffect(() => {
    const handler = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      console.log('beforeinstallprompt event fired on home page.');
    };
    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // PWA: Handle install button click
  const handleInstallClick = async () => {
    if (deferredPrompt) {
      // Show the install prompt
      deferredPrompt.prompt();
      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      // We've used the prompt, and it can't be used again until another beforeinstallprompt event.
      setDeferredPrompt(null);
    }
  };

  const handleBotOnly = () => {
    console.log("Starting game: Play with Bot");
    router.push('/chakra-ludo?mode=play-with-bot');
  };

  const handlePlayWithFriendsLocal = () => {
    console.log("Starting game: Play with Friends (Over the Table)");
    router.push('/chakra-ludo?mode=local-friends');
  };

  const handlePlayMultiplayer = () => {
    console.log("Multiplayer online is coming soon!");
    onOpen(); // Open the "coming soon" modal
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
          width="380px" // Set a fixed width for consistency
        >
          Play with Bot
        </Button>
        <Button
          colorScheme="purple"
          size="lg"
          onClick={handlePlayWithFriendsLocal}
          width="380px" // Set a fixed width for consistency
        >
          Play with Friends (Over the Table)
        </Button>
        <Button
          colorScheme="blue" // New color for multiplayer button
          size="lg"
          onClick={handlePlayMultiplayer}
          width="380px" // Set a fixed width for consistency
        >
          Play Multiplayer
        </Button>
        {deferredPrompt && ( // Conditionally render install button
          <Button
            colorScheme="green"
            size="lg"
            onClick={handleInstallClick}
            width="280px" // Set a fixed width for consistency
          >
            Download App
          </Button>
        )}
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

      {/* Multiplayer Coming Soon Modal */}
      <Modal isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay />
        <ModalContent bg="gray.700" color="white" borderRadius="md">
          <ModalHeader>Multiplayer Online</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <Text>Multiplayer online is coming soon! Stay tuned for updates.</Text>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Center>
  );
}

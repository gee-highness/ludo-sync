"use client";

import { ChevronLeftIcon } from "@chakra-ui/icons";
import { Box, Flex, Heading, IconButton, Text } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { CardStudio } from "./CardStudio";
import { BG } from "./Shell";

/** The Cards page: design the back and the court cards once, and every card game uses them. */
export default function CardsClient() {
  const router = useRouter();
  return (
    <Flex minH="100dvh" bg={BG} color="white" justify="center" px={4} pt="max(12px, env(safe-area-inset-top))" pb="max(24px, env(safe-area-inset-bottom))">
      <Box as="main" w="100%" maxW="560px">
        <Flex align="center" gap={2} mb={3}>
          <IconButton aria-label="Back" icon={<ChevronLeftIcon boxSize={6} />} variant="ghost" color="white" onClick={() => (history.length > 1 ? router.back() : router.push("/"))} />
          <Heading as="h1" size="md">Cards</Heading>
        </Flex>
        <Text color="gray.300" fontSize="sm" mb={4}>Design your deck. The back and the Jack, Queen and King follow you into Casino, Crazy Eights, 4 Colors, Solitaire and every other card game.</Text>
        <CardStudio />
      </Box>
    </Flex>
  );
}

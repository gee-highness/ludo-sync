"use client";

import { Box, Drawer, DrawerBody, DrawerCloseButton, DrawerContent, DrawerHeader, DrawerOverlay, HStack, Text, VStack } from "@chakra-ui/react";
import { SEAT_INFO } from "@/lib/ludo/board";
import type { LogLine } from "@/lib/client/describe";

export const LogList = ({ lines, limit }: { lines: LogLine[]; limit?: number }) => {
  const shown = (limit ? lines.slice(-limit) : lines).slice().reverse();
  return (
    <VStack align="stretch" spacing={1} as="ol" listStyleType="none" m={0} p={0}>
      {shown.length === 0 && <Text fontSize="sm" color="gray.400">Nothing yet.</Text>}
      {shown.map((l, i) => (
        <HStack as="li" key={`${lines.length - i}`} spacing={2} opacity={i === 0 ? 1 : 0.75 - Math.min(i, 5) * 0.06}>
          <Box w="8px" h="8px" borderRadius="full" bg={SEAT_INFO[l.seat].main} flexShrink={0} aria-hidden />
          <Text fontSize="sm" color="white">{l.text}</Text>
        </HStack>
      ))}
    </VStack>
  );
};

/** The game log, and (when given) the room chat above it. A side drawer on wide screens, a bottom sheet on phones. */
export const LogDrawer = ({ isOpen, onClose, lines, extra, side = false, title = "Game log" }: {
  isOpen: boolean; onClose: () => void; lines: LogLine[]; extra?: React.ReactNode; side?: boolean; title?: string;
}) => (
  <Drawer isOpen={isOpen} onClose={onClose} placement={side ? "left" : "bottom"} size={side ? "sm" : undefined}>
    <DrawerOverlay />
    <DrawerContent bg="gray.800" color="white" maxH={side ? "100dvh" : "78dvh"} borderTopRadius={side ? undefined : "2xl"}>
      <DrawerCloseButton />
      <DrawerHeader>{title}</DrawerHeader>
      <DrawerBody pb={6} display="flex" flexDirection="column" gap={4} minH={0}>
        {extra}
        <Box><Text fontSize="xs" textTransform="uppercase" color="gray.400" mb={1}>Game log</Text><LogList lines={lines} limit={extra ? 30 : undefined} /></Box>
      </DrawerBody>
    </DrawerContent>
  </Drawer>
);

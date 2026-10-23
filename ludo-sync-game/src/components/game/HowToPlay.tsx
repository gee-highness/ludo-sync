"use client";

import {
  Modal, ModalBody, ModalCloseButton, ModalContent, ModalHeader, ModalOverlay, Text, VStack, Heading, UnorderedList, ListItem,
} from "@chakra-ui/react";

const Section = ({ title, items }: { title: string; items: string[] }) => (
  <VStack align="stretch" spacing={1}>
    <Heading size="sm" color="yellow.300">{title}</Heading>
    <UnorderedList spacing={1} pl={2} fontSize="sm">{items.map(t => <ListItem key={t}>{t}</ListItem>)}</UnorderedList>
  </VStack>
);

export const HowToPlay = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => (
  <Modal isOpen={isOpen} onClose={onClose} size="lg" scrollBehavior="inside" isCentered>
    <ModalOverlay />
    <ModalContent bg="gray.800" color="white" mx={3}>
      <ModalHeader>How to play</ModalHeader>
      <ModalCloseButton />
      <ModalBody pb={6}>
        <VStack align="stretch" spacing={4}>
          <Text>Race all four of your tokens around the board and into the centre. First home wins.</Text>
          <Section title="Getting out" items={[
            "Roll a 6 to move a token from your yard onto your coloured start square.",
            "Every 6 gives you another roll. Three sixes in a row lose your turn (a rule you can switch off).",
          ]} />
          <Section title="Moving" items={[
            "Tokens travel clockwise by the number rolled. Tap or click a token that glows to move it.",
            "If no token can move, your turn passes automatically.",
            "Two-dice mode: spend each die on any token, or add them together when they differ.",
          ]} />
          <Section title="Capturing" items={[
            "Land on an opponent's token and it goes back to its yard. You roll again.",
            "Squares with a ★, and every start square, are safe: nobody can be captured there.",
          ]} />
          <Section title="Blockades" items={[
            "Two of a player's tokens on one square form a blockade. Opponents cannot pass or land on it.",
          ]} />
          <Section title="Finishing" items={[
            "After a full lap your token climbs its coloured home column.",
            "You need the exact number to step into the centre. Reaching home earns another roll.",
          ]} />
          <Section title="Tips" items={[
            "Space or Enter rolls the dice. Tab moves between glowing tokens and Enter picks one.",
            "Turn on token symbols in Settings if colours are hard to tell apart.",
          ]} />
        </VStack>
      </ModalBody>
    </ModalContent>
  </Modal>
);

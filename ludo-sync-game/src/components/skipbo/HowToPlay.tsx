"use client";

import { Modal, ModalBody, ModalCloseButton, ModalContent, ModalHeader, ModalOverlay, Text, VStack } from "@chakra-ui/react";

export function SkipBoHowToPlay({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent bg="#1f2937" color="white">
        <ModalHeader>How to play Skip-Bo</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <VStack align="stretch" spacing={3} fontSize="sm">
            <Text><b>The goal:</b> be the first to play every card from your <b>stock pile</b>. Only the top card of it is face up.</Text>
            <Text><b>Your turn:</b> you start with five cards in your hand (you draw up to five). Then play as many cards as you can onto the four middle <b>building piles</b>, and finish by <b>discarding one card</b> from your hand onto one of your four discard piles.</Text>
            <Text><b>Building:</b> every pile is built up in order, 1, 2, 3 and on to 12. A pile starts with a 1. When it reaches 12 it is cleared away and the place is free again.</Text>
            <Text><b>Skip-Bo cards</b> are wild: they can be any number. Save them for when they unlock your stock pile.</Text>
            <Text><b>Where you can play from:</b> your hand, the top card of your stock pile, and the top card of any of your discard piles. When you play your stock card, the next one turns up.</Text>
            <Text><b>Bonus:</b> play all five hand cards and you draw five more and carry on.</Text>
            <Text><b>Discards</b> can go in any order, but try to build them downwards (a 5 on a 6 on a 7) so you can play them in order later.</Text>
            <Text><b>Defend:</b> look at the stock cards the others are showing. If someone needs a 4 and a pile stands at 3, think twice before you play the 3.</Text>
            <Text><b>Scoring:</b> in a quick game the first stock to empty wins. In a tournament the winner of each round scores 25 plus 5 for every card left in the other players&apos; stock piles, and the first to reach the target score wins.</Text>
            <Text color="gray.300"><b>On your phone:</b> tap a card to pick it up, then tap a glowing pile. Tap a picked-up hand card again to play it straight away when there is only one place for it. To discard, pick a card and tap one of your discard piles. On a computer you can also drag. Stuck? The <b>Hint</b> button shows a good move.</Text>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

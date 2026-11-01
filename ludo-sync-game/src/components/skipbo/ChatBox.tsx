"use client";

import { Badge, Box, Button, Drawer, DrawerBody, DrawerCloseButton, DrawerContent, DrawerHeader, DrawerOverlay, HStack, Input, Text, VStack, useDisclosure } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import type { ChatItem } from "@/lib/skipbo/net/protocol";

export interface ChatSource { items: ChatItem[]; onSend: (text: string) => boolean; mySlot: number | null }

/** The room's chat: the latest messages and a box to type in. */
export function ChatBox({ chat, height = "260px" }: { chat: ChatSource; height?: string }) {
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [chat.items.length]);
  const send = () => { if (chat.onSend(text)) setText(""); };
  return (
    <VStack align="stretch" spacing={2}>
      <Box h={height} overflowY="auto" bg="blackAlpha.300" borderRadius="lg" p={2} role="log" aria-label="Chat messages" aria-live="polite">
        {chat.items.length === 0 && <Text fontSize="sm" color="gray.400">No messages yet. Say hello.</Text>}
        {chat.items.map(m => (
          <Text key={m.id} fontSize="sm" py="2px" wordBreak="break-word">
            <Text as="span" fontWeight={800} color={m.slot !== null && m.slot === chat.mySlot ? "teal.200" : "yellow.200"}>{m.name}: </Text>{m.text}
          </Text>
        ))}
        <div ref={end} />
      </Box>
      <HStack>
        <Input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") send(); }} maxLength={200} placeholder="Type a message" bg="gray.700" border="none" aria-label="Message" />
        <Button colorScheme="teal" onClick={send} isDisabled={!text.trim()}>Send</Button>
      </HStack>
    </VStack>
  );
}

/** A Chat button for the game screen, with the conversation in a drawer and a dot when something new arrived. */
export function ChatButton({ chat }: { chat: ChatSource }) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const seen = useRef(0);
  const last = chat.items.at(-1)?.id ?? 0;
  const [unread, setUnread] = useState(false);
  useEffect(() => {
    if (isOpen) { seen.current = last; setUnread(false); }
    else if (last > seen.current) setUnread(true);
  }, [last, isOpen]);
  return (
    <>
      <Button size="sm" variant="outline" color="white" onClick={onOpen} aria-label={unread ? "Open chat, new messages" : "Open chat"} position="relative">
        Chat{unread && <Badge position="absolute" top="-4px" right="-4px" colorScheme="red" borderRadius="full" boxSize="10px" p={0} />}
      </Button>
      <Drawer isOpen={isOpen} onClose={onClose} placement="bottom">
        <DrawerOverlay />
        <DrawerContent bg="gray.800" color="white" borderTopRadius="2xl">
          <DrawerCloseButton />
          <DrawerHeader>Chat</DrawerHeader>
          <DrawerBody pb={6}><ChatBox chat={chat} height="min(40dvh, 320px)" /></DrawerBody>
        </DrawerContent>
      </Drawer>
    </>
  );
}

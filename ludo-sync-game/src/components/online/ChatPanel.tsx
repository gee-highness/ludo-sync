"use client";

import { Badge, Box, Button, Drawer, DrawerBody, DrawerCloseButton, DrawerContent, DrawerHeader, DrawerOverlay, HStack, IconButton, Input, Text, VStack } from "@chakra-ui/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SEAT_INFO } from "@/lib/ludo/board";
import { MAX_CHAT, type ChatItem } from "@/lib/net/protocol";
import type { Seat } from "@/lib/ludo/board";

const NEAR_BOTTOM = 48;

export interface ChatSource {
  items: ChatItem[];
  /** Returns false if the message could not be sent. */
  onSend: (text: string) => boolean;
}

/** Counts messages that arrived while the chat was closed. */
export const useUnread = (items: ChatItem[], open: boolean): number => {
  const seen = useRef(items.length ? items[items.length - 1].id : 0);
  const [unread, setUnread] = useState(0);
  const last = items.length ? items[items.length - 1].id : 0;
  useEffect(() => {
    if (open) { seen.current = last; setUnread(0); return; }
    setUnread(items.filter(i => i.id > seen.current).length);
  }, [items, open, last]);
  return unread;
};

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** The message list and the box to type in. Scrolls itself to new messages unless you have scrolled up to read. */
export function ChatPanel({ items, onSend, mySeat, height }: ChatSource & { mySeat: Seat | null; height?: string | number }) {
  const list = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [text, setText] = useState("");
  const [behind, setBehind] = useState(0);
  const lastId = items.length ? items[items.length - 1].id : 0;
  const shownId = useRef(lastId);

  const toBottom = useCallback(() => {
    const el = list.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    stick.current = true;
    shownId.current = lastId;
    setBehind(0);
  }, [lastId]);

  useLayoutEffect(() => {
    if (stick.current) toBottom();
    else setBehind(items.filter(i => i.id > shownId.current).length);
  }, [items, toBottom]);

  const onScroll = () => {
    const el = list.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    stick.current = near;
    if (near) { shownId.current = lastId; setBehind(0); }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    if (onSend(t)) { setText(""); stick.current = true; }
  };

  return (
    <VStack align="stretch" spacing={2} h={height ?? "100%"} minH={0}>
      <Box position="relative" flex={1} minH={0}>
        <Box
          ref={list} onScroll={onScroll} role="log" aria-live="polite" aria-label="Chat messages" tabIndex={0}
          h="100%" overflowY="auto" bg="blackAlpha.300" borderRadius="lg" p={2} sx={{ overscrollBehavior: "contain" }}
        >
          {items.length === 0 && <Text color="gray.400" fontSize="sm" p={2}>No messages yet. Say hello!</Text>}
          {items.map(i => {
            const mine = mySeat !== null && i.seat === mySeat;
            return (
              <Box key={i.id} mb={2} textAlign={mine ? "right" : "left"}>
                <HStack justify={mine ? "flex-end" : "flex-start"} spacing={1} fontSize="xs" color="gray.400">
                  {i.seat !== null && <Box w="8px" h="8px" borderRadius="full" bg={SEAT_INFO[i.seat].main} aria-hidden />}
                  <Text as="span" fontWeight={700} color="gray.200">{i.name}</Text>
                  {i.seat === null && <Text as="span">(watching)</Text>}
                  <Text as="span">{time(i.at)}</Text>
                </HStack>
                <Text
                  display="inline-block" maxW="85%" textAlign="left" bg={mine ? "teal.600" : "whiteAlpha.200"} px={3} py={1} borderRadius="lg"
                  fontSize="sm" whiteSpace="pre-wrap" sx={{ overflowWrap: "anywhere" }}
                >{i.text}</Text>
              </Box>
            );
          })}
        </Box>
        {behind > 0 && (
          <Button size="xs" colorScheme="teal" position="absolute" bottom={2} left="50%" transform="translateX(-50%)" onClick={toBottom} boxShadow="lg">
            {behind} new message{behind > 1 ? "s" : ""} ↓
          </Button>
        )}
      </Box>
      <form onSubmit={submit}>
        <HStack align="flex-start">
          <Box flex={1}>
            <Input
              value={text} onChange={e => setText(e.target.value.slice(0, MAX_CHAT))} aria-label="Type a message" placeholder="Type a message"
              maxLength={MAX_CHAT} autoComplete="off" enterKeyHint="send" bg="gray.700" color="white" style={{ fontSize: 16 }}
            />
            <Text fontSize="xs" color={text.length >= MAX_CHAT ? "orange.300" : "gray.400"} textAlign="right" aria-live="off">{text.length}/{MAX_CHAT}</Text>
          </Box>
          <Button type="submit" colorScheme="teal" isDisabled={!text.trim()} aria-label="Send message">Send</Button>
        </HStack>
      </form>
    </VStack>
  );
}

/** The chat button for a game's header, with an unread badge, and the drawer it opens. */
export function ChatDrawer({ items, onSend, mySeat }: ChatSource & { mySeat: Seat | null }) {
  const [open, setOpen] = useState(false);
  const unread = useUnread(items, open);
  return (
    <>
      <Box position="relative" display="inline-block">
        <IconButton
          aria-label={unread ? `Open chat, ${unread} unread` : "Open chat"} variant="ghost" color="white" fontSize="lg"
          icon={<span aria-hidden>💬</span>} onClick={() => setOpen(true)}
        />
        {unread > 0 && <Badge colorScheme="red" borderRadius="full" position="absolute" top="2px" right="0" fontSize="2xs" aria-hidden>{unread > 9 ? "9+" : unread}</Badge>}
      </Box>
      <Drawer isOpen={open} onClose={() => setOpen(false)} placement="right" size="sm">
        <DrawerOverlay />
        <DrawerContent bg="gray.800" color="white" maxH="100dvh">
          <DrawerCloseButton />
          <DrawerHeader>Chat</DrawerHeader>
          <DrawerBody pb={3} display="flex" flexDirection="column" minH={0}>
            <ChatPanel items={items} onSend={onSend} mySeat={mySeat} />
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </>
  );
}

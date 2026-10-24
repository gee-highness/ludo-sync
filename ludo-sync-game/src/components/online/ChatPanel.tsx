"use client";

import { Box, Button, HStack, Input, Text, VStack } from "@chakra-ui/react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SEAT_INFO } from "@/lib/ludo/board";
import { MAX_CHAT, REACTIONS, type ChatItem } from "@/lib/net/protocol";
import type { ReactionEntry } from "./hooks";
import type { Seat } from "@/lib/ludo/board";

const NEAR_BOTTOM = 48;

export interface ChatSource {
  items: ChatItem[];
  /** Returns false if the message could not be sent. */
  onSend: (text: string) => boolean;
}

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

type Entry = { key: string; at: number; chat?: ChatItem; reaction?: ReactionEntry };

interface PanelProps extends ChatSource {
  mySeat: Seat | null;
  height?: string | number;
  /** Reactions received, shown in the same scrolling log as messages. */
  reactions?: ReactionEntry[];
  /** When given, a scrollable bar of emoji is shown above the log. */
  onReact?: (emoji: string) => void;
}

/**
 * One panel for talking: a sideways-scrolling bar of emoji, a log of messages and reactions that scrolls up and down
 * (following new entries unless you have scrolled up to read), and a box to type in.
 */
export function ChatPanel({ items, onSend, mySeat, height, reactions = [], onReact }: PanelProps) {
  const list = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [text, setText] = useState("");
  const [behind, setBehind] = useState(0);
  const entries: Entry[] = useMemo(
    () => [
      ...items.map((chat): Entry => ({ key: `c${chat.id}`, at: chat.at, chat })),
      ...reactions.map((reaction): Entry => ({ key: `r${reaction.id}`, at: reaction.at, reaction })),
    ].sort((x, y) => x.at - y.at),
    [items, reactions],
  );
  const shown = useRef(entries.length);

  const toBottom = useCallback(() => {
    const el = list.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    stick.current = true;
    shown.current = entries.length;
    setBehind(0);
  }, [entries.length]);

  useLayoutEffect(() => {
    if (stick.current) toBottom();
    else setBehind(Math.max(0, entries.length - shown.current));
  }, [entries, toBottom]);

  const onScroll = () => {
    const el = list.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    stick.current = near;
    if (near) { shown.current = entries.length; setBehind(0); }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    if (onSend(t)) { setText(""); stick.current = true; }
  };

  return (
    <VStack align="stretch" spacing={2} h={height ?? "100%"} minH={0}>
      {onReact && (
        <HStack
          spacing={1} role="group" aria-label="Quick reactions" overflowX="auto" flexShrink={0} pb={1} tabIndex={0}
          sx={{ scrollSnapType: "x proximity", overscrollBehaviorX: "contain", scrollbarWidth: "thin" }}
        >
          {REACTIONS.map(e => (
            <Button
              key={e} aria-label={`Send ${e}`} variant="ghost" fontSize="xl" minW="44px" h="44px" p={0} flexShrink={0} sx={{ scrollSnapAlign: "start" }}
              onClick={() => onReact(e)}
            ><span aria-hidden>{e}</span></Button>
          ))}
        </HStack>
      )}
      <Box position="relative" flex={1} minH={0}>
        <Box
          ref={list} onScroll={onScroll} role="log" aria-live="polite" aria-label="Chat and reactions" tabIndex={0}
          h="100%" overflowY="auto" bg="blackAlpha.300" borderRadius="lg" p={2} sx={{ overscrollBehavior: "contain" }}
        >
          {entries.length === 0 && <Text color="gray.400" fontSize="sm" p={2}>No messages yet. Say hello!</Text>}
          {entries.map(({ key, chat, reaction }) => {
            if (reaction) {
              const mine = mySeat !== null && reaction.seat === mySeat;
              return (
                <HStack key={key} mb={2} spacing={2} justify={mine ? "flex-end" : "flex-start"} fontSize="xs" color="gray.400">
                  {reaction.seat !== null && <Box w="8px" h="8px" borderRadius="full" bg={SEAT_INFO[reaction.seat].main} aria-hidden />}
                  <Text as="span" fontWeight={700} color="gray.200">{reaction.name}</Text>
                  <Text as="span" fontSize="xl" lineHeight={1}>{reaction.emoji}</Text>
                </HStack>
              );
            }
            const i = chat!;
            const mine = mySeat !== null && i.seat === mySeat;
            return (
              <Box key={key} mb={2} textAlign={mine ? "right" : "left"}>
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
            {behind} new ↓
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

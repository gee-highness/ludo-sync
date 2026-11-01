"use client";

import { Box, Button, Center, HStack, Heading, Progress, Text, VStack, useToast } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { awardBonus } from "@/lib/client/profile";
import { lessonDone, markLessonDone } from "@/lib/skipbo/lessonStore";
import { describeEvents } from "@/lib/skipbo/describe";
import { applyAction } from "@/lib/skipbo/engine";
import { LESSON, LESSON_XP } from "@/lib/skipbo/lesson";
import type { Action, GameState } from "@/lib/skipbo/types";
import { viewOf } from "@/lib/skipbo/view";
import { useFeed } from "@/hooks/useSkipBoLocal";
import { sound } from "@/lib/client/audio";
import { Table } from "./Table";

/** A guided first game: a scripted table, one idea at a time, on the real rules. */
export default function LessonClient() {
  const router = useRouter();
  const toast = useToast();
  const [index, setIndex] = useState(0);
  const [state, setState] = useState<GameState>(() => LESSON[0].start());
  const [flash, setFlash] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [more, setMore] = useState(false);
  const ref = useRef(state);
  const lock = useRef(false);
  const { feed, push, reset } = useFeed();

  const begin = useCallback((i: number) => {
    const s = LESSON[i].start();
    ref.current = s;
    setState(s);
    setIndex(i);
    setFlash(null);
    setMore(false);
    lock.current = false;
    reset();
  }, [reset]);

  const act = useCallback((a: Action): boolean => {
    if (lock.current) return false;
    const r = applyAction(ref.current, a);
    if (!r) return false;
    ref.current = r.state;
    setState(r.state);
    push(r.events, describeEvents(r.events, viewOf(r.state, 0)));
    if (LESSON[index].done(r.events)) {
      lock.current = true;
      sound.play("bonus");
      setFlash(["Nice one!", "Exactly right.", "That is the idea.", "Well played.", "You have got it.", "Smart.", "Perfect."][index % 7]);
      setTimeout(() => {
        if (index + 1 < LESSON.length) begin(index + 1);
        else {
          setFinished(true);
          if (!lessonDone()) {
            markLessonDone();
            const a2 = awardBonus(LESSON_XP);
            toast({ title: `+${LESSON_XP} XP`, description: a2.leveledUp ? `Level ${a2.after.level}` : "For finishing the lesson", status: "success", duration: 5000, isClosable: true, position: "top" });
          }
        }
      }, 1500);
    }
    return true;
  }, [index, begin, push, toast]);

  if (finished) {
    return (
      <Center minH="100dvh" bg="#0c3a27" color="white" p={6}>
        <VStack spacing={4} textAlign="center" maxW="380px">
          <Text fontSize="5xl" aria-hidden>🎓</Text>
          <Heading size="lg">You know how to play</Heading>
          <Text color="whiteAlpha.800">You can build piles, use Skip-Bo cards, discard, play a whole hand, block a rival and clear a pile. The rest is practice.</Text>
          <Button colorScheme="yellow" size="lg" w="100%" onClick={() => router.push("/skipbo")}>Play a game</Button>
          <Button variant="outline" color="white" w="100%" onClick={() => { setFinished(false); begin(0); }}>Do the lesson again</Button>
        </VStack>
      </Center>
    );
  }

  const step = LESSON[index];
  return (
    <Box position="relative">
      <Table view={viewOf(state, 0)} act={act} frame={feed.frame} log={feed.log} title="Skip-Bo lesson" onExit={() => router.push("/skipbo")} />
      <Box position="fixed" zIndex={30} left="50%" transform="translateX(-50%)" top="max(64px, calc(env(safe-area-inset-top) + 56px))" w="min(560px, calc(100vw - 16px))" pointerEvents="none">
        <VStack spacing={2} align="stretch" p={3} borderRadius="xl" bg="rgba(8,20,14,.94)" color="white" border="2px solid #fde047" boxShadow="0 10px 30px rgba(0,0,0,.5)" pointerEvents="auto" role="region" aria-label="Lesson">
          <HStack justify="space-between">
            <Text fontSize="xs" fontWeight={800} color="yellow.200" textTransform="uppercase">Step {index + 1} of {LESSON.length} · {step.title}</Text>
            <Button size="xs" variant="ghost" color="whiteAlpha.800" onClick={() => router.push("/skipbo")}>Skip lesson</Button>
          </HStack>
          <Progress value={((index + (flash ? 1 : 0)) / LESSON.length) * 100} size="xs" borderRadius="full" colorScheme="yellow" bg="whiteAlpha.300" aria-hidden />
          <Text fontSize="sm" aria-live="polite">{flash ?? step.text}</Text>
          {more && !flash && <Text fontSize="sm" color="whiteAlpha.800">{step.more}</Text>}
          {!flash && (
            <HStack spacing={2}>
              <Button size="xs" variant="outline" color="white" onClick={() => setMore(v => !v)}>{more ? "Less" : "Need help?"}</Button>
              <Button size="xs" variant="outline" color="white" onClick={() => begin(index)}>Restart step</Button>
            </HStack>
          )}
        </VStack>
      </Box>
    </Box>
  );
}

"use client";

import { Button, HStack, Spinner, Text, Textarea, VStack } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { extractSignalText } from "@/lib/net/offerCodec";
import type { NearbyDesk } from "@/lib/net/manualTransport";
import { ScanButton } from "../online/ScanButton";
import { ConnectionTips } from "./HostInvites";
import { PairCard } from "./PairCard";
import { useDesk } from "./useDesk";

const parseNote = (text: string) => extractSignalText(text);

/** The guest's side of pairing: take the host's invite, show the reply, wait for the link. */
export const GuestPairing = ({ desk, initialNote }: { desk: NearbyDesk; initialNote?: string }) => {
  const { guest } = useDesk(desk);
  const [note, setNote] = useState(initialNote ?? "");
  const [error, setError] = useState("");
  const tried = useRef(false);

  const submit = async (text: string) => {
    setError("");
    const r = await desk.acceptInvite(text);
    if (!r.ok) setError(r.error);
  };

  // an invite that arrived in a link starts straight away
  useEffect(() => {
    if (initialNote && !tried.current) { tried.current = true; void submit(initialNote); }
    // once, when the screen opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (guest.stage === "connected") return <HStack bg="whiteAlpha.100" borderRadius="xl" p={3}><Spinner size="sm" /><Text fontSize="sm">Connected. Joining the game…</Text></HStack>;
  const asking = guest.stage === "idle" || guest.stage === "failed";
  return (
    <VStack align="stretch" spacing={3} w="100%">
      {guest.lost && asking && <Text bg="orange.900" borderRadius="lg" p={3} fontSize="sm" role="alert">The link to the host dropped. Ask them for a new invite to carry on in your seat.</Text>}
      {asking && (
        <VStack align="stretch" spacing={3} bg="whiteAlpha.100" borderRadius="xl" p={4}>
          <Text fontWeight={700}>1. Get the host&apos;s invite</Text>
          <Text fontSize="sm" color="gray.300">On the host&apos;s phone, open <b>Play nearby</b> and choose <b>Host</b>, then <b>Invite a player</b>. Scan the code it shows, or paste the text.</Text>
          <ScanButton parse={parseNote} onCode={code => { void submit(code); }} label="Scan the host's invite" failText="Camera not available. Paste the invite instead." />
          <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Paste the invite here" rows={3} bg="gray.700" fontSize="xs" fontFamily="mono" aria-label="Invite from the host" />
          <Button colorScheme="teal" isDisabled={!note.trim()} onClick={() => { void submit(note); }}>Use this invite</Button>
          {(error || guest.error) && <Text color="orange.200" fontSize="sm" role="alert">{error || guest.error}</Text>}
          {guest.stage === "failed" && <Button size="sm" variant="ghost" color="gray.300" onClick={() => desk.resetGuest()}>Start again</Button>}
        </VStack>
      )}
      {guest.stage === "reading" && <HStack bg="whiteAlpha.100" borderRadius="xl" p={4}><Spinner size="sm" /><Text>Making your reply…</Text></HStack>}
      {(guest.stage === "reply" || guest.stage === "connecting") && (
        <>
          <VStack align="stretch" spacing={1} bg="whiteAlpha.100" borderRadius="xl" p={4}>
            <Text fontWeight={700}>2. Show your reply to the host</Text>
            <Text fontSize="sm" color="gray.300">They scan it or paste it into invite {guest.label}. Keep this screen open.</Text>
          </VStack>
          <PairCard kind="reply" text={guest.reply} label={guest.label} />
          <HStack bg="whiteAlpha.100" borderRadius="xl" p={3}><Spinner size="sm" /><Text fontSize="sm">Waiting for the host to enter it…</Text></HStack>
          <Button size="sm" variant="ghost" color="gray.300" onClick={() => desk.resetGuest()}>Use a different invite</Button>
        </>
      )}
      <ConnectionTips />
    </VStack>
  );
};

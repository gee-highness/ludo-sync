"use client";

import { Badge, Box, Button, HStack, Spinner, Text, Textarea, VStack } from "@chakra-ui/react";
import { useState } from "react";
import { extractSignalText } from "@/lib/net/offerCodec";
import { MAX_INVITES, primeLocalAddresses, type InviteView, type NearbyDesk } from "@/lib/net/manualTransport";
import { ScanButton } from "../online/ScanButton";
import { PairCard } from "./PairCard";
import { useDesk } from "./useDesk";

const parseNote = (text: string) => extractSignalText(text);

export const ConnectionTips = () => {
  const [camera, setCamera] = useState<"idle" | "ok" | "no">("idle");
  return (
    <VStack align="stretch" spacing={2} bg="whiteAlpha.100" borderRadius="xl" p={3}>
      <Text fontSize="sm" fontWeight={700}>Connecting the two phones</Text>
      <Text fontSize="sm" color="gray.300">
        No internet is needed, but the phones must be on the same small network. Any one of these works:
      </Text>
      <Box as="ul" pl={5} fontSize="sm" color="gray.300">
        <li>One phone shares a <b>hotspot</b> and the other joins it.</li>
        <li>Both phones are on the <b>same Wi-Fi</b>, even if that Wi-Fi has no internet.</li>
        <li>One phone turns on <b>Bluetooth tethering</b> and the other connects to it.</li>
      </Box>
      <Text fontSize="sm" color="gray.300">Then pass two short notes: the host&apos;s invite to the guest, and the guest&apos;s reply back.</Text>
      <HStack>
        <Button size="sm" variant="outline" color="white" onClick={async () => setCamera((await primeLocalAddresses()) ? "ok" : "no")}>Improve connection</Button>
        {camera === "ok" && <Text fontSize="xs" color="teal.200">Done. Do this on both phones.</Text>}
        {camera === "no" && <Text fontSize="xs" color="orange.200">Camera not allowed. It is only used to help phones find each other.</Text>}
      </HStack>
    </VStack>
  );
};

const stateBadge = (i: InviteView) => {
  switch (i.state) {
    case "creating": return <Badge>Making invite…</Badge>;
    case "waiting": return <Badge colorScheme="yellow">Waiting for the reply</Badge>;
    case "connecting": return <Badge colorScheme="blue">Connecting…</Badge>;
    case "connected": return <Badge colorScheme="green">Connected</Badge>;
    case "failed": return <Badge colorScheme="red">Did not connect</Badge>;
  }
};

const InviteSlot = ({ desk, invite }: { desk: NearbyDesk; invite: InviteView }) => {
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (text: string) => {
    setBusy(true); setError("");
    const r = await desk.acceptReply(text);
    setBusy(false);
    if (!r.ok) setError(r.error); else setReply("");
  };
  return (
    <VStack align="stretch" spacing={3} bg="blackAlpha.300" borderRadius="xl" p={3} data-testid="invite-slot">
      <HStack justify="space-between"><Text fontWeight={700}>Invite {invite.label}</Text>{stateBadge(invite)}</HStack>
      {invite.state === "creating" && <HStack><Spinner size="sm" /><Text fontSize="sm">Finding this phone&apos;s address…</Text></HStack>}
      {invite.state === "waiting" && (
        <>
          <Text fontSize="sm" color="gray.300">1. The other player opens <b>Play nearby</b> and chooses <b>Join</b>, then scans this or pastes the text.</Text>
          <PairCard kind="invite" text={invite.text} label={invite.label} />
          <Text fontSize="sm" color="gray.300">2. They show you a reply. Scan it or paste it here.</Text>
          <ScanButton parse={parseNote} onCode={code => { void submit(code); }} label="Scan their reply" failText="Camera not available. Paste the reply instead." />
          <Textarea value={reply} onChange={e => setReply(e.target.value)} placeholder="Paste the reply here" rows={2} bg="gray.700" fontSize="xs" fontFamily="mono" aria-label="Reply from the other player" />
          <Button colorScheme="teal" isDisabled={!reply.trim() || busy} isLoading={busy} onClick={() => { void submit(reply); }}>Use this reply</Button>
          {error && <Text color="red.300" fontSize="sm" role="alert">{error}</Text>}
          <Button size="sm" variant="ghost" color="gray.300" onClick={() => desk.cancelInvite(invite.id)}>Cancel this invite</Button>
        </>
      )}
      {invite.state === "connecting" && <HStack><Spinner size="sm" /><Text fontSize="sm">Connecting to the other phone…</Text></HStack>}
      {invite.state === "connected" && <Text fontSize="sm" color="teal.200">This player is in. They appear in the seat list.</Text>}
      {invite.state === "failed" && (
        <>
          <Text fontSize="sm" color="orange.200" role="alert">{invite.error}</Text>
          <HStack>
            <Button size="sm" colorScheme="teal" onClick={() => { desk.cancelInvite(invite.id); void desk.createInvite(); }}>Make a new invite</Button>
            <Button size="sm" variant="ghost" color="gray.300" onClick={() => desk.cancelInvite(invite.id)}>Remove</Button>
          </HStack>
        </>
      )}
    </VStack>
  );
};

/** The host's side of pairing: one invite per player, each with its note, a way to take the reply, and the state of the link. */
export const HostInvites = ({ desk, ready = true }: { desk: NearbyDesk; ready?: boolean }) => {
  const snap = useDesk(desk);
  const [error, setError] = useState("");
  const open = snap.invites.filter(i => i.state !== "connected" && i.state !== "failed").length;
  const make = async () => { setError(""); const r = await desk.createInvite(); if (!r.ok) setError(r.error); };
  return (
    <VStack align="stretch" spacing={3} as="section" aria-label="Invite players">
      <Text fontSize="xs" textTransform="uppercase" color="gray.400">Invite players nearby</Text>
      {snap.invites.map(i => <InviteSlot key={i.id} desk={desk} invite={i} />)}
      <Button colorScheme="cyan" isDisabled={!ready || open >= MAX_INVITES} onClick={make}>
        {snap.invites.length ? "Invite another player" : "Invite a player"}
      </Button>
      {error && <Text color="orange.200" fontSize="sm" role="alert">{error}</Text>}
      <ConnectionTips />
    </VStack>
  );
};

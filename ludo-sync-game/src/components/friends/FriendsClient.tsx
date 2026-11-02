"use client";

import { Badge, Box, Button, Flex, HStack, Heading, IconButton, Input, Menu, MenuButton, MenuItem, MenuList, Switch, Text, VStack } from "@chakra-ui/react";
import { ChevronLeftIcon } from "@chakra-ui/icons";
import { QRCodeSVG } from "qrcode.react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getSettings, updateSettings } from "@/lib/client/settings";
import { GAMES } from "@/lib/games";
import { hostPathFor } from "@/lib/friends/routes";
import type { RequestResult } from "@/lib/friends/service";
import { extractFriendCode, formatFriendCode, friendLink } from "@/lib/friends/store";
import { cleanName } from "@/lib/ludo/engine";
import { ScanButton } from "../online/ScanButton";
import { useFriends } from "./FriendsProvider";

const RESULT_TEXT: Record<RequestResult, string> = {
  added: "You are friends!", sent: "Request sent. They will see it next time their app is open.", offline: "Saved. Their app is not open right now: they will get the request when it is.",
  self: "That is your own code.", invalid: "That does not look like a friend code. It has 8 letters and numbers.", blocked: "You blocked this code. Unblock it first.",
};

export default function FriendsClient() {
  const router = useRouter();
  const params = useSearchParams();
  const { service, snap } = useFriends();
  const [name, setName] = useState("");
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState<Record<string, boolean | undefined>>({});
  const [copied, setCopied] = useState(false);
  const [notify, setNotify] = useState<NotificationPermission | "none">("none");

  useEffect(() => { setName(getSettings().playerName); if (typeof Notification !== "undefined") setNotify(Notification.permission); const a = extractFriendCode(params.get("add") ?? ""); if (a) setTyped(a); }, [params]);

  const code = snap?.code ?? "";
  const friends = snap?.friends ?? [];

  // who has the app open: check when the page opens and every half minute
  useEffect(() => {
    if (!service) return;
    let alive = true;
    const run = async () => { for (const f of service.getSnapshot().friends.slice(0, 20)) { const p = await service.ping(f.code); if (!alive) return; setOnline(o => ({ ...o, [f.code]: p.online })); } };
    void run();
    const t = setInterval(run, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, [service]);

  const add = useCallback(async (raw: string) => {
    if (!service) return;
    setBusy(true); setNote("");
    const r = await service.request(raw);
    setBusy(false);
    setNote(RESULT_TEXT[r]);
    if (r !== "invalid" && r !== "self" && r !== "blocked") setTyped("");
  }, [service]);

  const copy = async () => { try { await navigator.clipboard.writeText(formatFriendCode(code)); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ } };
  const share = () => { void navigator.share?.({ title: "Ludo Sync", text: `Add me on Ludo Sync: ${formatFriendCode(code)}`, url: friendLink(code) }).catch(() => undefined); };
  const saveName = (v: string) => { setName(v); updateSettings({ playerName: cleanName(v, "") }); };
  const playWith = (game: string, friendCode: string) => { const p = hostPathFor(game, [friendCode]); if (p) router.push(p); };

  return (
    <Flex minH="100dvh" bg="#0f172a" color="white" justify="center" px={4} pt="max(12px, env(safe-area-inset-top))" pb="max(24px, env(safe-area-inset-bottom))">
      <VStack w="100%" maxW="480px" spacing={4} align="stretch" as="main">
        <HStack>
          <IconButton aria-label="Back" icon={<ChevronLeftIcon boxSize={6} />} variant="ghost" color="white" onClick={() => router.push("/")} />
          <Heading as="h1" size="md">Friends</Heading>
        </HStack>

        <VStack bg="whiteAlpha.100" borderRadius="xl" p={4} spacing={3} as="section" aria-label="Your friend code">
          <Text fontSize="xs" textTransform="uppercase" color="gray.400">Your friend code</Text>
          <Text fontSize="4xl" fontWeight={800} letterSpacing="0.1em" fontFamily="mono" aria-label={`Your friend code ${code.split("").join(" ")}`}>{code ? formatFriendCode(code) : "…"}</Text>
          {code && <Box bg="white" p={2} borderRadius="md" lineHeight={0}><QRCodeSVG value={friendLink(code)} size={140} role="img" aria-label="QR code to add you as a friend" /></Box>}
          <HStack w="100%"><Button flex={1} onClick={copy}>{copied ? "Copied" : "Copy code"}</Button>{typeof navigator !== "undefined" && "share" in navigator && <Button flex={1} colorScheme="blue" onClick={share}>Share</Button>}</HStack>
          <Text fontSize="xs" color="gray.400" textAlign="center">This code stays the same on this device. Friends who add it can invite you to games with one tap.</Text>
        </VStack>

        <VStack align="stretch" spacing={2} bg="whiteAlpha.100" borderRadius="xl" p={4} as="section" aria-label="Your name">
          <Text fontSize="sm" fontWeight={700}>Friends see you as</Text>
          <Input value={name} maxLength={20} onChange={e => saveName(e.target.value)} placeholder="Your name" bg="gray.700" border="none" aria-label="Your name" />
          <HStack justify="space-between" align="start">
            <Box><Text fontSize="sm" fontWeight={600}>Let friends invite me</Text><Text fontSize="xs" color="gray.400">{snap?.status === "ready" ? "Connected: invites arrive while this app is open." : snap?.status === "connecting" ? "Connecting…" : snap?.error ?? "Not connected."}</Text></Box>
            <Switch isChecked={snap?.listening ?? true} colorScheme="green" aria-label="Let friends invite me" onChange={e => void service?.setListening(e.target.checked)} />
          </HStack>
          {notify !== "none" && notify !== "granted" && notify !== "denied" && <Button size="sm" variant="outline" color="white" onClick={() => void Notification.requestPermission().then(setNotify)}>Notify me when a friend invites me</Button>}
          {notify === "granted" && <Text fontSize="xs" color="green.300">Notifications on: you will see invites even when the app is in the background.</Text>}
        </VStack>

        <VStack align="stretch" spacing={2} bg="whiteAlpha.100" borderRadius="xl" p={4} as="section" aria-label="Add a friend">
          <Text fontSize="sm" fontWeight={700}>Add a friend</Text>
          <Input value={typed} onChange={e => setTyped(e.target.value)} placeholder="Their friend code" bg="gray.700" border="none" textAlign="center" fontFamily="mono" fontSize="xl" letterSpacing="0.1em" autoCapitalize="characters" autoComplete="off" aria-label="Friend code" />
          <Button colorScheme="yellow" isLoading={busy} isDisabled={!service || !extractFriendCode(typed)} onClick={() => void add(typed)}>Add friend</Button>
          <ScanButton onCode={c => { setTyped(c); void add(c); }} parse={extractFriendCode} label="Scan their QR code" />
          {note && <Text fontSize="sm" color="gray.200" role="status">{note}</Text>}
        </VStack>

        {(snap?.requests.length ?? 0) > 0 && (
          <VStack align="stretch" spacing={2} as="section" aria-label="Friend requests">
            <Text fontSize="xs" textTransform="uppercase" color="sky.300" fontWeight={800}>Wants to be your friend</Text>
            {snap!.requests.map(r => (
              <Box key={r.code} bg="whiteAlpha.100" borderRadius="lg" p={3}>
                <Text fontWeight={800}>{r.name}</Text>
                <Text fontSize="xs" color="gray.400">Check digits <Badge fontFamily="mono">{r.check}</Badge> match on their screen · {formatFriendCode(r.code)}</Text>
                <HStack mt={2}><Button size="sm" colorScheme="blue" onClick={() => void service?.acceptRequest(r.code)}>Accept</Button><Button size="sm" variant="ghost" color="white" onClick={() => service?.declineRequest(r.code)}>Decline</Button><Button size="sm" variant="ghost" color="red.200" onClick={() => service?.block(r.code)}>Block</Button></HStack>
              </Box>
            ))}
          </VStack>
        )}

        <VStack align="stretch" spacing={2} as="section" aria-label="Your friends">
          <Text fontSize="xs" textTransform="uppercase" color="gray.400" fontWeight={800}>Your friends</Text>
          {friends.length === 0 && <Text color="gray.400" fontSize="sm">No friends yet. Share your code, or add theirs above.</Text>}
          {friends.map(f => (
            <HStack key={f.code} bg="whiteAlpha.100" borderRadius="lg" p={3} justify="space-between" align="center">
              <HStack minW={0} spacing={3}>
                <Box w="12px" h="12px" borderRadius="full" flexShrink={0} bg={!f.confirmed ? "yellow.500" : online[f.code] ? "green.400" : "gray.500"} aria-label={!f.confirmed ? "waiting for them to accept" : online[f.code] ? "online" : "not online"} />
                <Box minW={0}>
                  <Text fontWeight={800} noOfLines={1}>{f.name}</Text>
                  <Text fontSize="xs" color="gray.400">{f.confirmed ? (online[f.code] ? "Online: ready to play" : "Not online right now") : "Waiting for them to accept"} · <Box as="span" fontFamily="mono">{formatFriendCode(f.code)}</Box></Text>
                </Box>
              </HStack>
              <HStack spacing={1}>
                {f.confirmed && (
                  <Menu>
                    <MenuButton as={Button} size="sm" colorScheme="yellow" aria-label={`Play a game with ${f.name}`}>Play</MenuButton>
                    <MenuList bg="gray.800" borderColor="whiteAlpha.300" maxH="60vh" overflowY="auto">
                      {GAMES.map(g => <MenuItem key={g.id} bg="gray.800" _hover={{ bg: "whiteAlpha.200" }} onClick={() => playWith(g.id, f.code)}>{g.icon ?? "🎲"} {g.name}</MenuItem>)}
                    </MenuList>
                  </Menu>
                )}
                <Button size="sm" variant="ghost" color="red.200" onClick={() => service?.remove(f.code)} aria-label={`Remove ${f.name}`}>✕</Button>
              </HStack>
            </HStack>
          ))}
          <Text fontSize="xs" color="gray.500">Invites reach a friend while their app is open (this page, a game, or the app in the background). If they are not online, share the room link instead.</Text>
        </VStack>
      </VStack>
    </Flex>
  );
}

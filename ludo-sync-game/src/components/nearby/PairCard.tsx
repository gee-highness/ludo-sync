"use client";

import { Box, Button, HStack, Text, Textarea, VStack } from "@chakra-ui/react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";

/** One pairing note: a QR code to scan, plus the same text to copy or send (Share offers Bluetooth and Nearby Share on phones). */
export const PairCard = ({ kind, text, label }: { kind: "invite" | "reply"; text: string; label: string }) => {
  const [copied, setCopied] = useState(false);
  const message = kind === "invite" ? `Join my Ludo Sync game. Open Play nearby, choose Join, and paste this:\n${text}` : `My reply for your Ludo Sync invite ${label}:\n${text}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked; the text is on screen */ }
  };
  const share = () => { void navigator.share?.({ title: "Ludo Sync", text: message }).catch(() => undefined); };
  return (
    <VStack bg="whiteAlpha.100" borderRadius="xl" p={4} spacing={3} align="stretch">
      <HStack justify="space-between">
        <Text fontSize="xs" textTransform="uppercase" color="gray.400">{kind === "invite" ? "Invite" : "Reply"}</Text>
        <Text fontFamily="mono" fontWeight={800} letterSpacing="0.15em" aria-label={`Invite code ${label.split("").join(" ")}`}>{label}</Text>
      </HStack>
      <Box bg="white" p={2} borderRadius="md" lineHeight={0} alignSelf="center">
        <QRCodeSVG value={text} size={200} level="L" role="img" aria-label={kind === "invite" ? "QR code for the other phone to scan" : "QR code for the host to scan"} />
      </Box>
      <Textarea value={text} readOnly rows={3} bg="gray.700" fontSize="xs" fontFamily="mono" aria-label={kind === "invite" ? "Invite text" : "Reply text"} onFocus={e => e.target.select()} />
      <HStack>
        <Button flex={1} onClick={copy}>{copied ? "Copied" : "Copy"}</Button>
        {typeof navigator !== "undefined" && "share" in navigator && <Button flex={1} colorScheme="blue" onClick={share}>Share</Button>}
      </HStack>
      <Text fontSize="xs" color="gray.400">Share can send this over Bluetooth or Nearby Share, with no internet.</Text>
    </VStack>
  );
};

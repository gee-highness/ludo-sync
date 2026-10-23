"use client";

import { Badge } from "@chakra-ui/react";
import { useOnline } from "@/lib/client/device";

/** Reassures people the game works without a connection; only shows while offline. */
export const OfflineBadge = () => {
  const online = useOnline();
  if (online) return null;
  return <Badge colorScheme="orange" px={3} py={1} borderRadius="full" role="status">Offline: bots and pass-and-play still work</Badge>;
};

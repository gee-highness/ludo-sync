"use client";

import { Badge } from "@chakra-ui/react";
import { useOnline } from "@/lib/client/device";
import { useOfflineState } from "@/lib/client/offline";

/** Says whether the games work without a connection: not yet, getting ready, ready, or you are offline right now. */
export const OfflineBadge = () => {
  const online = useOnline();
  const offline = useOfflineState();
  if (!online) return <Badge colorScheme="orange" px={3} py={1} borderRadius="full" role="status">Offline: every game still works except online rooms</Badge>;
  if (offline.kind === "downloading") return <Badge colorScheme="blue" px={3} py={1} borderRadius="full" role="status">Getting ready to play offline… {offline.pct}%</Badge>;
  if (offline.kind === "ready") return <Badge colorScheme="green" px={3} py={1} borderRadius="full" role="status" data-testid="offline-ready">✓ Ready to play offline</Badge>;
  return null;
};

"use client";

import { useSyncExternalStore } from "react";
import type { DeskSnapshot, NearbyDesk } from "@/lib/net/manualTransport";

/** Follows a desk, re-rendering whenever an invite or the guest's progress changes. */
export const useDesk = (desk: NearbyDesk): DeskSnapshot => useSyncExternalStore(desk.subscribe, desk.getSnapshot, desk.getSnapshot);

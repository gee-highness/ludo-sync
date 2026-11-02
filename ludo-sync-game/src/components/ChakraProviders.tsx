// src/components/ChakraProviders.tsx
"use client";

import { ChakraProvider } from "@chakra-ui/react";
import React from "react";
import theme from "@/theme";
import { InteractionEffect } from "@/components/platform/interact/InteractionEffect";

export function ChakraProviders({ children }: { children: React.ReactNode }) {
  return <ChakraProvider theme={theme}><InteractionEffect />{children}</ChakraProvider>;
}

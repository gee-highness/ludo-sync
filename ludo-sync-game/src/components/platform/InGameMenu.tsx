"use client";

import { useState } from "react";
import { Box, Button, Drawer, DrawerBody, DrawerCloseButton, DrawerContent, DrawerHeader, DrawerOverlay, Tab, TabList, TabPanel, TabPanels, Tabs, Text, VStack } from "@chakra-ui/react";
import { CardStudio } from "./CardStudio";
import { ControlsPanel } from "./ControlsPanel";
import { Credit } from "./Credit";
import { SettingsPanel } from "./SettingsPanel";

export type MenuTab = "settings" | "rules" | "help" | "log" | "controls" | "cards";

/** Everything you might need mid-game, in one drawer: settings, the rules in use, how to play, what just happened, controls, and your cards. */
export interface MenuContent {
  name: string;
  /** Lines describing the rules in use; leave out for a game with no rules screen. */
  rules?: string[];
  howTo?: { title: string; text: string }[];
  log?: string[];
  keys?: { key: string; does: string }[];
  /** Card games let you restyle the cards from here. */
  cards?: boolean;
}

export function InGameMenu({ isOpen, onClose, tab, setTab, c }: { isOpen: boolean; onClose: () => void; tab: MenuTab; setTab: (t: MenuTab) => void; c: MenuContent }) {
  const tabs: { id: MenuTab; label: string }[] = [
    { id: "settings", label: "Settings" }, ...(c.rules ? [{ id: "rules" as const, label: "Rules" }] : []), ...(c.howTo ? [{ id: "help" as const, label: "How to play" }] : []),
    ...(c.log ? [{ id: "log" as const, label: "Log" }] : []), { id: "controls", label: "Controls" }, ...(c.cards ? [{ id: "cards" as const, label: "Cards" }] : []),
  ];
  const lines = c.rules ?? [];
  const log = c.log ?? [];
  const mod = { driver: { name: c.name }, howTo: c.howTo ?? [], keys: c.keys };
  const index = Math.max(0, tabs.findIndex(t => t.id === tab));
  return (
    <Drawer isOpen={isOpen} onClose={onClose} placement="right" size="sm">
      <DrawerOverlay />
      <DrawerContent bg="gray.800" color="white">
        <DrawerCloseButton />
        <DrawerHeader pb={1}>{mod.driver.name}</DrawerHeader>
        <DrawerBody px={3} pb={6}>
          <Tabs index={index} onChange={i => setTab(tabs[i].id)} variant="soft-rounded" colorScheme="yellow" isLazy>
            <TabList overflowX="auto" pb={2} flexWrap="nowrap">
              {tabs.map(t => <Tab key={t.id} flexShrink={0} color="white" fontSize="sm" _selected={{ color: "black", bg: "yellow.300" }}>{t.label}</Tab>)}
            </TabList>
            <TabPanels>
              {tabs.map(t => (
                <TabPanel key={t.id} px={1}>
                  {t.id === "settings" && <SettingsPanel />}
                  {t.id === "rules" && (
                    <VStack align="stretch" spacing={1}>
                      <Text fontWeight={800} mb={1}>Rules in use</Text>
                      {lines.length ? lines.map(l => <Text key={l} fontSize="sm">• {l}</Text>) : <Text color="gray.300">Standard rules.</Text>}
                      <Text fontSize="xs" color="gray.500" mt={3}>Rules are set before a game starts, so they cannot change during it. Everything else is as in the default rules.</Text>
                    </VStack>
                  )}
                  {t.id === "help" && (
                    <VStack align="stretch" spacing={3}>
                      {mod.howTo.map((s, i) => <Box key={i}><Text fontWeight={800}>{i + 1}. {s.title}</Text><Text fontSize="sm" color="gray.300">{s.text}</Text></Box>)}
                    </VStack>
                  )}
                  {t.id === "log" && (
                    <VStack align="stretch" spacing={1} role="log" aria-label="Everything that has happened">
                      {log.length ? [...log].reverse().map((l, i) => <Text key={i} fontSize="sm" color={i === 0 ? "white" : "gray.300"}>{l}</Text>) : <Text color="gray.400" fontSize="sm">Nothing yet.</Text>}
                    </VStack>
                  )}
                  {t.id === "controls" && <ControlsPanel shortcuts={mod.keys} />}
                  {t.id === "cards" && <CardStudio compact />}
                </TabPanel>
              ))}
            </TabPanels>
          </Tabs>
          <Credit />
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

/** A Menu button with its drawer, for tables that have their own header (Skip-Bo). */
export function MenuLauncher({ c }: { c: MenuContent }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<MenuTab>("settings");
  return (
    <>
      <Button size="sm" variant="outline" color="white" onClick={() => { setTab("settings"); setOpen(true); }} aria-label="Menu: settings, log, controls" leftIcon={<span aria-hidden>☰</span>}>Menu</Button>
      <InGameMenu isOpen={open} onClose={() => setOpen(false)} tab={tab} setTab={setTab} c={c} />
    </>
  );
}

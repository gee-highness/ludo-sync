"use client";

import { WORLDS } from "@/lib/client/themes";
import {
  Button, Drawer, DrawerBody, DrawerCloseButton, DrawerContent, DrawerHeader, DrawerOverlay, FormControl, FormLabel, Heading,
  Select, Slider, SliderFilledTrack, SliderThumb, SliderTrack, Switch, Text, VStack, HStack, Divider,
} from "@chakra-ui/react";
import { BOARD_THEMES, DEFAULT_SETTINGS, useSettings, type Settings } from "@/lib/client/settings";
import Link from "next/link";
import { clearSavedGame } from "@/lib/client/save";
import { sound } from "@/lib/client/audio";

const Row = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <FormControl display="flex" alignItems="center" justifyContent="space-between" gap={4}>
    <VStack align="start" spacing={0} flex={1}>
      <FormLabel m={0} fontSize="sm">{label}</FormLabel>
      {hint && <Text fontSize="xs" color="gray.400">{hint}</Text>}
    </VStack>
    {children}
  </FormControl>
);

export const SettingsDrawer = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const [s, update] = useSettings();
  const toggle = (key: keyof Settings) => (
    <Switch isChecked={s[key] as boolean} onChange={e => update({ [key]: e.target.checked } as Partial<Settings>)} colorScheme="teal" />
  );
  return (
    <Drawer isOpen={isOpen} onClose={onClose} placement="right" size="sm">
      <DrawerOverlay />
      <DrawerContent bg="gray.800" color="white">
        <DrawerCloseButton />
        <DrawerHeader>Settings</DrawerHeader>
        <DrawerBody pb={8}>
          <VStack align="stretch" spacing={4}>
            <Heading size="xs" color="teal.200" textTransform="uppercase">Sound and feel</Heading>
            <Row label="Sound effects">{toggle("sound")}</Row>
            <Row label="Volume">
              <Slider w="130px" min={0} max={1} step={0.05} value={s.volume} onChange={v => update({ volume: v })}
                onChangeEnd={() => { sound.unlock(); sound.play("pop"); }} aria-label="Volume" colorScheme="teal">
                <SliderTrack><SliderFilledTrack /></SliderTrack><SliderThumb />
              </Slider>
            </Row>
            <Row label="Vibration" hint="On phones that support it">{toggle("haptics")}</Row>
            <Divider borderColor="whiteAlpha.300" />
            <Heading size="xs" color="teal.200" textTransform="uppercase">Graphics</Heading>
            <Row label="Board" hint="Auto picks 3D when your device can handle it">
              <Select w="120px" size="sm" value={s.renderer} onChange={e => update({ renderer: e.target.value as Settings["renderer"] })} bg="gray.700">
                <option value="auto">Auto</option><option value="3d">3D</option><option value="2d">Flat</option>
              </Select>
            </Row>
            <Row label="3D camera" hint="Moving follows the piece from behind">
              <Select w="140px" size="sm" value={s.camera} onChange={e => update({ camera: e.target.value as Settings["camera"] })} bg="gray.700">
                <option value="follow">Moving</option><option value="tilt">Tilted</option><option value="top">Top-down</option>
              </Select>
            </Row>
            <Row label="Graphics" hint="Auto adapts to your device">
              <Select w="120px" size="sm" value={s.quality} onChange={e => update({ quality: e.target.value as Settings["quality"] })} bg="gray.700">
                <option value="auto">Auto</option><option value="ultra">Ultra</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="lite">Lite</option>
              </Select>
            </Row>
            <Row label="Theme" hint="World colours: sky, city and board">
              <Select w="120px" size="sm" value={s.boardTheme} onChange={e => update({ boardTheme: e.target.value as Settings["boardTheme"] })} bg="gray.700">
                {BOARD_THEMES.map(t => <option key={t} value={t}>{WORLDS[t]?.name ?? t[0].toUpperCase() + t.slice(1)}</option>)}
              </Select>
            </Row>
            <Row label="Pieces" hint="Shapes, colours, patterns, 2D and 3D">
              <Button as={Link} href="/pieces" size="sm" colorScheme="teal">Piece maker</Button>
            </Row>
            <Row label="Animation speed">
              <Select w="120px" size="sm" value={s.speed} onChange={e => update({ speed: e.target.value as Settings["speed"] })} bg="gray.700">
                <option value="normal">Normal</option><option value="fast">Fast</option><option value="instant">Instant</option>
              </Select>
            </Row>
            <Row label="Motion" hint="Auto follows your device's setting">
              <Select w="120px" size="sm" value={s.motion} onChange={e => update({ motion: e.target.value as Settings["motion"] })} bg="gray.700">
                <option value="auto">Auto</option><option value="reduce">Reduced</option><option value="full">Full</option>
              </Select>
            </Row>
            <Divider borderColor="whiteAlpha.300" />
            <Heading size="xs" color="teal.200" textTransform="uppercase">Playing</Heading>
            <Row label="Token symbols" hint="A shape on each token, for colour-blind play">{toggle("symbols")}</Row>
            <Row label="Highlight movable tokens">{toggle("hints")}</Row>
            <Row label="Move preview" hint="Dots along each move, with the landing square marked">
              <Select w="140px" size="sm" value={s.movePreview} onChange={e => update({ movePreview: e.target.value as Settings["movePreview"] })} bg="gray.700">
                <option value="dots">Path and landing</option><option value="end">Landing only</option><option value="off">Off</option>
              </Select>
            </Row>
            <Row label="Auto-move forced moves" hint="When only one move is possible">{toggle("autoMove")}</Row>
            <Row label="Keep screen awake">{toggle("keepAwake")}</Row>
            <Divider borderColor="whiteAlpha.300" />
            <HStack>
              <Button size="sm" variant="outline" onClick={() => clearSavedGame()}>Forget saved game</Button>
              <Button size="sm" variant="outline" colorScheme="red" onClick={() => update({ ...DEFAULT_SETTINGS, playerName: s.playerName })}>Reset settings</Button>
            </HStack>
          </VStack>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
};

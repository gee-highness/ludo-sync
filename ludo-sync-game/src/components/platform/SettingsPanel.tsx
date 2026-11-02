"use client";

import { Box, Button, FormControl, FormLabel, HStack, Input, Select, Slider, SliderFilledTrack, SliderThumb, SliderTrack, Switch, Text, VStack } from "@chakra-ui/react";
import { sound } from "@/lib/client/audio";
import { useSettings, type Settings } from "@/lib/client/settings";
import { MOODS, MOOD_LABEL } from "@/lib/client/soundDesign";

const Row = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <FormControl display="flex" alignItems="center" justifyContent="space-between" gap={4}>
    <VStack align="start" spacing={0} flex={1}>
      <FormLabel m={0} fontSize="sm" fontWeight={700}>{label}</FormLabel>
      {hint && <Text fontSize="xs" color="gray.400">{hint}</Text>}
    </VStack>
    {children}
  </FormControl>
);

/** Sound, music, speed and motion: the settings every game shares, in the same place at every table. */
export function SettingsPanel() {
  const [s, update] = useSettings();
  const sw = (key: keyof Settings, label: string) => <Switch aria-label={label} isChecked={s[key] as boolean} onChange={e => { update({ [key]: e.target.checked } as Partial<Settings>); sound.unlock(); }} colorScheme="yellow" />;
  const slider = (key: "volume" | "musicVolume", label: string, onEnd?: () => void) => (
    <Slider w="140px" min={0} max={1} step={0.05} value={s[key]} onChange={v => update({ [key]: v } as Partial<Settings>)} onChangeEnd={onEnd} aria-label={label} colorScheme="yellow">
      <SliderTrack><SliderFilledTrack /></SliderTrack><SliderThumb boxSize={6} />
    </Slider>
  );
  return (
    <VStack align="stretch" spacing={4}>
      <Row label="Your name" hint="Shown to others at the table">
        <Input size="sm" w="150px" value={s.playerName} maxLength={20} onChange={e => update({ playerName: e.target.value })} bg="gray.700" border="none" aria-label="Your name" />
      </Row>
      <Box><Text fontWeight={800} mb={2}>Sound</Text>
        <VStack align="stretch" spacing={3}>
          <Row label="Sound effects">{sw("sound", "Sound effects")}</Row>
          <Row label="Volume">{slider("volume", "Volume", () => { sound.unlock(); sound.play("pop"); })}</Row>
          <Row label="Music" hint="Soft, made as you play">{sw("music", "Music")}</Row>
          <Row label="Music volume">{slider("musicVolume", "Music volume")}</Row>
          <Row label="Music mood">
            <Select size="sm" w="140px" value={s.mood} onChange={e => update({ mood: e.target.value as Settings["mood"] })} bg="gray.700" aria-label="Music mood">
              {MOODS.map(m => <option key={m} value={m}>{MOOD_LABEL[m]}</option>)}
            </Select>
          </Row>
          <Row label="Vibration" hint="On phones that support it">{sw("haptics", "Vibration")}</Row>
        </VStack>
      </Box>
      <Box><Text fontWeight={800} mb={2}>Pace and motion</Text>
        <VStack align="stretch" spacing={3}>
          <Row label="Speed" hint="How fast cards and pieces move">
            <HStack spacing={1} role="radiogroup" aria-label="Speed">
              {(["normal", "fast", "instant"] as const).map(v => <Button key={v} size="sm" role="radio" aria-checked={s.speed === v} variant={s.speed === v ? "solid" : "outline"} colorScheme={s.speed === v ? "yellow" : undefined} color={s.speed === v ? undefined : "white"} onClick={() => update({ speed: v })}>{v[0].toUpperCase() + v.slice(1)}</Button>)}
            </HStack>
          </Row>
          <Row label="Motion" hint="Reduced motion keeps things still">
            <Select size="sm" w="140px" value={s.motion} onChange={e => update({ motion: e.target.value as Settings["motion"] })} bg="gray.700" aria-label="Motion">
              <option value="auto">Follow my device</option><option value="reduce">Reduced</option><option value="full">Full</option>
            </Select>
          </Row>
          <Row label="Keep the screen on" hint="While you play">{sw("keepAwake", "Keep the screen on")}</Row>
        </VStack>
      </Box>
    </VStack>
  );
}

"use client";

import {
  Box, Button, HStack, IconButton, Input, Select, Slider, SliderFilledTrack, SliderThumb, SliderTrack, Switch, Text, VStack, Wrap,
} from "@chakra-ui/react";
import { CloseIcon } from "@chakra-ui/icons";
import { useEffect, useState } from "react";
import { BUILT_IN_PRESETS, TUNING_OPTIONS, sameRules, type RulePreset } from "@/lib/ludo/tuning";
import { tuningOf, type Rules, type RuleTuning } from "@/lib/ludo/types";
import { allPresets, deletePreset, loadSavedPresets, savePreset } from "@/lib/client/presets";

const TOGGLES: { key: Exclude<keyof Rules, "tuning">; label: string; hint: string }[] = [
  { key: "tycoon", label: "Tycoon mode", hint: "Buy squares, collect rent, build and bankrupt rivals. Plays on the flat board" },
  { key: "twoDice", label: "Two dice", hint: "Spend each die separately, or add them when they differ" },
  { key: "threeSixes", label: "Too many sixes lose the turn", hint: "Rolling several sixes in a row forfeits the turn" },
  { key: "captureBonus", label: "Capture bonus", hint: "Roll again after capturing a token" },
  { key: "finishBonus", label: "Finish bonus", hint: "Roll again after a token reaches home" },
  { key: "blockades", label: "Blockades", hint: "Two tokens on one square block opponents" },
  { key: "safeSquares", label: "Safe squares", hint: "Stars and start squares cannot be captured on" },
];

interface Props {
  rules: Rules;
  onChange: (rules: Rules) => void;
  /** Disable editing (a guest looking at the host's rules). */
  readOnly?: boolean;
}

/** One editor for every mode: presets, switches, and the numeric tuning. Local setup and the online lobby share it. */
export default function RulesEditor({ rules, onChange, readOnly = false }: Props) {
  const [saved, setSaved] = useState<RulePreset[]>([]);
  const [name, setName] = useState("");
  useEffect(() => { setSaved(loadSavedPresets()); }, []);

  const tune = tuningOf(rules);
  const presets = allPresets(saved);
  const active = presets.find(p => sameRules(p.rules, rules));
  const setTuning = <K extends keyof RuleTuning>(key: K, value: RuleTuning[K]) =>
    onChange({ ...rules, tuning: { ...rules.tuning, [key]: value } });

  return (
    <VStack align="stretch" spacing={4}>
      <Box>
        <Text fontSize="xs" textTransform="uppercase" color="gray.400" mb={2}>Presets</Text>
        <Wrap spacing={2}>
          {presets.map(p => {
            const user = !BUILT_IN_PRESETS.some(b => b.id === p.id);
            return (
              <HStack key={p.id} spacing={0}>
                <Button
                  size="sm" variant={active?.id === p.id ? "solid" : "outline"} colorScheme="teal" isDisabled={readOnly} title={p.blurb}
                  onClick={() => onChange({ ...p.rules })} borderRightRadius={user ? 0 : undefined}
                >{p.name}</Button>
                {user && !readOnly && (
                  <IconButton aria-label={`Delete preset ${p.name}`} size="sm" icon={<CloseIcon boxSize={2} />} variant="outline" colorScheme="red"
                    borderLeftRadius={0} onClick={() => setSaved(deletePreset(p.id))} />
                )}
              </HStack>
            );
          })}
        </Wrap>
        <Text fontSize="xs" color="gray.400" mt={1}>{active ? active.blurb : "Custom rules"}</Text>
        {!readOnly && !active && (
          <HStack mt={2}>
            <Input size="sm" bg="gray.700" placeholder="Name this preset" value={name} maxLength={24} aria-label="Preset name" onChange={e => setName(e.target.value)} />
            <Button size="sm" colorScheme="teal" onClick={() => { setSaved(savePreset(name, rules)); setName(""); }}>Save</Button>
          </HStack>
        )}
      </Box>

      <VStack align="stretch" spacing={3}>
        {TOGGLES.map(r => (
          <HStack key={r.key} justify="space-between" spacing={4}>
            <Box><Text fontWeight={600} fontSize="sm">{r.label}</Text><Text color="gray.400" fontSize="xs">{r.hint}</Text></Box>
            <Switch colorScheme="teal" isChecked={!!rules[r.key]} isDisabled={readOnly} aria-label={r.label}
              onChange={e => onChange({ ...rules, [r.key]: e.target.checked })} />
          </HStack>
        ))}
      </VStack>

      <VStack align="stretch" spacing={3}>
        <Text fontSize="xs" textTransform="uppercase" color="gray.400">Fine tuning</Text>
        {TUNING_OPTIONS.filter(o => !("tycoon" in o && o.tycoon) || rules.tycoon).map(o => (
          <HStack key={o.key} justify="space-between" spacing={4}>
            <Box flex={1}><Text fontWeight={600} fontSize="sm">{o.label}</Text><Text color="gray.400" fontSize="xs">{o.hint}</Text></Box>
            {o.kind === "bool" && (
              <Switch colorScheme="teal" isDisabled={readOnly} isChecked={tune[o.key] as boolean} aria-label={o.label}
                onChange={e => setTuning(o.key, e.target.checked as never)} />
            )}
            {o.kind === "choice" && (
              <Select w="140px" size="sm" bg="gray.700" isDisabled={readOnly} value={tune[o.key] as string} aria-label={o.label}
                onChange={e => setTuning(o.key, e.target.value as never)}>
                {o.choices.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            )}
            {o.kind === "number" && (
              <HStack w="190px" spacing={3}>
                <Slider min={o.min} max={o.max} step={o.step} value={tune[o.key] as number} isDisabled={readOnly} aria-label={o.label} colorScheme="teal"
                  onChange={v => setTuning(o.key, v as never)}>
                  <SliderTrack><SliderFilledTrack /></SliderTrack><SliderThumb />
                </Slider>
                <Text fontSize="sm" w="56px" textAlign="right">{o.prefix ?? ""}{tune[o.key] as number}{o.key === "rentFactor" ? "×" : ""}</Text>
              </HStack>
            )}
          </HStack>
        ))}
      </VStack>
    </VStack>
  );
}

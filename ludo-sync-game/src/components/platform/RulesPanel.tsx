"use client";

import { Badge, Box, Button, HStack, IconButton, Input, Select, Switch, Text, Textarea, VStack, Wrap } from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import {
  decodeRules, defaultsOf, encodeRules, loadSavedPresets, presetMatching, sanitizeRules, savePresets, visibleRules,
  type RulePreset, type RuleSchema, type RuleValues,
} from "@/lib/platform/rules";

interface Props {
  gameId: string;
  schema: RuleSchema;
  values: RuleValues;
  onChange: (v: RuleValues) => void;
  /** When set the panel is read-only: guests see the rules the host chose. */
  readOnly?: boolean;
}

const Stepper = ({ label, value, min, max, step, text, onChange, disabled }: { label: string; value: number; min: number; max: number; step: number; text: string; onChange: (n: number) => void; disabled?: boolean }) => (
  <HStack spacing={1}>
    <IconButton aria-label={`Less ${label}`} size="xs" variant="outline" icon={<Text>−</Text>} isDisabled={disabled || value <= min} onClick={() => onChange(value - step)} />
    <Text minW="52px" textAlign="center" fontWeight={700} fontSize="sm" aria-live="polite">{text}</Text>
    <IconButton aria-label={`More ${label}`} size="xs" variant="outline" icon={<Text>+</Text>} isDisabled={disabled || value >= max} onClick={() => onChange(value + step)} />
  </HStack>
);

/** One editor for every game: every rule is a switch, a stepper or a menu, grouped, with presets, saved presets and share codes. */
export function RulesPanel({ gameId, schema, values, onChange, readOnly }: Props) {
  const [saved, setSaved] = useState<RulePreset[]>([]);
  const [shareText, setShareText] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => setSaved(loadSavedPresets(gameId, schema)), [gameId, schema]);
  const current = useMemo(() => presetMatching(schema, values, saved), [schema, values, saved]);
  const shown = visibleRules(schema, values);
  const groups = useMemo(() => {
    const m = new Map<string, typeof shown>();
    for (const r of shown) m.set(r.group ?? "Rules", [...(m.get(r.group ?? "Rules") ?? []), r]);
    return [...m.entries()];
  }, [shown]);
  const set = (k: string, v: boolean | number | string) => onChange(sanitizeRules(schema, { ...values, [k]: v }));
  const defaults = defaultsOf(schema);

  const saveCurrent = () => {
    const name = window.prompt("Name these rules", "My rules")?.trim();
    if (!name) return;
    const next = [...saved.filter(p => p.name !== name), { id: `u${Date.now().toString(36)}`, name: name.slice(0, 24), blurb: "Saved on this device", values }].slice(-12);
    savePresets(gameId, next);
    setSaved(next);
  };
  const remove = (id: string) => { const next = saved.filter(p => p.id !== id); savePresets(gameId, next); setSaved(next); };

  return (
    <VStack align="stretch" spacing={3} as="section" aria-label="Rules">
      <Wrap spacing={2} role="group" aria-label="Rule presets">
        {[...schema.presets, ...saved].map(p => {
          const active = current?.id === p.id;
          return (
            <Button key={p.id} size="xs" borderRadius="full" variant={active ? "solid" : "outline"} colorScheme={active ? "yellow" : "gray"} isDisabled={readOnly} title={p.blurb}
              onClick={() => onChange(sanitizeRules(schema, { ...defaults, ...p.values }))}>{p.name}</Button>
          );
        })}
        {!current && <Badge colorScheme="purple" alignSelf="center">Custom</Badge>}
      </Wrap>
      {groups.map(([group, rules]) => (
        <VStack key={group} align="stretch" spacing={1} bg="whiteAlpha.100" borderRadius="lg" p={3}>
          <Text fontSize="xs" textTransform="uppercase" color="gray.400" fontWeight={800}>{group}</Text>
          {rules.map(r => (
            <HStack key={r.key} justify="space-between" align="center" py="2px" spacing={3}>
              <Box minW={0}>
                <Text fontSize="sm" fontWeight={600}>{r.label}</Text>
                {r.hint && <Text fontSize="xs" color="gray.400">{r.hint}</Text>}
              </Box>
              {r.kind === "bool" && <Switch isChecked={values[r.key] === true} isDisabled={readOnly} colorScheme="yellow" aria-label={r.label} onChange={e => set(r.key, e.target.checked)} />}
              {r.kind === "number" && <Stepper label={r.label} value={values[r.key] as number} min={r.min} max={r.max} step={r.step ?? 1} disabled={readOnly}
                text={values[r.key] === 0 && r.zeroLabel ? r.zeroLabel : `${r.prefix ?? ""}${values[r.key]}${r.suffix ?? ""}`} onChange={n => set(r.key, n)} />}
              {r.kind === "choice" && (
                <Select size="sm" w="170px" bg="gray.700" isDisabled={readOnly} aria-label={r.label} value={values[r.key] as string} onChange={e => set(r.key, e.target.value)}>
                  {r.choices.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </Select>
              )}
            </HStack>
          ))}
        </VStack>
      ))}
      {!readOnly && (
        <VStack align="stretch" spacing={2}>
          <HStack wrap="wrap">
            <Button size="xs" variant="outline" onClick={saveCurrent}>Save these rules</Button>
            <Button size="xs" variant="outline" onClick={() => onChange(defaults)}>Reset</Button>
            <Button size="xs" variant="outline" onClick={() => { const code = encodeRules(gameId, schema, values); setShareText(code); void navigator.clipboard?.writeText(code).then(() => setNote("Copied: send this code to a friend"), () => setNote("Select and copy the code")); }}>Share code</Button>
          </HStack>
          {saved.length > 0 && <Wrap>{saved.map(p => <Button key={p.id} size="xs" variant="ghost" color="red.200" onClick={() => remove(p.id)} aria-label={`Delete saved rules ${p.name}`}>Delete “{p.name}”</Button>)}</Wrap>}
          <Textarea size="sm" rows={2} bg="gray.700" border="none" placeholder="Paste a rules code from a friend here" value={shareText} aria-label="Rules code"
            onChange={e => { setShareText(e.target.value); const v = decodeRules(gameId, schema, e.target.value); if (v) { onChange(v); setNote("Rules loaded"); } else setNote(e.target.value ? "That code is not for this game" : ""); }} />
          {note && <Text fontSize="xs" color="gray.400" role="status">{note}</Text>}
        </VStack>
      )}
    </VStack>
  );
}

export const RuleSummary = ({ lines }: { lines: string[] }) => (
  <Text fontSize="sm" color="gray.300">{lines.length ? lines.join(" · ") : "Standard rules"}</Text>
);
export { Input };

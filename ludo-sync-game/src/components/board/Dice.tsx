"use client";

import { Box } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";

const FACE_ROTATION: Record<number, string> = {
  1: "rotateX(0deg) rotateY(0deg)",
  6: "rotateY(180deg)",
  3: "rotateY(-90deg)",
  4: "rotateY(90deg)",
  2: "rotateX(-90deg)",
  5: "rotateX(90deg)",
};

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

const FACE_TRANSFORM: [number, string][] = [
  [1, "rotateY(0deg)"], [6, "rotateY(180deg)"], [3, "rotateY(90deg)"],
  [4, "rotateY(-90deg)"], [2, "rotateX(90deg)"], [5, "rotateX(-90deg)"],
];

const Face = ({ value, transform, accent }: { value: number; transform: string; accent: string }) => (
  <Box
    position="absolute" inset={0} borderRadius="22%" bg="linear-gradient(145deg,#ffffff,#dfe5f3)"
    border="2px solid" borderColor="whiteAlpha.900" boxShadow={`inset 0 0 0 2px ${accent}33`}
    style={{ transform: `${transform} translateZ(calc(var(--die) / 2))`, backfaceVisibility: "hidden" }}
    display="grid" gridTemplateColumns="repeat(3,1fr)" gridTemplateRows="repeat(3,1fr)" p="14%" aria-hidden
  >
    {PIPS[value].map(([c, r]) => (
      <Box key={`${c}${r}`} gridColumn={c + 1} gridRow={r + 1} bg="#18203A" borderRadius="full" m="14%" boxShadow="inset 0 -2px 0 rgba(255,255,255,.18)" />
    ))}
  </Box>
);

interface DieProps {
  value: number;
  /** Changes on every roll so the cube tumbles again, even for a repeated number. */
  rollKey: number;
  accent: string;
  tumble: boolean;
}

/** One six-faced cube that tumbles to the rolled face. */
const Die = ({ value, rollKey, accent, tumble }: DieProps) => {
  const spins = useRef({ x: 0, y: 0 });
  const [orientation, setOrientation] = useState(FACE_ROTATION[value] ?? FACE_ROTATION[1]);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; setOrientation(FACE_ROTATION[value]); return; }
    if (tumble) {
      spins.current = { x: spins.current.x + 360 * (1 + Math.floor(Math.random() * 2)), y: spins.current.y + 360 * (1 + Math.floor(Math.random() * 2)) };
    }
    setOrientation(`rotateX(${spins.current.x}deg) rotateY(${spins.current.y}deg) ${FACE_ROTATION[value]}`);
  }, [value, rollKey, tumble]);

  return (
    <Box style={{ perspective: "420px", width: "var(--die)", height: "var(--die)" }}>
      <Box
        position="relative" w="100%" h="100%"
        style={{ transformStyle: "preserve-3d", transform: orientation, transition: tumble ? "transform 640ms cubic-bezier(.2,.8,.25,1)" : "transform 120ms" }}
      >
        {FACE_TRANSFORM.map(([v, t]) => <Face key={v} value={v} transform={t} accent={accent} />)}
      </Box>
    </Box>
  );
};

interface DiceProps {
  values: number[];
  rollKey: number;
  canRoll: boolean;
  onRoll: () => void;
  accent: string;
  tumble: boolean;
  /** Edge length in px; the cubes scale with it. */
  size?: number;
  label: string;
}

/** The dice, which double as the roll button. */
export const Dice = ({ values, rollKey, canRoll, onRoll, accent, tumble, size = 64, label }: DiceProps) => {
  const shown = values.length ? values : [1];
  return (
    <Box
      as="button" type="button" onClick={onRoll} disabled={!canRoll} aria-label={label}
      display="flex" gap={size * 0.25 + "px"} p={3} borderRadius="2xl" alignItems="center" justifyContent="center"
      bg={canRoll ? "whiteAlpha.200" : "whiteAlpha.100"} border="2px solid" borderColor={canRoll ? accent : "whiteAlpha.200"}
      cursor={canRoll ? "pointer" : "default"} transition="all .2s" minW={`${size * 1.8}px`} minH={`${size * 1.5}px`}
      _hover={canRoll ? { transform: "scale(1.04)" } : undefined} _active={canRoll ? { transform: "scale(.97)" } : undefined}
      _focusVisible={{ outline: "3px solid", outlineColor: "white", outlineOffset: "3px" }}
      sx={{
        "--die": `${size}px`,
        animation: canRoll ? "dicePulse 1.4s ease-in-out infinite" : undefined,
        "@keyframes dicePulse": { "0%,100%": { boxShadow: `0 0 0 0 ${accent}00` }, "50%": { boxShadow: `0 0 0 8px ${accent}55` } },
        "@media (prefers-reduced-motion: reduce)": { animation: "none" },
      }}
    >
      {shown.map((v, i) => <Die key={i} value={v} rollKey={rollKey} accent={accent} tumble={tumble} />)}
    </Box>
  );
};

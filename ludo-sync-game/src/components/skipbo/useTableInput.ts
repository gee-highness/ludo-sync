"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sound } from "@/lib/client/audio";
import { turnLine } from "@/lib/skipbo/describe";
import { WILD, type Action, type Card, type GameEvent, type Source } from "@/lib/skipbo/types";
import { hintFor, type TableView } from "@/lib/skipbo/view";

export interface Frame { id: number; events: GameEvent[] }

export const sameSource = (a: Source | null, b: Source | null) =>
  !!a && !!b && a.from === b.from && (a.from === "hand" ? a.index === (b as typeof a).index : a.from === "discard" ? a.pile === (b as typeof a).pile : true);

export const hintText = (v: TableView, a: Action): string => {
  const me = v.players[v.you!];
  if (a.type === "discard") return `Discard your ${me.hand?.[a.index] === WILD ? "Skip-Bo" : me.hand?.[a.index]} to end your turn`;
  if (a.type === "endTurn") return "You have no cards left in your hand: end your turn";
  if (a.type !== "play") return "";
  const card = a.source.from === "hand" ? me.hand?.[a.source.index] : a.source.from === "stock" ? me.stockTop : me.discards[a.source.pile].at(-1);
  const from = a.source.from === "stock" ? "from your stock pile" : a.source.from === "discard" ? "from a discard pile" : "from your hand";
  return `Play ${card === WILD ? "a Skip-Bo" : card} ${from} on pile ${a.to + 1}`;
};

/**
 * Everything a table needs to be played, whether it is drawn flat or in 3D: which card is picked up, which piles it fits,
 * hints, the sounds and the little banners for big moments, and the sentence that says what to do next.
 */
export function useTableInput(view: TableView, act: (a: Action) => boolean, frame: Frame, rejected?: string) {
  const me = view.you !== null ? view.players[view.you] : null;
  const myTurn = view.phase === "play" && view.you !== null && view.turn === view.you;
  const [selected, setSelected] = useState<Source | null>(null);
  const [hint, setHint] = useState<Action | null>(null);
  const [banner, setBanner] = useState<{ id: number; text: string; tone: "good" | "info" } | null>(null);
  const [popped, setPopped] = useState<{ pile: number; id: number } | null>(null);
  const bannerId = useRef(0);

  const say = useCallback((text: string, tone: "good" | "info" = "info") => {
    const id = ++bannerId.current;
    setBanner({ id, text, tone });
    setTimeout(() => setBanner(b => (b?.id === id ? null : b)), 1800);
  }, []);

  // what just happened: sound, the pile that took a card, and a word about the big moments
  useEffect(() => {
    if (frame.id === 0) return;
    for (const e of frame.events) {
      if (e.type === "deal") sound.play("shuffle");
      else if (e.type === "play") { sound.play("card"); setPopped({ pile: e.to, id: frame.id }); }
      else if (e.type === "discard") sound.play("flip");
      else if (e.type === "pileDone") { sound.play("home"); say("Pile complete!", "good"); }
      else if (e.type === "draw" && e.bonus) { sound.play("bonus"); say(e.player === view.you ? "All five played! Draw five more" : `${view.players[e.player]?.name} plays on`, "good"); }
      else if (e.type === "reshuffle") { sound.play("shuffle"); say("Shuffling the finished piles"); }
      else if (e.type === "turn" && e.player === view.you) { sound.play("turn"); say("Your turn"); }
      else if (e.type === "roundEnd" || e.type === "gameOver") sound.duck(2.5);
    }
    // only when a new frame arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame.id]);

  // a new position clears the picked-up card and any hint
  useEffect(() => { setSelected(null); setHint(null); }, [view.seq, view.turn]);
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), 6000);
    return () => clearTimeout(t);
  }, [hint]);
  useEffect(() => { if (rejected) say("That move was not allowed"); }, [rejected, say]);

  const cardOf = useCallback((src: Source | null): Card | undefined => {
    if (!src || !me) return undefined;
    if (src.from === "hand") return me.hand?.[src.index];
    if (src.from === "stock") return me.stockTop ?? undefined;
    return me.discards[src.pile].at(-1);
  }, [me]);

  const fitsOn = useCallback((card: Card | undefined, pile: number) => card !== undefined && (card === WILD || card === view.building[pile].length + 1), [view.building]);
  const targets = useCallback((card: Card | undefined): number[] => [0, 1, 2, 3].filter(i => fitsOn(card, i)), [fitsOn]);
  const picked = cardOf(selected);

  const tryPlay = (src: Source, to: number): boolean => {
    if (!myTurn || !fitsOn(cardOf(src), to)) { sound.play("error"); return false; }
    return act({ type: "play", source: src, to });
  };

  const onHand = (index: number) => {
    if (!myTurn) return;
    const src: Source = { from: "hand", index };
    if (sameSource(selected, src)) {
      // a second tap plays the card if there is only one sensible place for it
      const t = [...new Set(targets(cardOf(src)).map(i => view.building[i].length))];
      if (t.length === 1) tryPlay(src, targets(cardOf(src))[0]);
      else setSelected(null);
    } else setSelected(src);
  };
  const onStock = () => {
    if (!myTurn || me?.stockTop == null) return;
    const src: Source = { from: "stock" };
    if (sameSource(selected, src)) {
      const t = targets(me.stockTop);
      if (t.length) tryPlay(src, t[0]); else setSelected(null);
    } else setSelected(src);
  };
  const onDiscard = (pile: number) => {
    if (!myTurn || !me) return;
    if (selected?.from === "hand") { act({ type: "discard", index: selected.index, pile }); return; }
    if (!me.discards[pile].length) return;
    const src: Source = { from: "discard", pile };
    setSelected(sameSource(selected, src) ? null : src);
  };
  const onBuilding = (pile: number) => { if (selected) tryPlay(selected, pile); };

  const wantHint = () => {
    const a = hintFor(view);
    if (a) { setHint(a); setSelected(null); } else say("Nothing to suggest right now");
  };
  const hintSrc: Source | null = hint?.type === "play" ? hint.source : hint?.type === "discard" ? { from: "hand", index: hint.index } : null;
  const hintTarget = hint?.type === "play" ? `build${hint.to}` : hint?.type === "discard" ? `discard${hint.pile}` : null;

  const mustEnd = myTurn && me !== null && me.handCount === 0;
  const status = useMemo(() => {
    if (view.phase !== "play") return turnLine(view);
    if (view.you === null) return `${view.players[view.turn].name} is playing`;
    if (myTurn) {
      if (me!.handCount === 0) return "You have no cards in hand: play from your stock or discards, or end your turn";
      if (picked !== undefined) return targets(picked).length ? "Tap a glowing pile to play it" : "That card does not fit yet. Tap a discard pile to discard it, or pick another";
      return "Play onto the middle piles, then discard one card to end your turn";
    }
    return `${view.players[view.turn].name} is ${view.players[view.turn].kind === "bot" ? "thinking…" : "playing…"}`;
  }, [view, myTurn, me, picked, targets]);

  return {
    me, myTurn, selected, setSelected, hint, banner, popped, say, cardOf, fitsOn, targets, picked, tryPlay,
    onHand, onStock, onDiscard, onBuilding, wantHint, hintSrc, hintTarget, hintLine: hint ? hintText(view, hint) : null, mustEnd, status,
  };
}

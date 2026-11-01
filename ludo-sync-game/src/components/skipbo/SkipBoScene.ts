import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { TIER_SPECS, TierGovernor, stepUp, type Tier } from "@/lib/client/quality";
import { onCameraReset } from "@/lib/client/cameraView";
import { CARD_H, CARD_T, CARD_W, CLUSTER, handSlots, layoutTable, seatOrder, stackHeight, type P2, type TableLayout } from "@/lib/skipbo/layout3d";
import { WILD, type Card, type GameEvent, type Source } from "@/lib/skipbo/types";
import type { PlayerView, TableView } from "@/lib/skipbo/view";
import { CardTextures } from "./cardTextures";

export type Pick = { kind: "hand"; index: number } | { kind: "stock" } | { kind: "discard"; pile: number } | { kind: "build"; pile: number };

export interface SceneInput {
  view: TableView;
  /** Ticks for every new frame; the events say what just moved so cards can fly there. */
  frame: { id: number; events: GameEvent[] };
  selected: Source | null;
  hintSrc: Source | null;
  hintTarget: string | null;
  /** Building piles the picked-up card can go on. */
  targets: number[];
  camera: "tilt" | "top" | "follow" | "drone";
  reduceMotion: boolean;
  insets?: { top: number; right: number; bottom: number; left: number };
}

export interface SceneOptions {
  quality: Tier;
  onPick: (p: Pick) => void;
  onTier: (dir: "down" | "up") => void;
  onContextLost: () => void;
  onFirstFrame?: () => void;
}

const FOV = 40;
const HAND_LEAN = 0.95;
const HAND_SCALE = 1.3;
const ease = (t: number) => t * t * (3 - 2 * t);

interface Flight {
  mesh: THREE.Mesh;
  from: THREE.Vector3; to: THREE.Vector3;
  t0: number; dur: number; arc: number;
  /** Rotation about x at the start and the end: cards lean in the hand and lie flat on the table. */
  rx0: number; rx1: number;
  onDone?: () => void;
}

class Stack {
  readonly group = new THREE.Group();
  private body: THREE.Mesh;
  private top: THREE.Mesh;
  private slot: THREE.Mesh;
  pos = new THREE.Vector3();
  count = 0;
  hidden = 0;
  constructor(parent: THREE.Object3D, private tex: CardTextures, private edge: THREE.Material, private topMats: Map<string, THREE.MeshBasicMaterial | THREE.MeshStandardMaterial>, geo: { body: THREE.BufferGeometry; card: THREE.BufferGeometry; slot: THREE.BufferGeometry }, slotMat: THREE.Material, readonly key: string) {
    this.body = new THREE.Mesh(geo.body, edge);
    this.top = new THREE.Mesh(geo.card, edge);
    this.slot = new THREE.Mesh(geo.slot, slotMat);
    this.slot.rotation.x = -Math.PI / 2; this.slot.position.y = 0.004;
    this.body.castShadow = this.body.receiveShadow = true;
    this.top.castShadow = true; this.top.receiveShadow = true;
    this.group.add(this.slot, this.body, this.top);
    parent.add(this.group);
  }
  /** The cards of this stack lie on the table: `visible` counts those showing, and the top one is drawn on the face given. */
  set(count: number, face: { card: Card; asValue?: number } | "back" | null, hidden: number) {
    this.count = count; this.hidden = hidden;
    const shown = Math.max(0, count - hidden);
    const h = stackHeight(shown);
    this.body.visible = shown > 1;
    this.body.scale.set(1, Math.max(h - CARD_T, 0.0001), 1);
    this.body.position.y = Math.max(h - CARD_T, 0) / 2;
    this.top.visible = shown > 0 && face !== null;
    this.slot.visible = shown === 0;
    this.top.position.y = Math.max(h - CARD_T / 2, CARD_T / 2);
    if (face !== null && shown > 0) this.top.material = this.materialFor(face);
  }
  topY(): number { return stackHeight(Math.max(0, this.count - this.hidden)) + CARD_T; }
  lift(y: number) { this.top.position.y += y; }
  get topMesh() { return this.top; }
  get bodyMesh() { return this.body; }
  private materialFor(face: { card: Card; asValue?: number } | "back"): THREE.Material[] | THREE.Material {
    const key = face === "back" ? "back" : face.card === WILD && face.asValue ? `w${face.asValue}` : `f${face.card}`;
    let m = this.topMats.get(key);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ map: face === "back" ? this.tex.back() : this.tex.face(face.card, face.asValue) });
      this.topMats.set(key, m);
    }
    return [this.edge, this.edge, m, this.edge, this.edge, this.edge];
  }
}

/** The 3D card table: felt, cards you can tap, and cards that fly where they are played. */
export class SkipBoScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 200);
  private world = new THREE.Group();
  private tex = new CardTextures(4);
  private edge = new THREE.MeshStandardMaterial({ color: 0xf4efe2, roughness: 0.7 });
  private slotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false });
  private topMats = new Map<string, THREE.MeshBasicMaterial | THREE.MeshStandardMaterial>();
  private geo = {
    body: new THREE.BoxGeometry(CARD_W, 1, CARD_H),
    card: new RoundedBoxGeometry(CARD_W, CARD_T, CARD_H, 2, 0.03),
    slot: new THREE.PlaneGeometry(CARD_W, CARD_H),
  };
  private stacks = new Map<string, Stack>();
  private layout: TableLayout | null = null;
  private layoutKey = "";
  private tableGroup = new THREE.Group();
  private handMeshes: THREE.Mesh[] = [];
  private oppHands = new Map<number, THREE.Mesh[]>();
  private labels = new Map<string, { sprite: THREE.Sprite; key: string; tex: THREE.CanvasTexture }>();
  private flights: Flight[] = [];
  private flightPool: THREE.Mesh[] = [];
  private rings: THREE.Mesh[] = [];
  private glow: THREE.Mesh;
  private hintRing: THREE.Mesh;
  private sparks: { mesh: THREE.Mesh; v: THREE.Vector3; life: number; t0: number }[] = [];
  private pickables: THREE.Object3D[] = [];
  private input: SceneInput | null = null;
  private lastFrame = -1;
  private holds = { build: [0, 0, 0, 0], discard: [0, 0, 0, 0], hand: 0, oppDiscard: new Map<string, number>() };
  private raycaster = new THREE.Raycaster();
  private view = { yaw: 0, pitch: 0, zoom: 1 };
  private viewTo = { yaw: 0, pitch: 0, zoom: 1 };
  private base = { dist: 20, elev: 0.9, target: new THREE.Vector3() };
  private droneT = 0;
  private autoPause = 0;
  private touches = new Map<number, { x: number; y: number }>();
  private pinch: { d: number } | null = null;
  private orbit: { id: number; x: number; y: number } | null = null;
  private downAt: { x: number; y: number; t: number } | null = null;
  private raf = 0;
  private disposed = false;
  private first = false;
  private governor: TierGovernor;
  private lastT = 0;
  private ro: ResizeObserver;
  private unreset: () => void;
  private spec = TIER_SPECS.medium;
  private hovered: string | null = null;

  constructor(private host: HTMLElement, private opts: SceneOptions) {
    const spec = TIER_SPECS[opts.quality];
    this.spec = spec;
    this.governor = new TierGovernor(dir => this.opts.onTier(dir), () => stepUp(this.opts.quality) !== null);
    this.renderer = new THREE.WebGLRenderer({ antialias: spec.antialias, alpha: false, powerPreference: spec.antialias ? "high-performance" : "low-power" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, spec.pixelRatio));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = spec.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.tex = new CardTextures(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));
    const canvas = this.renderer.domElement;
    canvas.style.cssText = "width:100%;height:100%;display:block;touch-action:none;outline:none";
    canvas.addEventListener("webglcontextlost", this.onContextLost);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointercancel", this.onPointerCancel);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.unreset = onCameraReset(() => this.resetView());
    host.appendChild(canvas);

    this.scene.background = new THREE.Color(0x07140e);
    this.scene.fog = new THREE.Fog(0x07140e, 40, 90);
    this.scene.add(this.world);
    this.world.add(this.tableGroup);
    this.scene.add(new THREE.HemisphereLight(0xfff3dc, 0x1b3a2a, 1.25));
    const lamp = new THREE.DirectionalLight(0xfff0d0, 1.7);
    lamp.position.set(3, 14, 8);
    if (spec.shadows) {
      lamp.castShadow = true;
      lamp.shadow.mapSize.set(2048, 2048);
      Object.assign(lamp.shadow.camera, { left: -14, right: 14, top: 12, bottom: -12, near: 2, far: 40 });
      lamp.shadow.bias = -0.0004;
    }
    this.scene.add(lamp);

    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.52, 0.64, 48), new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
      r.rotation.x = -Math.PI / 2; r.visible = false; r.renderOrder = 3;
      this.rings.push(r); this.world.add(r);
    }
    this.hintRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 48), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }));
    this.hintRing.rotation.x = -Math.PI / 2; this.hintRing.visible = false; this.hintRing.renderOrder = 4;
    this.world.add(this.hintRing);
    this.glow = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.2, depthWrite: false }));
    this.glow.rotation.x = -Math.PI / 2; this.glow.visible = false; this.glow.position.y = 0.006; this.glow.renderOrder = 1;
    this.world.add(this.glow);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
  }

  // ---- building the table ------------------------------------------------------------------

  private buildTable(l: TableLayout) {
    this.tableGroup.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
    this.tableGroup.clear();
    const w = l.bounds.maxX - l.bounds.minX + 2.6, d = l.bounds.maxZ - l.bounds.minZ + 2.2;
    const cx = (l.bounds.maxX + l.bounds.minX) / 2, cz = (l.bounds.maxZ + l.bounds.minZ) / 2;
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = "#1c6b47"; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${i % 2 ? "255,255,255" : "0,0,0"},${0.02 + Math.random() * 0.04})`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
    const felt = new THREE.CanvasTexture(c);
    felt.wrapS = felt.wrapT = THREE.RepeatWrapping; felt.repeat.set(w / 2.5, d / 2.5); felt.colorSpace = THREE.SRGBColorSpace;
    const shape = new THREE.Shape();
    const r = 1.6, hw = w / 2, hd = d / 2;
    shape.moveTo(-hw + r, -hd); shape.lineTo(hw - r, -hd); shape.quadraticCurveTo(hw, -hd, hw, -hd + r); shape.lineTo(hw, hd - r); shape.quadraticCurveTo(hw, hd, hw - r, hd);
    shape.lineTo(-hw + r, hd); shape.quadraticCurveTo(-hw, hd, -hw, hd - r); shape.lineTo(-hw, -hd + r); shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
    const top = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), new THREE.MeshStandardMaterial({ map: felt, roughness: 0.95 }));
    top.rotation.x = -Math.PI / 2; top.position.set(cx, 0, cz); top.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: true, bevelSize: 0.28, bevelThickness: 0.12, bevelSegments: 3, curveSegments: 12 }), new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.5, metalness: 0.1 }));
    rim.rotation.x = -Math.PI / 2; rim.position.set(cx, -0.56, cz); rim.receiveShadow = true;
    this.tableGroup.add(rim, top);
    // a faint ring where the shared piles sit
    const ringGeo = new THREE.PlaneGeometry(l.centre.building.at(-1)!.x - l.centre.draw.x + 2.0, 1.9);
    const mark = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false }));
    mark.rotation.x = -Math.PI / 2; mark.position.set((l.centre.building.at(-1)!.x + l.centre.draw.x) / 2, 0.003, l.centre.draw.z);
    this.tableGroup.add(mark);
  }

  private stack(key: string, pos: P2, scale: number): Stack {
    let s = this.stacks.get(key);
    if (!s) { s = new Stack(this.world, this.tex, this.edge, this.topMats, this.geo, this.slotMat, key); this.stacks.set(key, s); this.registerPick(s, key); }
    s.group.position.set(pos.x, 0, pos.z);
    s.group.scale.setScalar(scale);
    s.pos.set(pos.x, 0, pos.z);
    return s;
  }

  private registerPick(s: Stack, key: string) {
    const pick = ((): Pick | null => {
      if (key === "me.stock") return { kind: "stock" };
      const d = /^me\.d(\d)$/.exec(key); if (d) return { kind: "discard", pile: Number(d[1]) };
      const b = /^b(\d)$/.exec(key); if (b) return { kind: "build", pile: Number(b[1]) };
      return null;
    })();
    if (!pick) return;
    // a generous invisible box makes thin stacks easy to hit with a finger
    const hit = new THREE.Mesh(new THREE.BoxGeometry(CARD_W * 1.15, 0.5, CARD_H * 1.15), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.2; hit.userData.pick = pick; s.group.add(hit);
    this.pickables.push(hit);
  }

  private label(key: string, pos: THREE.Vector3, lines: string[], accent: boolean, scale = 1) {
    const text = lines.join("|") + (accent ? "!" : "");
    let l = this.labels.get(key);
    if (!l) {
      const tex = new THREE.CanvasTexture(document.createElement("canvas"));
      tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      sprite.renderOrder = 5;
      this.world.add(sprite);
      l = { sprite, key: "", tex };
      this.labels.set(key, l);
    }
    if (l.key !== text) {
      l.key = text;
      const c = l.tex.image as HTMLCanvasElement;
      c.width = 384; c.height = 110;
      const g = c.getContext("2d")!;
      g.clearRect(0, 0, c.width, c.height);
      g.fillStyle = accent ? "rgba(253,224,71,.95)" : "rgba(8,20,14,.82)";
      g.beginPath(); g.roundRect(4, 4, 376, 102, 30); g.fill();
      g.fillStyle = accent ? "#1f2937" : "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
      g.font = "800 46px system-ui, sans-serif"; g.fillText(lines[0], 192, 38, 350);
      g.fillStyle = accent ? "#374151" : "#fde047"; g.font = "700 32px system-ui, sans-serif"; g.fillText(lines[1] ?? "", 192, 80, 350);
      l.tex.needsUpdate = true;
    }
    l.sprite.position.copy(pos);
    l.sprite.scale.set(2.5 * scale, 0.72 * scale, 1);
  }

  // ---- the state of the table --------------------------------------------------------------

  update(input: SceneInput) {
    this.input = input;
    const v = input.view;
    const aspect = (this.host.clientWidth || 1) / (this.host.clientHeight || 1);
    const key = `${v.players.length}|${aspect < 0.85 ? "p" : aspect < 1.35 ? "m" : "l"}`;
    if (key !== this.layoutKey) {
      this.layoutKey = key;
      this.layout = layoutTable(v.players.length - 1, aspect);
      this.buildTable(this.layout);
      this.stacks.forEach(s => { this.world.remove(s.group); });
      this.stacks.clear(); this.pickables.length = 0;
      this.updateCamera();
    }
    if (input.frame.id !== this.lastFrame) {
      const events = input.frame.events;
      this.lastFrame = input.frame.id;
      this.sync(input);
      if (!input.reduceMotion) this.animate(events, v);
    } else this.sync(input);
    this.invalidate();
  }

  private youIndex(v: TableView) { return v.you ?? 0; }

  private sync(input: SceneInput) {
    const v = input.view, l = this.layout!;
    const you = this.youIndex(v);
    const me = v.players[you];
    this.pickables = this.pickables.filter(p => p.userData.pick);

    // the shared piles
    const draw = this.stack("draw", l.centre.draw, l.centre.scale);
    draw.set(v.drawCount, v.drawCount ? "back" : null, 0);
    v.building.forEach((pile, i) => {
      const s = this.stack(`b${i}`, l.centre.building[i], l.centre.scale);
      const hide = Math.min(this.holds.build[i], pile.length);
      const vis = pile.length - hide;
      const topCard = vis > 0 ? pile[vis - 1] : undefined;
      s.set(pile.length, topCard === undefined ? null : { card: topCard, asValue: vis }, hide);
    });

    // your own cards
    const ms = l.me.scale;
    const stock = this.stack("me.stock", l.me.stock, ms);
    stock.set(me.stockCount, me.stockTop === null ? null : { card: me.stockTop }, 0);
    me.discards.forEach((d, i) => {
      const s = this.stack(`me.d${i}`, l.me.discards[i], ms);
      const hide = Math.min(this.holds.discard[i], d.length);
      s.set(d.length, d.length - hide > 0 ? { card: d[d.length - hide - 1] } : null, hide);
    });
    const sel = input.selected;
    stock.group.position.y = sel?.from === "stock" ? 0.28 : 0;
    me.discards.forEach((_, i) => { this.stacks.get(`me.d${i}`)!.group.position.y = sel?.from === "discard" && sel.pile === i ? 0.28 : 0; });
    this.syncHand(input, me);

    // the others
    const order = seatOrder(v.players.length, v.you);
    order.forEach((pi, k) => this.syncOpponent(k, pi, v.players[pi], l.opponents[k], v, input));

    // who is to play
    const turn = v.phase === "play" ? v.turn : -1;
    this.glow.visible = false;
    if (turn >= 0) {
      if (turn === you && v.you !== null) { this.glow.visible = true; this.glow.position.x = 0; this.glow.position.z = 3.3; this.glow.scale.set(4.6, 3.2, 1); }
      else {
        const k = order.indexOf(turn);
        if (k >= 0) { const o = l.opponents[k]; this.glow.visible = true; this.glow.position.x = o.at.x; this.glow.position.z = o.at.z; this.glow.scale.set(2.3 * o.scale + 0.4, 1.5 * o.scale + 0.4, 1); }
      }
    }
    this.syncHighlights(input);
    this.label("me", new THREE.Vector3(l.me.label.x, 0.4, l.me.label.z), [`${me.name}${v.you !== null && v.turn === you && v.phase === "play" ? " · your turn" : ""}`, `Stock ${me.stockCount}${v.rules.tournament ? ` · ${me.score} pts` : ""}`], v.you !== null && v.turn === you && v.phase === "play", 1.15);
  }

  private syncHand(input: SceneInput, me: PlayerView) {
    const v = input.view, l = this.layout!;
    const hand = me.hand ?? [];
    const hold = Math.min(this.holds.hand, hand.length);
    while (this.handMeshes.length < hand.length) {
      const m = new THREE.Mesh(this.geo.card, this.edge);
      m.castShadow = true;
      this.world.add(m); this.handMeshes.push(m);
    }
    const slots = handSlots(hand.length, l.me.hand, 0.9);
    const myTurn = v.phase === "play" && v.you !== null && v.turn === v.you;
    this.pickables = this.pickables.filter(p => !(p.userData.pick?.kind === "hand"));
    this.handMeshes.forEach((m, i) => {
      const show = i < hand.length && i < hand.length - hold;
      m.visible = show;
      if (!show) return;
      const c = hand[i];
      const selected = input.selected?.from === "hand" && input.selected.index === i;
      const hinted = input.hintSrc?.from === "hand" && input.hintSrc.index === i;
      m.material = this.handMaterial(c, myTurn);
      m.scale.setScalar(HAND_SCALE);
      m.position.set(slots[i].x, 0.62 + (selected ? 0.55 : 0) + (hinted ? 0.18 : 0), slots[i].z + (selected ? -0.45 : 0));
      m.rotation.set(HAND_LEAN, slots[i].rot, 0);
      m.userData.pick = { kind: "hand", index: i } satisfies Pick;
      this.pickables.push(m);
    });
    // the hint pulses on a hand card too
    void v;
  }

  private handMaterial(c: Card, lit: boolean): THREE.Material[] {
    const key = `h${c}${lit ? "L" : "D"}`;
    let m = this.topMats.get(key) as THREE.MeshBasicMaterial | undefined;
    if (!m) {
      m = new THREE.MeshBasicMaterial({ map: this.tex.face(c), color: lit ? 0xffffff : 0x9aa4a0 });
      this.topMats.set(key, m);
    }
    return [this.edge, this.edge, m, this.edge, this.edge, this.edge] as unknown as THREE.Material[];
  }

  private syncOpponent(k: number, pi: number, p: PlayerView, seat: { at: P2; scale: number }, v: TableView, input: SceneInput) {
    const s = seat.scale;
    const at = (o: P2) => ({ x: seat.at.x + o.x * s, z: seat.at.z + o.z * s });
    const stock = this.stack(`o${k}.stock`, at(CLUSTER.stock), s);
    stock.set(p.stockCount, p.stockTop === null ? null : { card: p.stockTop }, 0);
    p.discards.forEach((d, i) => {
      const st = this.stack(`o${k}.d${i}`, at(CLUSTER.discards[i]), s);
      const hide = Math.min(this.holds.oppDiscard.get(`${k}.${i}`) ?? 0, d.length);
      st.set(d.length, d.length - hide > 0 ? { card: d[d.length - hide - 1] } : null, hide);
    });
    // their hand: a small fan of backs
    let fan = this.oppHands.get(k);
    if (!fan) { fan = []; this.oppHands.set(k, fan); }
    while (fan.length < 5) {
      const m = new THREE.Mesh(this.geo.card, this.backMaterial());
      this.world.add(m); fan.push(m);
    }
    const hp = at(CLUSTER.hand);
    const slots = handSlots(p.handCount, hp, 0.34 * s);
    fan.forEach((m, i) => {
      m.visible = i < p.handCount;
      if (i >= p.handCount) return;
      m.scale.setScalar(0.8 * s);
      m.position.set(slots[i].x, 0.12 + i * 0.004, slots[i].z);
      m.rotation.set(0, slots[i].rot, 0);
    });
    const playing = v.phase === "play" && v.turn === pi;
    this.label(`o${k}`, new THREE.Vector3(seat.at.x, 0.45, seat.at.z + CLUSTER.label.z * s + 0.1), [`${p.name}${p.kind === "bot" ? " 🤖" : ""}`, `Stock ${p.stockCount} · Hand ${p.handCount}${v.rules.tournament ? ` · ${p.score}` : ""}`], playing, 0.82 * Math.max(0.8, s));
    void input;
  }

  private backMat?: THREE.Material[];
  private backMaterial(): THREE.Material[] {
    if (!this.backMat) {
      const m = new THREE.MeshBasicMaterial({ map: this.tex.back() });
      this.backMat = [this.edge, this.edge, m, this.edge, this.edge, this.edge];
    }
    return this.backMat;
  }

  private syncHighlights(input: SceneInput) {
    const l = this.layout!;
    const picked = !!input.selected;
    this.rings.forEach((r, i) => {
      r.visible = picked && input.targets.includes(i);
      if (r.visible) { const p = l.centre.building[i]; r.position.set(p.x, 0.03 + stackHeight(input.view.building[i].length) * l.centre.scale, p.z); r.scale.setScalar(l.centre.scale * 1.08); }
    });
    this.hintRing.visible = false;
    const t = input.hintTarget;
    if (t) {
      const b = /^build(\d)$/.exec(t), d = /^discard(\d)$/.exec(t);
      if (b) { const p = l.centre.building[Number(b[1])]; this.hintRing.position.set(p.x, 0.5, p.z); this.hintRing.scale.setScalar(l.centre.scale * 1.15); this.hintRing.visible = true; }
      else if (d) { const p = l.me.discards[Number(d[1])]; this.hintRing.position.set(p.x, 0.4, p.z); this.hintRing.scale.setScalar(l.me.scale * 1.1); this.hintRing.visible = true; }
    }
    const hs = input.hintSrc;
    if (hs && hs.from !== "hand" && !this.hintRing.visible) {
      const p = hs.from === "stock" ? l.me.stock : l.me.discards[hs.pile];
      this.hintRing.position.set(p.x, 0.4, p.z); this.hintRing.scale.setScalar(l.me.scale * 1.1); this.hintRing.visible = true;
    }
  }

  // ---- cards in flight ---------------------------------------------------------------------

  private flightMesh(card: Card | "back", asValue?: number): THREE.Mesh {
    const m = this.flightPool.pop() ?? new THREE.Mesh(this.geo.card, this.edge);
    const key = card === "back" ? "back" : card === WILD && asValue ? `w${asValue}` : `f${card}`;
    let mat = this.topMats.get(key);
    if (!mat) { mat = new THREE.MeshBasicMaterial({ map: card === "back" ? this.tex.back() : this.tex.face(card, asValue) }); this.topMats.set(key, mat); }
    m.material = [this.edge, this.edge, mat, this.edge, this.edge, this.edge] as unknown as THREE.Material;
    m.castShadow = true; m.visible = true;
    this.world.add(m);
    return m;
  }

  private fly(card: Card | "back", asValue: number | undefined, from: THREE.Vector3, to: THREE.Vector3, o: { delay?: number; dur?: number; rx0?: number; rx1?: number; scale0?: number; scale1?: number; onDone?: () => void } = {}) {
    const mesh = this.flightMesh(card, asValue);
    mesh.scale.setScalar(o.scale0 ?? 1);
    mesh.position.copy(from);
    mesh.userData.s0 = o.scale0 ?? 1; mesh.userData.s1 = o.scale1 ?? 1;
    const now = performance.now();
    mesh.visible = !o.delay;
    this.flights.push({ mesh, from: from.clone(), to: to.clone(), t0: now + (o.delay ?? 0), dur: o.dur ?? 520, arc: 1.6, rx0: o.rx0 ?? 0, rx1: o.rx1 ?? 0, onDone: o.onDone });
  }

  private handPos(you: boolean, k: number, index: number, total: number): THREE.Vector3 {
    const l = this.layout!;
    if (you) { const s = handSlots(Math.max(total, index + 1), l.me.hand, 0.9)[index]; return new THREE.Vector3(s.x, 0.62, s.z); }
    const o = l.opponents[k];
    return new THREE.Vector3(o.at.x + CLUSTER.hand.x * o.scale, 0.2, o.at.z + CLUSTER.hand.z * o.scale);
  }

  private topOf(key: string): THREE.Vector3 {
    const s = this.stacks.get(key);
    return s ? new THREE.Vector3(s.pos.x, s.topY(), s.pos.z) : new THREE.Vector3();
  }

  private animate(events: GameEvent[], v: TableView) {
    if (!events.length || !this.layout) return;
    const you = this.youIndex(v);
    const order = seatOrder(v.players.length, v.you);
    const seatKey = (p: number) => (p === you ? "me" : `o${order.indexOf(p)}`);
    const seatIdx = (p: number) => order.indexOf(p);
    let delay = 0;
    for (const e of events) {
      if (e.type === "play") {
        const p = e.player, to = `b${e.to}`;
        const stack = this.stacks.get(to);
        const dest = this.topOf(to);
        if (stack && v.building[e.to] !== undefined) {
          // the pile already shows the new card in the view: keep it hidden until the flying card lands (unless the pile was cleared)
          const cleared = v.building[e.to].length === 0;
          const sk = seatKey(p);
          let from: THREE.Vector3; let rx0 = 0; let scale0 = 1;
          if (e.source.from === "hand") { from = this.handPos(p === you, seatIdx(p), e.source.index, 5); rx0 = p === you ? HAND_LEAN : 0; scale0 = p === you ? HAND_SCALE : 0.7; }
          else if (e.source.from === "stock") { from = this.topOf(`${sk}.stock`); from.y += 0.2; }
          else { from = this.topOf(`${sk}.d${e.source.pile}`); from.y += 0.2; }
          if (!cleared) { this.holds.build[e.to] += 1; }
          dest.y += CARD_T * 0 + (cleared ? stackHeight(11) * this.layout.centre.scale : 0);
          this.fly(e.card, e.value, from, dest.clone(), { delay, rx0, scale0, scale1: this.layout.centre.scale, onDone: () => { if (!cleared) this.holds.build[e.to] = Math.max(0, this.holds.build[e.to] - 1); if (cleared) this.burst(dest); this.resync(); } });
          delay += 130;
        }
      } else if (e.type === "discard") {
        const p = e.player;
        const sk = seatKey(p);
        const to = `${sk}.d${e.pile}`;
        const stack = this.stacks.get(to);
        if (stack) {
          const mineHold = p === you;
          const oppKey = `${seatIdx(p)}.${e.pile}`;
          if (mineHold) this.holds.discard[e.pile] += 1; else this.holds.oppDiscard.set(oppKey, (this.holds.oppDiscard.get(oppKey) ?? 0) + 1);
          const from = this.handPos(p === you, seatIdx(p), 2, 5);
          this.fly(e.card, undefined, from, this.topOf(to), {
            delay, rx0: p === you ? HAND_LEAN : 0, scale0: p === you ? HAND_SCALE : 0.7, scale1: p === you ? this.layout.me.scale : this.layout.opponents[seatIdx(p)]?.scale ?? 1,
            onDone: () => { if (mineHold) this.holds.discard[e.pile] = Math.max(0, this.holds.discard[e.pile] - 1); else this.holds.oppDiscard.set(oppKey, Math.max(0, (this.holds.oppDiscard.get(oppKey) ?? 1) - 1)); this.resync(); },
          });
          delay += 130;
        }
      } else if (e.type === "draw" && e.player === you && v.you !== null) {
        const n = e.count;
        this.holds.hand += n;
        for (let i = 0; i < n; i++) {
          const idx = Math.max(0, (v.players[you].hand?.length ?? 5) - n + i);
          this.fly("back", undefined, this.topOf("draw"), this.handPos(true, 0, idx, v.players[you].hand?.length ?? 5), {
            delay: delay + i * 90, dur: 460, rx1: HAND_LEAN, scale1: HAND_SCALE,
            onDone: () => { this.holds.hand = Math.max(0, this.holds.hand - 1); this.resync(); },
          });
        }
        delay += n * 90;
      } else if (e.type === "pileDone") delay += 120;
    }
  }

  private resync() { if (this.input && this.layout) { this.sync(this.input); this.invalidate(); } }

  private burst(at: THREE.Vector3) {
    const now = performance.now();
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xfde047 : 0xffffff, transparent: true }));
      m.position.copy(at); this.world.add(m);
      const a = (i / 18) * Math.PI * 2;
      this.sparks.push({ mesh: m, v: new THREE.Vector3(Math.cos(a) * (1.2 + Math.random()), 2.6 + Math.random() * 1.4, Math.sin(a) * (1.2 + Math.random())), life: 800, t0: now });
    }
  }

  // ---- camera ------------------------------------------------------------------------------

  private updateCamera() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    const mode = this.input?.camera ?? "tilt";
    const aspect = w / h;
    const l = this.layout ?? layoutTable(1, aspect);
    this.camera.aspect = aspect; this.camera.fov = FOV;
    const elev = THREE.MathUtils.degToRad(mode === "top" ? 86 : mode === "drone" ? 46 : 57);
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const ins = this.input?.insets;
    const il = ins?.left ?? 0, ir = ins?.right ?? 0, it = ins?.top ?? 0, ib = ins?.bottom ?? 0;
    const fw = Math.max(120, w - il - ir), fh = Math.max(120, h - it - ib);
    const halfW = (l.bounds.maxX - l.bounds.minX) / 2 + 0.7;
    const depth = l.bounds.maxZ - l.bounds.minZ + 0.8;
    const halfH = (depth / 2) * Math.sin(elev) + 0.9;
    const dist = Math.max((halfW * w) / (fw * tan * aspect), (halfH * h) / (fh * tan));
    this.base = { dist, elev, target: new THREE.Vector3((l.bounds.minX + l.bounds.maxX) / 2, 0, (l.bounds.minZ + l.bounds.maxZ) / 2 + (mode === "top" ? 0 : 0.2)) };
    const dx = (il - ir) / 2, dy = (it - ib) / 2;
    if (dx || dy) this.camera.setViewOffset(w, h, -dx, -dy, w, h); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.placeCamera();
  }

  private placeCamera() {
    const { dist, elev, target } = this.base;
    const yaw = this.view.yaw + (this.input?.camera === "drone" ? Math.sin(this.droneT * 0.35) * 0.32 : 0);
    const pitch = THREE.MathUtils.clamp(elev + this.view.pitch + (this.input?.camera === "drone" ? Math.sin(this.droneT * 0.23) * 0.06 : 0), 0.35, 1.5);
    const d = dist * this.view.zoom;
    this.camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * d, target.y + Math.sin(pitch) * d, target.z + Math.cos(yaw) * Math.cos(pitch) * d);
    this.camera.lookAt(target);
  }

  resetView() { this.viewTo = { yaw: 0, pitch: 0, zoom: 1 }; this.autoPause = 0; this.invalidate(); }
  private nudge(dyaw: number, dpitch: number, zoomBy: number) {
    this.viewTo.yaw = THREE.MathUtils.clamp(this.viewTo.yaw + dyaw, -1.1, 1.1);
    this.viewTo.pitch = THREE.MathUtils.clamp(this.viewTo.pitch + dpitch, -0.5, 0.55);
    this.viewTo.zoom = THREE.MathUtils.clamp(this.viewTo.zoom * zoomBy, 0.4, 1.5);
    this.autoPause = performance.now() + 6000;
    this.invalidate();
  }

  // ---- pointers ----------------------------------------------------------------------------

  private pickAt(e: { clientX: number; clientY: number }): Pick | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, false).find(h => h.object.userData.pick);
    return (hit?.object.userData.pick as Pick | undefined) ?? null;
  }
  private gesture() { const a = [...this.touches.values()]; return { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) }; }

  private onPointerDown = (e: PointerEvent) => {
    this.downAt = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    if (e.pointerType === "touch") {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) { this.orbit = null; this.downAt = null; this.pinch = this.gesture(); return; }
    }
    if (!this.pinch) {
      this.orbit = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try { this.renderer.domElement.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
  };
  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === "touch" && this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch && this.touches.size === 2) { const g = this.gesture(); this.nudge(0, 0, this.pinch.d / Math.max(10, g.d)); this.pinch = g; return; }
    }
    if (this.orbit && this.orbit.id === e.pointerId) {
      const dx = e.clientX - this.orbit.x, dy = e.clientY - this.orbit.y;
      if (this.downAt && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) < 8) return;
      this.orbit.x = e.clientX; this.orbit.y = e.clientY;
      this.nudge(-dx * 0.006, dy * 0.004, 1);
      return;
    }
    if (e.pointerType === "mouse") {
      const p = this.pickAt(e);
      const k = p ? JSON.stringify(p) : null;
      if (k !== this.hovered) { this.hovered = k; this.renderer.domElement.style.cursor = p ? "pointer" : "grab"; }
    }
  };
  private onPointerUp = (e: PointerEvent) => {
    this.touches.delete(e.pointerId);
    if (this.touches.size < 2) this.pinch = null;
    const d = this.downAt;
    this.downAt = null;
    if (this.orbit?.id === e.pointerId) { this.orbit = null; try { this.renderer.domElement.releasePointerCapture(e.pointerId); } catch { /* ignore */ } }
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 || e.timeStamp - d.t > 600) return;
    const p = this.pickAt(e);
    if (p) this.opts.onPick(p);
  };
  private onPointerCancel = (e: PointerEvent) => { this.touches.delete(e.pointerId); this.pinch = null; this.orbit = null; this.downAt = null; };
  private onWheel = (e: WheelEvent) => { e.preventDefault(); this.nudge(0, 0, Math.exp(e.deltaY * 0.0012)); };
  private onContextLost = (e: Event) => { e.preventDefault(); this.opts.onContextLost(); };

  // ---- the loop ----------------------------------------------------------------------------

  snapshot(): string | null {
    try { this.renderer.render(this.scene, this.camera); return this.renderer.domElement.toDataURL("image/png"); } catch { return null; }
  }

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    if (this.input) {
      const aspect = w / h;
      const key = `${this.input.view.players.length}|${aspect < 0.85 ? "p" : aspect < 1.35 ? "m" : "l"}`;
      if (key !== this.layoutKey) this.update(this.input);
    }
    this.updateCamera();
    this.invalidate();
  }

  invalidate() {
    if (this.disposed || this.raf) return;
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    this.raf = 0;
    if (this.disposed) return;
    const dt = this.lastT ? Math.min(100, now - this.lastT) : 16;
    this.lastT = now;
    let animating = false;

    // the camera eases towards where the player has put it
    const k = 1 - Math.exp(-dt * 0.012);
    const prev = { ...this.view };
    this.view.yaw += (this.viewTo.yaw - this.view.yaw) * k;
    this.view.pitch += (this.viewTo.pitch - this.view.pitch) * k;
    this.view.zoom += (this.viewTo.zoom - this.view.zoom) * k;
    if (Math.abs(prev.yaw - this.view.yaw) + Math.abs(prev.pitch - this.view.pitch) + Math.abs(prev.zoom - this.view.zoom) > 0.0002) animating = true;
    const drone = this.input?.camera === "drone" && !this.input.reduceMotion && now > this.autoPause;
    if (drone) { this.droneT += dt / 1000; animating = true; }
    if (animating || drone) this.placeCamera();

    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i];
      const t = (now - f.t0) / f.dur;
      if (t < 0) { animating = true; continue; }
      f.mesh.visible = true;
      const e = ease(Math.min(1, t));
      f.mesh.position.lerpVectors(f.from, f.to, e);
      f.mesh.position.y += Math.sin(e * Math.PI) * f.arc;
      f.mesh.rotation.x = f.rx0 + (f.rx1 - f.rx0) * e;
      f.mesh.rotation.z = Math.sin(e * Math.PI) * 0.12;
      f.mesh.scale.setScalar((f.mesh.userData.s0 as number) + ((f.mesh.userData.s1 as number) - (f.mesh.userData.s0 as number)) * e);
      animating = true;
      if (t >= 1) {
        this.world.remove(f.mesh); f.mesh.rotation.set(0, 0, 0); this.flightPool.push(f.mesh);
        this.flights.splice(i, 1);
        f.onDone?.();
      }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      const t = (now - s.t0) / s.life;
      if (t >= 1) { this.world.remove(s.mesh); s.mesh.geometry.dispose(); (s.mesh.material as THREE.Material).dispose(); this.sparks.splice(i, 1); continue; }
      s.v.y -= 7 * dt / 1000;
      s.mesh.position.addScaledVector(s.v, dt / 1000);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - t;
      animating = true;
    }
    // soft pulses on what can be played
    const pulse = 0.55 + 0.45 * Math.sin(now / 220);
    let pulsing = false;
    this.rings.forEach(r => { if (r.visible) { (r.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.6 * pulse; pulsing = true; } });
    if (this.hintRing.visible) { (this.hintRing.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.6 * pulse; pulsing = true; }
    if (this.glow.visible) { (this.glow.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.12 * pulse; pulsing = true; }

    this.renderer.render(this.scene, this.camera);
    if (!this.first) { this.first = true; this.opts.onFirstFrame?.(); }
    if (animating) this.governor.frame(dt, now);
    if (animating || pulsing) this.raf = requestAnimationFrame(this.tick);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.unreset();
    const c = this.renderer.domElement;
    c.removeEventListener("webglcontextlost", this.onContextLost);
    c.removeEventListener("pointerdown", this.onPointerDown);
    c.removeEventListener("pointerup", this.onPointerUp);
    c.removeEventListener("pointermove", this.onPointerMove);
    c.removeEventListener("pointercancel", this.onPointerCancel);
    c.removeEventListener("wheel", this.onWheel);
    this.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh || (o as THREE.Sprite).isSprite) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach(mat => { if (mat && mat !== this.edge) (mat as THREE.Material).dispose(); });
      }
    });
    Object.values(this.geo).forEach(g => g.dispose());
    this.labels.forEach(l => l.tex.dispose());
    this.tex.dispose();
    this.edge.dispose();
    this.renderer.dispose();
    c.remove();
  }
}

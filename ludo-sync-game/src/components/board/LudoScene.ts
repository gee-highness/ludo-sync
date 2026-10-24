import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FINISH, RING, SEATS, SEAT_INFO, STAR_RING_INDEXES, YARD, pointOf, type Point, type Seat } from "@/lib/ludo/board";
import type { MoveOption } from "@/lib/ludo/types";
import { tokenKey, type PlacedToken } from "./layout";
import type { ResolvedDesign, TrailId, IdleId } from "@/lib/client/pieces";
import { buildPiece3D, type Built3D } from "./pieces3d";
import { shade } from "@/lib/client/pieces";
import { previewPath } from "@/lib/client/preview";
import { buildNeonBoard, type NeonBoard } from "./neon3d";
import { NIGHT, buildCityscape, skyTexture, type CityHandle } from "./cityscape3d";
import { buildBoardDressing, type BoardDressing } from "./boarddress3d";
import { DiceRig } from "./dice3d";
import type { IslandMap } from "@/lib/client/islands";
import type { TycoonState } from "@/lib/ludo/types";
import type { MovePreview } from "@/lib/client/settings";

export interface SceneInput {
  tokens: PlacedToken[];
  playing: ReadonlySet<Seat>;
  /** Seat whose tokens may be picked, with their legal moves; null when input is off. */
  interactiveSeat: Seat | null;
  options: MoveOption[];
  viewSeat: Seat;
  /** Whose turn it is, for the glowing yard. */
  activeSeat: Seat | null;
  winnerSeat: Seat | null;
  symbols: boolean;
  hints: boolean;
  reduceMotion: boolean;
  hopMs: number;
  camera: "tilt" | "top" | "follow";
  movePreview: MovePreview;
  /** Dark tiles with glowing outlines instead of the pale classic look. */
  neon: boolean;
  /** The neon-city look: night skyline, dark slab with girders, dressed squares and lots, island buildings. */
  look: boolean;
  tycoon: TycoonState | null;
  islands: IslandMap;
  enterBonus: number;
  /** Bumps on every roll; with `rolled` and `rollMs` it drives the thrown dice. */
  rollKey: number;
  rolled: number[];
  rollMs: number;
  /** Keep the camera on the current token (a purchase or build decision is waiting). */
  hold: boolean;
  /** What each piece looks like, by seat then token. */
  designs: Record<Seat, ResolvedDesign[]>;
  /** CSS px of the canvas covered by the interface; the board is framed in the rest. */
  insets?: { top: number; right: number; bottom: number; left: number };
}

export interface SceneOptions {
  quality: "high" | "low";
  onPick: (token: number) => void;
  /** Called once when the frame rate stays poor, so the caller can fall back to the flat board. */
  onSlow: () => void;
  onContextLost: () => void;
}

const MODELS = {
  grid: "/models/grid.glb",
  center: "/models/center.glb",
  starts: ["/models/p1-start.glb", "/models/p2-start.glb", "/models/p3-start.glb", "/models/p4-start.glb"],
  tokens: ["/models/player1.glb", "/models/player2.glb", "/models/player3.glb", "/models/player4.glb"],
} as const;

const TOKEN_SCALE = 0.42;
const FOV = 36;
const INACTIVE = 0x555555;
const TAU = Math.PI * 2;
const hex = (css: string) => parseInt(css.slice(1), 16);

type TweenKind = "hop" | "enter" | "return" | "finish" | "slide";
interface Tween { from: THREE.Vector3; to: THREE.Vector3; t0: number; dur: number; arc: number; smooth: boolean; kind: TweenKind; turns: number }

interface TokenObj {
  root: THREE.Group;
  holder: THREE.Group;
  proxy: THREE.Mesh;
  seat: Seat;
  token: number;
  progress: number;
  target: THREE.Vector3;
  scaleTarget: number;
  tween: Tween | null;
  ring: THREE.Mesh | null;
  glyph: THREE.Sprite | null;
  phase: number;
  designKey: string;
  body: THREE.Object3D | null;
  built: Built3D | null;
  ownMaterials: THREE.Material[];
  /** Set for flat standing pieces, which turn to face the camera. */
  facing: THREE.Object3D | null;
  idle: IdleId;
  trail: TrailId;
  size: number;
  /** 0..1, how squashed the token is right now (spring that settles after a landing). */
  squash: number;
  hover: number;
  cheerUntil: number;
}

interface Shock { mesh: THREE.Mesh; t0: number; dur: number; max: number }

const toWorld = (p: Point, y = 0) => new THREE.Vector3(p.x - 7, y, p.y - 7);
const ease = (t: number) => t * t * (3 - 2 * t);

const softDot = (): THREE.CanvasTexture => {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,255,255,.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
};

/**
 * The 3D board. Plain Three.js behind a small imperative API so React only passes it state:
 * it owns the renderer, loads the GLB models and brings the pieces to life (squash-and-stretch hops,
 * landing dust, capture shockwaves, spinning flights, idle breathing, a winner's celebration)
 * while rendering only when something is actually moving.
 */
export class LudoScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 100);
  private camBase = new THREE.Vector3();
  private world = new THREE.Group();
  private tokens = new Map<string, TokenObj>();
  private templates: (THREE.Object3D | null)[] = [null, null, null, null];
  private templateLift = [0, 0, 0, 0];
  private bases: THREE.Group[] = [];
  private yardPlates: THREE.Mesh[] = [];
  private stars: THREE.Mesh[] = [];
  /** Board materials that change colour with who is playing, by seat. */
  private seatMats: { column: THREE.MeshStandardMaterial[][]; start: THREE.MeshStandardMaterial[][]; centre: THREE.MeshStandardMaterial[][] } = {
    column: [[], [], [], []], start: [[], [], [], []], centre: [[], [], [], []],
  };
  private ghosts: THREE.Mesh[] = [];
  private pathDots: THREE.Mesh[] = [];
  private hemi!: THREE.HemisphereLight;
  private sunLight!: THREE.DirectionalLight;
  private city: CityHandle | null = null;
  private skyTex: THREE.Texture | null = null;
  private dressing: BoardDressing | null = null;
  private dressingTycoon = false;
  private dice!: DiceRig;
  private lastRollKey = -1;
  private diceFadeAt = 0;
  private camMoved = false;
  private baseFov = FOV;
  private followK = 0;
  private followObj: TokenObj | null = null;
  private followHoldUntil = 0;
  private followDir = new THREE.Vector3(0, 0, -1);
  private camLook = new THREE.Vector3();
  private neonBoard: NeonBoard | null = null;
  private neonOn = false;
  private tileMats: THREE.MeshStandardMaterial[] = [];
  private edgeMats: THREE.MeshStandardMaterial[] = [];
  private centreEdgeMats: THREE.MeshStandardMaterial[] = [];
  private shocks: Shock[] = [];
  private particles!: {
    points: THREE.Points; pos: Float32Array; col: Float32Array; base: Float32Array; vel: Float32Array; life: Float32Array; max: Float32Array; grav: Float32Array;
  };
  private raycaster = new THREE.Raycaster();
  private glyphTextures: THREE.CanvasTexture[] = [];
  private dotTexture!: THREE.CanvasTexture;
  private ro: ResizeObserver;
  private raf = 0;
  private lastFrame = 0;
  private lastAmbient = 0;
  private disposed = false;
  private input: SceneInput | null = null;
  private hoverToken: number | null = null;
  private rotationTarget = 0;
  private fpsSamples: number[] = [];
  private slowReported = false;
  private downAt: { x: number; y: number } | null = null;
  private shake = 0;
  private kick = 0;
  private lastActive: Seat | null = null;
  private lastFirework = 0;
  private readonly high: boolean;

  constructor(private host: HTMLElement, private opts: SceneOptions) {
    const high = opts.quality === "high";
    this.high = high;
    this.renderer = new THREE.WebGLRenderer({ antialias: high, alpha: true, powerPreference: high ? "high-performance" : "low-power" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 1.5 : 1.25));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = high;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = this.renderer.domElement;
    canvas.style.cssText = "width:100%;height:100%;display:block;touch-action:manipulation;outline:none";
    canvas.addEventListener("webglcontextlost", this.onContextLost);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    host.appendChild(canvas);

    this.scene.add(this.world);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x8899bb, 1.7);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    this.sunLight = sun;
    sun.position.set(5, 12, 7);
    if (high) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.left = -10; sun.shadow.camera.right = 10; sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -10;
      sun.shadow.camera.near = 1; sun.shadow.camera.far = 40;
      sun.shadow.bias = -0.0005;
      sun.shadow.radius = 5;
    }
    this.scene.add(sun);

    this.dotTexture = softDot();
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Mesh(
        new THREE.RingGeometry(0.46, 0.62, 40),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
      );
      g.rotation.x = -Math.PI / 2;
      g.visible = false;
      g.renderOrder = 2;
      this.ghosts.push(g);
      this.world.add(g);
    }
    const dotGeo = new THREE.CircleGeometry(0.15, 16);
    for (let i = 0; i < 48; i++) {
      const d = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.8, depthWrite: false }));
      d.rotation.x = -Math.PI / 2;
      d.visible = false;
      d.renderOrder = 2;
      this.pathDots.push(d);
      this.world.add(d);
    }
    this.dice = new DiceRig(this.world);
    this.initParticles();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
  }

  /** Fetches every model; rejects if any is missing so the caller can fall back to the flat board. */
  async load(): Promise<void> {
    const loader = new GLTFLoader();
    const [grid, center, starts, tokens] = await Promise.all([
      loader.loadAsync(MODELS.grid),
      loader.loadAsync(MODELS.center),
      Promise.all(MODELS.starts.map(u => loader.loadAsync(u))),
      Promise.all(MODELS.tokens.map(u => loader.loadAsync(u))),
    ]);
    if (this.disposed) return;

    // glTF materials without a metalness value default to fully metallic, which renders black without an environment map
    const matte = (root: THREE.Object3D, metalness = 0, roughness = 0.65) => root.traverse(c => {
      const m = c as THREE.Mesh;
      if (!m.isMesh) return;
      (Array.isArray(m.material) ? m.material : [m.material]).forEach(mat => {
        const std = mat as THREE.MeshStandardMaterial;
        if (std.isMeshStandardMaterial) { std.metalness = metalness; std.roughness = roughness; }
      });
    });
    // flat board pieces only receive shadows (a big plate casting onto the cells under it turns them black);
    // tokens are the only casters
    const shade = (o: THREE.Object3D, cast = false) => o.traverse(c => {
      if ((c as THREE.Mesh).isMesh) { c.castShadow = cast && this.renderer.shadowMap.enabled; c.receiveShadow = this.renderer.shadowMap.enabled; }
    });
    grid.scene.position.set(0, 0.005, 0);
    center.scene.position.set(0, 0.001, 0);
    shade(grid.scene); shade(center.scene);
    matte(grid.scene); matte(center.scene);
    this.world.add(grid.scene, center.scene);
    this.styleBoard(grid.scene, center.scene);

    SEATS.forEach(seat => {
      const base = new THREE.Group();
      const model = starts[seat].scene;
      shade(model);
      matte(model);
      model.traverse(c => { // each base owns its materials so an empty seat can be greyed on its own
        const m = c as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.computeVertexNormals();
        m.material = Array.isArray(m.material) ? m.material.map(x => x.clone()) : m.material.clone();
      });
      base.add(model);
      // the yard's four token slots sit round its centre
      const slots = [0, 1, 2, 3].map(i => pointOf(seat, i, YARD));
      const cx = slots.reduce((a, p) => a + p.x, 0) / 4;
      const cy = slots.reduce((a, p) => a + p.y, 0) / 4;
      base.position.set(cx - 7, 0.03, cy - 7);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({ color: SEAT_INFO[seat].main, roughness: 0.7, metalness: 0 }));
      plate.rotation.x = -Math.PI / 2;
      plate.position.set(cx - 7, 0.022, cy - 7);
      plate.receiveShadow = this.renderer.shadowMap.enabled;
      this.yardPlates[seat] = plate;
      this.world.add(plate);
      this.bases[seat] = base;
      this.world.add(base);

      const tpl = tokens[seat].scene.children[0] ?? tokens[seat].scene;
      shade(tpl, true);
      matte(tpl, 0.05, 0.38);
      // tokens take the same palette as the flat board
      tpl.traverse(c => {
        const m = c as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
        mat.color.setHex(hex(SEAT_INFO[seat].main));
        mat.emissive.setHex(hex(SEAT_INFO[seat].main));
        mat.emissiveIntensity = 0.18;
      });
      const box = new THREE.Box3().setFromObject(tpl);
      this.templates[seat] = tpl;
      this.templateLift[seat] = -box.min.y * TOKEN_SCALE + 0.02;
    });
    for (let s = 0; s < 4; s++) this.glyphTextures[s] = this.makeGlyph(SEAT_INFO[s as Seat].glyph);
    if (this.input) this.update(this.input);
    this.invalidate();
  }

  /** The model ships as a near-black plate; recolour it so cells, yards and columns read clearly. */
  private styleBoard(grid: THREE.Object3D, centre: THREE.Object3D) {
    for (const root of [grid, centre]) root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && o.name !== "simple_grid") m.geometry.computeVertexNormals(); });
    const bySeat: Record<string, Seat> = { "Material.001": 0, "Material.002": 1, "Material.003": 2, "Material.004": 3 };
    const startBySeat: Record<string, Seat> = { "Material.008": 0, "Material.009": 1, "Material.010": 2, "Material.011": 3 };
    grid.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      (Array.isArray(m.material) ? m.material : [m.material]).forEach(mat => {
        const std = mat as THREE.MeshStandardMaterial;
        if (std.name === "Material.005") { std.color.setHex(0xd6d6d6); std.roughness = 0.85; this.tileMats.push(std); }
        else if (std.name === "Material.007") { std.color.setHex(0x9a9a9a); this.edgeMats.push(std); }
        else if (std.name in bySeat) this.seatMats.column[bySeat[std.name]].push(std);
        else if (std.name in startBySeat) this.seatMats.start[startBySeat[std.name]].push(std);
      });
    });
    centre.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      (Array.isArray(m.material) ? m.material : [m.material]).forEach(mat => {
        const std = mat as THREE.MeshStandardMaterial;
        if (std.name === "Material.007") { std.color.setHex(0x2b2b2b); this.centreEdgeMats.push(std); }
        else if (std.name in bySeat) this.seatMats.centre[bySeat[std.name]].push(std);
      });
    });
    // gold stars on the safe squares the model does not mark
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    g.font = "bold 110px system-ui, sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = "#D69E2E"; g.fillText("★", 64, 70);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.glyphTextures.push(tex);
    for (const idx of STAR_RING_INDEXES) {
      const [row, col] = RING[idx];
      const star = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      star.rotation.x = -Math.PI / 2;
      star.position.set(col - 7, 0.035, row - 7);
      star.renderOrder = 1;
      this.stars.push(star);
      this.world.add(star);
    }
  }

  private applyColours(playing: ReadonlySet<Seat>) {
    const neon = this.neonOn;
    // neon: the tiles go dark and the glowing outlines carry the colour
    this.tileMats.forEach(m => m.color.setHex(neon ? 0x191919 : 0xd6d6d6));
    this.edgeMats.forEach(m => m.color.setHex(neon ? 0x101010 : 0x9a9a9a));
    this.centreEdgeMats.forEach(m => m.color.setHex(neon ? 0x101010 : 0x2b2b2b));
    this.neonBoard?.setColours(playing);
    const dim = (css: string, k: number) => hex(shade(css, k));
    SEATS.forEach(seat => {
      const on = playing.has(seat);
      const info = SEAT_INFO[seat];
      this.seatMats.column[seat].forEach(m => m.color.setHex(neon ? (on ? dim(info.path, -0.8) : 0x1e1e1e) : on ? hex(info.path) : 0xa0a0a0));
      this.seatMats.start[seat].forEach(m => m.color.setHex(neon ? (on ? dim(info.main, -0.5) : 0x1e1e1e) : on ? hex(info.main) : INACTIVE));
      this.seatMats.centre[seat].forEach(m => m.color.setHex(neon ? (on ? dim(info.main, -0.75) : 0x1a1a1a) : on ? hex(info.main) : INACTIVE));
      const plate = this.yardPlates[seat];
      if (plate) (plate.material as THREE.MeshStandardMaterial).color.setHex(neon ? (on ? dim(info.home, -0.82) : 0x1c1c1c) : on ? hex(info.home) : INACTIVE);
      const base = this.bases[seat];
      if (!base) return;
      base.traverse(c => {
        const m = c as THREE.Mesh;
        if (!m.isMesh) return;
        (Array.isArray(m.material) ? m.material : [m.material]).forEach(mat => {
          const std = mat as THREE.MeshStandardMaterial;
          // the tile becomes a pale inner square, the model's frame a darker shade of the yard
          if (std.name === "Material.007") std.color.setHex(neon ? 0x121212 : on ? hex(shade(info.home, -0.38)) : 0x2b2b2b);
          else std.color.setHex(neon ? 0x202020 : on ? 0xf4e9e9 : 0x8f8f8f);
        });
      });
    });
  }

  private makeGlyph(glyph: string): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = c.height = 96;
    const g = c.getContext("2d")!;
    g.font = "bold 70px system-ui, sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = 10; g.strokeStyle = "#111827"; g.strokeText(glyph, 48, 52);
    g.fillStyle = "#ffffff"; g.fillText(glyph, 48, 52);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // ---- particles and shockwaves -------------------------------------------------------------

  private initParticles() {
    const n = this.high ? 480 : 200;
    const pos = new Float32Array(n * 3).fill(-999);
    const col = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.34, map: this.dotTexture, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    points.frustumCulled = false;
    points.renderOrder = 4;
    this.world.add(points);
    this.particles = { points, pos, col, base: new Float32Array(n * 3), vel: new Float32Array(n * 3), life: new Float32Array(n), max: new Float32Array(n), grav: new Float32Array(n) };
  }

  /** Throws `count` glowing specks from a point. `up` is initial upward speed, `spread` sideways speed. */
  private emit(at: THREE.Vector3, count: number, color: number, o: { spread?: number; up?: number; life?: number; gravity?: number; y?: number } = {}) {
    if (this.input?.reduceMotion) count = Math.ceil(count / 4);
    const { pos, vel, life, max, grav, base } = this.particles;
    const c = new THREE.Color(color);
    let made = 0;
    for (let i = 0; i < life.length && made < count; i++) {
      if (life[i] > 0) continue;
      const a = Math.random() * TAU;
      const sp = (o.spread ?? 2.4) * (0.4 + Math.random() * 0.8);
      pos[i * 3] = at.x + Math.cos(a) * 0.12; pos[i * 3 + 1] = at.y + (o.y ?? 0.3); pos[i * 3 + 2] = at.z + Math.sin(a) * 0.12;
      vel[i * 3] = Math.cos(a) * sp; vel[i * 3 + 1] = (o.up ?? 2.5) * (0.5 + Math.random()); vel[i * 3 + 2] = Math.sin(a) * sp;
      life[i] = max[i] = (o.life ?? 0.8) * (0.7 + Math.random() * 0.5);
      grav[i] = o.gravity ?? 9;
      base[i * 3] = c.r; base[i * 3 + 1] = c.g; base[i * 3 + 2] = c.b;
      made++;
    }
  }

  private shockwave(at: THREE.Vector3, color: number, max = 3.2, dur = 650) {
    if (this.input?.reduceMotion) return;
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(at.x, 0.06, at.z);
    mesh.scale.setScalar(0.2);
    mesh.renderOrder = 3;
    this.world.add(mesh);
    this.shocks.push({ mesh, t0: performance.now(), dur, max });
  }

  private firework(at: THREE.Vector3, color: number) {
    this.emit(at, 36, color, { spread: 3.4, up: 5.5, life: 1.2, gravity: 6, y: 1.2 });
    this.emit(at, 14, 0xffffff, { spread: 2.2, up: 4.5, life: 1, gravity: 6, y: 1.2 });
  }

  // ---- tokens ---------------------------------------------------------------------------------

  /** Gives a token the look its design asks for, rebuilding only when the design actually changed. */
  private env: THREE.Texture | null = null;
  /** A small gradient-cube environment, so metal reads as polished without loading a file. */
  private metalEnv(): THREE.Texture {
    if (this.env) return this.env;
    const sc = new THREE.Scene();
    const cols = ["#7fb2ff", "#2a3a7a", "#ffd9a0", "#0b1030", "#c9a0ff", "#1c2a58"].map(c => new THREE.MeshBasicMaterial({ color: c, side: THREE.BackSide }));
    sc.add(new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), cols));
    const bright = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 6), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
    bright.position.y = 8; sc.add(bright);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.env = pm.fromScene(sc, 0.02).texture;
    pm.dispose();
    return this.env;
  }

  private applyDesign(obj: TokenObj, d: ResolvedDesign) {
    const metal = this.neonOn && d.shape === "classic";
    const key = JSON.stringify(d) + (metal ? "|m" : "");
    if (obj.designKey === key) return;
    obj.designKey = key;
    if (obj.body) obj.holder.remove(obj.body);
    obj.built?.dispose();
    obj.built = null;
    obj.ownMaterials.forEach(m => m.dispose());
    obj.ownMaterials = [];
    obj.idle = d.idle; obj.trail = d.trail; obj.size = d.size;
    if (d.shape === "classic") {
      const tpl = this.templates[obj.seat];
      if (!tpl) return;
      const body = tpl.clone(true);
      body.traverse(c => {
        const m = c as THREE.Mesh;
        if (!m.isMesh) return;
        const own = Array.isArray(m.material) ? m.material.map(x => x.clone()) : m.material.clone();
        m.material = own;
        (Array.isArray(own) ? own : [own]).forEach(x => {
          obj.ownMaterials.push(x);
          const std = x as THREE.MeshStandardMaterial;
          if (!std.isMeshStandardMaterial) return;
          if (metal) { // gold and silver figurines lit by a gradient environment
            std.color.set(obj.seat % 2 === 0 ? "#f3c64a" : "#d5dbe6");
            std.metalness = 1; std.roughness = 0.28;
            std.envMap = this.metalEnv(); std.envMapIntensity = 1.25;
            std.emissive.set(0x000000); std.emissiveIntensity = 0;
            return;
          }
          std.color.set(d.primary);
          std.emissive.set(d.glow ?? d.primary);
          std.emissiveIntensity = d.glow ? 0.15 + 0.6 * d.glowStrength : 0.18;
        });
      });
      body.position.set(0, this.templateLift[obj.seat] / TOKEN_SCALE, 0);
      if (metal) { // round pedestal: dark disc, seat-colour ring and a base glow
        const col = new THREE.Color(SEAT_INFO[obj.seat].main);
        const ped = new THREE.Group();
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.15, 0.22, 24), new THREE.MeshStandardMaterial({ color: "#1b2036", roughness: 0.5, metalness: 0.6, envMap: this.metalEnv() }));
        disc.position.y = 0.11;
        const ringM = new THREE.MeshBasicMaterial({ color: col, toneMapped: false });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.06, 6, 28), ringM);
        ring.rotation.x = Math.PI / 2; ring.position.y = 0.2;
        const glowM = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
        const glow = new THREE.Mesh(new THREE.CircleGeometry(1.7, 24), glowM);
        glow.rotation.x = -Math.PI / 2; glow.position.y = 0.02;
        ped.add(disc, ring, glow);
        body.position.y += 0.22;
        const wrap = new THREE.Group(); wrap.add(ped, body);
        obj.ownMaterials.push(disc.material as THREE.Material, ringM, glowM);
        obj.holder.add(wrap);
        obj.body = wrap;
      } else {
        obj.holder.add(body);
        obj.body = body;
      }
      obj.facing = null;
    } else {
      const built = buildPiece3D(d);
      built.group.position.y = 0.02 / TOKEN_SCALE;
      obj.holder.add(built.group);
      obj.body = built.group;
      obj.built = built;
      obj.facing = built.facing;
    }
  }

  private ensureToken(p: PlacedToken): TokenObj | null {
    const key = tokenKey(p.seat, p.token);
    let obj = this.tokens.get(key);
    if (obj) return obj;
    const tpl = this.templates[p.seat];
    if (!tpl) return null;
    const root = new THREE.Group();
    const holder = new THREE.Group();
    holder.scale.setScalar(TOKEN_SCALE);
    root.add(holder);
    const proxy = new THREE.Mesh(new THREE.SphereGeometry(0.78, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    proxy.position.y = 0.55;
    root.add(proxy);
    const target = toWorld(p.at);
    root.position.copy(target);
    this.world.add(root);
    obj = {
      root, holder, proxy, seat: p.seat, token: p.token, progress: p.progress, target, scaleTarget: p.scale, tween: null, ring: null, glyph: null,
      phase: Math.random() * TAU, squash: 0, hover: 0, cheerUntil: 0,
      designKey: "", body: null, built: null, ownMaterials: [], facing: null, idle: "breathe", trail: "dust", size: 1,
    };
    this.tokens.set(key, obj);
    return obj;
  }

  private emitTrail(obj: TokenObj) {
    const at = obj.root.position;
    switch (obj.trail) {
      case "sparkle": this.emit(at, 2, Math.random() < 0.5 ? 0xfacc15 : 0xffffff, { spread: 0.8, up: 0.6, life: 0.6, gravity: 0.5, y: 0.3 }); break;
      case "ember": this.emit(at, 2, 0xfb923c, { spread: 0.4, up: 1.4, life: 0.7, gravity: -0.4, y: 0.2 }); break;
      case "bubbles": this.emit(at, 1, 0x7dd3fc, { spread: 0.5, up: 1.1, life: 0.9, gravity: -0.3, y: 0.3 }); break;
      default: this.emit(at, 1, hex(SEAT_INFO[obj.seat].light), { spread: 0.5, up: 0.4, life: 0.45, gravity: 1, y: 0.15 });
    }
  }

  /** Builds the glowing outlines the first time they are wanted, then shows or hides them. */
  private setNeon(on: boolean) {
    this.neonOn = on;
    if (on && !this.neonBoard) {
      this.neonBoard = buildNeonBoard();
      this.world.add(this.neonBoard.group);
    }
    if (this.neonBoard) this.neonBoard.group.visible = on;
  }

  /** Builds or removes the neon city, the dressed board, and the night lighting to match the look setting. */
  private applyLook(input: SceneInput) {
    if (input.look && !this.city) {
      this.city = buildCityscape(this.high);
      this.scene.add(this.city.group);
      this.skyTex = skyTexture();
      this.scene.background = this.skyTex;
      this.scene.fog = new THREE.Fog(NIGHT.fog, 28, 90);
      this.hemi.color.setHex(NIGHT.hemiSky); this.hemi.groundColor.setHex(NIGHT.hemiGround); this.hemi.intensity = NIGHT.hemiK;
      this.sunLight.color.setHex(NIGHT.sun); this.sunLight.intensity = NIGHT.sunK;
    } else if (!input.look && this.city) {
      this.scene.remove(this.city.group); this.city.dispose(); this.city = null;
      this.skyTex?.dispose(); this.skyTex = null;
      this.scene.background = null; this.scene.fog = null;
      this.hemi.color.setHex(0xffffff); this.hemi.groundColor.setHex(0x8899bb); this.hemi.intensity = 1.7;
      this.sunLight.color.setHex(0xffffff); this.sunLight.intensity = 1.5;
    }
    const tycoonGame = !!input.tycoon;
    if (this.dressing && (!input.look || this.dressingTycoon !== tycoonGame)) {
      this.world.remove(this.dressing.group); this.dressing.dispose(); this.dressing = null;
    }
    if (input.look && !this.dressing) {
      this.dressing = buildBoardDressing(this.high, tycoonGame);
      this.dressingTycoon = tycoonGame;
      this.world.add(this.dressing.group);
    }
    this.dressing?.update({ tycoon: input.tycoon, islands: input.islands, enterBonus: input.enterBonus });
  }

  update(input: SceneInput) {
    this.input = input;
    this.applyLook(input);
    if (this.lastRollKey < 0) this.lastRollKey = input.rollKey;
    if (input.rollKey !== this.lastRollKey) {
      this.lastRollKey = input.rollKey;
      if (input.rolled.length) {
        this.dice.throw(input.rolled, SEAT_INFO[input.activeSeat ?? 0].main, input.rollMs, input.reduceMotion, Math.atan2(Math.cos(this.world.rotation.y), -Math.sin(this.world.rotation.y)));
        this.diceFadeAt = 0;
      }
    }
    const now = performance.now();
    const f = input.hopMs / 170;
    const calm = input.reduceMotion;
    this.rotationTarget = (Math.PI / 2) * input.viewSeat;
    this.updateCamera(input.camera);
    this.setNeon(input.neon || input.look);
    this.applyColours(input.playing);
    if (input.activeSeat !== this.lastActive) {
      if (this.lastActive !== null) this.diceFadeAt = now + 1100;
      if (this.lastActive !== null && !calm) this.kick = 1;
      this.lastActive = input.activeSeat;
    }

    const seen = new Set<string>();
    for (const p of input.tokens) {
      const obj = this.ensureToken(p);
      if (!obj) continue;
      this.applyDesign(obj, input.designs[p.seat][p.token]);
      seen.add(tokenKey(p.seat, p.token));
      const target = toWorld(p.at);
      if (!obj.target.equals(target)) {
        const prev = obj.progress;
        let kind: TweenKind = "hop";
        let dur = input.hopMs, arc = calm ? 0.15 : 0.6, smooth = false, turns = 0;
        // the token has not gone anywhere: others just made room, so slide over quietly instead of hopping
        if (p.progress === prev) { kind = "slide"; dur = 160; arc = 0; smooth = true; }
        else if (p.progress === YARD) { kind = "return"; dur = 520 * f; arc = calm ? 0.3 : 3.0; smooth = true; turns = calm ? 0 : 2; }
        else if (prev === YARD) { kind = "enter"; dur = 340 * f; arc = calm ? 0.2 : 1.5; smooth = true; turns = calm ? 0 : 1; }
        else if (p.progress === FINISH) { kind = "finish"; dur = 460 * f; arc = calm ? 0.2 : 1.8; smooth = true; turns = calm ? 0 : 2; }
        if (input.hopMs === 0) {
          obj.root.position.copy(target);
          obj.tween = null;
        } else {
          obj.tween = { from: obj.root.position.clone(), to: target.clone(), t0: now, dur: Math.max(dur, 1), arc, smooth, kind, turns };
        }
        if (kind === "return" && prev >= 0 && prev < FINISH) {
          // a capture: the victim is blasted off its square
          const at = obj.root.position.clone();
          this.shockwave(at, 0xfacc15, 3.4);
          this.emit(at, 34, 0xfacc15, { spread: 3.6, up: 4.5, life: 0.9 });
          this.emit(at, 16, 0xffffff, { spread: 2.4, up: 3.5, life: 0.7 });
          if (!calm) this.shake = 1;
          // whoever stands on the square cheers
          for (const other of this.tokens.values()) {
            if (other !== obj && other.root.position.distanceTo(at) < 0.8) other.cheerUntil = now + 900;
          }
        }
        obj.target.copy(target);
      }
      obj.progress = p.progress;
      obj.scaleTarget = p.scale;
      if (input.symbols && this.glyphTextures[p.seat]) {
        if (!obj.glyph) {
          const mat = new THREE.SpriteMaterial({ map: this.glyphTextures[p.seat], depthTest: false, transparent: true });
          obj.glyph = new THREE.Sprite(mat);
          obj.glyph.scale.set(0.55, 0.55, 1);
          obj.glyph.position.y = 1.45;
          obj.glyph.renderOrder = 5;
          obj.root.add(obj.glyph);
        }
        obj.glyph.visible = true;
      } else if (obj.glyph) obj.glyph.visible = false;
    }
    for (const [key, obj] of this.tokens) {
      if (!seen.has(key)) { this.world.remove(obj.root); this.tokens.delete(key); }
    }

    // glowing rings under movable tokens
    const movable = new Set(input.interactiveSeat !== null ? input.options.map(o => o.token) : []);
    for (const obj of this.tokens.values()) {
      const on = input.interactiveSeat === obj.seat && movable.has(obj.token);
      if (on && !obj.ring) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.46, 0.66, 32),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.renderOrder = 2;
        this.world.add(ring);
        obj.ring = ring;
      }
      if (obj.ring) obj.ring.visible = on && input.hints;
      if (!on && obj.ring) { this.world.remove(obj.ring); obj.ring.geometry.dispose(); (obj.ring.material as THREE.Material).dispose(); obj.ring = null; }
    }
    this.syncGhosts();
    this.invalidate();
  }

  setHover(token: number | null) {
    this.hoverToken = token;
    this.syncGhosts();
    this.invalidate();
  }

  /** For every token that can move: a dot on each square it would cross and a ring on its landing square. */
  private syncGhosts() {
    const input = this.input;
    this.ghosts.forEach(g => { g.visible = false; });
    this.pathDots.forEach(d => { d.visible = false; });
    if (!input || input.interactiveSeat === null || input.movePreview === "off") return;
    const seat = input.interactiveSeat;
    const dark = hex(SEAT_INFO[seat].dark);
    const hovering = this.hoverToken !== null;
    let ring = 0, dot = 0;
    for (const o of input.options) {
      if (ring >= this.ghosts.length) break;
      const strong = !hovering || o.token === this.hoverToken;
      const path = previewPath(seat, o);
      const g = this.ghosts[ring++];
      g.position.copy(toWorld(path.end, 0.04));
      (g.material as THREE.MeshBasicMaterial).opacity = strong ? 0.95 : 0.4;
      g.visible = true;
      if (input.movePreview !== "dots") continue;
      for (const p of path.dots) {
        if (dot >= this.pathDots.length) break;
        const d = this.pathDots[dot++];
        d.position.copy(toWorld(p, 0.05));
        d.scale.setScalar(strong && hovering ? 1.35 : 1);
        const mat = d.material as THREE.MeshBasicMaterial;
        mat.color.setHex(dark);
        mat.opacity = strong ? 0.9 : 0.35;
        d.visible = true;
      }
    }
  }

  private updateCamera(mode: "tilt" | "top" | "follow") {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    const aspect = w / h;
    const look = !!this.input?.look;
    // the overhead view looks from further away through a longer lens, so the city rooftops stay well below the camera
    const fov = mode === "top" && look ? 26 : FOV;
    this.baseFov = fov;
    this.camera.aspect = aspect;
    this.camera.fov = fov;
    const elev = THREE.MathUtils.degToRad(mode === "top" ? 89 : 60);
    const tan = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const halfW = look ? 8.8 : 8.0;
    const halfH = 7.7 * Math.sin(elev) + (look ? 2.2 : 1.3);
    // frame the board in the part of the canvas the interface leaves uncovered, and shift the picture to its centre
    const ins = this.input?.insets;
    const il = ins?.left ?? 0, ir = ins?.right ?? 0, it = ins?.top ?? 0, ib = ins?.bottom ?? 0;
    const fw = Math.max(120, w - il - ir), fh = Math.max(120, h - it - ib);
    const dist = Math.max((halfW * w) / (fw * tan * aspect), (halfH * h) / (fh * tan));
    this.camBase.set(0, dist * Math.sin(elev), dist * Math.cos(elev));
    // while the camera is swooping, the frame loop owns its position
    if (!this.camMoved) { this.camera.position.copy(this.camBase); this.camera.lookAt(0, 0, 0); }
    const dx = (il - ir) / 2, dy = (it - ib) / 2;
    if (dx || dy) this.camera.setViewOffset(w, h, -dx, -dy, w, h); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.updateCamera(this.input?.camera ?? "tilt");
    this.invalidate();
  }

  invalidate() {
    if (this.disposed || this.raf) return;
    this.raf = requestAnimationFrame(this.tick);
  }

  // ---- the frame ------------------------------------------------------------------------------

  private tick = (now: number) => {
    this.raf = 0;
    if (this.disposed) return;
    const rawDt = now - (this.lastFrame || now);
    const dt = Math.min(rawDt / 1000, 0.1);
    this.lastFrame = now;
    const t = now / 1000;
    const input = this.input;
    const calm = !!input?.reduceMotion;
    const lively = this.high && !calm;
    let animating = false;

    const winner = input?.winnerSeat ?? null;
    if (winner !== null && !calm) {
      animating = true;
      if (now - this.lastFirework > 520) {
        this.lastFirework = now;
        const a = Math.random() * TAU, r = 1 + Math.random() * 4.5;
        this.firework(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), hex(SEAT_INFO[winner].light));
      }
    }

    for (const obj of this.tokens.values()) {
      let lift = 0, spinY = 0, stretch = 0;
      const tw = obj.tween;
      if (tw) {
        const k = Math.min((now - tw.t0) / tw.dur, 1);
        const e = tw.smooth ? ease(k) : k;
        obj.root.position.lerpVectors(tw.from, tw.to, e);
        const arc = tw.arc * 4 * k * (1 - k);
        obj.root.position.y += arc;
        stretch = tw.kind === "slide" ? 0 : Math.sin(k * Math.PI) * (calm ? 0 : tw.kind === "hop" ? 0.22 : 0.3);
        spinY = tw.turns * TAU * e;
        if (!calm && this.high && k < 1 && obj.trail !== "none" && tw.kind !== "slide") this.emitTrail(obj);
        if (k >= 1) {
          obj.root.position.copy(tw.to);
          obj.tween = null;
          if (tw.kind !== "slide") {
          obj.squash = 1;
          this.emit(tw.to, tw.kind === "hop" ? 7 : 16, 0xdfe7f5, { spread: 1.3, up: 0.9, life: 0.5, gravity: 2.5, y: 0.08 });
          if (tw.kind === "enter") { this.shockwave(tw.to, hex(SEAT_INFO[obj.seat].light), 2.2, 520); this.emit(tw.to, 20, hex(SEAT_INFO[obj.seat].light), { up: 3.2, life: 0.8 }); }
          if (tw.kind === "finish") { this.firework(tw.to, hex(SEAT_INFO[obj.seat].light)); this.shockwave(tw.to, 0xffffff, 3.6, 800); if (!calm) this.shake = Math.max(this.shake, 0.5); }
          if (tw.kind === "return") this.emit(tw.to, 10, 0xffffff, { spread: 1.8, up: 1.5, life: 0.6 });
          }
        } else animating = true;
      }

      // spring back from a landing squash
      if (obj.squash > 0.001) { obj.squash *= Math.exp(-dt * 11); animating = true; } else obj.squash = 0;

      // eager tokens bounce on the spot; hovered ones rise and turn; the winners dance
      const movable = !!obj.ring && obj.ring.visible;
      let bounce = 0;
      if (movable && !calm && !tw) {
        const s = Math.abs(Math.sin(t * 5 + obj.phase));
        bounce = s * 0.3;
        if (s < 0.12) stretch -= 0.12; else stretch += s * 0.1;
      }
      const hovered = this.hoverToken === obj.token && input?.interactiveSeat === obj.seat;
      obj.hover += ((hovered ? 1 : 0) - obj.hover) * Math.min(1, dt * 10);
      if (obj.hover > 0.01 && !calm) { lift += obj.hover * 0.3; spinY += t * 2.2 * obj.hover; }
      if (winner === obj.seat && !calm) bounce = Math.abs(Math.sin(t * 4.2 + obj.token * 0.9)) * 0.95;
      if (now < obj.cheerUntil && !calm) bounce = Math.max(bounce, Math.abs(Math.sin(t * 9)) * 0.55);

      const idleOn = lively && !tw;
      const breathe = idleOn && obj.idle === "breathe" ? Math.sin(t * 2.2 + obj.phase) * 0.03 : 0;
      let tilt = 0, grow = 1;
      if (idleOn) {
        if (obj.idle === "bounce") { bounce = Math.max(bounce, Math.abs(Math.sin(t * 2.4 + obj.phase)) * 0.4); animating = true; }
        else if (obj.idle === "spin") { spinY += t * 1.5 + obj.phase; animating = true; }
        else if (obj.idle === "pulse") { grow = 1 + Math.sin(t * 3.4 + obj.phase) * 0.09; animating = true; }
        else if (obj.idle === "wobble") { tilt = Math.sin(t * 3 + obj.phase) * 0.14; animating = true; }
      }
      const sq = obj.squash;
      const sy = 1 - 0.3 * sq + stretch + breathe;
      const sxz = 1 + 0.24 * sq - stretch * 0.45 - breathe * 0.5;
      const k = TOKEN_SCALE * obj.size * grow;
      obj.holder.scale.set(k * sxz, k * sy, k * sxz);
      obj.holder.rotation.y = spinY;
      obj.holder.rotation.z = tilt;
      obj.holder.position.y = lift + bounce;
      if (obj.facing) obj.facing.rotation.y = -this.world.rotation.y;

      const s = obj.root.scale.x + (obj.scaleTarget - obj.root.scale.x) * Math.min(1, dt * 14);
      if (Math.abs(s - obj.scaleTarget) > 0.002) { animating = true; obj.root.scale.setScalar(s); } else obj.root.scale.setScalar(obj.scaleTarget);
      if (winner === obj.seat) animating = true;
    }

    // the board turns to the viewer's seat (and, for a winner, sways)
    const rot = this.world.rotation.y;
    this.dressing?.orient(rot);
    const sway = winner !== null && !calm ? Math.sin(t * 0.5) * 0.18 : 0;
    const diff = this.rotationTarget + sway - rot;
    if (Math.abs(diff) > 0.0015) {
      this.world.rotation.y = calm ? this.rotationTarget : rot + diff * Math.min(1, dt * 6);
      animating = true;
    } else this.world.rotation.y = this.rotationTarget + sway;

    // particles
    const { pos, col, base, vel, life, max, grav, points } = this.particles;
    let alive = false;
    for (let i = 0; i < life.length; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { pos[i * 3 + 1] = -999; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; continue; }
      vel[i * 3 + 1] -= grav[i] * dt;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < 0.04) { pos[i * 3 + 1] = 0.04; vel[i * 3 + 1] *= -0.3; }
      const f = life[i] / max[i];
      col[i * 3] = base[i * 3] * f; col[i * 3 + 1] = base[i * 3 + 1] * f; col[i * 3 + 2] = base[i * 3 + 2] * f;
      alive = true;
    }
    if (alive) {
      (points.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      (points.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
      animating = true;
    }

    // shockwaves
    for (let i = this.shocks.length - 1; i >= 0; i--) {
      const s = this.shocks[i];
      const k = (now - s.t0) / s.dur;
      if (k >= 1) {
        this.world.remove(s.mesh); s.mesh.geometry.dispose(); (s.mesh.material as THREE.Material).dispose(); this.shocks.splice(i, 1);
        continue;
      }
      s.mesh.scale.setScalar(0.2 + (s.max - 0.2) * (1 - (1 - k) * (1 - k)));
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
      animating = true;
    }

    // the thrown dice, the dressed board's rising buildings, and the city's traffic and signs
    if (this.diceFadeAt && now >= this.diceFadeAt) { this.diceFadeAt = 0; this.dice.fadeOut(now); }
    if (this.dice.update(now)) animating = true;
    if (this.dressing?.tick(now)) animating = true;
    if (this.city && lively) this.city.update(t);

    // camera: swoop in behind the moving token, hold on the landing, then pull back to the overview
    let target = 0;
    const picking = !!input && input.interactiveSeat !== null && input.options.length > 0;
    if (input && input.camera === "follow" && input.look && !calm && !picking) {
      let mover: TokenObj | null = null;
      for (const o of this.tokens.values()) if (o.tween && o.tween.kind !== "slide") { mover = o; break; }
      if (mover) { this.followObj = mover; this.followHoldUntil = now + 1100; }
      if (mover || (this.followObj && (now < this.followHoldUntil || input.hold))) target = 1;
    }
    this.followK += (target - this.followK) * Math.min(1, dt * (target > this.followK ? 2.6 : 1.8));
    if (Math.abs(target - this.followK) < 0.002) this.followK = target;
    if (target === 0 && this.followK === 0) this.followObj = null;
    const following = this.followK > 0.001 && !!this.followObj;
    if (following || this.shake > 0.003 || this.kick > 0.003) {
      this.shake *= Math.exp(-dt * 7);
      this.kick *= Math.exp(-dt * 5);
      const a = this.shake * 0.22;
      const base = this.camBase.clone();
      this.camLook.set(0, 0, 0);
      let zoom = 0;
      if (following) {
        const o = this.followObj!;
        const wp = o.root.getWorldPosition(new THREE.Vector3());
        if (o.tween) {
          const d = new THREE.Vector3(o.tween.to.x - o.tween.from.x, 0, o.tween.to.z - o.tween.from.z);
          if (d.lengthSq() > 1e-4) { d.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.world.rotation.y); this.followDir.lerp(d, Math.min(1, dt * 6)).normalize(); }
        }
        const e = this.followK * this.followK * (3 - 2 * this.followK);
        base.lerp(wp.clone().addScaledVector(this.followDir, -2.9).add(new THREE.Vector3(0, 1.75, 0)), e);
        this.camLook.lerp(wp.clone().addScaledVector(this.followDir, 1.3).add(new THREE.Vector3(0, 0.35, 0)), e);
        zoom = 6 * e;
      }
      this.camera.position.set(base.x + (Math.random() - 0.5) * a, base.y + (Math.random() - 0.5) * a, base.z + (Math.random() - 0.5) * a);
      this.camera.lookAt(this.camLook);
      if (following && !this.input?.reduceMotion) this.camera.rotateZ(0.035 * this.followK * Math.sin(t * 0.7));
      if (this.scene.fog instanceof THREE.Fog) { this.scene.fog.near = 28 - 20 * this.followK; this.scene.fog.far = 90 - 40 * this.followK; } // distance haze stands in for depth of field
      this.camera.fov = this.baseFov - 2.4 * this.kick - zoom;
      this.camera.updateProjectionMatrix();
      this.camMoved = true;
      animating = true;
    } else if (this.camMoved || this.shake > 0 || this.kick > 0) {
      this.shake = this.kick = 0;
      this.camMoved = false;
      this.camera.position.copy(this.camBase);
      this.camera.lookAt(0, 0, 0);
      this.camera.fov = this.baseFov;
      if (this.scene.fog instanceof THREE.Fog) { this.scene.fog.near = 28; this.scene.fog.far = 90; }
      this.camera.updateProjectionMatrix();
    }

    // ambient life: twinkling stars, the active yard's glow, pulsing rings
    let ambient = false;
    if (lively) {
      ambient = true;
      this.stars.forEach((st, i) => { const k = 1 + 0.14 * Math.sin(t * 3 + i * 1.7); st.scale.setScalar(k); st.rotation.z = Math.sin(t * 0.9 + i) * 0.25; });
      SEATS.forEach(seat => {
        const plate = this.yardPlates[seat]?.material as THREE.MeshStandardMaterial | undefined;
        if (!plate) return;
        const on = input?.activeSeat === seat && input.playing.has(seat);
        plate.emissive.setHex(on ? hex(SEAT_INFO[seat].home) : 0x000000);
        plate.emissiveIntensity = on ? 0.28 + 0.22 * Math.sin(t * 3.2) : 0;
      });
    }
    const pulse = 1 + Math.sin(t * 3.8) * 0.14;
    for (const obj of this.tokens.values()) {
      if (!obj.ring || !obj.ring.visible) continue;
      obj.ring.position.set(obj.root.position.x, 0.05, obj.root.position.z);
      obj.ring.scale.setScalar((calm ? 1 : pulse) * Math.max(obj.root.scale.x, 0.7));
      if (!calm) ambient = true;
    }
    for (const g of this.ghosts) if (g.visible && !calm) { g.position.y = 0.06 + Math.abs(Math.sin(t * 4)) * 0.12; ambient = true; }

    const gap = this.high ? 33 : 66;
    if (animating || now - this.lastAmbient >= gap || !ambient) {
      this.renderer.render(this.scene, this.camera);
      if (!animating) this.lastAmbient = now;
    }

    if (animating && rawDt > 0 && rawDt < 400 && !this.slowReported) {
      this.fpsSamples.push(rawDt);
      if (this.fpsSamples.length >= 90) {
        const sorted = [...this.fpsSamples].sort((a, b) => a - b);
        const median = sorted[sorted.length >> 1];
        if (1000 / median < 22) { this.slowReported = true; this.opts.onSlow(); }
        this.fpsSamples = [];
      }
    }
    if (animating || ambient) this.raf = requestAnimationFrame(this.tick);
    else this.lastFrame = 0;
  };

  // ---- input ----------------------------------------------------------------------------------

  private pointer(e: PointerEvent): THREE.Vector2 {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private hit(e: PointerEvent): TokenObj | null {
    const input = this.input;
    if (!input || input.interactiveSeat === null) return null;
    const movable = new Set(input.options.map(o => o.token));
    const proxies: THREE.Object3D[] = [];
    for (const obj of this.tokens.values()) if (obj.seat === input.interactiveSeat && movable.has(obj.token)) proxies.push(obj.proxy);
    if (!proxies.length) return null;
    this.raycaster.setFromCamera(this.pointer(e), this.camera);
    const hits = this.raycaster.intersectObjects(proxies, false);
    if (!hits.length) return null;
    return [...this.tokens.values()].find(o => o.proxy === hits[0].object) ?? null;
  }

  private onPointerDown = (e: PointerEvent) => { this.downAt = { x: e.clientX, y: e.clientY }; };
  private onPointerUp = (e: PointerEvent) => {
    const d = this.downAt;
    this.downAt = null;
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) return;
    const obj = this.hit(e);
    if (obj) this.opts.onPick(obj.token);
  };
  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    const obj = this.hit(e);
    this.renderer.domElement.style.cursor = obj ? "pointer" : "default";
    const t = obj ? obj.token : null;
    if (t !== this.hoverToken) this.setHover(t);
  };
  private onPointerLeave = () => { if (this.hoverToken !== null) this.setHover(null); };
  private onContextLost = (e: Event) => { e.preventDefault(); this.opts.onContextLost(); };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("webglcontextlost", this.onContextLost);
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointerup", this.onPointerUp);
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach(x => x.dispose()); else mat?.dispose();
    });
    this.neonBoard?.dispose();
    this.dice.dispose();
    this.dressing?.dispose();
    this.env?.dispose();
    this.city?.dispose();
    this.skyTex?.dispose();
    this.glyphTextures.forEach(t => t.dispose());
    this.dotTexture.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    canvas.remove();
  }
}

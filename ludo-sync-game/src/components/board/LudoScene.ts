import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FINISH, RING, SEATS, SEAT_INFO, STAR_RING_INDEXES, YARD, pointOf, type Point, type Seat } from "@/lib/ludo/board";
import type { MoveOption } from "@/lib/ludo/types";
import { tokenKey, type PlacedToken } from "./layout";
import type { ResolvedDesign, TrailId, IdleId } from "@/lib/client/pieces";
import { buildPiece3D, type Built3D } from "./pieces3d";
import { MOODS, buildCity, buildYardProps, skyTexture, type SceneryHandle } from "./scenery3d";
import type { TimeOfDay } from "@/lib/client/settings";

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
  camera: "tilt" | "top";
  /** What each piece looks like, by seat then token. */
  designs: Record<Seat, ResolvedDesign[]>;
  /** A city around the board and homes in the yards. */
  scenery: "city" | "off";
  timeOfDay: TimeOfDay;
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
const INACTIVE = 0x4a5568;
const TAU = Math.PI * 2;
const hex = (css: string) => parseInt(css.slice(1), 16);

type TweenKind = "hop" | "enter" | "return" | "finish";
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
  private hemi!: THREE.HemisphereLight;
  private sun!: THREE.DirectionalLight;
  private city: (SceneryHandle & { stars: THREE.Points | null }) | null = null;
  private yardHomes: SceneryHandle[] = [];
  private skyTex: THREE.Texture | null = null;
  private sceneryKey = "off";

  constructor(private host: HTMLElement, private opts: SceneOptions) {
    const high = opts.quality === "high";
    this.high = high;
    this.renderer = new THREE.WebGLRenderer({ antialias: high, alpha: true, powerPreference: high ? "high-performance" : "low-power" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 2 : 1.5));
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
    this.sun = sun;
    sun.position.set(5, 12, 7);
    if (high) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.left = -10; sun.shadow.camera.right = 10; sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -10;
      sun.shadow.camera.near = 1; sun.shadow.camera.far = 40;
      sun.shadow.bias = -0.0005;
      sun.shadow.radius = 5;
    }
    this.scene.add(sun);

    this.dotTexture = softDot();
    for (let i = 0; i < 4; i++) {
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
        if (std.name === "Material.005") { std.color.setHex(0xf4f7fb); std.roughness = 0.85; }
        else if (std.name === "Material.007") std.color.setHex(0x9aa7bd);
        else if (std.name in bySeat) this.seatMats.column[bySeat[std.name]].push(std);
        else if (std.name in startBySeat) this.seatMats.start[startBySeat[std.name]].push(std);
      });
    });
    centre.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      (Array.isArray(m.material) ? m.material : [m.material]).forEach(mat => {
        const std = mat as THREE.MeshStandardMaterial;
        if (std.name === "Material.007") std.color.setHex(0x2d3748);
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
    SEATS.forEach(seat => {
      const on = playing.has(seat);
      const info = SEAT_INFO[seat];
      this.seatMats.column[seat].forEach(m => m.color.setHex(on ? hex(info.light) : 0xa0aec0));
      this.seatMats.start[seat].forEach(m => m.color.setHex(on ? hex(info.main) : INACTIVE));
      this.seatMats.centre[seat].forEach(m => m.color.setHex(on ? hex(info.main) : INACTIVE));
      const plate = this.yardPlates[seat];
      if (plate) (plate.material as THREE.MeshStandardMaterial).color.setHex(on ? hex(info.main) : INACTIVE);
      const base = this.bases[seat];
      if (!base) return;
      base.traverse(c => {
        const m = c as THREE.Mesh;
        if (!m.isMesh) return;
        (Array.isArray(m.material) ? m.material : [m.material]).forEach(mat => {
          const std = mat as THREE.MeshStandardMaterial;
          // the tile becomes a pale inner square, the model's frame a darker shade of the yard
          if (std.name === "Material.007") std.color.setHex(on ? hex(info.dark) : 0x2d3748);
          else std.color.setHex(on ? 0xf4e9e9 : 0x8d99a8);
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
  private applyDesign(obj: TokenObj, d: ResolvedDesign) {
    const key = JSON.stringify(d);
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
          std.color.set(d.primary);
          std.emissive.set(d.glow ?? d.primary);
          std.emissiveIntensity = d.glow ? 0.15 + 0.6 * d.glowStrength : 0.18;
        });
      });
      body.position.set(0, this.templateLift[obj.seat] / TOKEN_SCALE, 0);
      obj.holder.add(body);
      obj.body = body;
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

  /** Builds, swaps or removes the city and the yard homes to match the settings. */
  private applyScenery(input: SceneInput) {
    const key = input.scenery === "city" ? `city:${input.timeOfDay}` : "off";
    if (key === this.sceneryKey) return;
    this.sceneryKey = key;
    if (this.city) { this.scene.remove(this.city.group); this.city.dispose(); this.city = null; }
    this.yardHomes.forEach(h => { this.world.remove(h.group); h.dispose(); });
    this.yardHomes = [];
    this.skyTex?.dispose(); this.skyTex = null;
    if (input.scenery !== "city") {
      this.scene.background = null; this.scene.fog = null;
      this.hemi.color.setHex(0xffffff); this.hemi.groundColor.setHex(0x8899bb); this.hemi.intensity = 1.7;
      this.sun.color.setHex(0xffffff); this.sun.intensity = 1.5;
      this.updateCamera(input.camera);
      return;
    }
    const m = MOODS[input.timeOfDay];
    this.city = buildCity(input.timeOfDay, this.high);
    this.scene.add(this.city.group);
    this.skyTex = skyTexture(m);
    this.scene.background = this.skyTex;
    this.scene.fog = new THREE.Fog(m.fog, 26, 75);
    this.hemi.color.setHex(m.hemiSky); this.hemi.groundColor.setHex(m.hemiGround); this.hemi.intensity = m.hemiK;
    this.sun.color.setHex(m.sun); this.sun.intensity = m.sunK;
    for (const seat of SEATS) {
      const home = buildYardProps(seat, input.timeOfDay, this.high);
      this.world.add(home.group);
      this.yardHomes.push(home);
    }
    this.updateCamera(input.camera);
  }

  update(input: SceneInput) {
    this.input = input;
    this.applyScenery(input);
    const now = performance.now();
    const f = input.hopMs / 170;
    const calm = input.reduceMotion;
    this.rotationTarget = (Math.PI / 2) * input.viewSeat;
    this.updateCamera(input.camera);
    this.applyColours(input.playing);
    if (input.activeSeat !== this.lastActive) {
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
        if (p.progress === YARD) { kind = "return"; dur = 520 * f; arc = calm ? 0.3 : 3.0; smooth = true; turns = calm ? 0 : 2; }
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

  private syncGhosts() {
    const input = this.input;
    this.ghosts.forEach(g => { g.visible = false; });
    if (!input || input.interactiveSeat === null || this.hoverToken === null) return;
    input.options.filter(o => o.token === this.hoverToken).slice(0, 4).forEach((o, i) => {
      const g = this.ghosts[i];
      g.position.copy(toWorld(pointOf(input.interactiveSeat!, o.token, o.to), 0.04));
      g.visible = true;
    });
  }

  private updateCamera(mode: "tilt" | "top") {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camera.fov = FOV;
    const elev = THREE.MathUtils.degToRad(mode === "top" ? 89 : 60);
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const wide = this.input?.scenery === "city";
    const halfW = wide ? 10.6 : 8.0;
    const halfH = 7.7 * Math.sin(elev) + (wide ? 3.3 : 1.3);
    const dist = Math.max(halfW / (tan * aspect), halfH / tan);
    this.camBase.set(0, dist * Math.sin(elev), dist * Math.cos(elev));
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(0, 0, 0);
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
        stretch = Math.sin(k * Math.PI) * (calm ? 0 : tw.kind === "hop" ? 0.22 : 0.3);
        spinY = tw.turns * TAU * e;
        if (!calm && this.high && k < 1 && obj.trail !== "none") this.emitTrail(obj);
        if (k >= 1) {
          obj.root.position.copy(tw.to);
          obj.tween = null;
          obj.squash = 1;
          this.emit(tw.to, tw.kind === "hop" ? 7 : 16, 0xdfe7f5, { spread: 1.3, up: 0.9, life: 0.5, gravity: 2.5, y: 0.08 });
          if (tw.kind === "enter") { this.shockwave(tw.to, hex(SEAT_INFO[obj.seat].light), 2.2, 520); this.emit(tw.to, 20, hex(SEAT_INFO[obj.seat].light), { up: 3.2, life: 0.8 }); }
          if (tw.kind === "finish") { this.firework(tw.to, hex(SEAT_INFO[obj.seat].light)); this.shockwave(tw.to, 0xffffff, 3.6, 800); if (!calm) this.shake = Math.max(this.shake, 0.5); }
          if (tw.kind === "return") this.emit(tw.to, 10, 0xffffff, { spread: 1.8, up: 1.5, life: 0.6 });
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

    // camera: shake on impacts, a small fov kick when the turn changes
    if (this.shake > 0.003 || this.kick > 0.003) {
      this.shake *= Math.exp(-dt * 7);
      this.kick *= Math.exp(-dt * 5);
      const a = this.shake * 0.22;
      this.camera.position.set(this.camBase.x + (Math.random() - 0.5) * a, this.camBase.y + (Math.random() - 0.5) * a, this.camBase.z + (Math.random() - 0.5) * a);
      this.camera.lookAt(0, 0, 0);
      this.camera.fov = FOV - 2.4 * this.kick;
      this.camera.updateProjectionMatrix();
      animating = true;
    } else if (this.shake > 0 || this.kick > 0) {
      this.shake = this.kick = 0;
      this.camera.position.copy(this.camBase);
      this.camera.lookAt(0, 0, 0);
      this.camera.fov = FOV;
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
        plate.emissive.setHex(on ? hex(SEAT_INFO[seat].main) : 0x000000);
        plate.emissiveIntensity = on ? 0.28 + 0.22 * Math.sin(t * 3.2) : 0;
      });
    }
    if (lively && (this.city || this.yardHomes.length)) {
      this.city?.update(t);
      this.yardHomes.forEach(h => h.update(t));
    }
    const pulse = 1 + Math.sin(t * 3.8) * 0.14;
    for (const obj of this.tokens.values()) {
      if (!obj.ring || !obj.ring.visible) continue;
      obj.ring.position.set(obj.root.position.x, 0.05, obj.root.position.z);
      obj.ring.scale.setScalar((calm ? 1 : pulse) * Math.max(obj.root.scale.x, 0.7));
      if (!calm) ambient = true;
    }
    for (const g of this.ghosts) if (g.visible && !calm) { g.position.y = 0.06 + Math.abs(Math.sin(t * 4)) * 0.12; ambient = true; }

    const gap = this.high ? 33 : 50;
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
    this.city?.dispose();
    this.yardHomes.forEach(h => h.dispose());
    this.skyTex?.dispose();
    this.glyphTextures.forEach(t => t.dispose());
    this.dotTexture.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    canvas.remove();
  }
}

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import {
  backgroundFragment,
  particleFragment,
  particleVertex,
  starFragment,
  starVertex,
} from "./shaders";
import {
  WORLD_SIZE,
  clamp,
  factionColor,
  radius,
  upgradeCost,
  type WorldMeta,
  type Unit,
  type WorldEvent,
  type Star,
  type MoveOrder,
  type Viewport,
} from "../../shared/types";
import { Soundscape } from "./Audio";

type RenderUnit = Pick<Unit, "id" | "owner" | "x" | "y" | "moving"> & {
  px: number;
  py: number;
};
type Point = { x: number; y: number };
interface Ripple extends WorldEvent {
  born: number;
}
interface Callbacks {
  selection: (count: number) => void;
  order: (order: MoveOrder) => void;
  view: (view: Viewport) => void;
  hover: (star?: Star) => void;
  fps: (fps: number) => void;
}
export class GalaxyRenderer {
  readonly audio = new Soundscape();
  readonly selected = new Set<number>();
  world: WorldMeta = {
    time: 0,
    stars: [],
    players: [],
    room: "",
    unitCount: 0,
  };
  units = new Map<number, RenderUnit>();
  player = 0;
  playing = false;
  touchSelect = false;
  reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  minimap?: HTMLCanvasElement;
  onDemoFrame?: (dt: number) => void;
  cameraX = 3400;
  cameraY = 3400;
  viewHeight = 1700;
  private targetX = 3400;
  private targetY = 3400;
  private targetHeight = 1700;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 3000);
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private canvas: HTMLCanvasElement;
  private overlay: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private starGeo: THREE.InstancedBufferGeometry;
  private starMaterial: THREE.ShaderMaterial;
  private bgMaterial: THREE.ShaderMaterial;
  private particles: THREE.BufferGeometry;
  private particleMaterial: THREE.ShaderMaterial;
  private positions = new Float32Array(30000 * 3);
  private colors = new Float32Array(30000 * 3);
  private sizes = new Float32Array(30000);
  private colorCache = new Map<number, THREE.Color>();
  private starCounts = new Map<number, number>();
  private width = 1;
  private height = 1;
  private dpr = 0;
  private animation = 0;
  private observer: ResizeObserver;
  private lastTime = 0;
  private snapshotTime = 0;
  private frame = 0;
  private frameTime = 0;
  private frameCount = 0;
  private ripples: Ripple[] = [];
  private drag?: {
    start: Point;
    last: Point;
    button: number;
    pan: boolean;
    moved: boolean;
    touch: boolean;
    born: number;
  };
  private pointers = new Map<number, Point>();
  private pinch = 0;
  private gesture = false;
  private space = false;
  private hoverStar?: Star;
  private cursor: Point = { x: 0, y: 0 };
  private lastView = 0;
  private abort = new AbortController();
  private paths: { from: Point; to: Point; born: number }[] = [];
  constructor(
    private container: HTMLElement,
    private callbacks: Callbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor("#030710");
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas = this.renderer.domElement;
    this.canvas.className = "galaxy-canvas";
    this.canvas.setAttribute(
      "aria-label",
      "Interactive galaxy. Drag to select units. Click to move. Scroll to zoom.",
    );
    this.canvas.tabIndex = 0;
    container.append(this.canvas);
    this.overlay = document.createElement("canvas");
    this.overlay.className = "galaxy-overlay";
    container.append(this.overlay);
    this.ctx = this.overlay.getContext("2d")!;
    this.camera.position.z = 1000;
    this.bgMaterial = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader:
        "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: backgroundFragment,
      depthWrite: false,
    });
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(18000, 18000),
      this.bgMaterial,
    );
    bg.position.set(3400, -3400, -200);
    this.scene.add(bg);
    this.makeStarfield();
    const plane = new THREE.PlaneGeometry(1, 1);
    this.starGeo = new THREE.InstancedBufferGeometry();
    this.starGeo.index = plane.index;
    this.starGeo.attributes.position = plane.attributes.position;
    this.starGeo.attributes.uv = plane.attributes.uv;
    this.starGeo.instanceCount = 0;
    this.starMaterial = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: starVertex,
      fragmentShader: starFragment,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const stars = new THREE.Mesh(this.starGeo, this.starMaterial);
    stars.frustumCulled = false;
    stars.renderOrder = 2;
    this.scene.add(stars);
    this.particles = new THREE.BufferGeometry();
    this.particles.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.particles.setAttribute(
      "tint",
      new THREE.BufferAttribute(this.colors, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.particles.setAttribute(
      "size",
      new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage),
    );
    this.particles.setDrawRange(0, 0);
    this.particleMaterial = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 1 }, time: { value: 0 } },
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const points = new THREE.Points(this.particles, this.particleMaterial);
    points.frustumCulled = false;
    points.renderOrder = 3;
    this.scene.add(points);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(800, 600),
      0.7,
      0.65,
      0.65,
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.bindInput();
    this.animation = requestAnimationFrame(this.animate);
  }
  private makeStarfield() {
    const g = new THREE.BufferGeometry(),
      positions = [],
      colors = [],
      sizes = [];
    let seed = 827;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 8500; i++) {
      positions.push(rand() * 14000 - 3600, -rand() * 14000 + 3600, -100);
      const warm = rand() > 0.85;
      const brightness = 0.08 + rand() ** 5 * 0.9;
      colors.push(
        brightness * (warm ? 1 : 0.65),
        brightness * 0.8,
        brightness * (warm ? 0.6 : 1),
      );
      sizes.push(1 + rand() ** 8 * 3);
    }
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("tint", new THREE.Float32BufferAttribute(colors, 3));
    g.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 1.3 }, time: { value: 0 } },
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.scene.add(new THREE.Points(g, m));
  }
  private color(owner: number) {
    let c = this.colorCache.get(owner);
    if (!c) {
      c = new THREE.Color(factionColor(owner));
      this.colorCache.set(owner, c);
    }
    return c;
  }
  setWorld(world: WorldMeta) {
    this.world = world;
    if (this.hoverStar) {
      this.hoverStar = world.stars[this.hoverStar.id];
      this.callbacks.hover(this.hoverStar);
    }
    const centers = new Float32Array(world.stars.length * 3),
      colors = new Float32Array(world.stars.length * 3),
      params = new Float32Array(world.stars.length * 2);
    world.stars.forEach((s, i) => {
      centers.set([s.x, -s.y, 0], i * 3);
      const c = this.color(s.owner);
      colors.set([c.r, c.g, c.b], i * 3);
      params.set([radius(s), s.owner ? s.id + 1 : 0], i * 2);
    });
    this.starGeo.setAttribute(
      "center",
      new THREE.InstancedBufferAttribute(centers, 3),
    );
    this.starGeo.setAttribute(
      "tint",
      new THREE.InstancedBufferAttribute(colors, 3),
    );
    this.starGeo.setAttribute(
      "params",
      new THREE.InstancedBufferAttribute(params, 2),
    );
    this.starGeo.instanceCount = world.stars.length;
  }
  setUnits(list: Pick<Unit, "id" | "owner" | "x" | "y" | "moving">[]) {
    const now = performance.now(),
      t = clamp((now - this.snapshotTime) / 100, 0, 1);
    const next = new Map<number, RenderUnit>();
    for (const u of list) {
      const old = this.units.get(u.id);
      next.set(u.id, {
        ...u,
        px: old ? old.px + (old.x - old.px) * t : u.x,
        py: old ? old.py + (old.y - old.py) * t : u.y,
      });
    }
    this.units = next;
    this.snapshotTime = now;
    this.starCounts.clear();
    for (const s of this.world.stars)
      if (s.owner === this.player) {
        let count = 0;
        for (const u of next.values())
          if (
            u.owner === this.player &&
            (u.x - s.x) ** 2 + (u.y - s.y) ** 2 < 145 ** 2
          )
            count++;
        this.starCounts.set(s.id, count);
      }
    let changed = false;
    for (const id of this.selected)
      if (!next.has(id)) {
        this.selected.delete(id);
        changed = true;
      }
    if (changed) this.callbacks.selection(this.selected.size);
  }
  setPlayer(id: number, home: number) {
    this.player = id;
    this.playing = true;
    this.clearSelection();
    const s = this.world.stars[home];
    if (s) this.focus(s.x, s.y, this.width < 700 ? 1300 : 1150);
  }
  focus(x: number, y: number, height?: number) {
    this.targetX = clamp(x, 0, WORLD_SIZE);
    this.targetY = clamp(y, 0, WORLD_SIZE);
    if (height) this.targetHeight = height;
  }
  home() {
    const p = this.world.players.find((p) => p.id === this.player);
    const s =
      this.world.stars.find(
        (s) => s.id === p?.home && s.owner === this.player,
      ) ?? this.world.stars.find((s) => s.owner === this.player);
    if (s) this.focus(s.x, s.y, 1150);
  }
  zoom(factor: number) {
    this.targetHeight = clamp(this.targetHeight * factor, 430, 7900);
  }
  setQuality(high: boolean) {
    this.bloom.enabled = high && !this.reducedMotion;
    this.dpr = Math.min(devicePixelRatio, high ? 1.7 : 1);
    this.resize();
  }
  clearSelection() {
    this.selected.clear();
    this.callbacks.selection(0);
  }
  selectAll() {
    this.selected.clear();
    for (const u of this.units.values())
      if (u.owner === this.player) this.selected.add(u.id);
    this.callbacks.selection(this.selected.size);
    this.audio.select();
  }
  halfSelection() {
    let i = 0;
    for (const id of this.selected) if (i++ % 2 === 0) this.selected.delete(id);
    this.callbacks.selection(this.selected.size);
  }
  event(events: WorldEvent[]) {
    const now = performance.now();
    for (const e of events) {
      this.ripples.push({ ...e, born: now });
      const p = this.toScreen(e);
      const visible =
        p.x >= 0 && p.y >= 0 && p.x < this.width && p.y < this.height;
      if (visible && e.kind === "clash") this.audio.clash();
      else if (e.owner === this.player && e.kind !== "clash")
        this.audio.capture();
    }
    if (this.ripples.length > 400)
      this.ripples.splice(0, this.ripples.length - 400);
  }
  toScreen(p: Point) {
    const k = this.height / this.viewHeight;
    return {
      x: (p.x - this.cameraX) * k + this.width / 2,
      y: (p.y - this.cameraY) * k + this.height / 2,
    };
  }
  toWorld(p: Point) {
    const k = this.viewHeight / this.height;
    return {
      x: (p.x - this.width / 2) * k + this.cameraX,
      y: (p.y - this.height / 2) * k + this.cameraY,
    };
  }
  getView(): Viewport {
    return {
      x: this.cameraX,
      y: this.cameraY,
      width: (this.viewHeight * this.width) / this.height,
      height: this.viewHeight,
    };
  }
  private resize() {
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    if (!this.dpr)
      this.dpr = Math.min(devicePixelRatio, this.width < 700 ? 1.3 : 1.7);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.width, this.height);
    this.composer.setPixelRatio(this.dpr);
    this.composer.setSize(this.width, this.height);
    this.overlay.width = this.width * this.dpr;
    this.overlay.height = this.height * this.dpr;
    this.overlay.style.width = `${this.width}px`;
    this.overlay.style.height = `${this.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }
  private animate = (now: number) => {
    this.animation = requestAnimationFrame(this.animate);
    const elapsed = (now - (this.lastTime || now)) / 1000;
    const dt = Math.min(0.05, elapsed);
    this.lastTime = now;
    this.onDemoFrame?.(dt);
    const ease = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 8);
    this.cameraX += (this.targetX - this.cameraX) * ease;
    this.cameraY += (this.targetY - this.cameraY) * ease;
    this.viewHeight += (this.targetHeight - this.viewHeight) * ease;
    const halfW = (this.viewHeight * this.width) / this.height / 2;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = this.viewHeight / 2;
    this.camera.bottom = -this.viewHeight / 2;
    this.camera.position.x = this.cameraX;
    this.camera.position.y = -this.cameraY;
    this.camera.updateProjectionMatrix();
    this.starMaterial.uniforms.time.value = this.reducedMotion ? 0 : now / 1000;
    this.bgMaterial.uniforms.time.value = this.reducedMotion ? 0 : now / 1000;
    this.drawParticles(now);
    this.composer.render();
    this.drawOverlay(now);
    if (this.frame++ % 8 === 0) this.drawMinimap();
    if (this.playing && now - this.lastView > 250) {
      this.lastView = now;
      this.callbacks.view(this.getView());
    }
    this.frameCount++;
    this.frameTime += elapsed;
    if (this.frameTime >= 1) {
      this.callbacks.fps(Math.round(this.frameCount / this.frameTime));
      this.frameCount = 0;
      this.frameTime = 0;
    }
  };
  private drawParticles(now: number) {
    const t = clamp((now - this.snapshotTime) / 100, 0, 1);
    let count = 0;
    const add = (
      x: number,
      y: number,
      c: THREE.Color,
      intensity: number,
      size: number,
    ) => {
      if (count >= 30000) return;
      this.positions.set([x, -y, 5], count * 3);
      this.colors.set(
        [c.r * intensity, c.g * intensity, c.b * intensity],
        count * 3,
      );
      this.sizes[count++] = size;
    };
    for (const u of this.units.values()) {
      const x = u.px + (u.x - u.px) * t,
        y = u.py + (u.y - u.py) * t;
      if (
        Math.abs(x - this.cameraX) >
          (this.viewHeight * this.width) / this.height / 2 + 50 ||
        Math.abs(y - this.cameraY) > this.viewHeight / 2 + 50
      )
        continue;
      const c = this.color(u.owner),
        selected = this.selected.has(u.id);
      add(x, y, c, selected ? 2.5 : 1.2, selected ? 9 : 7);
      if (u.moving && !this.reducedMotion) {
        const dx = u.x - u.px,
          dy = u.y - u.py;
        for (let i = 1; i <= 3; i++)
          add(x - dx * i * 0.35, y - dy * i * 0.35, c, 0.35 / i, 5 - i * 0.5);
      }
    }
    for (const e of this.ripples) {
      const age = (now - e.born) / 1000,
        capture = e.kind !== "clash";
      const life = capture ? 2.1 : 0.55;
      if (age > life) continue;
      const color = this.color(e.owner),
        n = capture ? 65 : 7;
      for (let i = 0; i < n; i++) {
        const a = i * 2.399963 + e.x;
        const speed = 16 + (i % 9) * (capture ? 17 : 10),
          r = age * speed;
        add(
          e.x + Math.cos(a) * r,
          e.y + Math.sin(a) * r,
          color,
          (1 - age / life) * 2,
          capture ? 7 : 5,
        );
      }
    }
    this.particles.setDrawRange(0, count);
    for (const a of Object.values(this.particles.attributes))
      a.needsUpdate = true;
    this.particleMaterial.uniforms.scale.value =
      (this.height / this.viewHeight) * this.dpr;
  }
  private drawOverlay(now: number) {
    const c = this.ctx;
    c.clearRect(0, 0, this.width, this.height);
    const scale = this.height / this.viewHeight;
    for (const s of this.world.stars) {
      const p = this.toScreen(s),
        r = radius(s) * scale;
      if (
        p.x < -100 ||
        p.y < -100 ||
        p.x > this.width + 100 ||
        p.y > this.height + 100
      )
        continue;
      const own = s.owner === this.player && this.playing,
        col = factionColor(s.owner);
      c.strokeStyle = col;
      c.lineWidth = 1;
      for (let l = 1; l < s.maxLevel; l++) {
        c.globalAlpha = l < s.level ? 0.5 : 0.15;
        c.beginPath();
        c.arc(p.x, p.y, r + (9 + l * 9) * scale, 0, Math.PI * 2);
        c.stroke();
      }
      if (s.upgrade && scale > 0.24) {
        c.globalAlpha = 0.85;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(
          p.x,
          p.y,
          r + 22 * scale,
          -Math.PI / 2,
          -Math.PI / 2 + (s.upgrade / upgradeCost(s)) * Math.PI * 2,
        );
        c.stroke();
      }
      if (s.shield > this.world.time && s.owner) {
        c.globalAlpha = 0.25;
        c.setLineDash([3, 6]);
        c.beginPath();
        c.arc(
          p.x,
          p.y,
          r + 39 * scale,
          -now * 0.0001,
          Math.PI * 2 - now * 0.0001,
        );
        c.stroke();
        c.setLineDash([]);
      }
      if (this.hoverStar?.id === s.id || own) {
        c.globalAlpha = this.hoverStar?.id === s.id ? 0.7 : 0.22;
        c.beginPath();
        c.arc(p.x, p.y, r + 7, 0, Math.PI * 2);
        c.stroke();
      }
      c.globalAlpha = 1;
      const labelY = p.y + r + 35;
      const unobscured = this.playing
        ? labelY > (this.width < 600 ? 235 : 85) &&
          labelY < this.height - 105 &&
          !(
            this.width >= 600 &&
            p.y < 340 &&
            (p.x < 275 || p.x > this.width - 245)
          )
        : this.width < 600
          ? labelY < this.height * 0.35
          : p.x > this.width * 0.43 && labelY < this.height - 150;
      if (scale > 0.28 && unobscured) {
        c.textAlign = "center";
        c.font = `${own ? 500 : 400} ${clamp(12 * scale + 5, 11, 14)}px 'Space Grotesk', sans-serif`;
        c.fillStyle = own ? "#f4debd" : s.owner ? col : "#6f8294";
        c.fillText(s.name.toUpperCase(), p.x, p.y + r + 35);
        c.font = '10px "IBM Plex Mono", monospace';
        c.fillStyle = s.owner ? "#a0acbb" : "#526779";
        if (!s.owner)
          c.fillText(`${Math.ceil(s.hp)} TO CAPTURE`, p.x, p.y + r + 51);
        else if (own) {
          const n = this.starCounts.get(s.id) ?? 0;
          c.fillText(
            `${n}  ·  +${(s.level * 1.7).toFixed(1)}/s`,
            p.x,
            p.y + r + 51,
          );
        } else {
          const owner = this.world.players.find((o) => o.id === s.owner);
          c.fillText(
            `${owner?.name ?? "ABANDONED"}${owner?.bot ? " · AI" : ""}`,
            p.x,
            p.y + r + 51,
          );
        }
        if (s.owner && s.hp < s.maxHp - 2) {
          c.fillStyle = "#152230";
          c.fillRect(p.x - 18, p.y - r - 13, 36, 2);
          c.fillStyle = col;
          c.fillRect(p.x - 18, p.y - r - 13, (36 * s.hp) / s.maxHp, 2);
        }
      }
    }
    for (const e of this.ripples) {
      const age = (now - e.born) / 1000,
        capture = e.kind !== "clash";
      if (!capture || age > 2.5) continue;
      const p = this.toScreen(e);
      c.strokeStyle = factionColor(e.owner);
      c.globalAlpha = Math.max(0, (1 - age / 2.5) * 0.7);
      c.lineWidth = 1;
      c.beginPath();
      c.arc(p.x, p.y, (30 + age * 140) * scale, 0, Math.PI * 2);
      c.stroke();
      if (e.kind !== "order") {
        c.font = '11px "IBM Plex Mono", monospace';
        c.textAlign = "center";
        c.fillStyle = factionColor(e.owner);
        c.fillText(
          e.kind === "capture" ? "STAR CAPTURED" : "STAR EVOLVED",
          p.x,
          p.y - 60 * scale - age * 18,
        );
      }
    }
    c.globalAlpha = 1;
    this.ripples = this.ripples.filter((e) => now - e.born < 2600);
    this.paths = this.paths.filter((p) => now - p.born < 1800);
    for (const path of this.paths) {
      const a = this.toScreen(path.from),
        b = this.toScreen(path.to);
      c.strokeStyle = factionColor(this.player);
      c.globalAlpha = Math.max(0, 1 - (now - path.born) / 1800) * 0.4;
      c.setLineDash([3, 7]);
      c.lineDashOffset = -now / 70;
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
      c.setLineDash([]);
    }
    c.globalAlpha = 1;
    if (this.drag?.moved && !this.drag.pan && !this.gesture) {
      const a = this.drag.start,
        b = this.cursor;
      c.fillStyle = "rgba(255,209,151,.045)";
      c.strokeStyle = "rgba(255,209,151,.7)";
      c.lineWidth = 1;
      c.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      c.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    }
    if (this.selected.size && this.playing && !this.drag) {
      c.strokeStyle = "#f4d3a2";
      c.globalAlpha = 0.65;
      c.lineWidth = 1;
      const p = this.cursor;
      c.beginPath();
      c.arc(p.x, p.y, 9, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.moveTo(p.x - 14, p.y);
      c.lineTo(p.x - 6, p.y);
      c.moveTo(p.x + 6, p.y);
      c.lineTo(p.x + 14, p.y);
      c.moveTo(p.x, p.y - 14);
      c.lineTo(p.x, p.y - 6);
      c.moveTo(p.x, p.y + 6);
      c.lineTo(p.x, p.y + 14);
      c.stroke();
      c.globalAlpha = 1;
    }
  }
  private drawMinimap() {
    if (!this.minimap) return;
    const c = this.minimap.getContext("2d")!;
    const w = this.minimap.width,
      h = this.minimap.height,
      pad = 12,
      k = (w - 2 * pad) / WORLD_SIZE;
    c.clearRect(0, 0, w, h);
    c.strokeStyle = "#1d3042";
    c.lineWidth = 1;
    c.beginPath();
    c.arc(w / 2, h / 2, (w - 2 * pad) / 2, 0, Math.PI * 2);
    c.stroke();
    for (const s of this.world.stars) {
      c.fillStyle = factionColor(s.owner);
      c.globalAlpha = s.owner ? 0.9 : 0.22;
      c.beginPath();
      c.arc(
        pad + s.x * k,
        pad + s.y * k,
        s.owner === this.player ? 2.5 : s.owner ? 1.8 : 1,
        0,
        Math.PI * 2,
      );
      c.fill();
    }
    c.globalAlpha = 1;
    const v = this.getView();
    c.strokeStyle = "#cbd4da88";
    c.fillStyle = "#9ac7e90a";
    const x = pad + (v.x - v.width / 2) * k,
      y = pad + (v.y - v.height / 2) * k;
    c.fillRect(x, y, v.width * k, v.height * k);
    c.strokeRect(x, y, v.width * k, v.height * k);
  }
  private starAt(p: Point) {
    const world = this.toWorld(p);
    const min = (24 * this.viewHeight) / this.height;
    return this.world.stars.find(
      (s) =>
        Math.hypot(s.x - world.x, s.y - world.y) <
        Math.max(radius(s) + 14, min),
    );
  }
  private selectNear(star: Star, add: boolean) {
    if (!add) this.selected.clear();
    for (const u of this.units.values())
      if (
        u.owner === this.player &&
        Math.hypot(u.x - star.x, u.y - star.y) < 155
      )
        this.selected.add(u.id);
    this.callbacks.selection(this.selected.size);
    this.audio.select();
  }
  private issue(p: Point, star?: Star) {
    if (!this.selected.size) return;
    const target = star ?? this.toWorld(p);
    let x = 0,
      y = 0,
      count = 0;
    for (const id of this.selected) {
      const u = this.units.get(id);
      if (u) {
        x += u.x;
        y += u.y;
        count++;
      }
    }
    if (count)
      this.paths.push({
        from: { x: x / count, y: y / count },
        to: target,
        born: performance.now(),
      });
    this.callbacks.order({
      ids: [...this.selected],
      x: target.x,
      y: target.y,
      star: star?.id,
    });
    this.audio.order();
    this.event([
      { kind: "order", x: target.x, y: target.y, owner: this.player },
    ]);
    this.clearSelection();
  }
  private bindInput() {
    const signal = this.abort.signal;
    const point = (e: PointerEvent) => {
      const r = this.canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault(), {
      signal,
    });
    this.canvas.addEventListener(
      "pointerdown",
      (e) => {
        this.canvas.focus({ preventScroll: true });
        this.canvas.setPointerCapture(e.pointerId);
        const p = point(e);
        this.pointers.set(e.pointerId, p);
        this.cursor = p;
        if (this.pointers.size === 2) {
          const [a, b] = [...this.pointers.values()];
          this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
          this.gesture = true;
          return;
        }
        this.gesture = false;
        this.drag = {
          start: p,
          last: p,
          button: e.button,
          pan:
            this.space ||
            e.button === 1 ||
            e.button === 2 ||
            (e.pointerType === "touch" && !this.touchSelect) ||
            !this.playing,
          moved: false,
          touch: e.pointerType === "touch",
          born: performance.now(),
        };
      },
      { signal },
    );
    this.canvas.addEventListener(
      "pointermove",
      (e) => {
        const p = point(e);
        this.cursor = p;
        if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
        if (this.pointers.size === 2) {
          const [a, b] = [...this.pointers.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (this.pinch > 0)
            this.targetHeight = clamp(
              (this.targetHeight * this.pinch) / d,
              430,
              7900,
            );
          this.pinch = d;
          return;
        }
        if (this.drag && this.pointers.has(e.pointerId) && !this.gesture) {
          const d = this.drag;
          if (Math.hypot(p.x - d.start.x, p.y - d.start.y) > 7) d.moved = true;
          if (d.pan && d.moved) {
            const k = this.targetHeight / this.height;
            this.targetX = clamp(
              this.targetX - (p.x - d.last.x) * k,
              0,
              WORLD_SIZE,
            );
            this.targetY = clamp(
              this.targetY - (p.y - d.last.y) * k,
              0,
              WORLD_SIZE,
            );
          }
          d.last = p;
        } else {
          const s = this.starAt(p);
          if (s?.id !== this.hoverStar?.id) {
            this.hoverStar = s;
            this.callbacks.hover(s);
          }
        }
      },
      { signal },
    );
    this.canvas.addEventListener(
      "pointerup",
      (e) => {
        this.pointers.delete(e.pointerId);
        const d = this.drag,
          p = point(e);
        if (this.gesture) {
          if (!this.pointers.size) {
            this.gesture = false;
            this.drag = undefined;
          }
          return;
        }
        this.drag = undefined;
        if (!d || !this.playing) return;
        if (d.moved && !d.pan) {
          if (!e.shiftKey) this.selected.clear();
          const a = this.toWorld(d.start),
            b = this.toWorld(p);
          for (const u of this.units.values())
            if (
              u.owner === this.player &&
              u.x >= Math.min(a.x, b.x) &&
              u.x <= Math.max(a.x, b.x) &&
              u.y >= Math.min(a.y, b.y) &&
              u.y <= Math.max(a.y, b.y)
            )
              this.selected.add(u.id);
          this.callbacks.selection(this.selected.size);
          this.audio.select();
          return;
        }
        if (d.moved) return;
        const s = this.starAt(p);
        if (s?.owner === this.player && (!this.selected.size || e.shiftKey))
          this.selectNear(s, e.shiftKey);
        else if (this.selected.size) this.issue(p, s);
        else {
          const w = this.toWorld(p);
          for (const u of this.units.values())
            if (
              u.owner === this.player &&
              Math.hypot(u.x - w.x, u.y - w.y) < 80
            )
              this.selected.add(u.id);
          this.callbacks.selection(this.selected.size);
        }
      },
      { signal },
    );
    this.canvas.addEventListener(
      "pointercancel",
      (e) => {
        this.pointers.delete(e.pointerId);
        this.drag = undefined;
        this.gesture = false;
      },
      { signal },
    );
    this.canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const p = { x: e.clientX, y: e.clientY };
        const before = this.toWorld(p);
        const factor = Math.exp(clamp(e.deltaY, -150, 150) * 0.0018);
        this.targetHeight = clamp(this.targetHeight * factor, 430, 7900);
        if (this.playing) {
          this.targetX = clamp(
            before.x + (this.targetX - before.x) * factor,
            0,
            WORLD_SIZE,
          );
          this.targetY = clamp(
            before.y + (this.targetY - before.y) * factor,
            0,
            WORLD_SIZE,
          );
        }
      },
      { passive: false, signal },
    );
    window.addEventListener(
      "keydown",
      (e) => {
        if (
          (e.target as HTMLElement).matches("input,textarea,button,select") ||
          !this.playing
        )
          return;
        if (e.code === "Space") {
          this.space = true;
          e.preventDefault();
        }
        if (e.key === "Escape") this.clearSelection();
        if (e.key.toLowerCase() === "a") {
          e.preventDefault();
          this.selectAll();
        }
        if (e.key.toLowerCase() === "f") this.home();
        if (e.key.toLowerCase() === "q") this.halfSelection();
        if (e.key === "+" || e.key === "=") this.zoom(0.8);
        if (e.key === "-") this.zoom(1.25);
        const step = this.targetHeight * 0.15;
        if (e.key === "ArrowLeft") this.targetX -= step;
        if (e.key === "ArrowRight") this.targetX += step;
        if (e.key === "ArrowUp") this.targetY -= step;
        if (e.key === "ArrowDown") this.targetY += step;
        this.targetX = clamp(this.targetX, 0, WORLD_SIZE);
        this.targetY = clamp(this.targetY, 0, WORLD_SIZE);
      },
      { signal },
    );
    window.addEventListener(
      "keyup",
      (e) => {
        if (e.code === "Space") this.space = false;
      },
      { signal },
    );
    window.addEventListener(
      "blur",
      () => {
        this.space = false;
        this.drag = undefined;
        this.pointers.clear();
      },
      { signal },
    );
  }
  dispose() {
    cancelAnimationFrame(this.animation);
    this.abort.abort();
    this.observer.disconnect();
    this.audio.dispose();
    this.composer.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        o.geometry.dispose();
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        materials.forEach((m) => m.dispose());
      }
    });
    this.renderer.dispose();
    this.canvas.remove();
    this.overlay.remove();
  }
}

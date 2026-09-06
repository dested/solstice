import { WORLD_SIZE, UNIT_CAP, START_UNITS, SPAWN_SHIELD, UNIT_SPEED, MAX_PLAYERS, clamp, distanceSq, radius, upgradeCost, type Star, type Player, type Unit, type MoveOrder, type WorldEvent, type Viewport } from './types';

const NAMES = ['Alcyone','Vesper','Altair','Sol','Merope','Rigel','Lyra','Antares','Sirius','Maia','Arcturus','Vega','Atlas','Electra','Deneb','Mira','Polaris','Taygeta','Aster','Celeno','Capella','Orion','Nashira','Elara','Bellatrix','Castor','Hadar','Nerissa','Sadr','Talitha','Saiph','Celaeno'];
export class Simulation {
  stars: Star[] = []; players = new Map<number, Player>(); units = new Map<number, Unit>(); events: WorldEvent[] = [];
  time = 0; nextUnit = 1; nextPlayer = 1; private rng: number; private botClock = 0;
  constructor(seed = Date.now()) {
    this.rng = seed >>> 0;
    for (let row = 0; row < 19; row++) for (let col = 0; col < 19; col++) {
      const x = 300 + col * 344 + (this.random() - .5) * 130;
      const y = 300 + row * 344 + (this.random() - .5) * 130;
      if (Math.hypot(x - 3400, y - 3400) > 3200) continue;
      const id = this.stars.length; const maxLevel = this.random() < .2 ? 3 : this.random() < .55 ? 2 : 1;
      this.stars.push({id, name: NAMES[id % NAMES.length] + (id >= NAMES.length ? ` ${Math.floor(id / NAMES.length) + 1}` : ''), x, y, owner: 0, level: 1, maxLevel, hp: 28 + (maxLevel - 1) * 8, maxHp: 45, upgrade: 0, production: this.random(), shield: 0});
    }
  }
  random() { let t = this.rng += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  addPlayer(name: string, bot = false): Player {
    if (this.players.size >= MAX_PLAYERS) throw new Error('Universe full');
    // The wire format uses 16-bit faction IDs. Reuse only IDs with no remaining assets.
    if (this.nextPlayer >= 65535) this.nextPlayer = 1;
    while (this.players.has(this.nextPlayer) || this.stars.some(s => s.owner === this.nextPlayer)) this.nextPlayer++;
    const p: Player = {id: this.nextPlayer++, name: name.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 18) || 'Wanderer', bot, connected: true, stars: 0, units: 0, kills: 0, captured: 0, eliminated: false, joined: this.time, home: -1};
    this.players.set(p.id, p); this.spawn(p); return p;
  }
  spawn(p: Player) {
    const hostile = this.stars.filter(s => s.owner && s.owner !== p.id);
    let best: Star | undefined; let score = -Infinity;
    for (const s of this.stars) {
      if (s.owner) continue;
      let nearest = 2200;
      for (const e of hostile) nearest = Math.min(nearest, Math.sqrt(distanceSq(s, e)));
      let danger = 0;
      for (const u of this.units.values()) if (u.owner !== p.id && distanceSq(s, u) < 300 ** 2) danger++;
      const value = (nearest < 650 ? nearest - 1700 : -Math.abs(nearest - 1100) * .25) - danger * 25 + this.random() * 120;
      if (value > score) { score = value; best = s; }
    }
    // A fully conquered map opens a frontier by reclaiming the least defended star.
    if (!best) best = [...this.stars].sort((a,b) => a.level - b.level || a.hp - b.hp)[0];
    if (!best) throw new Error('No spawn available');
    // Never spawn into an enemy particle cloud, even when the world is saturated.
    for (const u of this.units.values()) if (distanceSq(best, u) < 150 ** 2 && u.owner !== p.id) this.removeUnit(u);
    best.owner = p.id; best.level = 1; best.maxLevel = Math.max(2, best.maxLevel); best.hp = best.maxHp = 45; best.upgrade = 0; best.shield = this.time + SPAWN_SHIELD;
    p.home = best.id; p.eliminated = false; p.joined = this.time;
    for (let i = 0; i < START_UNITS; i++) this.createUnit(best, p.id);
    this.recount();
  }
  createUnit(star: Star, owner: number) {
    const p = this.players.get(owner); if (!p || p.units >= UNIT_CAP) return;
    const phase = this.random() * Math.PI * 2; const r = radius(star) + 14 + this.random() ** .6 * 62;
    const u: Unit = { id: this.nextUnit++, owner, x: star.x + Math.cos(phase) * r, y: star.y + Math.sin(phase) * r, tx: star.x, ty: star.y, star: star.id, moving: false, phase };
    this.units.set(u.id, u); p.units++; return u;
  }
  removeUnit(u: Unit) { if (this.units.delete(u.id)) { const p = this.players.get(u.owner); if (p) p.units--; } }
  abandon(id: number) {
    const p = this.players.get(id); if (!p) return;
    p.connected = false;
    // Abandoned stars and swarms remain conquerable, but no new units are produced.
    for (const s of this.stars) if (s.owner === id) s.shield = 0;
  }
  retire(id: number) {
    for (const u of this.units.values()) if (u.owner === id) this.removeUnit(u);
    for (const s of this.stars) if (s.owner === id) { s.owner = 0; s.level = 1; s.hp = 28; s.shield = 0; s.upgrade = 0; }
    this.players.delete(id);
  }
  order(owner: number, order: MoveOrder): number {
    if (!order || !Array.isArray(order.ids) || order.ids.length > UNIT_CAP || !Number.isFinite(order.x) || !Number.isFinite(order.y)) return 0;
    const x = clamp(order.x, 50, WORLD_SIZE - 50), y = clamp(order.y, 50, WORLD_SIZE - 50);
    const star = Number.isInteger(order.star) ? this.stars[order.star!] : undefined;
    if (star && distanceSq(star, {x, y}) > 120 ** 2) return 0;
    if (star && star.owner !== owner && star.shield > this.time) return 0;
    let n = 0;
    for (const id of new Set(order.ids)) {
      const u = this.units.get(id); if (!u || u.owner !== owner) continue;
      const angle = n * 2.399963; const r = star ? 0 : Math.min(80, Math.sqrt(n) * 4);
      u.tx = star ? star.x : clamp(x + Math.cos(angle) * r, 15, WORLD_SIZE - 15);
      u.ty = star ? star.y : clamp(y + Math.sin(angle) * r, 15, WORLD_SIZE - 15);
      u.star = star?.id ?? -1; u.moving = true; n++;
    }
    // Moving beyond the starting sanctuary ends protection. It cannot shield an attack.
    if (n && (!star || star.owner !== owner)) for (const s of this.stars) if (s.owner === owner) s.shield = 0;
    return n;
  }
  step(dt: number) {
    this.time += dt; this.events = [];
    for (const s of this.stars) {
      const p = this.players.get(s.owner); if (!p || !p.connected) continue;
      s.production += dt * s.level * 1.7;
      if (s.production >= 1) { const count = Math.floor(s.production); s.production -= count; for (let i = 0; i < count; i++) this.createUnit(s, s.owner); }
      s.hp = Math.min(s.maxHp, s.hp + dt * .35);
    }
    for (const u of this.units.values()) {
      const s = this.stars[u.star];
      if (u.moving) {
        const dx = u.tx - u.x, dy = u.ty - u.y, d = Math.hypot(dx, dy);
        const stop = s ? radius(s) + 3 : 3;
        if (d <= stop) {
          if (s && s.owner !== u.owner) {
            if (s.shield > this.time) { u.moving = false; u.star = -1; u.tx = u.x; u.ty = u.y; continue; }
            s.hp -= 1; this.removeUnit(u);
            if (s.hp <= 0) {
              const old = s.owner; s.owner = u.owner; s.level = 1; s.hp = s.maxHp = 45; s.upgrade = 0; s.production = 0;
              const p = this.players.get(u.owner); if (p) p.captured++;
              this.events.push({kind: 'capture', x: s.x, y: s.y, owner: u.owner, other: old, star: s.name});
            }
          } else if (s && s.level < s.maxLevel) {
            s.upgrade++; this.removeUnit(u);
            if (s.upgrade >= upgradeCost(s)) { s.level++; s.upgrade = 0; s.maxHp = s.level * 45; s.hp = s.maxHp; this.events.push({kind: 'upgrade', x: s.x, y: s.y, owner: u.owner, star: s.name}); }
          } else { u.moving = false; if (!s) { u.tx = u.x; u.ty = u.y; } }
        } else { const speed = Math.min(UNIT_SPEED * dt, d - stop + .1); u.x += dx / d * speed; u.y += dy / d * speed; }
      } else {
        if (s && s.owner !== u.owner) { u.star = -1; u.tx = u.x; u.ty = u.y; }
        const a = this.time * .16 + u.phase; const r = s ? radius(s) + 20 + (u.id % 59) : 6;
        const tx = (s?.x ?? u.tx) + Math.cos(a) * r, ty = (s?.y ?? u.ty) + Math.sin(a) * r;
        u.x += (tx - u.x) * Math.min(1, dt * 1.8); u.y += (ty - u.y) * Math.min(1, dt * 1.8);
      }
    }
    this.collide();
    this.botClock += dt;
    if (this.botClock >= 2) { this.botClock = 0; this.recount(); this.thinkBots(); this.cleanup(); }
  }
  private collide() {
    // Spatial hash: contact combat is local, rather than O(n²) across the galaxy.
    const grid = new Map<number, Unit[]>(); const cell = 16;
    for (const u of this.units.values()) {
      const gx = Math.floor(u.x / cell), gy = Math.floor(u.y / cell); let hit: Unit | undefined;
      for (let ox = -1; ox <= 1 && !hit; ox++) for (let oy = -1; oy <= 1 && !hit; oy++) {
        const near = grid.get((gx + ox) + (gy + oy) * 512); if (!near) continue;
        for (const e of near) if (e.owner !== u.owner && this.units.has(e.id) && distanceSq(e, u) < 9 ** 2) { hit = e; break; }
      }
      if (hit) {
        // Sanctuary protection applies to home swarms as well as their star.
        const protectedUnit = (v: Unit) => { const h = this.stars[this.players.get(v.owner)?.home ?? -1]; return h && h.owner === v.owner && h.shield > this.time && distanceSq(v, h) < 145 ** 2; };
        if (protectedUnit(u) || protectedUnit(hit)) continue;
        this.removeUnit(u); this.removeUnit(hit);
        const p = this.players.get(u.owner), e = this.players.get(hit.owner); if (p) p.kills++; if (e) e.kills++;
        if (this.events.length < 150) this.events.push({kind: 'clash', x: (u.x + hit.x) / 2, y: (u.y + hit.y) / 2, owner: u.owner, other: hit.owner});
      } else { const key = gx + gy * 512; const bucket = grid.get(key); if (bucket) bucket.push(u); else grid.set(key, [u]); }
    }
  }
  recount() {
    for (const p of this.players.values()) { p.stars = 0; p.units = 0; }
    for (const s of this.stars) { const p = this.players.get(s.owner); if (p) p.stars++; }
    for (const u of this.units.values()) { const p = this.players.get(u.owner); if (p) p.units++; }
    for (const p of this.players.values()) p.eliminated = p.units === 0 && p.stars === 0;
  }
  private thinkBots() {
    for (const p of this.players.values()) {
      if (!p.bot || !p.connected) continue;
      if (p.eliminated) { this.spawn(p); continue; }
      const homes = this.stars.filter(s => s.owner === p.id);
      for (const home of homes) {
        const idle = [...this.units.values()].filter(u => u.owner === p.id && !u.moving && distanceSq(u, home) < 160 ** 2);
        if (idle.length < 65) continue;
        const candidates = this.stars.filter(s => s.owner !== p.id && s.shield <= this.time && distanceSq(s, home) < 1000 ** 2);
        candidates.sort((a, b) => distanceSq(a, home) + (a.owner ? 90000 : 0) - distanceSq(b, home) - (b.owner ? 90000 : 0));
        const target = candidates[0];
        if (home.level < home.maxLevel && idle.length > 110 && this.random() < .4) this.order(p.id, {ids: idle.slice(0, 65).map(u => u.id), x: home.x, y: home.y, star: home.id});
        else if (target) this.order(p.id, {ids: idle.slice(0, Math.floor(idle.length * .8)).map(u => u.id), x: target.x, y: target.y, star: target.id});
      }
    }
  }
  private cleanup() {
    for (const p of this.players.values()) if (!p.connected && (p.eliminated || this.time - p.joined > 600)) this.retire(p.id);
  }
  visible(owner: number, view: Viewport, limit = 6000): Unit[] {
    const result: Unit[] = []; const others: Unit[] = [];
    for (const u of this.units.values()) {
      if (u.owner === owner) result.push(u);
      else if (Math.abs(u.x - view.x) < view.width / 2 + 180 && Math.abs(u.y - view.y) < view.height / 2 + 180) others.push(u);
    }
    // At galaxy scale, use a deterministic representative LOD of remote swarms.
    const budget = Math.max(0, limit - result.length); const stride = Math.max(1, Math.ceil(others.length / Math.max(1, budget)));
    for (let i = 0; i < others.length && result.length < limit; i += stride) result.push(others[i]);
    return result;
  }
}

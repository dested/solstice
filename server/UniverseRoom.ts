import { Room, type Client, type AuthContext, ServerError } from '@colyseus/core';
import { Simulation } from '../shared/Simulation';
import { MAX_PLAYERS, TICK, WORLD_SIZE, clamp, encodeUnits, type MoveOrder, type Viewport, type WorldEvent } from '../shared/types';

export const liveRooms = new Set<UniverseRoom>();
export function allowedOrigin(headers: Headers) {
  const origin = headers.get('origin'); if (!origin || process.env.NODE_ENV !== 'production') return true;
  const allowed = (process.env.ALLOWED_ORIGINS ?? '').split(',').map(v => v.trim()).filter(Boolean);
  if (allowed.includes(origin)) return true;
  try { return new URL(origin).host === headers.get('host'); } catch { return false; }
}
interface Seat { player: number; view: Viewport; tokens: number; last: number; }
export class UniverseRoom extends Room {
  maxClients = MAX_PLAYERS; maxMessagesPerSecond = 30; autoDispose = true;
  sim = new Simulation(); seats = new Map<string, Seat>(); private frame = 0; private pending: WorldEvent[] = [];
  onCreate() {
    liveRooms.add(this); this.setPatchRate(null);
    this.onMessage('move', (client, msg: MoveOrder) => {
      const seat = this.seats.get(client.sessionId); if (!seat) return;
      const now = performance.now(); seat.tokens = Math.min(8, seat.tokens + (now - seat.last) * .004); seat.last = now;
      if (seat.tokens < 1) return; seat.tokens--;
      const count = this.sim.order(seat.player, msg); client.send('ordered', {count});
    });
    this.onMessage('view', (client, v: Viewport) => {
      const seat = this.seats.get(client.sessionId); if (!seat || !v || ![v.x, v.y, v.width, v.height].every(Number.isFinite)) return;
      seat.view = {x: clamp(v.x, 0, WORLD_SIZE), y: clamp(v.y, 0, WORLD_SIZE), width: clamp(v.width, 300, WORLD_SIZE * 1.5), height: clamp(v.height, 300, WORLD_SIZE * 1.5)};
    });
    this.onMessage('respawn', client => {
      const seat = this.seats.get(client.sessionId); const p = seat && this.sim.players.get(seat.player);
      this.sim.recount();
      if (p?.eliminated) { this.sim.spawn(p); this.welcome(client); }
    });
    this.onMessage('ping', (client, value: unknown) => { if (typeof value === 'number' && Number.isFinite(value)) client.send('pong', value); });
    // Fixed steps prevent packet timing from changing game rules. Limit catch-up under overload.
    let accumulator = 0, lastTick = performance.now();
    this.setSimulationInterval(() => {
      // Colyseus also ticks its clock when schema patching is disabled; use an
      // independent monotonic clock so that timer cannot consume our delta.
      const now = performance.now();
      accumulator += Math.min((now - lastTick) / 1000, .2); lastTick = now;
      while (accumulator >= TICK) { this.sim.step(TICK); this.pending.push(...this.sim.events); accumulator -= TICK; }
      this.frame++;
      if (this.frame % 2 === 0) this.stream();
      if (this.frame % 10 === 0) this.sendMetadata();
    }, TICK * 1000);
  }
  onAuth(_client: Client, options: unknown, context: AuthContext) {
    if (!allowedOrigin(context.headers)) throw new ServerError(403, 'Origin not allowed');
    if (!options || typeof options !== 'object' || ('name' in options && typeof options.name !== 'string')) throw new ServerError(400, 'Invalid name');
    return true;
  }
  onJoin(client: Client, options: { name?: string }) {
    // Make room for humans first; bots never consume the last human seat.
    if (this.sim.players.size >= MAX_PLAYERS) {
      const expendable = [...this.sim.players.values()].find(p => p.bot || !p.connected);
      if (expendable) this.sim.retire(expendable.id);
    }
    const p = this.sim.addPlayer(options.name ?? 'Wanderer');
    const home = this.sim.stars[p.home];
    this.seats.set(client.sessionId, {player: p.id, view: {x: home.x, y: home.y, width: 1700, height: 1200}, tokens: 8, last: performance.now()});
    if (this.clients.length === 1 && this.sim.players.size === 1 && process.env.BOTS !== '0') {
      for (const name of ['KEPLER', 'HALLEY', 'CASSINI', 'VOYAGER']) this.sim.addPlayer(name, true);
    }
    this.welcome(client);
  }
  welcome(client: Client) {
    const seat = this.seats.get(client.sessionId); if (!seat) return;
    const p = this.sim.players.get(seat.player)!;
    const home = this.sim.stars[p.home]; seat.view.x = home.x; seat.view.y = home.y;
    client.send('welcome', {id: p.id, home: p.home, room: this.roomId, time: this.sim.time});
    client.send('world', this.world()); client.sendBytes('units', encodeUnits(this.sim.visible(p.id, seat.view)));
  }
  world() { this.sim.recount(); return {time: this.sim.time, stars: this.sim.stars, players: [...this.sim.players.values()], room: this.roomId, unitCount: this.sim.units.size}; }
  private sendMetadata() { this.broadcast('world', this.world()); }
  private stream() {
    for (const client of this.clients) {
      const seat = this.seats.get(client.sessionId); if (!seat) continue;
      client.sendBytes('units', encodeUnits(this.sim.visible(seat.player, seat.view)));
      const events = this.pending.filter(e => e.owner === seat.player || e.other === seat.player || (Math.abs(e.x - seat.view.x) < seat.view.width / 2 + 100 && Math.abs(e.y - seat.view.y) < seat.view.height / 2 + 100));
      if (events.length) client.send('events', events.slice(-160));
    }
    this.pending = [];
  }
  onDrop(client: Client) { this.allowReconnection(client, 30); }
  onReconnect(client: Client) { this.welcome(client); }
  onLeave(client: Client) {
    const seat = this.seats.get(client.sessionId); if (seat) { this.sim.abandon(seat.player); this.seats.delete(client.sessionId); }
  }
  onDispose() { liveRooms.delete(this); }
}


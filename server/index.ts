import { Server, matchMaker } from '@colyseus/core';
import { BunWebSockets } from '@colyseus/bun-websockets';
import { RedisPresence } from '@colyseus/redis-presence';
import { RedisDriver } from '@colyseus/redis-driver';
import { resolve, extname, sep } from 'node:path';
import { UniverseRoom, liveRooms, allowedOrigin } from './UniverseRoom';

const port = Number(process.env.PORT ?? 2567);
const redis = process.env.REDIS_URL;
if (process.env.PUBLIC_ADDRESS && !redis) throw new Error('PUBLIC_ADDRESS requires REDIS_URL for shared matchmaking');
const publicDir = resolve(import.meta.dir, '../dist');
let draining = false;
const game = new Server({
  transport: new BunWebSockets({maxPayloadLength: 16384, idleTimeout: 30, sendPings: true, backpressureLimit: 1024 * 1024, closeOnBackpressureLimit: true, beforeUpgrade: (_request, context) => allowedOrigin(context.headers) ? undefined : new Response('Forbidden', {status: 403})}),
  ...(redis ? {presence: new RedisPresence(redis), driver: new RedisDriver(redis)} : {}),
  publicAddress: process.env.PUBLIC_ADDRESS || undefined,
  greet: false,
  express: app => {
    app.get('/healthz', (_req, res) => { res.status(draining ? 503 : 200).json({ok: !draining, uptime: Math.round(process.uptime()), rooms: liveRooms.size}); });
    app.get('/api/status', async (_req, res) => {
      try { const rooms = await matchMaker.query({name: 'universe', locked: false}); res.json({players: rooms.reduce((n, r) => n + r.clients, 0), worlds: rooms.length, capacity: 64}); }
      catch { res.status(503).json({error: 'Matchmaking unavailable'}); }
    });
    app.use(async (req, res) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.status(404).end(); return; }
      let path: string;
      try { path = resolve(publicDir, '.' + decodeURIComponent(new URL(req.url!, 'http://localhost').pathname)); }
      catch { res.status(400).end(); return; }
      if (path !== publicDir && !path.startsWith(publicDir + sep)) { res.status(403).end(); return; }
      let file = Bun.file(path);
      if (path === publicDir || !await file.exists()) {
        if (extname(path)) { res.status(404).end(); return; }
        file = Bun.file(resolve(publicDir, 'index.html'));
      }
      if (!await file.exists()) { res.status(200).send('Solstice server is running. Open http://localhost:5173 for development.'); return; }
      res.setHeader('Content-Type', file.type);
      res.setHeader('Cache-Control', path.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(Buffer.from(await file.arrayBuffer()));
    });
  }
});
game.define('universe', UniverseRoom).sortBy({clients: -1});
game.onBeforeShutdown(async () => {
  draining = true;
  const seconds = Number(process.env.DRAIN_SECONDS ?? (process.env.NODE_ENV === 'production' ? '60' : '0'));
  for (const room of liveRooms) { await room.lock(); room.broadcast('shutdown', {seconds}); }
  if (seconds > 0 && liveRooms.size) await new Promise(resolve => setTimeout(resolve, seconds * 1000));
});
await game.listen(port, '0.0.0.0');
console.log(`Solstice game server: http://localhost:${port} (${redis ? 'Redis matchmaking' : 'single process'})`);

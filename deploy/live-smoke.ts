/** Small production check: joins one real room, verifies binary updates + bot
 * participants, then leaves. Run only when a short diagnostic player is acceptable. */
import { Client } from '@colyseus/sdk';
import { decodeUnits, type WorldMeta } from '../shared/types';
const client = new Client('https://solstice.dested.com');
const room = await client.joinOrCreate('universe', {name: 'DEPLOY CHECK'});
room.reconnection.enabled = false;
let frames = 0;
let world: WorldMeta | undefined;
room.onMessage('world', (value: WorldMeta) => {world = value;});
room.onMessage('units', (value: Uint8Array) => {if (decodeUnits(value).length) frames++;});
room.onMessage('welcome', () => {});
room.onMessage('events', () => {});
room.onMessage('ordered', () => {});
room.onMessage('pong', () => {});
room.onMessage('shutdown', () => {});
try {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline && (!world?.players.some(p => p.bot) || frames < 5)) await Bun.sleep(500);
  if (!world || frames < 5) throw new Error('No live world/binary particle stream');
  if (!world.players.some(p => p.bot)) throw new Error('Separate worker did not populate bots');
  console.log(JSON.stringify({room:room.roomId, binaryFrames:frames, players:world.players.length, bots:world.players.filter(p=>p.bot).length, stars:world.stars.length}));
} finally {
  await room.leave();
}
console.log('Production HTTPS matchmaking, WebSocket particles, and separate bot population passed.');

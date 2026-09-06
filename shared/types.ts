export const WORLD_SIZE = 6800;
export const MAX_PLAYERS = 64;
export const UNIT_CAP = 1600;
export const START_UNITS = 100;
export const SPAWN_SHIELD = 35;
export const UNIT_SPEED = 100;
export const TICK = 1 / 20;
export const PALETTE = ['#ffd094','#66e1ed','#fa7b9a','#b19aff','#91e6b0','#ff9869','#8faeff','#e8a4ec'];
export function factionColor(id: number) { return id === 0 ? '#587188' : id <= PALETTE.length ? PALETTE[id - 1] : `hsl(${Math.round(id * 137.508) % 360}, ${65 + id % 3 * 8}%, ${65 + id % 4 * 4}%)`; }
export interface Star { id: number; name: string; x: number; y: number; owner: number; level: number; maxLevel: number; hp: number; maxHp: number; upgrade: number; production: number; shield: number; }
export interface Player { id: number; name: string; bot: boolean; connected: boolean; stars: number; units: number; kills: number; captured: number; eliminated: boolean; joined: number; home: number; }
export interface Unit { id: number; owner: number; x: number; y: number; tx: number; ty: number; star: number; moving: boolean; phase: number; }
export interface WorldEvent { kind: 'clash' | 'capture' | 'upgrade' | 'order'; x: number; y: number; owner: number; other?: number; star?: string; }
export interface WorldMeta { time: number; stars: Star[]; players: Player[]; room: string; unitCount: number; }
export interface Viewport { x: number; y: number; width: number; height: number; }
export interface MoveOrder { ids: number[]; x: number; y: number; star?: number; }
export const radius = (s: Star) => 21 + s.level * 7;
export const upgradeCost = (s: Star) => s.level * 60;
export const distanceSq = (a: {x: number; y: number}, b: {x: number; y: number}) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
// Little-endian, 16 bytes/unit. No client-controlled state is ever accepted.
export function encodeUnits(units: Iterable<Unit>): Uint8Array {
  const list = Array.isArray(units) ? units : [...units];
  const buffer = new ArrayBuffer(list.length * 16); const v = new DataView(buffer);
  for (let i = 0; i < list.length; i++) { const u = list[i]; const n = i * 16; v.setUint32(n, u.id, true); v.setFloat32(n + 4, u.x, true); v.setFloat32(n + 8, u.y, true); v.setUint16(n + 12, u.owner, true); v.setUint16(n + 14, u.moving ? 1 : 0, true); }
  return new Uint8Array(buffer);
}
export function decodeUnits(bytes: Uint8Array): Pick<Unit, 'id' | 'owner' | 'x' | 'y' | 'moving'>[] {
  if (bytes.byteLength % 16) return [];
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); const result = [];
  for (let n = 0; n < bytes.byteLength; n += 16) result.push({id: v.getUint32(n, true), x: v.getFloat32(n + 4, true), y: v.getFloat32(n + 8, true), owner: v.getUint16(n + 12, true), moving: !!v.getUint16(n + 14, true)});
  return result;
}

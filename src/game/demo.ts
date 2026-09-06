import { Simulation } from "../../shared/Simulation";
import type { GalaxyRenderer } from "./Renderer";

export function startAttract(renderer: GalaxyRenderer) {
  const sim = new Simulation(71824);
  const names = ["SOLSTICE", "KEPLER", "CASSINI"];
  for (const name of names) sim.addPlayer(name, true);
  for (const p of sim.players.values()) {
    for (const u of sim.units.values()) if (u.owner === p.id) sim.removeUnit(u);
  }
  for (const s of sim.stars) {
    s.owner = 0;
    s.shield = 0;
  }
  // The attract scene runs the same simulation, but never masquerades as a live room.
  const layout = [
    ["Helios", 3650, 3340, 1, 3],
    ["Vega", 3250, 3000, 2, 2],
    ["Lyra", 4020, 2850, 3, 2],
    ["Vesper", 3670, 2780, 0, 1],
    ["Merope", 4220, 3340, 0, 1],
    ["Atlas", 4090, 3890, 3, 2],
    ["Maia", 3190, 3780, 2, 1],
    ["Sol", 2800, 3450, 0, 1],
    ["Echo", 3680, 4030, 0, 1],
    ["Deneb", 4460, 2890, 3, 1],
  ] as const;
  sim.stars = layout.map(([name, x, y, owner, level], id) => ({
    ...sim.stars[id],
    id,
    name,
    x,
    y,
    owner,
    level,
    maxLevel: Math.max(level, 2),
    hp: level * 45,
    maxHp: level * 45,
  }));
  for (const s of sim.stars)
    if (s.owner)
      for (let n = 0; n < (s.owner === 1 ? 430 : 210); n++)
        sim.createUnit(s, s.owner);
  for (const p of sim.players.values())
    p.home = sim.stars.find((s) => s.owner === p.id)!.id;
  sim.recount();
  renderer.cameraX = 3340;
  renderer.cameraY = 3310;
  renderer.viewHeight = 1500;
  renderer.focus(3340, 3310, 1500);
  let clock = 0,
    metaClock = 0;
  renderer.onDemoFrame = (dt) => {
    clock += dt;
    metaClock += dt;
    if (clock < 0.05) return;
    sim.step(clock);
    clock = 0;
    renderer.event(sim.events);
    renderer.setUnits([...sim.units.values()]);
    if (metaClock > 0.35) {
      renderer.setWorld({
        time: sim.time,
        stars: sim.stars,
        players: [...sim.players.values()],
        room: "attract",
        unitCount: sim.units.size,
      });
      metaClock = 0;
    }
  };
  renderer.setWorld({
    time: 0,
    stars: sim.stars,
    players: [...sim.players.values()],
    room: "attract",
    unitCount: sim.units.size,
  });
}

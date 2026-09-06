import { Simulation } from '../../shared/Simulation';
import type { GalaxyRenderer } from './Renderer';

export function startAttract(renderer: GalaxyRenderer) {
  const sim = new Simulation(71824);
  const names = ['SOLSTICE', 'KEPLER', 'CASSINI'];
  for (const name of names) sim.addPlayer(name, true);
  for (const p of sim.players.values()) { for (const u of sim.units.values()) if (u.owner === p.id) sim.removeUnit(u); }
  for (const s of sim.stars) { s.owner=0;s.shield=0; }
  // The attract scene runs the same simulation, but never masquerades as a live room.
  const central = sim.stars.filter(s => Math.abs(s.x - 3400) < 850 && Math.abs(s.y - 3400) < 700);
  central.forEach((s, i) => {
    if (i % 4 === 0) return;
    s.owner = s.x < 3370 ? 2 : s.y < 3370 ? 3 : 1;
    s.level = s.owner === 1 ? 2 : 1; s.maxLevel = Math.max(s.maxLevel, s.level); s.hp = s.maxHp = s.level * 45;
    for (let n=0;n<110+(i%3)*50;n++) sim.createUnit(s,s.owner);
  });
  sim.recount();
  renderer.cameraX=renderer.cameraY=3400; renderer.viewHeight=1700; renderer.focus(3290,3350,1700);
  let clock=0, metaClock=0;
  renderer.onDemoFrame=dt=>{
    clock+=dt;metaClock+=dt;
    if(clock<.05)return; sim.step(clock);clock=0; renderer.event(sim.events);
    renderer.setUnits([...sim.units.values()]);
    if(metaClock>.35){renderer.setWorld({time:sim.time,stars:sim.stars,players:[...sim.players.values()],room:'attract',unitCount:sim.units.size});metaClock=0;}
  };
  renderer.setWorld({time:0,stars:sim.stars,players:[...sim.players.values()],room:'attract',unitCount:sim.units.size});
}

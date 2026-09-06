import {Simulation} from '../shared/Simulation';
import {TICK,encodeUnits} from '../shared/types';
const s=new Simulation(4096);
for(let i=0;i<64;i++){const p=s.addPlayer(`P${i}`);for(let j=0;j<500;j++)s.createUnit(s.stars[p.home],p.id);}
s.time=40;const times:number[]=[];
for(let frame=0;frame<400;frame++){
  if(frame%80===0)for(const p of s.players.values()){const ids=[...s.units.values()].filter(u=>u.owner===p.id).map(u=>u.id);const target=s.stars[(p.home+1)%s.stars.length];s.order(p.id,{ids,x:target.x,y:target.y,star:target.id});}
  const start=performance.now();s.step(TICK);times.push(performance.now()-start);
}
times.sort((a,b)=>a-b);const start=performance.now();let bytes=0;
for(const p of s.players.values()){const h=s.stars[p.home];bytes+=encodeUnits(s.visible(p.id,{x:h.x,y:h.y,width:1700,height:1200})).length;}
console.log(JSON.stringify({players:s.players.size,initialParticles:38400,remainingParticles:s.units.size,tickBudgetMs:50,medianTickMs:+times[200].toFixed(2),p95TickMs:+times[380].toFixed(2),maxTickMs:+times[399].toFixed(2),snapshotAll64Ms:+(performance.now()-start).toFixed(2),snapshotTotalKB:Math.round(bytes/1024)},null,2));

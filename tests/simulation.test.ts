import {describe,expect,test} from 'bun:test';
import {Simulation} from '../shared/Simulation';
import {encodeUnits,decodeUnits,UNIT_CAP,TICK} from '../shared/types';

describe('authoritative gameplay',()=>{
  test('generates a reproducible galaxy and a protected starting swarm',()=>{
    const a=new Simulation(42),b=new Simulation(42);expect(a.stars).toEqual(b.stars);expect(a.stars.length).toBeGreaterThan(250);
    const p=a.addPlayer('Explorer');expect(p.units).toBe(100);expect(p.stars).toBe(1);expect(a.stars[p.home].shield).toBe(35);
  });
  test('rejects invalid orders and orders for another player’s units',()=>{
    const s=new Simulation(42),a=s.addPlayer('A'),b=s.addPlayer('B');const enemy=[...s.units.values()].find(u=>u.owner===b.id)!;
    expect(s.order(a.id,{ids:[enemy.id],x:100,y:100})).toBe(0);expect(enemy.moving).toBe(false);
    expect(s.order(a.id,{ids:[],x:NaN,y:1})).toBe(0);expect(s.order(a.id,{ids:new Array(UNIT_CAP+1).fill(1),x:1,y:1})).toBe(0);
    const own=[...s.units.values()].find(u=>u.owner===a.id)!;
    expect(s.order(a.id,{ids:[own.id,own.id],x:1,y:1})).toBe(1);expect(s.stars[a.home].shield).toBe(0);
  });
  test('particles capture a neutral star and it begins producing',()=>{
    const s=new Simulation(6),p=s.addPlayer('A');const target=s.stars.find(t=>!t.owner)!;target.hp=3;target.maxLevel=1;
    for(const u of s.units.values()){u.x=target.x+32;u.y=target.y;}
    s.order(p.id,{ids:[...s.units.keys()].slice(0,3),x:target.x,y:target.y,star:target.id});
    for(let i=0;i<10;i++)s.step(TICK);
    expect(target.owner).toBe(p.id);expect(p.captured).toBe(1);
    const before=s.units.size;for(let i=0;i<20;i++)s.step(TICK);expect(s.units.size).toBeGreaterThan(before);
  });
  test('friendly stars consume reinforcements to evolve',()=>{
    const s=new Simulation(3),p=s.addPlayer('A'),home=s.stars[p.home];home.maxLevel=2;
    const list=[...s.units.values()].slice(0,60);for(const u of list){u.x=home.x+29;u.y=home.y;}
    s.order(p.id,{ids:list.map(u=>u.id),x:home.x,y:home.y,star:home.id});s.step(TICK);s.step(TICK);
    expect(home.level).toBe(2);expect(home.upgrade).toBe(0);expect(home.maxHp).toBe(90);
  });
  test('opposing particles annihilate one for one in open space',()=>{
    const s=new Simulation(3),a=s.addPlayer('A'),b=s.addPlayer('B');const ua=[...s.units.values()].find(u=>u.owner===a.id)!,ub=[...s.units.values()].find(u=>u.owner===b.id)!;
    for(const u of [ua,ub]){u.x=3400;u.y=3400;u.tx=3400;u.ty=3400;u.star=-1;u.moving=false;}
    s.step(TICK);expect(s.units.has(ua.id)).toBe(false);expect(s.units.has(ub.id)).toBe(false);expect(a.kills).toBe(1);expect(b.kills).toBe(1);
  });
  test('spawn sanctuary blocks attacks until it expires',()=>{
    const s=new Simulation(3),a=s.addPlayer('A'),b=s.addPlayer('B');const star=s.stars[b.home];
    const ids=[...s.units.values()].filter(u=>u.owner===a.id).map(u=>u.id);
    expect(s.order(a.id,{ids,x:star.x,y:star.y,star:star.id})).toBe(0);
    s.time=36;expect(s.order(a.id,{ids,x:star.x,y:star.y,star:star.id})).toBe(100);
  });
  test('production is capped and abandoned stars remain vulnerable',()=>{
    const s=new Simulation(3),p=s.addPlayer('A'),star=s.stars[p.home];
    for(let i=0;i<2000;i++)s.createUnit(star,p.id);expect(p.units).toBe(UNIT_CAP);
    s.abandon(p.id);s.step(1);expect(star.owner).toBe(p.id);expect(star.shield).toBe(0);expect(p.units).toBe(UNIT_CAP);
  });
  test('visibility always includes your own units and bounds remote payloads',()=>{
    const s=new Simulation(3),a=s.addPlayer('A');s.addPlayer('B');
    const list=s.visible(a.id,{x:0,y:0,width:100,height:100});expect(list.length).toBe(100);expect(list.every(u=>u.owner===a.id)).toBe(true);
    const bytes=encodeUnits(list),decoded=decodeUnits(bytes);expect(bytes.length).toBe(list.length*16);expect(decoded[0].id).toBe(list[0].id);expect(decoded[0].x).toBeCloseTo(list[0].x,2);
  });
});

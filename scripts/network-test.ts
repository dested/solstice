import {Client,type Room} from '@colyseus/sdk';
import {decodeUnits,type WorldMeta} from '../shared/types';
import {strict as assert} from 'node:assert';
const endpoint=process.env.TEST_SERVER_URL||'http://localhost:2575';
const server=process.env.TEST_SERVER_URL?undefined:Bun.spawn(['bun','server/index.ts'],{env:{...process.env,PORT:'2575',NODE_ENV:'test',DRAIN_SECONDS:'0',BOT_TARGET:'0'},stdout:'ignore',stderr:'inherit'});
const rooms:Room[]=[];let frames=0,bytes=0;const states=new Map<string,WorldMeta>();const identities=new Map<string,number>();const unitLists=new Map<string,ReturnType<typeof decodeUnits>>();
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const waitFor=async(fn:()=>boolean,label:string)=>{const until=Date.now()+10000;while(!fn()){if(Date.now()>until)throw new Error(`Timed out: ${label}`);await delay(40);}};
function attach(room:Room){rooms.push(room);room.onMessage('welcome',(v:{id:number})=>identities.set(room.sessionId,v.id));room.onMessage('world',(v:WorldMeta)=>states.set(room.sessionId,v));room.onMessage('units',(v:Uint8Array)=>{frames++;bytes+=v.length;unitLists.set(room.sessionId,decodeUnits(v));});room.onMessage('events',()=>{});room.onMessage('ordered',()=>{});room.onMessage('shutdown',()=>{});room.onMessage('pong',()=>{});}
try{
  await waitFor(()=>server ? performance.now()>500 : true,'test server startup');
  for(let i=0;i<40;i++){try{if((await fetch(`${endpoint}/healthz`)).ok)break;}catch{}await delay(100);}
  const first=await new Client(endpoint).joinOrCreate('universe',{name:'Load-01'});attach(first);
  await waitFor(()=>identities.has(first.sessionId),'first welcome');
  for(let batch=0;batch<7;batch++){const count=Math.min(9,63-batch*9);await Promise.all(Array.from({length:count},async(_,i)=>{const r=await new Client(endpoint).joinOrCreate('universe',{name:`Load-${batch*9+i+2}`});attach(r);}));}
  assert.equal(rooms.length,64);assert.equal(new Set(rooms.map(r=>r.roomId)).size,1,'64 clients join one universe');
  await waitFor(()=>states.size===64&&identities.size===64,'all client snapshots');
  assert.equal(new Set(identities.values()).size,64,'unique faction ownership');
  const id=identities.get(first.sessionId)!;const units=unitLists.get(first.sessionId)!.filter(u=>u.owner===id);assert.ok(units.length>=100);
  const u=units[0];first.send('move',{ids:[u.id],x:u.x+240,y:u.y});await delay(600);
  const moved=unitLists.get(first.sessionId)!.find(x=>x.id===u.id)!;assert.ok(moved.x>u.x+15,'server applies movement');
  const other=rooms[1];const otherId=identities.get(other.sessionId)!;const victim=unitLists.get(other.sessionId)!.find(u=>u.owner===otherId)!;
  first.send('move',{ids:[victim.id],x:1,y:1});await delay(250);assert.equal(unitLists.get(other.sessionId)!.find(u=>u.id===victim.id)?.moving,false,'forged ownership rejected');
  const overflow=await new Client(endpoint).joinOrCreate('universe',{name:'Overflow'});attach(overflow);assert.notEqual(overflow.roomId,first.roomId,'65th player starts another world');
  const reconnecting=rooms[2],token=reconnecting.reconnectionToken,oldId=identities.get(reconnecting.sessionId);reconnecting.reconnection.enabled=false;reconnecting.connection.close();await delay(150);
  const restored=await new Client(endpoint).reconnect(token);attach(restored);await waitFor(()=>identities.get(restored.sessionId)===oldId,'reconnect preserves empire');
  console.log(JSON.stringify({passed:true,checks:['64 concurrent clients in one room','65th client overflow room','server movement','ownership validation','binary snapshots','reconnect preserves faction'],frames,megabytes:+(bytes/1e6).toFixed(2)},null,2));
}finally{await Promise.all(rooms.filter(r=>r.connection.isOpen).map(r=>r.leave().catch(()=>{})));await delay(200);server?.kill();if(server)await server.exited;}

import {Client,type Room} from '@colyseus/sdk';
import {decodeUnits,type WorldMeta} from '../shared/types';
import {planOrders,type ObservedUnit} from './Brain';
const endpoint=process.env.GAME_SERVER_URL??'http://localhost:2567';
const secret=process.env.BOT_SECRET||(process.env.NODE_ENV!=='production'?'dev-bot-secret':'');
if(!secret)throw new Error('BOT_SECRET is required in production');
const capacity=Math.max(1,Number(process.env.BOT_WORKER_CAPACITY??24));
const names=['KEPLER','HALLEY','CASSINI','VOYAGER','PIONEER','HUBBLE','GALILEO','JUNO','DAWN','WEBB','SPITZER','ECHO'];
interface Bot {room:Room;id:number;world?:WorldMeta;units:ObservedUnit[];nextThink:number;}
interface Listing {roomId:string;humans:number;botSlots:number[];botTarget:number;}
const bots=new Map<string,Bot>();let stopping=false,working=false,lastPoll=0,orders=0;
async function joinBot(listing:Listing,slot:number){
  const key=`${listing.roomId}:${slot}`;if(bots.has(key))return;
  try{
    const room=await new Client(endpoint).joinById(listing.roomId,{name:names[slot%names.length],bot:true,token:secret,slot});
    const bot:Bot={room,id:0,units:[],nextThink:performance.now()+600+Math.random()*800};bots.set(key,bot);room.reconnection.enabled=false;
    room.onMessage('welcome',(v:{id:number})=>{bot.id=v.id;});room.onMessage('world',(w:WorldMeta)=>{bot.world=w;});room.onMessage('units',(bytes:Uint8Array)=>{bot.units=decodeUnits(bytes);});
    room.onMessage('ordered',()=>{});room.onMessage('events',()=>{});room.onMessage('shutdown',()=>{void room.leave();});room.onLeave(()=>bots.delete(key));room.onError(()=>{});
  }catch(error){const code=(error as {code?:number}).code;if(code!==409&&code!==421&&code!==524&&code!==506)console.warn('Bot join failed:',error instanceof Error?error.message:error);}
}
async function poll(){
  if(stopping||working)return;working=true;
  try{
    const response=await fetch(`${endpoint}/api/bot-worlds`,{headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw new Error(`World discovery returned ${response.status}`);
    const worlds=await response.json() as Listing[];lastPoll=Date.now();worlds.sort(()=>Math.random()-.5);
    for(const world of worlds){const desired=world.humans?Math.max(0,world.botTarget-world.humans):0;for(let slot=0;slot<desired&&bots.size<capacity&&!stopping;slot++)if(!world.botSlots?.includes(slot))await joinBot(world,slot);}
  }catch(error){console.warn('Bot discovery:',error instanceof Error?error.message:error);}finally{working=false;}
}
const thinker=setInterval(()=>{
  for(const bot of bots.values()){
    if(!bot.world||!bot.id||performance.now()<bot.nextThink||!bot.room.connection.isOpen)continue;bot.nextThink=performance.now()+1800+Math.random()*1200;
    const me=bot.world.players.find(p=>p.id===bot.id);if(me?.eliminated){bot.room.send('respawn');continue;}
    const home=bot.world.stars.find(s=>s.id===me?.home&&s.owner===bot.id)??bot.world.stars.find(s=>s.owner===bot.id);
    if(home)bot.room.send('view',{x:home.x,y:home.y,width:2400,height:2000});
    for(const order of planOrders(bot.world,bot.units,bot.id)){bot.room.send('move',order);orders++;}
  }
},250);
const poller=setInterval(poll,2500+Math.random()*800);
const health=Bun.serve({port:Number(process.env.PORT??2568),hostname:'0.0.0.0',fetch:req=>new URL(req.url).pathname==='/healthz'?Response.json({ok:!stopping&&Date.now()-lastPoll<15000,bots:bots.size,capacity,orders,lastPoll},{status:!stopping&&Date.now()-lastPoll<15000?200:503}):new Response('Not found',{status:404})});
async function stop(){if(stopping)return;stopping=true;clearInterval(poller);clearInterval(thinker);await Promise.all([...bots.values()].filter(b=>b.room.connection.isOpen).map(b=>b.room.leave().catch(()=>{})));health.stop();process.exit(0);}
process.on('SIGTERM',stop);process.on('SIGINT',stop);console.log(`Solstice bot worker: ${endpoint}; capacity ${capacity}; health :${health.port}`);await poll();

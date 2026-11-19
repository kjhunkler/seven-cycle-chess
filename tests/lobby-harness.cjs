const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),path=require('node:path');
const {createGame,Element}=require('./game-harness.cjs');
function lobbyHarness({setup}={}){
 let now=100000,holdFrames=false;const clients=[],players=new Map(),matches=new Map(),blocked=new Set(),frameLoads=[];
 async function fetch(url,options){const body=JSON.parse(options.body),token=options.headers.Authorization;if(blocked.has(token))throw Error('offline');let p=players.get(token);if(!p){p={id:crypto.randomUUID(),events:[],name:body.name};players.set(token,p)}
 let data={};const other=id=>[...players.values()].find(p=>p.id===id);
 if(body.action==='poll'){p.activity=body.activity;data={friends:[...players.values()].filter(v=>v!==p).map(({id,name,activity})=>({id,name,activity})),iceServers:[],events:p.events.splice(0)}}
 else if(body.action==='enter'){other(body.to).events.push({kind:'entry-request',from:p.id,name:p.name,mode:body.mode})}
 else if(body.action==='invite'){const to=other(body.to),room=crypto.randomUUID();matches.set(room,{from:p,to});to.events.push({kind:'invite',room,name:p.name,from:p.id,expiresAt:now+30000});data={room}}
 else{const m=matches.get(body.room);if(!m)return {ok:false,json:async()=>({error:'Invite expired'})};const to=m.from===p?m.to:m.from;
  if(body.action==='accept')to.events.push({kind:'accept',room:body.room});
  if(body.action==='relay')to.events.push({kind:'relay',room:body.room});
  if(body.action==='game')to.events.push({kind:'game',room:body.room,game:JSON.parse(JSON.stringify(body.game))});
  if(body.action==='leave'){to.events.push({kind:'leave',room:body.room});matches.delete(body.room)}
 }
 return {ok:true,json:async()=>data};
 }
 function add(name){const match=createGame(),solo=createGame('index.html'),els=new Map(),events={},intervals=[],timeouts=[];const get=id=>{if(!els.has(id))els.set(id,new Element());return els.get(id)};const form=new Element(),input=new Element();form.elements={namedItem:()=>input};get('#lobby').fields.set('form',form);get('#lobby').closest=()=>new Element();
 const doc={querySelector:get,createTextNode:text=>({text}),body:new Element(),createElement:tag=>{
  const el=new Element();if(tag==='iframe'){el.remove=()=>{};const load=()=>{el.contentWindow=match.context;el.contentDocument={querySelector:selector=>match.elements.get(selector.slice(1))||new Element()};el.onload?.()};Object.defineProperty(el,'src',{set(){if(holdFrames)frameLoads.push(load);else queueMicrotask(load)}})}return el;
 }};
 const context=vm.createContext({document:doc,location:{hostname:'localhost',origin:'http://localhost',href:'http://localhost/'},history:{pushState(){},replaceState(){}},localStorage:{getItem:key=>key==='fruit-wars-name'?name:null,setItem(){}},crypto,URL,fetch,AbortSignal,performance:{now:()=>now},Date:class extends Date{static now(){return now}},setTimeout:fn=>{timeouts.push(fn);return fn},clearTimeout(){},setInterval:fn=>{intervals.push(fn);return fn},clearInterval(){},addEventListener:(name,fn)=>events[name]=fn,RTCPeerConnection:class{constructor(){throw Error('force relay')}},console});context.window=context;
 context.botGame=solo.context.botGame;
 setup?.(context,{match,solo});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../lobby.js'),'utf8'),context);const client={context,match,solo,els,events,intervals,run:code=>vm.runInContext(code,context)};clients.push(client);return client;
 }
 async function pump(n=10){for(let i=0;i<n;i++){await Promise.all(clients.map(c=>c.run('poll()')));await new Promise(setImmediate)}}
 return {add,pump,clients,holdFrames:()=>{holdFrames=true},releaseFrames:()=>{holdFrames=false;for(const load of frameLoads.splice(0))load()},block:c=>blocked.add('Bearer '+c.run('token')),unblock:c=>blocked.delete('Bearer '+c.run('token')),advance:ms=>{now+=ms},beat:async()=>{for(const c of clients)for(const fn of c.intervals)fn();await pump()},players};
}
module.exports={lobbyHarness};

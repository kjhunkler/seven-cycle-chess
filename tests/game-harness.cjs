const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
class Element{
 constructor(){this.listeners=new Map();this.fields=new Map();this.dataset={};this.style={};this.children=[];this.hidden=false;this.innerHTML='';this.classList={toggle(){}}}
 setAttribute(){} setPointerCapture(){} showModal(){this.open=true} close(){this.open=false}
 addEventListener(type,fn){this.listeners.set(type,fn)} before(){} after(){} append(...nodes){this.children.push(...nodes)} replaceChildren(...nodes){this.children=nodes} contains(){return false}
 querySelector(selector){if(!this.fields.has(selector))this.fields.set(selector,new Element());return this.fields.get(selector)} querySelectorAll(){return []}
}
function createGame(page='match.html'){
 const elements=new Map(),frames=[],sent=[];const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)};
 const context=vm.createContext({document:{querySelector:()=>new Element(),getElementById:get,createElement:()=>new Element(),body:new Element(),documentElement:new Element(),activeElement:null,addEventListener(){}},navigator:{},localStorage:{getItem(){return null},setItem(){}},matchMedia:()=>({matches:false,addEventListener(){}}),performance:{now:()=>100},requestAnimationFrame:fn=>frames.push(fn),addEventListener(){},setTimeout,clearTimeout,innerWidth:1000,innerHeight:800,parent:{postMessage(){}},location:{origin:'http://localhost',replace(){}},console});
 context.window=context;const root=path.join(__dirname,'..');
 vm.runInContext(fs.readFileSync(path.join(root,'production-cycle.js'),'utf8'),context);
 const html=fs.readFileSync(path.join(root,page),'utf8');for(const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(script[1].trim())vm.runInContext(script[1],context);
 for(const file of ['controls.js','board-ui.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
 return {context,elements,frames,sent,run:code=>vm.runInContext(code,context)};
}
module.exports={createGame,Element};

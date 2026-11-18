const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGame}=require('./game-harness.cjs');
const near=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-8,message);

function viewport(page){
  const game=createGame(page),map=game.elements.get('map');
  if(page==='match.html')game.run('matchGame.start(1,()=>{});gameStarted=true');
  let view;
  map.setAttribute=(name,value)=>{if(name==='viewBox')view=value.split(' ').map(Number)};
  game.context.boardViewport.fit();
  const pointer=(type,id,x,y,node)=>map.listeners.get(type)({
    pointerType:'touch',pointerId:id,button:0,clientX:x,clientY:y,
    target:{closest:()=>node?{dataset:{id:node}}:null},preventDefault(){}
  });
  return {...game,map,pointer,view:()=>view};
}
for(const page of ['index.html','match.html']){
  test(`${page}: pinch and pan preserve routes and suppress gameplay until all fingers lift`,()=>{
    const game=viewport(page),{pointer,run,context}=game;
    run('N.P1.routes=["C1"];sel=null');
    pointer('pointerdown',1,150,300,'P1');
    assert.equal(run('drag.from'),'P1');
    pointer('pointerdown',2,250,300,'P1');
    assert.equal(run('drag'),null);
    pointer('pointermove',1,100,300);
    pointer('pointermove',2,300,300);
    const zoomed=game.view();
    near(zoomed[2],55,'doubling separation doubles zoom');
    pointer('pointermove',1,120,320);
    pointer('pointermove',2,320,320);
    const panned=game.view();
    assert.ok(panned[0]<zoomed[0]&&panned[1]<zoomed[1],'the board follows both fingers');
    pointer('pointerup',2,320,320,'P1');
    pointer('pointermove',1,150,300,'P1');
    pointer('pointerup',1,150,300,'P1');
    assert.equal(run('JSON.stringify(N.P1.routes)'),'["C1"]');
    assert.equal(run('sel'),null);
    assert.equal(run('typeWheel.hidden'),true);
    pointer('pointerdown',3,150,300,'P1');
    pointer('pointerup',3,150,300,'P1');
    assert.equal(run('JSON.stringify(N.P1.routes)'),'[]','a fresh single-finger tap still stops routes');
    context.boardViewport.fit();
    near(game.view()[2],110);
  });
  test(`${page}: zoom limits, cancellation, extra fingers and rotation leave the board reachable`,()=>{
    const game=viewport(page),{pointer,context,map,run}=game;
    pointer('pointerdown',1,190,300);
    pointer('pointerdown',2,210,300);
    pointer('pointermove',1,0,300);
    pointer('pointermove',2,400,300);
    near(game.view()[2],27.5,'zoom is capped at 4×');
    pointer('pointerdown',3,200,400);
    pointer('pointercancel',1,0,300);
    pointer('pointermove',2,420,320);
    assert.ok(game.view().every(Number.isFinite));
    pointer('lostpointercapture',2,420,320);
    pointer('pointerup',3,200,400);
    assert.equal(run('drag'),null);
    map.getBoundingClientRect=()=>({left:0,top:0,width:800,height:400});
    context.boardViewport.resize();
    assert.equal(game.view()[2]/game.view()[3],2,'rotation updates the camera aspect ratio');
    context.boardViewport.fit();
    const [x,y,w,h]=game.view();
    assert.ok(x<=-5+1e-8&&y<=-7+1e-8&&x+w>=105-1e-8&&y+h>=109-1e-8,'Fit includes every board edge');
    pointer('pointerdown',4,300,200);
    pointer('pointerdown',5,500,200);
    pointer('pointermove',4,399,200);
    pointer('pointermove',5,401,200);
    assert.deepEqual(game.view(),[x,y,w,h],'pinching inward cannot shrink past Fit');
    pointer('pointerup',4,399,200);
    pointer('pointerup',5,401,200);
  });
  test(`${page}: full screen fits the board and still works when native full screen is rejected`,async()=>{
    const game=viewport(page),{context,created,pointer}=game;
    const shell=created.find(element=>element.className==='battle-shell');
    const button=shell.querySelector('.battle-fullscreen-button');
    const classes=new Set();
    context.document.documentElement.classList.toggle=(name,on)=>on?classes.add(name):classes.delete(name);
    context.document.documentElement.requestFullscreen=async()=>{throw Error('unsupported')};
    pointer('pointerdown',1,150,300);
    pointer('pointerdown',2,250,300);
    pointer('pointermove',2,350,300);
    pointer('pointerup',1,150,300);
    pointer('pointerup',2,350,300);
    await button.onclick();
    assert.ok(classes.has('board-fullscreen'));
    assert.equal(button.textContent,'Exit full screen');
    near(game.view()[2],110);
    await button.onclick();
    assert.ok(!classes.has('board-fullscreen'));
    assert.equal(button.textContent,'Full screen');
  });
}

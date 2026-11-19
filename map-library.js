const mapLibrary=(()=>{
  const get=id=>document.getElementById(id);
  const library=get('map-library'),editor=get('map-editor'),select=get('library-select');
  let catalog,profile,requested=Number(new URL(location.href).searchParams.get('map'));
  let published, selectedId=botConfig.map;
  const syncPicker=setupMapPicker(library,()=>({map:selectedId}),{showDetails:false});
  let draft,editing,baseRevision,first,undo=[],cursor=[50,50],keyboard=false;
  const fullView={x:-4,y:-4,size:108};
  let view={...fullView},pinch,suppressTap=false;
  const touches=new Map();
  const date=value=>new Date(Number(value/1000n)).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
  const message=text=>{get('library-status').textContent=text};
  const editorMessage=text=>{get('editor-status').textContent=text};
  function selectPublished(){
    if(!published)return;
    const m=[...latestMaps.values()].find(row=>row.owner===profile && row.name===published.name &&
      (published.id?row.id===published.id && row.revision>published.revision:!published.known.has(row.id)));
    if(m){selectedId=m.id;published=undefined}
  }
  function renderLibrary(){
    const m=latestMaps.get(Number(select.value));
    if(!m)return;
    const info=[m.players+' players',Object.keys(m.nodes).length+' nodes'];
    if(m.revision)info.push('By '+(catalog?.names.get(m.owner)??'Original creator'),m.plays+' plays','Updated '+date(m.updatedAt));
    get('library-meta').textContent=info.join(' · ');
    get('edit-map').hidden=profile===undefined||m.owner!==profile;
    get('map-discussion').hidden=!m.revision;
    const votes=catalog?.votes.filter(v=>v.mapId===m.id)??[],mine=votes.find(v=>v.profile===profile)?.value;
    for(const [button,value] of [['upvote',1],['downvote',-1]]){
      get(button).setAttribute('aria-pressed',String(mine===value));
      get(button).disabled=profile===undefined;
    }
    get('vote-total').textContent=votes.reduce((sum,v)=>sum+v.value,0)+' score · '+votes.length+' votes';
    get('comment-form').querySelector('button').disabled=profile===undefined;
    const items=(catalog?.comments??[]).filter(c=>c.mapId===m.id).sort((a,b)=>a.id>b.id?-1:1).map(c=>{
      const li=document.createElement('li'),by=document.createElement('small'),body=document.createElement('p');
      by.textContent=(catalog.names.get(c.profile)??'Player')+' · '+date(c.postedAt);body.textContent=c.body;
      li.append(by,body);return li;
    });
    if(!items.length){const empty=document.createElement('li');empty.textContent='No comments yet.';items.push(empty)}
    get('map-comments').replaceChildren(...items);
    get('map-auth-hint').hidden=profile!==undefined;
  }
  function openLibrary(id){
    if(window.botGame.active)window.botGame.pause();
    selectedId=latestMaps.has(id)?id:botConfig.map;
    syncPicker();
    renderLibrary();message('');if(!library.open)library.showModal();
  }
  get('open-maps').onclick=()=>openLibrary(botConfig.map);
  select.onchange=()=>{selectedId=Number(select.value);message('');renderLibrary()};
  for(const dialog of [editor,library])dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  get('play-map').onclick=()=>{
    delete botConfig.mapRevision;Object.assign(botConfig,selectionConfig(Number(select.value)));
    if(!validTeams(botConfig))botConfig.teams=false;
    act('restart');render();panel();library.close();
  };
  get('share-map').onclick=async()=>{
    const url=new URL('./',location.href);url.searchParams.set('map',select.value);
    try{await navigator.clipboard.writeText(url.href);message('Map link copied.')}catch{message(url.href)}
  };
  async function vote(value){
    const mapId=Number(select.value),current=catalog?.votes.find(v=>v.mapId===mapId&&v.profile===profile);
    try{await request('vote-map',{mapId,value:current?.value===value?0:value});message('Vote saved.')}catch(e){message(e.message)}
  }
  get('upvote').onclick=()=>vote(1);get('downvote').onclick=()=>vote(-1);
  get('comment-form').onsubmit=async event=>{
    event.preventDefault();
    const form=event.currentTarget,field=form.querySelector('textarea'),button=form.querySelector('button');
    button.disabled=true;
    try{await request('comment-map',{mapId:Number(select.value),body:field.value});field.value='';message('Comment posted.')}
    catch(e){message(e.message)}finally{button.disabled=profile===undefined}
  };
  function starter(players){
    const homes=players===3?THREE_POS:players===4?FOUR_POS:POS;
    const nodes={J1:[50,50]},edges=[];
    const radial=players>4?radialHomes(players):null;
    for(let i=1;i<=players;i++){const id='P'+i;nodes[id]=radial?radial[i-1]:[...homes[id]];edges.push([id,'J1'])}
    return {players,mirror:players===2||players===4,nodes,edges,difficulty:{}};
  }
  function symmetryField(){
    const field=get('editor-symmetry');
    const names=draft.players===3||draft.players>4?[`${draft.players}-fold rotation`,'Rotation and reflection']:['Top and bottom','Both axes'];
    field.replaceChildren(...names.map((name,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=name;return option}));
    field.value=String(Number(draft.mirror));field.disabled=draft.players===4;
  }
  function draw(){
    const area=get('editor-board');
    area.innerHTML=drawMapPreview(draft,true,first);
    updateView();
    const grid=get('editor-grid').checked, symmetry=get('editor-guides').checked;
    let guides='';
    if(grid)for(let n=0;n<=100;n+=10)guides+=`<path class="map-grid-line" d="M0 ${n}H100 M${n} 0V100"/>`;
    if(symmetry){
      const {players,mirror}=draft;
      if(players===2||players===4){
        guides+='<path class="map-symmetry-line" d="M0 50H100"/>';
        if(players===4||mirror)guides+='<path class="map-symmetry-line" d="M50 0V100"/>';
      }else{
        const rays=players*(mirror?2:1);
        for(const [x,y] of radialHomes(rays,[50,100]))guides+=`<path class="map-symmetry-line" d="M50 50L${x} ${y}"/>`;
      }
    }
    if(guides)area.firstChild.insertAdjacentHTML('afterbegin',`<g class="map-guides" aria-hidden="true">${guides}</g>`);
    if(keyboard){
      const mark=document.createElementNS('http://www.w3.org/2000/svg','circle');
      mark.setAttribute('cx',cursor[0]);mark.setAttribute('cy',cursor[1]);mark.setAttribute('r','4.5');mark.setAttribute('class','map-cursor');
      area.firstChild.append(mark);area.firstChild.focus();
    }
    get('editor-undo').disabled=!undo.length;
    const hints={node:'Place a neutral node. Its copies are added automatically.',path:first?'Choose the other end of the path.':'Choose the first node of a path.',difficulty:'Choose a neutral node to set its garrison and all matching copies.',erase:'Choose a node or path to remove it and its matching copies.'};
    const tool=get('editor-tool').value;
    get('editor-garrison-field').hidden=tool!=='node'&&tool!=='difficulty';
    get('editor-help').textContent=hints[tool]+' Use arrow keys and Enter on the board, or tap.';
  }
  function openEditor(m){
    editing=m?.id??0;baseRevision=m?.revision??0;undo=[];first=null;keyboard=false;
    view={...fullView};touches.clear();pinch=null;suppressTap=false;
    draft=m?structuredClone({nodes:m.nodes,edges:m.edges,players:m.players,mirror:m.mirror,difficulty:m.difficulty}):starter(2);
    get('map-name').value=m?.name??'';get('editor-players').value=String(draft.players);get('editor-players').disabled=!!m;
    get('editor-tool').value='node';get('editor-difficulty').value=5;
    symmetryField();draw();editorMessage(profile===undefined?'Sign in from Friends to publish this map.':'');
    editor.showModal();
  }
  get('new-map').onclick=()=>openEditor();
  get('edit-map').onclick=()=>openEditor(latestMaps.get(Number(select.value)));
  function change(action){
    const before=structuredClone(draft);
    try{action();mapLayout(draft,false);undo.push(before);editorMessage('')}
    catch(e){draft=before;editorMessage(e.message)}
    get('editor-players').value=String(draft.players);symmetryField();draw();
  }
  get('editor-players').onchange=e=>change(()=>{draft=starter(Number(e.target.value));first=null});
  get('editor-symmetry').onchange=e=>change(()=>{draft.mirror=e.target.value==='1'});
  get('editor-tool').onchange=()=>{first=null;draw()};
  get('editor-undo').onclick=()=>{
    if(!undo.length)return;draft=undo.pop();first=null;get('editor-players').value=String(draft.players);
    symmetryField();draw();editorMessage('');
  };
  function operate(point,node,edge){
    const {nodes,players,mirror}=draft,tool=get('editor-tool').value;
    const orbit=p=>symmetryCopies(p,players,mirror);
    const related=id=>orbit(nodes[id]).map(p=>nodeAt(nodes,p));
    const edgeKey=(a,b)=>[a,b].sort().join('-');
    const difficulty=Number(get('editor-difficulty').value);
    if(tool==='path' && node && !first){first=node;draw();return}
    change(()=>{
      if(tool==='node'){
        if(node)throw Error('Choose an empty position.');
        const position=point.map(n=>Math.round(n/2)*2);
        for(const p of orbit(position)){
          if(nodeAt(nodes,p))continue;
          if(Object.values(nodes).some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<8))throw Error('Leave space between nodes.');
          let i=1;while(nodes['J'+i])i++;
          nodes['J'+i]=p;draft.difficulty['J'+i]=difficulty;
        }
      }else if(tool==='path'){
        if(!node||!first||first===node)throw Error('Choose two different nodes.');
        const starts=related(first),ends=related(node),keys=new Set(draft.edges.map(([a,b])=>edgeKey(a,b)));
        starts.forEach((a,i)=>{const b=ends[i],k=edgeKey(a,b);if(!keys.has(k)){draft.edges.push([a,b]);keys.add(k)}});
        first=null;
      }else if(tool==='erase'&&edge){
        const [a,b]=edge.split('-'),ends=related(b),keys=new Set(related(a).map((id,i)=>edgeKey(id,ends[i])));
        draft.edges=draft.edges.filter(pair=>!keys.has(edgeKey(...pair)));
      }else{
        if(!node||node.startsWith('P'))throw Error('Choose a neutral node.');
        const ids=new Set(related(node));
        if(tool==='difficulty'){for(const id of ids)draft.difficulty[id]=difficulty}
        else{
          for(const id of ids){delete nodes[id];delete draft.difficulty[id]}
          draft.edges=draft.edges.filter(([a,b])=>!ids.has(a)&&!ids.has(b));
        }
      }
    });
  }
  const area=get('editor-board');
  function updateView(){area.firstChild.setAttribute('viewBox',`${view.x} ${view.y} ${view.size} ${view.size}`);}
  function boardPoint(x,y){return new DOMPoint(x,y).matrixTransform(area.firstChild.getScreenCTM().inverse());}
  function gesture(){
    const [a,b]=touches.values();
    return {x:(a.clientX+b.clientX)/2,y:(a.clientY+b.clientY)/2,distance:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)};
  }
  area.onpointerdown=e=>{
    if(e.pointerType!=='touch'){if(!touches.size)suppressTap=false;return}
    if(!touches.size)suppressTap=false;
    touches.set(e.pointerId,e);
    if(touches.size===2){
      const {x,y,distance}=gesture();
      pinch={anchor:boardPoint(x,y),distance:Math.max(1,distance),size:view.size};
      suppressTap=true;
    }
  };
  area.onpointermove=e=>{
    if(!touches.has(e.pointerId))return;
    touches.set(e.pointerId,e);
    if(!pinch)return;
    const {x,y,distance}=gesture(),point=boardPoint(x,y);
    const size=Math.max(27,Math.min(fullView.size,pinch.size*pinch.distance/Math.max(1,distance)));
    const scale=size/view.size,limit=fullView.x+fullView.size-size;
    const clamp=value=>Math.max(fullView.x,Math.min(limit,value));
    view={x:clamp(pinch.anchor.x-(point.x-view.x)*scale),y:clamp(pinch.anchor.y-(point.y-view.y)*scale),size};
    updateView();
  };
  area.onpointerup=area.onpointercancel=e=>{
    if(!touches.delete(e.pointerId))return;
    if(touches.size<2)pinch=null;
    else{const {x,y,distance}=gesture();pinch={anchor:boardPoint(x,y),distance:Math.max(1,distance),size:view.size};}
  };
  get('editor-grid').onchange=get('editor-guides').onchange=draw;
  get('editor-reset-view').onclick=()=>{view={...fullView};updateView();};
  area.onclick=e=>{
    if(suppressTap)return;
    const p=boardPoint(e.clientX,e.clientY);
    keyboard=false;operate([p.x,p.y],e.target.closest('[data-node]')?.dataset.node,e.target.dataset.edge);
  };
  area.onkeydown=e=>{
    const deltas={ArrowLeft:[-2,0],ArrowRight:[2,0],ArrowUp:[0,-2],ArrowDown:[0,2]};
    if(!deltas[e.key]&&e.key!=='Enter')return;e.preventDefault();keyboard=true;
    if(deltas[e.key]){cursor=cursor.map((v,i)=>Math.max(2,Math.min(98,v+deltas[e.key][i])));draw();return}
    const node=Object.keys(draft.nodes).find(id=>Math.hypot(draft.nodes[id][0]-cursor[0],draft.nodes[id][1]-cursor[1])<4);
    operate(cursor,node);
  };
  get('publish-map').onclick=async()=>{
    if(profile===undefined){editorMessage('Sign in from Friends to publish this map.');return}
    const button=get('publish-map');button.disabled=true;
    try{
      mapLayout(draft);
      const name=get('map-name').value.trim();if(!name)throw Error('Give your map a name.');
      const known=new Set(latestMaps.keys());
      await request('save-map',{mapId:editing,revision:baseRevision,name,layout:JSON.stringify(draft)});
      published={id:editing,revision:baseRevision,known,name};
      selectPublished();syncPicker();renderLibrary();editor.close();message('Map published.');
    }catch(e){editorMessage(e.message)}finally{button.disabled=false}
  };
  if(requested && defaultMaps[requested]){openLibrary(requested);requested=0}
  return {sync(data,user){
    if(data===catalog && user===profile)return;
    catalog=data;profile=user;
    if(requested){
      if(latestMaps.has(requested))openLibrary(requested);
      else{openLibrary(1);message('This map could not be found.')}
      requested=0;
    }else if(library.open){selectPublished();syncPicker();renderLibrary()}
  }};
})();

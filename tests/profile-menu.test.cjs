const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

test('account sync preserves the profile menu state across sign-in and polling',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../lobby.js'),'utf8');
  const render=source.slice(source.indexOf('function renderAccount(data)'),source.indexOf('\nasync function poll()'));
  const menu={open:false},stats={},owner={};
  const context=vm.createContext({
    accountPanel:{},signedInAccount:undefined,accountButton:{},accountStatus:{},
    historyPanel:{querySelector:()=>owner},
    document:{querySelector:selector=>selector==='#friends-panel'?menu:stats},
    rename(){},statsLine:()=> 'Updated stats',
  });
  vm.runInContext(render,context);
  // Fresh identity objects model account data rebuilt on successive polls.
  const sync=()=>vm.runInContext('renderAccount({profile:{id:1},name:"Player",stats:{}})',context);
  sync();
  assert.equal(menu.open,false);
  sync();
  assert.equal(menu.open,false);
  menu.open=true;
  sync();
  assert.equal(menu.open,true);
  menu.open=false;
  sync();
  assert.equal(menu.open,false);
  assert.equal(context.accountButton.textContent,'Sign out');
  assert.equal(stats.textContent,'Updated stats');
});

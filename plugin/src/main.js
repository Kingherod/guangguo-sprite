'use strict';
const {app,BrowserWindow,ipcMain,Menu,screen,nativeImage}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createActivityWatcher}=require('./activity');
const paths=require('./paths');
const testIndex=process.argv.indexOf('--selftest'), testing=testIndex>=0;
const output=testing?path.resolve(process.argv[testIndex+1]||path.join(__dirname,'..','out')):null;
const data=testing?path.join(output,'runtime'):paths.dataDir();
fs.mkdirSync(data,{recursive:true}); app.setPath('userData',path.join(data,'electron'));
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-background-networking');
const initialError=process.argv.includes('--error');
if(!app.requestSingleInstanceLock({hostError:initialError}))app.exit(0);
let win, watcher, commandTimer, dragOrigin, positionTimer, activity={busy:false,lastError:false,at:Date.now()}, config, atlasOk=false, finished=false;
function atomic(name,value){const target=path.join(data,name),temp=target+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2));fs.renameSync(temp,target);}
function fail(error){if(finished)return;finished=true;console.error(String(error.stack||error));app.exit(3);}
function readAtlas(){
  const atlasPath=path.join(__dirname,'..','assets','pet','spritesheet.png');
  const buffer=fs.readFileSync(atlasPath);const img=nativeImage.createFromBuffer(buffer),size=img.getSize();
  if(img.isEmpty()||size.width!==1536||size.height!==1872)throw new Error('图集读不到或尺寸不对：需要 1536×1872');
  const metadata=JSON.parse(fs.readFileSync(path.join(__dirname,'..','assets','pet','pet.json'),'utf8'));
  const loopMs=Number.isFinite(metadata.loopMs)&&metadata.loopMs>0?metadata.loopMs:1600;
  config={atlasUrl:pathToFileURL(atlasPath).href,loopMs,selftest:testing,width:W,height:H,scale};
}
function defaultPosition(){const area=screen.getPrimaryDisplay().workArea;return {x:area.x+Math.max(0,area.width-W-24),y:area.y+Math.max(0,area.height-H-24)};}
const SCALE_MIN=0.75, SCALE_MAX=2.5;
function readScale(){
  if(testing)return 2;
  try{const s=JSON.parse(fs.readFileSync(path.join(data,'settings.json'),'utf8'));if(Number.isFinite(s.scale))return Math.min(SCALE_MAX,Math.max(SCALE_MIN,s.scale));}catch{}
  return 1;   // 默认 100%（192×208）；高分屏上 150% 会显得过大
}
let scale=readScale(), W=Math.round(192*scale), H=Math.round(208*scale);
function applyScale(next){
  scale=Math.min(SCALE_MAX,Math.max(SCALE_MIN,next));W=Math.round(192*scale);H=Math.round(208*scale);
  atomic('settings.json',{scale});
  if(config){config.width=W;config.height=H;config.scale=scale;}
  if(win&&!win.isDestroyed()){
    const [x,y]=win.getPosition();
    const area=screen.getDisplayMatching({x,y,width:W,height:H}).workArea;
    win.setContentSize(W,H);
    win.setPosition(Math.min(x,area.x+area.width-W),Math.min(y,area.y+area.height-H));
    // 透明无边框窗口在 Windows 上改尺寸后，合成层不会自己重建：几何对了但画面上是残影/空白。
    // 隐藏再显示一次强制 DWM 重新分配表面，否则用户看到的是旧尺寸的鬼影。
    win.hide(); win.showInactive(); win.webContents.invalidate();
    win.webContents.send('pet:reload');   // 渲染器收到后重读 config 并重设画布
  }
}
function position(){try{const p=JSON.parse(fs.readFileSync(path.join(data,'position.json'),'utf8'));if(Number.isFinite(p.x)&&Number.isFinite(p.y)&&screen.getAllDisplays().some(({workArea:a})=>p.x>=a.x&&p.y>=a.y&&p.x+W<=a.x+a.width&&p.y+H<=a.y+a.height))return {x:Math.round(p.x),y:Math.round(p.y)};}catch{}return defaultPosition();}
function savePosition(){if(win&&!win.isDestroyed()){const [x,y]=win.getPosition();atomic('position.json',{x,y});}}
function sendActivity(){atomic('activity.json',activity);if(win&&!win.isDestroyed())win.webContents.send('pet:activity',activity);}
function hostError(){activity={...activity,lastError:true,at:Date.now()};sendActivity();}
function show(){if(win&&!win.isDestroyed()){if(win.isMinimized())win.restore();win.show();win.moveTop();win.focus();}}
app.on('second-instance',(_event,_argv,_cwd,extra)=>{if(extra.hostError)hostError();show();});
ipcMain.handle('pet:config',()=>config);
ipcMain.on('pet:fatal',(_event,error)=>fail(error));
ipcMain.on('pet:ready',()=>{atlasOk=true;if(!testing){sendActivity();show();}});
ipcMain.on('pet:status',(_event,status)=>{if(!testing)atomic('status.json',{state:status.state,busy:!!status.busy,frame:status.frame,clicks:status.clicks||0,atlasOk:atlasOk&&status.atlasOk,pid:process.pid,at:Date.now()});});
ipcMain.on('pet:drag-start',()=>{if(win)dragOrigin=win.getPosition();});
ipcMain.on('pet:drag-move',(_event,delta)=>{if(win&&dragOrigin&&Number.isFinite(delta.x)&&Number.isFinite(delta.y))win.setPosition(Math.round(dragOrigin[0]+delta.x),Math.round(dragOrigin[1]+delta.y));});
ipcMain.on('pet:drag-end',()=>{dragOrigin=undefined;savePosition();});
ipcMain.on('pet:menu',()=>{
  const sizes=[[0.75,'75%'],[1,'100%'],[1.5,'150%'],[2,'200%'],[2.5,'250%']].map(([value,label])=>({label,type:'radio',checked:Math.abs(scale-value)<0.01,click:()=>applyScale(value)}));
  Menu.buildFromTemplate([
    {label:'尺寸',submenu:sizes},
    {type:'separator'},
    {label:'重新载入图集',click:()=>{try{readAtlas();atlasOk=false;win.webContents.send('pet:reload');}catch(error){fail(error);}}},
    {label:'退出',click:()=>app.quit()}
  ]).popup({window:win});
});
ipcMain.handle('pet:selftest',async(_event,result)=>{
  if(!testing)return false;
  try{
    fs.mkdirSync(output,{recursive:true});
    const names=['state-idle.png','state-waiting.png','state-waving.png','state-failed.png','state-unread.png','frames-waiting.png'];
    for(const name of names){const png=result.pngs[name];if(typeof png!=='string'||!png.startsWith('data:image/png;base64,'))throw new Error('缺失 PNG：'+name);fs.writeFileSync(path.join(output,name),Buffer.from(png.split(',')[1],'base64'));}
    fs.writeFileSync(path.join(output,'atlas-report.json'),JSON.stringify(result.report,null,2)+'\n');
    console.log('frames: '+result.report.rows.map(r=>r.frames).join('/'));
    console.log('frameMs: '+result.report.rows.map(r=>r.frameMs).join('/'));
    console.log('PNG files: 6; state size: 384x416; waiting strip: '+(result.report.rows[6].frames*384)+'x416');
    console.log('waiting differences: '+JSON.stringify(result.report.waitingDifferences));
    console.log('waiting lower quarter stationary: '+result.report.waitingLowerQuarterStationary);
    console.log('selftest exports: PASS');finished=true;setTimeout(()=>app.exit(0),50);return true;
  }catch(error){fail(error);return false;}
});
app.whenReady().then(()=>{
  try{
    readAtlas();const p=position();
    win=new BrowserWindow({width:W,height:H,x:p.x,y:p.y,useContentSize:true,frame:false,transparent:true,alwaysOnTop:true,skipTaskbar:true,resizable:false,maximizable:false,fullscreenable:false,hasShadow:false,show:false,backgroundColor:'#00000000',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());
    win.webContents.on('render-process-gone',(_event,details)=>fail('Renderer stopped: '+details.reason));
    win.webContents.on('did-fail-load',(_event,code,description)=>fail('Renderer load: '+code+' '+description));
    win.loadFile(path.join(__dirname,'renderer','index.html')).catch(fail);
    win.on('move',()=>{clearTimeout(positionTimer);positionTimer=setTimeout(savePosition,200);});
    if(testing){const timeout=setTimeout(()=>fail('Selftest timed out after 30 seconds'),30000);timeout.unref();return;}
    watcher=createActivityWatcher({roots:paths.roots(),busyWindowMs:8000,intervalMs:1000});
    watcher.on(state=>{activity=state;sendActivity();});watcher.start();
    if(initialError)setTimeout(hostError,300);
    commandTimer=setInterval(()=>{
      for(const name of fs.readdirSync(data).filter(n=>/^command-[\w-]+\.json$/.test(n))){
        const file=path.join(data,name);try{const command=JSON.parse(fs.readFileSync(file,'utf8'));if(command.done)continue;
          if(command.action==='show'){show();fs.writeFileSync(file,JSON.stringify({done:true,at:Date.now(),scale,bounds:win.getBounds(),contentSize:win.getContentSize()}));}
          else if(command.action==='scale'&&Number.isFinite(command.value)){applyScale(command.value);savePosition();fs.writeFileSync(file,JSON.stringify({done:true,at:Date.now(),scale,width:W,height:H}));}
          else if(command.action==='hide'){if(win)win.hide();fs.writeFileSync(file,JSON.stringify({done:true,at:Date.now(),scale}));}
          else if(command.action==='shot'){win.capturePage().then(img=>{const p=path.join(data,'shot.png');fs.writeFileSync(p,img.toPNG());fs.writeFileSync(file,JSON.stringify({done:true,at:Date.now(),scale,width:W,height:H,file:p}));}).catch(error=>{fs.writeFileSync(file,JSON.stringify({done:true,error:error.message}));});}
        }catch(error){console.error(error.message);}
      }
    },200);
  }catch(error){fail(error);}
});
app.on('before-quit',()=>{watcher?.stop();clearInterval(commandTimer);clearTimeout(positionTimer);if(!testing){savePosition();try{fs.unlinkSync(path.join(data,'status.json'));}catch{}}});
app.on('window-all-closed',()=>app.quit());

'use strict';
const canvas=document.getElementById('pet'), ctx=canvas.getContext('2d');
const { inspect,drawFrame }=GuangguoAtlas;
let image, atlas, model, raf, lastState='', lastPose='', stateStart=0, frame=0, lastStatus=0, pointer, clicks=0, motion=null;
const pending=[];
window.pet.activity(event => { if (model) model.activity(event); else pending.push(event); });
window.pet.motion(next => { motion=next; lastPose=''; });
function emitStatus(now, state) { if (now-lastStatus>200) { lastStatus=now; window.pet.status({ state,busy:model.busy,frame,atlasOk:true,clicks }); } }
function animate(now) {
  const state=model.state();
  if (state!==lastState) { lastState=state; }
  // 漫游信号（走路/跳跃/下落）压过状态机的姿态；两者共用同一条时间轴，切姿态时归零。
  // 点击挥手是用户动作，优先于漫游姿态（否则走路/跳落时挥手会被吞掉）
  const pose=state==='waving'?'waving':(motion&&motion.row)?motion.row:(state==='unread'?'waiting':state);
  if (pose!==lastPose) { lastPose=pose; stateStart=now; }
  const row=atlas.rows.find(r=>r.name===pose)||atlas.rows[0];
  frame=Math.floor((now-stateStart)/row.frameMs)%row.frames;
  drawFrame(ctx,image,atlas,row.name,frame); emitStatus(now,state);
  raf=requestAnimationFrame(animate);
}
function loadImage(url) { return new Promise((resolve,reject)=>{ const img=new Image(); img.onload=()=>resolve(img); img.onerror=()=>reject(new Error('图集读不到：'+url)); img.src=url; }); }
async function load() {
  cancelAnimationFrame(raf);
  try {
    const config=await window.pet.config();
    if(config.width&&config.height){
      canvas.width=config.width; canvas.height=config.height;
      canvas.style.width=config.width+'px'; canvas.style.height=config.height+'px';
    }
    image=await loadImage(config.atlasUrl+'?reload='+Date.now()); atlas=inspect(image,config.loopMs);
    if (!model) { model=new GuangguoState(config.loopMs); for (const event of pending.splice(0)) model.activity(event); }
    else model.loopMs=config.loopMs;
    lastState=''; window.pet.ready(atlas);
    if (config.selftest) await selftest(); else raf=requestAnimationFrame(animate);
  } catch(error) { window.pet.fatal(error.stack||error.message); }
}
window.pet.reload(load);
canvas.addEventListener('pointerenter',()=>model?.hover());
canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;
  // skip：pointerdown 之后紧邻的第一个 pointermove 常带着"上一次光标位置"的残余坐标，
  // 若直接当拖拽会把窗口瞬移一大截（触控板、远程桌面、合成事件都能触发）。丢弃它并重置起点。
  pointer={ id:e.pointerId,x:e.screenX,y:e.screenY,max:0,drag:false,skip:true };
  canvas.setPointerCapture(e.pointerId); window.pet.dragStart();
});
canvas.addEventListener('pointermove',e=>{
  if(!pointer||pointer.id!==e.pointerId)return;
  // 没按住左键就绝不拖窗口（残留状态会让鼠标划过时把窗口推走）。注意别清 pointer：
  // 合成输入/部分触控板的移动事件会报 buttons=0，清了就再也收不到 pointerup 的点击。
  if(!(e.buttons&1))return;
  if(pointer.skip){ pointer.skip=false; pointer.x=e.screenX; pointer.y=e.screenY; return; }
  const x=e.screenX-pointer.x,y=e.screenY-pointer.y;
  pointer.max=Math.max(pointer.max,Math.hypot(x,y));
  if(pointer.max>=6)pointer.drag=true;
  if(pointer.drag)window.pet.dragMove({x,y});
});
canvas.addEventListener('pointerup',e=>{
  if(!pointer||pointer.id!==e.pointerId)return;
  const moved=Math.max(pointer.max,Math.hypot(e.screenX-pointer.x,e.screenY-pointer.y));
  const dragged=pointer.drag||moved>=6;
  canvas.releasePointerCapture(e.pointerId);
  if(dragged){
    window.pet.dragEnd();
  }else{
    // 纯点击：结束拖拽态（但不触发下落），交回挥手
    model.click(); lastState=''; lastPose=''; clicks++; window.pet.click();
  }
  pointer=undefined;
});
canvas.addEventListener('pointercancel',()=>{ pointer=undefined; window.pet.dragEnd(); });
canvas.addEventListener('contextmenu',e=>{e.preventDefault();window.pet.menu();});
async function selftest() {
  const pngs={}, diagnostics={};
  const scenarios={
    idle:{events:[],elapsed:0},
    waiting:{events:[{busy:true,lastError:false,at:0}],elapsed:0},
    waving:{events:[],click:true,elapsed:0},
    failed:{events:[{busy:false,lastError:true,at:0}],elapsed:0},
    unread:{events:[{busy:true,lastError:false,at:0},{busy:false,lastError:false,at:1}],elapsed:atlas.loopMs/2}
  };
  for(const [expected,scenario] of Object.entries(scenarios)) {
    const test=new GuangguoState(atlas.loopMs); for(const event of scenario.events)test.activity(event,0); if(scenario.click)test.click(0);
    const state=test.state(scenario.elapsed); if(state!==expected)throw new Error('状态自检失败：'+expected);
    const row=state==='unread'?'waiting':state, spec=atlas.rows.find(r=>r.name===row);
    let index=Math.floor(scenario.elapsed/spec.frameMs)%spec.frames, png;
    for(let attempt=0;attempt<spec.frames;attempt++){drawFrame(ctx,image,atlas,row,index);png=canvas.toDataURL('image/png');if(!Object.values(pngs).includes(png))break;index=(index+1)%spec.frames;}
    pngs['state-'+state+'.png']=png;
    const data=ctx.getImageData(0,0,384,416).data; let transparent=0,opaque=0;
    for(let i=3;i<data.length;i+=4)if(data[i]===0)transparent++;else opaque++;
    if(!transparent||!opaque)throw new Error('透明背景/角色检查失败：'+state);
    diagnostics[state]={row,frame:index,transparentPixels:transparent,visiblePixels:opaque};
  }
  if(new Set(Object.values(pngs)).size!==5)throw new Error('五个状态截图必须不同');
  const waiting=atlas.rows.find(r=>r.name==='waiting');
  const strip=document.createElement('canvas');strip.width=384*waiting.frames;strip.height=416;
  const stripCtx=strip.getContext('2d'); for(let i=0;i<waiting.frames;i++)drawFrame(stripCtx,image,atlas,'waiting',i,i*384,0,384,416);
  pngs['frames-waiting.png']=strip.toDataURL('image/png');
  const frameData=[];for(let i=0;i<waiting.frames;i++)frameData.push(stripCtx.getImageData(i*384,0,384,416).data);
  const differences=[];
  for(let i=1;i<frameData.length;i++){
    let changed=0,lowerChanged=0;
    for(let y=0;y<416;y++)for(let x=0;x<384;x++){
      const p=(y*384+x)*4;if(frameData[0].slice(p,p+4).some((v,c)=>v!==frameData[i][p+c])){changed++;if(y>=312)lowerChanged++;}
    }
    differences.push({frame:i,changedPixels:changed,lowerQuarterChangedPixels:lowerChanged});
  }
  await window.pet.saveTest({ report:{...atlas,states:diagnostics,waitingDifferences:differences,waitingLowerQuarterStationary:differences.every(d=>d.lowerQuarterChangedPixels===0),notes:['waiting 与 unread 共用 waiting 行；截图采样不同时间点。','边界 alpha 仅报告触边情况，不推断被裁掉的内容。']},pngs });
}
load();

'use strict';
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
process.env.GUANGGUO_DATA_DIR=path.join(__dirname,'..','out','ui-runtime');
process.env.GUANGGUO_ACTIVITY_ROOTS=path.join(__dirname,'..','out','empty-sessions');
let target;
app.on('browser-window-created',(_event,win)=>{target=win;});
const source=require('node:fs').existsSync(path.join(__dirname,'..','src','main.js'))?'../src':'../implementation/src';
require(source+'/main');
async function main(){
 await app.whenReady();const deadline=Date.now()+10000;
 while(!target||!await target.webContents.executeJavaScript('typeof model !== "undefined" && !!model').catch(()=>false)){if(Date.now()>deadline)throw new Error('UI did not initialize');await delay(50);}
 await delay(250);const wc=target.webContents;
 const state=()=>wc.executeJavaScript('model.state()');
 assert.equal(await state(),'idle');
 wc.sendInputEvent({type:'mouseMove',x:190,y:200});wc.sendInputEvent({type:'mouseDown',x:190,y:200,button:'left',clickCount:1});wc.sendInputEvent({type:'mouseUp',x:190,y:200,button:'left',clickCount:1});await delay(100);assert.equal(await state(),'waving');
 await delay(1600);assert.equal(await state(),'idle');
 const before=target.getPosition();
 wc.sendInputEvent({type:'mouseMove',x:190,y:200});await delay(50);wc.sendInputEvent({type:'mouseDown',x:190,y:200,button:'left',clickCount:1});await delay(50);await wc.executeJavaScript("canvas.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,screenX:20,screenY:10,clientX:210,clientY:210,buttons:1}))");await delay(150);wc.sendInputEvent({type:'mouseUp',x:190,y:200,button:'left',clickCount:1});await delay(150);
 const after=target.getPosition();assert.ok(after[0]!==before[0]||after[1]!==before[1],'Window should move during drag');assert.notEqual(await state(),'waving');
 wc.send('pet:activity',{busy:true,lastError:false,at:Date.now()});await delay(100);assert.equal(await state(),'waiting');
 wc.send('pet:activity',{busy:false,lastError:false,at:Date.now()});await delay(100);assert.equal(await state(),'unread');
 await wc.executeJavaScript("canvas.dispatchEvent(new PointerEvent('pointerenter',{pointerId:1}))");await delay(100);assert.equal(await state(),'idle');
 wc.send('pet:activity',{busy:false,lastError:true,at:Date.now()});await delay(100);assert.equal(await state(),'failed');
 const capture=await wc.capturePage();await fs.writeFile(path.join(__dirname,'..','out','window-verified.png'),capture.toPNG());
 console.log('PASS Electron input click and full-loop return; DOM pointer drag moves native window; busy/unread/hover/error transitions');
 console.log('window movement: '+JSON.stringify({before,after,size:target.getContentSize(),visible:target.isVisible(),backgroundColor:target.getBackgroundColor()}));
 app.quit();
}
main().catch(error=>{console.error(error.stack);app.exit(1);});

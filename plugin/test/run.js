'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const source=require('node:fs').existsSync(path.join(__dirname,'..','src','activity.js'))?'../src':'../implementation/src';
const PetState=require(source+'/renderer/state');
const {createActivityWatcher}=require(source+'/activity');
async function main(){
  const pet=new PetState(1600);assert.equal(pet.state(0),'idle');
  pet.activity({busy:true,lastError:false},0);pet.hover();assert.equal(pet.state(1),'waiting');
  pet.activity({busy:false,lastError:false},2);assert.equal(pet.state(3),'unread');pet.attend();assert.equal(pet.state(4),'idle');
  pet.activity({busy:true,lastError:false},5);pet.click(6);assert.equal(pet.state(1605),'waving');assert.equal(pet.state(1606),'waiting');
  pet.activity({busy:false,lastError:false},1700);assert.equal(pet.state(1701),'idle');
  pet.activity({busy:true,lastError:false},1800);pet.activity({busy:false,lastError:true},1801);assert.equal(pet.state(1802),'failed');assert.equal(pet.state(16801),'unread');
  pet.click(1803);assert.equal(pet.state(3402),'waving');assert.equal(pet.state(3403),'idle');
  const dir=await fs.mkdtemp(path.join(__dirname,'activity-'));let watcher;
  try{
    await fs.mkdir(path.join(dir,'nested'));const file=path.join(dir,'nested','session.jsonl');await fs.writeFile(file,'content is never read');const old=new Date(Date.now()-10000);await fs.utimes(file,old,old);
    const events=[];watcher=createActivityWatcher({roots:[dir,path.join(dir,'missing')],busyWindowMs:200,intervalMs:25});watcher.on(event=>events.push(event));watcher.start();
    async function until(predicate){const deadline=Date.now()+3000;while(!predicate()){if(Date.now()>deadline)throw new Error('Watcher transition timed out');await new Promise(r=>setTimeout(r,15));}}
    await until(()=>events.length===1);assert.equal(events[0].busy,false);const now=new Date();await fs.utimes(file,now,now);
    await until(()=>events.some(e=>e.busy));await until(()=>events.length>=3);assert.deepEqual(events.map(e=>e.busy),[false,true,false]);assert.ok(events.every(e=>e.lastError===false));
    watcher.stop();const count=events.length;await new Promise(r=>setTimeout(r,80));assert.equal(events.length,count);
    console.log('PASS state priorities, wave duration, unread attention, failure expiry, recursive mtime busy transitions, watcher stop');
  }finally{watcher?.stop();await fs.rm(dir,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

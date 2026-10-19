'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {resolveElectron,electronFlags}=require('./runtime');
const {dataDir}=require('./paths');
const dir=dataDir();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function status(){try{const value=JSON.parse(await fs.readFile(path.join(dir,'status.json'),'utf8'));if(Date.now()-value.at<5000){process.kill(value.pid,0);return value;}}catch{}return {state:'idle',busy:false,frame:0,atlasOk:false,running:false};}
async function show(){
  await fs.mkdir(dir,{recursive:true});
  if(!(await status()).atlasOk){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const child=spawn(resolveElectron(),[...electronFlags(),path.join(__dirname,'main.js')],{env,detached:true,stdio:'ignore',windowsHide:true});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();}
  const deadline=Date.now()+15000;while(!(await status()).atlasOk){if(Date.now()>deadline)throw new Error('Pet window did not become ready');await delay(100);}
  const file=path.join(dir,'command-'+randomUUID()+'.json');
  try{await fs.writeFile(file,JSON.stringify({action:'show'}));while(Date.now()<deadline){try{if(JSON.parse(await fs.readFile(file,'utf8')).done)return {shown:true};}catch{}await delay(100);}throw new Error('Pet did not acknowledge show');}finally{await fs.unlink(file).catch(()=>{});}
}
async function handle(message){
  if(message.id===undefined)return;
  const reply={jsonrpc:'2.0',id:message.id};
  try{
    if(message.method==='initialize')reply.result={protocolVersion:message.params?.protocolVersion||'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'guangguo',version:'1.0.0'}};
    else if(message.method==='tools/list')reply.result={tools:[{name:'guangguo_status',description:'Read local pet state',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true}},{name:'guangguo_show',description:'Bring the local pet window to the foreground',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true}}]};
    else if(message.method==='tools/call'){
      const name=message.params?.name;
      if(!['guangguo_status','guangguo_show'].includes(name))throw Object.assign(new Error('Unknown tool'),{rpcCode:-32602});
      if(Object.keys(message.params?.arguments||{}).length)throw Object.assign(new Error('Tools take no arguments'),{rpcCode:-32602});
      try{const result=name==='guangguo_status'?await status():await show();reply.result={content:[{type:'text',text:JSON.stringify(result)}],isError:false};}catch(error){reply.result={content:[{type:'text',text:error.message}],isError:true};}
    }else throw Object.assign(new Error('Method not found'),{rpcCode:-32601});
  }catch(error){reply.error={code:error.rpcCode||-32603,message:error.message};}
  process.stdout.write(JSON.stringify(reply)+'\n');
}
let buffer='';process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);if(!line)continue;try{const value=JSON.parse(line);if(!value||value.jsonrpc!=='2.0'||typeof value.method!=='string')throw new Error('Invalid Request');handle(value).catch(error=>console.error(error.message));}catch(error){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:error.message}})+'\n');}}});
process.stdin.on('end',()=>{if(buffer.trim())try{handle(JSON.parse(buffer)).catch(error=>console.error(error.message));}catch{process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}})+'\n');}});

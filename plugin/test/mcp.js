'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const source=fs.existsSync(path.join(__dirname,'..','src','launch.js'))?'src':path.join('implementation','src');
const child=spawn(process.execPath,[path.join(__dirname,'..',source,'launch.js'),'--mcp'],{cwd:path.join(__dirname,'..'),env:{...process.env,GUANGGUO_DATA_DIR:path.join(__dirname,'..','out','mcp-runtime'),GUANGGUO_ACTIVITY_ROOTS:path.join(__dirname,'..','out','empty-sessions'),GUANGGUO_NO_SANDBOX:'1',GUANGGUO_SOFTWARE_RENDERING:'1'},stdio:['pipe','pipe','pipe'],windowsHide:true});
const pending=new Map();let next=0,buffer='',pid;
child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);if(!line)continue;const reply=JSON.parse(line);const task=pending.get(reply.id);if(task){clearTimeout(task.timeout);pending.delete(reply.id);task.resolve(reply);}}});
child.stderr.on('data',chunk=>process.stderr.write(chunk));
child.on('error',error=>{for(const task of pending.values()){clearTimeout(task.timeout);task.reject(error);}pending.clear();});
function rpc(method,params){return new Promise((resolve,reject)=>{const id=++next;const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('MCP timeout: '+method));},20000);pending.set(id,{resolve,reject,timeout});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}
async function main(){try{
 const init=await rpc('initialize',{protocolVersion:'2024-11-05'});assert.equal(init.result.serverInfo.name,'guangguo');
 const list=await rpc('tools/list',{});assert.deepEqual(list.result.tools.map(t=>t.name),['guangguo_status','guangguo_show']);
 const shown=await rpc('tools/call',{name:'guangguo_show',arguments:{}});assert.equal(shown.result.isError,false);assert.equal(JSON.parse(shown.result.content[0].text).shown,true);
 const status=await rpc('tools/call',{name:'guangguo_status',arguments:{}});const value=JSON.parse(status.result.content[0].text);pid=value.pid;assert.equal(value.atlasOk,true);assert.equal(typeof value.frame,'number');
 console.log('PASS MCP initialize, two tools, show acknowledgement, live atlas status');console.log('status: '+JSON.stringify(value));
 const bad=await rpc('missing',{});assert.equal(bad.error.code,-32601);
}finally{if(pid)try{process.kill(pid);}catch{}child.stdin.end();}}
main().catch(error=>{console.error(error);child.kill();process.exitCode=1;});

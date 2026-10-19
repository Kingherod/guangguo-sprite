'use strict';
const path=require('node:path');
const { runElectron }=require('./runtime');
const output=path.resolve(path.join(__dirname,'..'),process.argv[2]||'out');
process.exitCode=runElectron(['--no-sandbox','--disable-gpu',path.join(__dirname,'main.js'),'--selftest',output]);

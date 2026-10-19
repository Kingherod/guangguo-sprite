'use strict';
const path = require('node:path');
const mcp = process.argv.includes('--mcp');
process.exitCode = require('./runtime').runElectron([path.join(__dirname, mcp ? 'mcp.js' : 'main.js'), ...process.argv.slice(2).filter(a => a !== '--mcp')], mcp);

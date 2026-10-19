'use strict';
const path = require('node:path');
const os = require('node:os');
function dataDir() { return process.env.GUANGGUO_DATA_DIR || path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'guangguo-pet'); }
function roots() {
  if (process.env.GUANGGUO_ACTIVITY_ROOTS) return process.env.GUANGGUO_ACTIVITY_ROOTS.split(path.delimiter).filter(Boolean);
  return [path.join(process.env.USERPROFILE || os.homedir(), '.codex', 'sessions'), path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), '@deepseek-ai', 'dsh-desktop')];
}
module.exports = { dataDir, roots };

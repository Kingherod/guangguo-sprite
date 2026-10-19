'use strict';
const path = require('node:path');
const os = require('node:os');
function dataDir() { return process.env.GUANGGUO_DATA_DIR || path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'guangguo-pet'); }
function roots() {
  if (process.env.GUANGGUO_ACTIVITY_ROOTS) return process.env.GUANGGUO_ACTIVITY_ROOTS.split(path.delimiter).filter(Boolean);
  const home = process.env.USERPROFILE || os.homedir();
  return [
    path.join(home, '.codex', 'sessions'),
    // DeepSeek Harness 的会话在 ~/.dsh/sessions/<workspace>/session-*/，不是 %APPDATA%\@deepseek-ai
    path.join(home, '.dsh', 'sessions'),
    path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), '@deepseek-ai', 'dsh-desktop')
  ];
}
module.exports = { dataDir, roots };

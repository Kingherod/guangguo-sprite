'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
function resolveElectron() {
  const candidates = [process.env.GUANGGUO_ELECTRON, path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe')];
  const base = path.join(process.env.LOCALAPPDATA || path.join(require('node:os').homedir(), 'AppData', 'Local'), 'CodexDragonPet', 'releases');
  try { for (const entry of fs.readdirSync(base).sort().reverse()) candidates.push(path.join(base, entry, 'node_modules', 'electron', 'dist', 'electron.exe')); } catch {}
  for (const candidate of candidates.filter(Boolean)) { try { if (fs.statSync(candidate).isFile()) return candidate; } catch {} }
  const error = new Error('需要 electron：设置 GUANGGUO_ELECTRON 或安装本地 Electron 运行时。'); error.exitCode = 2; throw error;
}
function electronFlags() { return [ ...(process.env.GUANGGUO_NO_SANDBOX === '1' ? ['--no-sandbox'] : []), ...(process.env.GUANGGUO_SOFTWARE_RENDERING === '1' ? ['--disable-gpu'] : []) ]; }
function runElectron(args, asNode = false) {
  try {
    const env = { ...process.env }; if (asNode) env.ELECTRON_RUN_AS_NODE = '1'; else delete env.ELECTRON_RUN_AS_NODE;
    const result = spawnSync(resolveElectron(), asNode ? args : [...electronFlags(), ...args], { stdio: 'inherit', env, cwd: path.join(__dirname, '..'), windowsHide: true });
    if (result.error) throw result.error;
    return result.status === null ? 1 : result.status;
  } catch (error) { console.error(error.message); return error.exitCode || 1; }
}
module.exports = { resolveElectron, runElectron, electronFlags };

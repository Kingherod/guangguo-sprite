// 按生产参数（scanEveryMs=10000）复现：DSH watcher 能否跟随 probe 帧
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const { createDshEventWatcher } = require('../src/dsh-events');
const { createCodexEventWatcher } = require('../src/codex-events');

const t0 = Date.now();
const ts = () => 'T+' + ((Date.now() - t0) / 1000).toFixed(1) + 's';
const log = (...a) => console.log(ts(), ...a);

const dshRoot = path.join(os.homedir(), '.dsh', 'sessions');
const probeRoot = path.join(dshRoot, '--probe-prod--');
const dir = path.join(probeRoot, 'session-probe-prod');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'session.v4.jsonl.zstd');
if (fs.existsSync(file)) fs.unlinkSync(file);

const write = (rec) => {
  fs.appendFileSync(file, zlib.zstdCompressSync(Buffer.from(JSON.stringify(rec) + '\n', 'utf8')));
  log('WROTE', rec.type, fs.statSync(file).size + 'B');
};

// 与 main.js 完全一致的合并逻辑
let codexPhase = 'idle', codexAt = 0, dshPhase = 'idle', dshAt = 0;
const applyPhase = (source, phase) => {
  const now = Date.now();
  if (source === 'codex') { codexPhase = phase; if (phase !== 'idle') codexAt = now; }
  else { dshPhase = phase; if (phase !== 'idle') dshAt = now; }
  const active = (codexPhase !== 'idle' && codexAt >= dshAt) ? codexPhase
    : (dshPhase !== 'idle' && dshAt >= codexAt) ? dshPhase
      : 'idle';
  log(`APPLY ${source}=${phase} → active=${active}`);
};

const dshWatcher = createDshEventWatcher({
  root: dshRoot,
  onPhase: (p, m) => applyPhase('dsh', p),
  intervalMs: 1000,
  idleAfterMs: 300000,
  scanEveryMs: 10000,      // ← 生产值
});
const codexWatcher = createCodexEventWatcher({
  root: path.join(os.homedir(), '.codex', 'sessions'),
  onPhase: (p) => applyPhase('codex', p),
});

dshWatcher.start();
codexWatcher.start();
log('both watchers started');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await sleep(2000);
  log('dsh stats=', JSON.stringify(dshWatcher.stats));
  write({ type: 'turn/start', time: Date.now(), data: { turn: 1 } });
  await sleep(5000);
  write({ type: 'tool/call', time: Date.now(), data: { turn: 1, step: 1, name: 'pwsh' } });
  await sleep(5000);
  write({ type: 'assistant/message', time: Date.now(), data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'reasoning' }] } } });
  await sleep(5000);
  write({ type: 'turn/end', time: Date.now(), data: { turn: 1 } });
  await sleep(6000);
  log('FINAL dsh phase=', dshWatcher.current(), 'stats=', JSON.stringify(dshWatcher.stats));
  dshWatcher.stop(); codexWatcher.stop();
  fs.rmSync(probeRoot, { recursive: true, force: true });
  log('cleaned');
})();

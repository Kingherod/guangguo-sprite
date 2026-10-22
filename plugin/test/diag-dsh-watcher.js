// 诊断：DSH watcher 在真实目录下能否跟随追加的帧
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const { createDshEventWatcher } = require('../src/dsh-events');

const root = path.join(os.homedir(), '.dsh', 'sessions');
const probeRoot = path.join(root, '--probe-diag--');
const dir = path.join(probeRoot, 'session-probe-diag');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'session.v4.jsonl.zstd');
if (fs.existsSync(file)) fs.unlinkSync(file);

const ts = () => new Date().toISOString().slice(11, 19);
const log = (...a) => console.log(ts(), ...a);

const write = (rec) => {
  const line = JSON.stringify(rec) + '\n';
  fs.appendFileSync(file, zlib.zstdCompressSync(Buffer.from(line, 'utf8')));
  log('WROTE', rec.type, '| 文件', fs.statSync(file).size, 'B');
};

const watcher = createDshEventWatcher({
  root,
  onPhase: (phase, meta) => log('PHASE →', phase, '|', meta.record),
  intervalMs: 500,
  scanEveryMs: 2000,
  idleAfterMs: 60000,
});

watcher.start();
log('watcher started, stats=', JSON.stringify(watcher.stats));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await sleep(3000);
  log('tick 后 stats=', JSON.stringify(watcher.stats));

  write({ type: 'turn/start', time: Date.now(), data: { turn: 1 } });
  await sleep(3000);
  log('stats=', JSON.stringify(watcher.stats), 'phase=', watcher.current());

  write({ type: 'tool/call', time: Date.now(), data: { turn: 1, step: 1, name: 'pwsh' } });
  await sleep(3000);
  log('stats=', JSON.stringify(watcher.stats), 'phase=', watcher.current());

  write({ type: 'turn/end', time: Date.now(), data: { turn: 1 } });
  await sleep(3000);
  log('stats=', JSON.stringify(watcher.stats), 'phase=', watcher.current());

  watcher.stop();
  fs.rmSync(probeRoot, { recursive: true, force: true });
  log('cleaned');
})();

// DSH 端到端探针：按真实格式往 ~/.dsh/sessions 写多帧 zstd，看桌宠是否跟着变姿态
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');

const root = path.join(os.homedir(), '.dsh', 'sessions');
const probeRoot = path.join(root, '--probe-e2e--');
const dir = path.join(probeRoot, 'session-probe-e2e');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'session.v4.jsonl.zstd');
if (fs.existsSync(file)) fs.unlinkSync(file);

const write = (rec) => {
  const line = JSON.stringify(rec) + '\n';
  fs.appendFileSync(file, zlib.zstdCompressSync(Buffer.from(line, 'utf8')));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  write({ type: 'turn/start', time: Date.now(), data: { turn: 1 } });
  await sleep(4000);
  write({ type: 'step/start', time: Date.now(), data: { turn: 1, step: 1 } });
  await sleep(3000);
  write({ type: 'assistant/message', time: Date.now(), data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'reasoning', text: 'probe reasoning' }] } } });
  await sleep(3000);
  write({ type: 'tool/call', time: Date.now(), data: { turn: 1, step: 1, name: 'pwsh', arguments: '{}' } });
  await sleep(5000);
  write({ type: 'tool/result', time: Date.now(), data: { turn: 1, step: 1, meta: {} } });
  await sleep(3000);
  write({ type: 'assistant/message', time: Date.now(), data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: 'probe done' }] } } });
  await sleep(3000);
  write({ type: 'turn/end', time: Date.now(), data: { turn: 1 } });
  await sleep(3000);
  try { fs.rmSync(probeRoot, { recursive: true, force: true }); console.log('probe done, cleaned'); }
  catch (e) { console.log('清理失败（可手动删）:', e.message); }
})();

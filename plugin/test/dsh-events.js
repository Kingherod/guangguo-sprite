// dsh 事件层验证：分类器 + 真实会话解压回放 + 状态机映射
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { classify, latestSession, readTail, splitFrames } = require('../src/dsh-events');

// 1) 分类器
const cases = [
  [{ type: 'turn/start' }, 'think'],
  [{ type: 'step/start' }, 'think'],
  [{ type: 'assistant/message' }, 'think'],
  [{ type: 'tool/call' }, 'tool'],
  [{ type: 'tool/result' }, 'tool'],
  [{ type: 'approval/asked' }, 'tool'],
  [{ type: 'approval/decided' }, 'think'],
  [{ type: 'turn/end' }, 'idle'],
  [{ type: 'system/message' }, null],
  [{ type: 'user/message' }, null],
  [{ type: 'step/end' }, null],
];
for (const [record, expected] of cases) {
  assert.equal(classify(record), expected, JSON.stringify(record));
}

// 2) 真实会话：找**最大的**那个（按 mtime 找可能撞上空会话）
const root = path.join(os.homedir(), '.dsh', 'sessions');
function collect(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) collect(full, out);
    else if (e.name.endsWith('.jsonl.zstd')) {
      try { out.push({ file: full, size: fs.statSync(full).size }); } catch {}
    }
  }
  return out;
}
const all = collect(root).sort((a, b) => b.size - a.size);
assert.ok(all.length > 0, '.dsh/sessions 下没有会话文件');
const sample = all[0];
const buf = fs.readFileSync(sample.file);
const frames = splitFrames(buf);
const { text, tailFrames } = readTail(buf, 80);

const counts = { think: 0, tool: 0, idle: 0 };
for (const line of text.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  let record;
  try { record = JSON.parse(trimmed); } catch { continue; }
  const phase = classify(record);
  if (phase) counts[phase]++;
}
console.log('样本:', path.basename(path.dirname(sample.file)));
console.log(`  压缩 ${buf.length} B | 帧 ${frames.length} | 取尾部 ${tailFrames} 帧`);
console.log('  阶段计数:', counts);
assert.ok(frames.length > 10, '切帧数应 > 10');
assert.ok(counts.think > 0, 'think 应出现（assistant/message 含 reasoning）');
assert.ok(counts.tool > 0, 'tool 应出现（tool/call）');

// 3) 状态机：dsh 的阶段也走同一套映射
const PetState = require('../src/renderer/state');
const s = new PetState(1600);
s.activity({ busy: true, lastError: false, at: 1, phase: 'think' }, 100);
assert.equal(s.state(101), 'review');
s.activity({ busy: true, lastError: false, at: 2, phase: 'tool' }, 200);
assert.equal(s.state(201), 'waiting');
s.activity({ busy: true, lastError: false, at: 3, phase: 'idle' }, 300);
assert.equal(s.state(301), 'waiting');

console.log('PASS dsh 分类器 / 真实会话解压回放 / 状态机映射');

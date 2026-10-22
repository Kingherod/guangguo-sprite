// Codex 事件层验证：分类器 + 真实 rollout 回放 + 状态机 phase
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { classify, latestRollout } = require('../src/codex-events');

// 1) 分类器
const cases = [
  [{ type: 'response_item', payload: { type: 'reasoning' } }, 'think'],
  [{ type: 'response_item', payload: { type: 'custom_tool_call' } }, 'tool'],
  [{ type: 'response_item', payload: { type: 'custom_tool_call_output' } }, 'tool'],
  [{ type: 'response_item', payload: { type: 'function_call' } }, 'tool'],
  [{ type: 'response_item', payload: { type: 'message', role: 'assistant' } }, 'think'],
  [{ type: 'response_item', payload: { type: 'message', role: 'user' } }, null],
  [{ type: 'event_msg', payload: { type: 'task_complete' } }, 'idle'],
  [{ type: 'event_msg', payload: { type: 'token_count' } }, 'think'],
  [{ type: 'session_meta' }, null],
  [{ type: 'turn_context' }, null],
];
for (const [record, expected] of cases) {
  assert.equal(classify(record), expected, JSON.stringify(record));
}

// 2) 回放固定 fixture（从真实会话里抽的 13 条事件）。
// 不要读 ~/.codex 的最新文件：最新那个可能是一次纯问答，没有工具调用，断言会假失败。
const fixture = path.join(__dirname, 'fixtures', 'rollout-sample.jsonl');
assert.ok(fs.existsSync(fixture), '缺少 fixture: ' + fixture);
const lines = fs.readFileSync(fixture, 'utf8').split('\n').filter(Boolean);
const counts = { think: 0, tool: 0, idle: 0 };
let first = null, last = null;
for (const line of lines) {
  let record;
  try { record = JSON.parse(line); } catch { continue; }
  const phase = classify(record);
  if (!phase) continue;
  counts[phase]++;
  first = first || phase;
  last = phase;
}
console.log('回放样本: fixtures/rollout-sample.jsonl');
console.log('  分类计数:', counts, '| 首个:', first, '| 末个:', last);
assert.ok(counts.think > 0, 'think 阶段应出现');
assert.ok(counts.tool > 0, 'tool 阶段应出现');

// 3) 状态机：phase → 姿态行
const PetState = require('../src/renderer/state');
const s = new PetState(1600);
s.activity({ busy: true, lastError: false, at: 1, phase: 'think' }, 100);
assert.equal(s.state(101), 'review', 'think 应映射到 review（思考行）');
s.activity({ busy: true, lastError: false, at: 2, phase: 'tool' }, 200);
assert.equal(s.state(201), 'waiting', 'tool 应映射到 waiting（坐等行）');
s.activity({ busy: true, lastError: false, at: 3, phase: 'idle' }, 300);
assert.equal(s.state(301), 'waiting', 'phase 清空后回落到 busy → waiting');
s.activity({ busy: false, lastError: false, at: 4, phase: 'idle' }, 400);
assert.equal(s.state(401), 'unread', '无 busy 无 phase → unread（旧路径不变）');

// 4) 没接事件源的宿主（Hermes/DSH）：phase 不传，行为必须与改前一致
const legacy = new PetState(1600);
legacy.activity({ busy: true, lastError: false, at: 1 }, 100);
assert.equal(legacy.state(101), 'waiting');
legacy.activity({ busy: false, lastError: false, at: 2 }, 200);
assert.equal(legacy.state(201), 'unread');

console.log('PASS 分类器 / 真实回放 / 状态机 phase / 旧宿主不回归');

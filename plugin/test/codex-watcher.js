// 事件 watcher 动态测试：增量写入 → 阶段切换 → 无事件回落
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCodexEventWatcher } = require('../src/codex-events');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-codex-'));
  const sub = path.join(dir, '2026', '10', '22');
  fs.mkdirSync(sub, { recursive: true });
  const file = path.join(sub, 'rollout-test.jsonl');
  const write = (record) => fs.appendFileSync(file, JSON.stringify(record) + '\n');

  const seen = [];
  const watcher = createCodexEventWatcher({
    root: dir,
    onPhase: (phase) => seen.push(phase),
    intervalMs: 50,
    idleAfterMs: 400,
  });

  write({ type: 'session_meta', payload: {} });
  watcher.start();
  await sleep(150);
  assert.equal(watcher.current(), 'idle', '初始应为 idle');

  write({ type: 'event_msg', payload: { type: 'task_started' } });
  await sleep(150);
  assert.equal(watcher.current(), 'think', 'task_started 应进 think');

  write({ type: 'response_item', payload: { type: 'custom_tool_call' } });
  await sleep(150);
  assert.equal(watcher.current(), 'tool', '工具调用应进 tool');

  write({ type: 'response_item', payload: { type: 'custom_tool_call_output' } });
  await sleep(150);
  assert.equal(watcher.current(), 'tool', '工具输出仍属 tool');

  write({ type: 'response_item', payload: { type: 'reasoning' } });
  await sleep(150);
  assert.equal(watcher.current(), 'think', 'reasoning 应回 think');

  write({ type: 'response_item', payload: { type: 'message', role: 'assistant' } });
  await sleep(150);
  assert.equal(watcher.current(), 'think', 'assistant 发言属 think');

  write({ type: 'event_msg', payload: { type: 'task_complete' } });
  await sleep(150);
  assert.equal(watcher.current(), 'idle', 'task_complete 应回 idle');

  // 超时回落：只有 reasoning、之后长时间无事件
  write({ type: 'response_item', payload: { type: 'reasoning' } });
  await sleep(150);
  assert.equal(watcher.current(), 'think');
  await sleep(600);
  assert.equal(watcher.current(), 'idle', '超过 idleAfterMs 无事件应回落 idle');

  watcher.stop();
  const unique = [...new Set(seen)];
  console.log('阶段序列:', seen.join(' → '));
  console.log('出现过的阶段:', unique.join(', '));
  assert.ok(unique.includes('think') && unique.includes('tool'), 'think 与 tool 都必须出现过');
  console.log('PASS 增量读 / think·tool 切换 / task_complete / 无事件回落');

  fs.rmSync(dir, { recursive: true, force: true });
})().catch((error) => { console.error('FAIL', error.message); process.exitCode = 1; });

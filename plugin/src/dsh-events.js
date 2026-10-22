'use strict';
/**
 * DeepSeek Harness (dsh) 宿主的事件源适配层。
 *
 * dsh 的会话是 **多帧 zstd 追加**的 `session.v4.jsonl.zstd`：
 * Node 的 `zstdDecompressSync` / `createZstdDecompress` 一次只解**第一帧**（940KB→244B，假成功）。
 * 必须按 zstd magic（28 B5 2F FD）切帧，逐帧解压。实测 578 帧全解 125ms，
 * 只解尾部 20 帧 0.5ms —— 所以只解尾部，文件没变就完全不碰。
 *
 * 事件语义（实测自真实会话）：
 *   turn/start            → think      一轮开始
 *   step/start            → think      一步开始
 *   assistant/message     → think      message.content 里带 type:"reasoning" 与 type:"text"
 *   tool/call             → tool       跑工具
 *   tool/result           → tool       工具返回，等下一步
 *   step/end              → 保持       多步之间不打断
 *   turn/end              → idle       整轮结束
 *   approval/asked        → tool       停在等你批准（dsh 独有，Codex 取不到）
 *
 * 本模块只做「文件 → 阶段」的翻译，不碰窗口、不碰渲染。
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const PHASE = { THINK: 'think', TOOL: 'tool', IDLE: 'idle' };
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/** 按 zstd magic 切帧（帧内碰巧含 magic 的概率可忽略，解压失败会自动跳过）。 */
function splitFrames(buf) {
  const starts = [];
  for (let i = 0; i + 4 <= buf.length; i++) {
    if (buf.compare(MAGIC, 0, 4, i, i + 4) === 0) starts.push(i);
  }
  starts.push(buf.length);
  const frames = [];
  for (let k = 0; k + 1 < starts.length; k++) {
    const from = starts[k];
    const to = starts[k + 1];
    if (to > from) frames.push(buf.subarray(from, to));
  }
  return frames;
}

/** 解压尾部 maxFrames 帧，拼成文本（首尾可能是半行，解析时跳过）。 */
function readTail(buf, maxFrames = 60) {
  const frames = splitFrames(buf);
  const tail = frames.slice(-maxFrames);
  let text = '';
  for (const frame of tail) {
    try { text += zlib.zstdDecompressSync(frame).toString('utf8'); } catch { /* 半帧/坏帧跳过 */ }
  }
  return { text, frames: frames.length, tailFrames: tail.length };
}

/** 把一条 dsh 记录翻成阶段；认不出返回 null。 */
function classify(record) {
  const type = record && record.type;
  if (!type) return null;

  if (type === 'turn/end') return PHASE.IDLE;
  if (type === 'turn/start' || type === 'step/start') return PHASE.THINK;
  if (type === 'tool/call' || type === 'tool/result') return PHASE.TOOL;
  if (type === 'assistant/message') return PHASE.THINK;   // content 里含 reasoning / text
  if (type === 'approval/asked') return PHASE.TOOL;       // 停在等你批准：坐等
  if (type === 'approval/decided') return PHASE.THINK;
  return null;
}

/** 事件时间：dsh 用毫秒 epoch；取不到回落到现在。 */
function eventTime(record) {
  if (record && Number.isFinite(record.time)) return record.time;
  return Date.now();
}

/** 递归找 mtime 最新的会话文件。 */
function latestSession(root) {
  let best = null;
  const walk = (dir, depth) => {
    if (depth > 4) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full, depth + 1); continue; }
      if (!entry.name.endsWith('.jsonl.zstd')) continue;
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      if (!best || stat.mtimeMs > best.mtimeMs) best = { file: full, mtimeMs: stat.mtimeMs, size: stat.size };
    }
  };
  walk(root, 0);
  return best;
}

/**
 * @param {object} opts
 * @param {string} opts.root         ~/.dsh/sessions
 * @param {(phase:string, meta:object)=>void} opts.onPhase
 * @param {number} [opts.intervalMs]  轮询间隔（默认 1000ms；文件没变时几乎零成本）
 * @param {number} [opts.idleAfterMs] 多久没新事件判 idle（默认 300s，与 Codex 侧一致）
 * @param {number} [opts.tailFrames]  只解尾部多少帧（默认 60，实测 0.5–2ms）
 * @param {number} [opts.scanEveryMs] 目录扫描间隔（默认 10s）
 */
function createDshEventWatcher({
  root,
  onPhase,
  intervalMs = 1000,
  idleAfterMs = 300000,
  tailFrames = 60,
  scanEveryMs = 10000,
} = {}) {
  let timer = null;
  let file = null;
  let lastSize = -1;
  let phase = PHASE.IDLE;
  let lastEventMs = 0;
  let stopped = false;
  let newest = null;
  let lastScan = 0;

  function emit(next, meta) {
    if (stopped) return;
    if (next === phase && !meta.force) return;
    phase = next;
    try { onPhase(next, meta); } catch (error) { console.error('[dsh-events] onPhase 抛错:', error.message); }
  }

  function tick() {
    if (stopped) return;
    const now = Date.now();

    if (!newest || now - lastScan >= scanEveryMs) {
      newest = latestSession(root);
      lastScan = now;
    }
    if (!newest) return;
    if (!file || newest.file !== file) { file = newest.file; lastSize = -1; }

    let stat;
    try { stat = fs.statSync(file); } catch { return; }
    if (stat.size === lastSize) {
      // 文件没变：只做超时判定
      if (phase !== PHASE.IDLE && lastEventMs && now - lastEventMs > idleAfterMs) {
        emit(PHASE.IDLE, { force: true, reason: 'no-event-' + idleAfterMs + 'ms' });
      }
      return;
    }
    lastSize = stat.size;

    let buf;
    try { buf = fs.readFileSync(file); } catch { return; }
    let text;
    try { ({ text } = readTail(buf, tailFrames)); } catch (error) {
      console.error('[dsh-events] 解压失败:', error.message);
      return;
    }

    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let record;
      try { record = JSON.parse(trimmed); } catch { continue; }
      const next = classify(record);
      if (!next) continue;
      lastEventMs = Math.max(lastEventMs, eventTime(record));
      emit(next, { at: lastEventMs, record: record.type });
    }

    if (phase !== PHASE.IDLE && lastEventMs && now - lastEventMs > idleAfterMs) {
      emit(PHASE.IDLE, { force: true, reason: 'no-event-' + idleAfterMs + 'ms' });
    }
  }

  return {
    start() {
      if (timer) return;
      stopped = false;
      tick();
      timer = setInterval(tick, intervalMs);
      if (timer.unref) timer.unref();
    },
    stop() {
      stopped = true;
      if (timer) { clearInterval(timer); timer = null; }
    },
    current() { return phase; },
    get stats() {
      return { file, phase, lastEventMs, size: lastSize };
    },
  };
}

module.exports = { createDshEventWatcher, classify, latestSession, readTail, splitFrames, eventTime, PHASE };

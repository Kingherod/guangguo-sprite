'use strict';
/**
 * Codex 宿主的事件源适配层。
 *
 * 为什么不靠 mtime：`activity.js` 只能回答「最近有没有文件被动过」，回答不了
 * 「在推理还是在跑工具」。实测一份 1071 秒的 rollout 里，mtime 规则让 busy
 * 在忙/闲之间翻转 **74 次** —— 坐着还没坐稳就弹回站立，思考态更是永远出不来。
 *
 * Codex 的 rollout jsonl（~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl）里有结构化事件：
 *   response_item.reasoning               → 模型推理中      → think（review 行）
 *   response_item.message(role=assistant) → 生成回答中      → think
 *   response_item.custom_tool_call / function_call → 跑工具 → tool（waiting 行）
 *   response_item.*_output                → 工具返回，等下一步 → 保持当前阶段
 *   event_msg.task_complete               → 一轮结束        → idle
 *
 * 本模块只做「文件 → 阶段」的翻译，不碰窗口、不碰渲染。
 */
const fs = require('node:fs');
const path = require('node:path');
const { StringDecoder } = require('node:string_decoder');

const PHASE = { THINK: 'think', TOOL: 'tool', IDLE: 'idle' };

/** 把一行 rollout 记录翻成阶段；认不出返回 null。 */
function classify(record) {
  const type = record && record.type;
  const payload = (record && record.payload) || {};
  const sub = payload.type;

  if (type === 'response_item') {
    if (sub === 'reasoning') return PHASE.THINK;
    if (sub === 'message') {
      const role = payload.role;
      // 只认助手自己说的话；developer/user 的系统提示不算「在输出」
      return role === 'assistant' ? PHASE.THINK : null;
    }
    if (sub === 'custom_tool_call' || sub === 'function_call' || sub === 'local_shell_call') return PHASE.TOOL;
    if (sub === 'custom_tool_call_output' || sub === 'function_call_output' || sub === 'local_shell_call_output') return PHASE.TOOL;
    return null;
  }

  if (type === 'event_msg') {
    if (sub === 'task_complete') return PHASE.IDLE;
    if (sub === 'task_started') return PHASE.THINK;
    // token_count 是心跳：模型正在吐 token，算思考
    if (sub === 'token_count') return PHASE.THINK;
  }

  return null;
}

/** 递归找 mtime 最新的 rollout 文件。 */
function latestRollout(root) {
  let best = null;
  const walk = (dir, depth) => {
    if (depth > 4) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full, depth + 1); continue; }
      if (!entry.name.endsWith('.jsonl')) continue;
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      if (!best || stat.mtimeMs > best.mtimeMs) best = { file: full, mtimeMs: stat.mtimeMs, size: stat.size };
    }
  };
  walk(root, 0);
  return best;
}

/**
 * 事件自身的时刻（rollout 的 timestamp 是 ISO / UTC）。
 * 用事件时间而不是「读到它的时间」：刚启动读到一小时前的旧会话时，
 * 应立刻判空闲，而不是误以为「刚刚还在思考」。取不到才回落到现在。
 */
function eventTime(record) {
  const raw = record && record.timestamp;
  if (typeof raw === 'string') {
    const ms = Date.parse(raw);
    if (Number.isFinite(ms)) return ms;
  }
  return Date.now();
}

/**
 * @param {object} opts
 * @param {string} opts.root          ~/.codex/sessions
 * @param {(phase:string, meta:object)=>void} opts.onPhase
 * @param {number} [opts.intervalMs]   轮询间隔（默认 500ms）
 * @param {number} [opts.idleAfterMs]  多久没有新事件就判 idle（默认 300s —— 一次长推理可能几分钟不落新事件，
 *                                    30s 会把「正在想」误判成「闲」）
 * @param {number} [opts.scanEveryMs]  目录扫描间隔（默认 10s；47 个文件全量 stat 约 3.2ms，1s 扫一次不划算）
 */
function createCodexEventWatcher({
  root,
  onPhase,
  intervalMs = 500,
  idleAfterMs = 300000,
  scanEveryMs = 10000,
} = {}) {
  let timer = null;
  let file = null;             // 当前跟踪的文件
  let phase = PHASE.IDLE;
  let lastEventMs = 0;         // 最后一条事件自身的时刻
  let stopped = false;

  // 每个文件独立游标：多会话并行时切来切去，各自续读，不整份重读、不互相重置
  const cursors = new Map();   // file -> { offset, carry, decoder }
  let newest = null;
  let lastScan = 0;

  function cursorFor(target) {
    let cur = cursors.get(target);
    if (!cur) {
      cur = { offset: 0, carry: '', decoder: new StringDecoder('utf8') };
      cursors.set(target, cur);
    }
    return cur;
  }

  function emit(next, meta) {
    if (stopped) return;
    if (next === phase && !meta.force) return;
    phase = next;
    try { onPhase(next, meta); } catch (error) { console.error('[codex-events] onPhase 抛错:', error.message); }
  }

  function consume(cur, text) {
    cur.carry += text;
    const lines = cur.carry.split('\n');
    cur.carry = lines.pop() || '';          // 最后一段可能不完整，留到下次
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let record;
      try { record = JSON.parse(trimmed); } catch { continue; }
      const next = classify(record);
      if (!next) continue;
      lastEventMs = Math.max(lastEventMs, eventTime(record));
      emit(next, { at: lastEventMs, record: record.type + '/' + ((record.payload || {}).type || '') });
    }
  }

  function tick() {
    if (stopped) return;

    const now = Date.now();
    if (!newest || now - lastScan >= scanEveryMs) {
      newest = latestRollout(root);
      lastScan = now;
    }
    if (!newest) return;
    if (!file || newest.file !== file) file = newest.file;

    const cur = cursorFor(file);
    let stat;
    try { stat = fs.statSync(file); } catch { return; }
    if (stat.size < cur.offset) { cur.offset = 0; cur.carry = ''; }   // 文件被重写/截断
    if (stat.size > cur.offset) {
      let fd;
      try {
        fd = fs.openSync(file, 'r');
        const length = stat.size - cur.offset;
        const buffer = Buffer.allocUnsafe(length);
        fs.readSync(fd, buffer, 0, length, cur.offset);
        cur.offset = stat.size;
        consume(cur, cur.decoder.write(buffer));   // 多字节字符跨读边界不会裂开
      } catch (error) {
        console.error('[codex-events] 读文件失败:', error.message);
      } finally {
        if (fd !== undefined) try { fs.closeSync(fd); } catch {}
      }
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
      return { file, phase, lastEventMs, cursors: cursors.size };
    },
  };
}

module.exports = { createCodexEventWatcher, classify, latestRollout, eventTime, PHASE };

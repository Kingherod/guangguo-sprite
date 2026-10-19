'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
function createActivityWatcher({ roots = [], busyWindowMs = 8000, intervalMs = 1000 } = {}) {
  const listeners = new Set(); let timer, running = false, generation = 0, previous;
  async function newest(dir) {
    let entries; try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return 0; }
    let latest = 0;
    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) latest = Math.max(latest, await newest(file));
      else if (entry.isFile() && /\.(jsonl|log)$/i.test(entry.name)) { try { latest = Math.max(latest, (await fs.stat(file)).mtimeMs); } catch {} }
    }
    return latest;
  }
  async function poll(token) {
    const times = await Promise.all(roots.map(newest)); if (!running || token !== generation) return;
    const at = Date.now(), latest = Math.max(0, ...times);
    // Metadata cannot identify session errors; only explicit host events can do that.
    const state = { busy: latest > 0 && at - latest <= busyWindowMs, lastError: false, at };
    if (!previous || previous.busy !== state.busy || previous.lastError !== state.lastError) { previous = state; for (const cb of listeners) { try { cb(state); } catch (error) { console.error(error.message); } } }
    timer = setTimeout(() => poll(token), intervalMs);
  }
  return { start() { if (!running) { running = true; previous = undefined; poll(++generation); } }, stop() { running = false; generation++; clearTimeout(timer); }, on(cb) { listeners.add(cb); return () => listeners.delete(cb); } };
}
module.exports = { createActivityWatcher };

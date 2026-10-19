'use strict';
/**
 * 桌面版漫游：把工作区底边当"地面"，用一个极简平台跳跃状态机驱动窗口。
 *
 *   pause ──(随机 2.5–6s)──▶ walk ──(到达)──▶ hop ──▶ pause
 *     │                        └──(途中被拖起)──▶ fall ──▶ pause
 *     └──(松手时离地)──▶ fall（跳姿 + 自由落体）──▶ pause
 *
 * 参考量来自 Hermes 桌宠：重力 5200px/s²、起跳 460ms、每个图集循环走 0.8 个身宽、
 * 松手后 90ms 就开始下落（不让人看着它悬在半空）。
 * 纯逻辑，窗口移动通过注入的 moveTo/readBounds 完成，便于单测。
 */

const GRAVITY_PX_S2 = 5200;
const JUMP_DUR_MS = 460;
const HOP_HEIGHT = 26;
const STRIDE_PER_LOOP = 0.8;
const DROP_SETTLE_MS = 90;
/** 松手后只下坠这么一小段就"站住"：占身高 21%（208px 时约 44px），随尺寸等比放大 */
const DROP_RATIO = 0.21;
const MAX_DT_S = 0.05;
const TICK_MS = 16;

const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const dirOf = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);

/**
 * @param {object} opts
 * @param {() => {x:number,y:number}} opts.readBounds    窗口当前位置（左上角，DIP）
 * @param {(x:number,y:number) => void} opts.moveTo      移动窗口
 * @param {() => {x:number,y:number,width:number,height:number}} opts.workArea 当前显示器工作区
 * @param {(motion:{row:string}|null) => void} opts.onMotion  姿态信号
 * @param {() => void} [opts.onSettle]                   落定/停顿后回调（存位置用）
 * @param {() => number} [opts.now]
 */
function createRoam({ readBounds, moveTo, workArea, onMotion = () => {}, onSettle = () => {}, now = () => Date.now(), size, rng = Math.random }) {
  const rand = (min, max) => min + rng() * (max - min);
  let phase = 'pause';
  let pauseUntil = 0;
  let targetX = 0;
  let vy = 0;
  let hopFromY = 0;
  let hopElapsed = 0;
  let last = 0;
  let timer = null;
  let ticks = 0, lastDt = 0, plans = 0, since = 0;
  /** 当前落脚线（虚拟台面）：松手时定在落点下方一小段，永远不高于工作区底边 */
  let shelfY = null;
  let dragging = false;
  let busy = false;
  let enabled = true;

  const dims = () => (typeof size === 'function' ? size() : size);
  const floorY = () => {
    const a = workArea();
    return a.y + a.height - dims().height;
  };
  const signal = (row) => onMotion(row ? { row } : null);

  /** 硬底线：工作区底边，任何情况下都不可越过 */
  const groundY = () => {
    if (shelfY === null) shelfY = Math.min(floorY(), readBounds().y);
    return Math.min(shelfY, floorY());
  };
  const settle = (y) => {
    const b = readBounds();
    moveTo(b.x, y);
    phase = 'pause';
    pauseUntil = now() + rand(2500, 6000);
    signal(null);
    onSettle();
  };

  const plan = () => {
    plans += 1; since = now();
    const b = readBounds();
    const floor = groundY();
    if (b.y < floor - 1) {
      // 被拖到空中 / 地面抬高：先摔下来
      phase = 'fall';
      vy = 0;
      signal('jumping');
      return;
    }
    const roll = rng();
    if (roll < 0.55) {
      phase = 'pause';
      pauseUntil = now() + rand(2500, 6000);
      signal(null);
      return;
    }
    if (roll < 0.85) {
      const a = workArea();
      const w = dims().width;
      const lo = a.x + 4;
      const hi = Math.max(lo, a.x + a.width - w - 4);
      targetX = Math.round(rand(lo, hi));
      if (Math.abs(targetX - b.x) < 24) {
        phase = 'pause';
        pauseUntil = now() + rand(1500, 3500);
        signal(null);
        return;
      }
      phase = 'walk';
      signal(dirOf(targetX - b.x) > 0 ? 'running-right' : 'running-left');
      return;
    }
    phase = 'hop';
    hopFromY = b.y;
    hopElapsed = 0;
    signal('jumping');
  };

  const tick = () => {
    if (dragging || !enabled || busy) return;
    const t = now();
    const dt = Math.min(MAX_DT_S, Math.max(0, (t - last) / 1000));
    ticks += 1; lastDt = Math.max(0, (t - last));
    last = t;
    const b = readBounds();

    if (phase === 'pause') {
      if (t >= pauseUntil) plan();
      return;
    }

    if (phase === 'walk') {
      const speed = (dims().width * STRIDE_PER_LOOP) / 1.6; // 一个图集循环 = 1600ms
      const step = speed * dt;
      const remain = targetX - b.x;
      if (Math.abs(remain) <= Math.max(1.5, step)) {
        moveTo(targetX, b.y);
        settle(b.y);
      } else {
        moveTo(Math.round(b.x + Math.sign(remain) * step), b.y);
      }
      return;
    }

    if (phase === 'hop') {
      hopElapsed += dt * 1000;
      const k = Math.min(1, hopElapsed / JUMP_DUR_MS);
      moveTo(b.x, Math.round(hopFromY - HOP_HEIGHT * Math.sin(Math.PI * k)));
      if (k >= 1) settle(hopFromY);
      return;
    }

    if (phase === 'fall') {
      vy += GRAVITY_PX_S2 * dt;
      const y = b.y + vy * dt;
      const floor = groundY();
      if (y >= floor) settle(floor);
      else moveTo(b.x, Math.round(y));
    }
  };

  return {
    start() {
      if (timer) return;
      last = now();
      pauseUntil = last + rand(1200, 3000);
      timer = setInterval(tick, TICK_MS);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      signal(null);
    },
    setEnabled(v) {
      enabled = !!v;
      if (!enabled) signal(null);
    },
    setBusy(v) {
      busy = !!v;
      if (busy) {
        phase = 'pause';
        signal(null);
      }
    },
    /** 用户开始拖：交出控制权，并让窗口记住"被拿起来了" */
    beginDrag() {
      dragging = true;
      phase = 'pause';
      signal(null);
    },
    /** 松手：短暂停顿后如果离地就摔下来（跳姿），贴地则继续待机循环 */
    endDrag() {
      dragging = false;
      last = now();
      pauseUntil = now() + DROP_SETTLE_MS;
      const b = readBounds();
      const floor = floorY();
      if (b.y > floor) {
        // 兜底：被拖到屏幕外（或显示器变矮）时先拉回底线之上
        shelfY = floor;
        moveTo(b.x, floor);
        phase = 'pause';
        pauseUntil = now() + rand(2500, 6000);
        signal(null);
        onSettle();
        return;
      }
      // 落点 + 一小段 = 新落脚线；贴底时收敛到底线，绝不越过
      const drop = Math.round(dims().height * DROP_RATIO);
      shelfY = Math.min(floor, b.y + drop);
      if (shelfY > b.y + 1) {
        phase = 'fall';
        vy = 0;
        signal('jumping');
      } else {
        phase = 'pause';
      }
    },
    /** 用户点了一下：原地待着，别在挥手时继续走/跳（下落中则让它落地再停） */
    hold(ms = 1600) {
      pauseUntil = now() + ms;
      if (phase !== 'fall') {
        phase = 'pause';
        signal(null);
      }
    },
    /** 当前落脚线（调试/回执用） */
    get shelf() {
      return groundY();
    },
    get phase() {
      return phase;
    },
    get stats() {
      return { ticks, lastDt, plans, since, shelf: Math.round(groundY()), pauseFor: Math.round(pauseUntil - now()) };
    },
    /** 单步推进：生产用 setInterval 驱动，测试用假时钟手动驱动 */
    tick
  };
}

module.exports = { createRoam, GRAVITY_PX_S2, JUMP_DUR_MS, HOP_HEIGHT, easeOutCubic };

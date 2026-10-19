'use strict';
/**
 * roam.js 的确定性测试：假时钟 + 假窗口 + 可控随机数。
 * 覆盖四件事：落地、拖起后下落、走路位移与朝向、忙碌时不乱动。
 */
const assert = require('node:assert');
const { createRoam } = require('../src/roam');

const AREA = { x: 0, y: 0, width: 1440, height: 860 };
const W = 192, H = 208;
const FLOOR = AREA.height - H; // 652

function harness({ x = 400, y = FLOOR, rolls = [0.9] } = {}) {
  let clock = 0;
  const pos = { x, y };
  const motions = [];
  let i = 0;
  const rng = () => rolls[Math.min(i++, rolls.length - 1)];
  const roam = createRoam({
    size: () => ({ width: W, height: H }),
    readBounds: () => ({ ...pos }),
    moveTo: (nx, ny) => { pos.x = nx; pos.y = ny; },
    workArea: () => AREA,
    onMotion: (m) => motions.push(m ? m.row : null),
    now: () => clock,
    rng
  });
  const advance = (ms, step = 16) => { for (let t = 0; t < ms; t += step) { clock += step; roam.tick(); } };
  return { roam, pos, motions, advance, at: () => clock };
}

// 1. 高处松手 → 只下坠一小段（身高 21% ≈ 44px）就站住，不再滑到底
{
  const h = harness({ y: 120 });
  h.roam.endDrag();
  assert.equal(h.roam.phase, 'fall', '松手且离地时应进入 fall');
  assert.equal(h.motions.at(-1), 'jumping', '下落时用跳姿');
  h.advance(2000);
  assert.equal(h.pos.y, 164, `应落在落点下 44px（164），实际 ${h.pos.y}`);
  assert.notEqual(h.pos.y, FLOOR, '不该滑到底线');
  assert.equal(h.roam.phase, 'pause', '落地后回到 pause');
}

// 2. 贴底松手 → 不越过底线：落点+28 被夹到底边
{
  const h = harness({ y: FLOOR - 10 });
  h.roam.endDrag();
  h.advance(2000);
  assert.equal(h.pos.y, FLOOR, `应夹到底线 ${FLOOR}，实际 ${h.pos.y}`);
}

// 2b. 已在地面松手 → 不摔
{
  const h = harness({ y: FLOOR });
  h.roam.endDrag();
  assert.notEqual(h.roam.phase, 'fall', '贴地松手不该触发下落');
}

// 2c. 连续几次下拖，落脚线逐段下移但永不越过底线
{
  const h = harness({ y: 100 });
  for (const dropY of [100, 200, 400, 640, 700]) {
    h.pos.y = dropY;
    h.roam.endDrag();
    h.advance(1500);
    assert.ok(h.pos.y <= FLOOR, `第 ${dropY} 次落点越界: ${h.pos.y}`);
    assert.ok(h.pos.y === Math.min(FLOOR, dropY + 44), `第 ${dropY} 次落点错误: ${h.pos.y}`);
  }
}

// 3. 走路：向目标位移、用对应朝向、到达后停下
{
  const h = harness({ x: 200, y: FLOOR, rolls: [0.7, 0.95, 0.95] });
  h.advance(7000); // 跨过第一次停顿
  assert.equal(h.roam.phase, 'walk', `应进入 walk，实际 ${h.roam.phase}`);
  const dir = h.pos.x > 200 ? 'running-right' : 'running-left';
  assert.ok(h.motions.includes(dir), `应发出 ${dir}，实际 ${h.motions.slice(-3)}`);
  const startX = h.pos.x;
  h.advance(3000);
  assert.notEqual(h.pos.x, startX, '走路过程中 x 应变化');
  assert.equal(h.pos.y, FLOOR, '走路不该改变落脚高度');
  assert.ok(h.pos.x >= 0 && h.pos.x <= AREA.width - W, '不应走出工作区');
}

// 4. 忙碌时不动
{
  const h = harness({ x: 300, y: FLOOR });
  h.roam.setBusy(true);
  const before = { ...h.pos };
  h.advance(9000);
  assert.deepEqual(h.pos, before, '忙碌时应原地不动');
}

// 4b. 点击触发 hold()：走路中立刻停住，姿态交还状态机（挥手）
{
  const h = harness({ x: 200, y: FLOOR, rolls: [0.7, 0.95, 0.95] });
  h.advance(7000);
  assert.equal(h.roam.phase, 'walk', '先进入 walk');
  h.roam.hold(1600);
  assert.equal(h.roam.phase, 'pause', 'hold 后应立即停');
  const x = h.pos.x;
  h.advance(800);
  assert.equal(h.pos.x, x, '挥手期间不应继续走');
}

// 5. 拖拽期间完全让路
{
  const h = harness({ x: 300, y: FLOOR });
  h.roam.beginDrag();
  h.advance(6000);
  assert.equal(h.roam.phase, 'pause', '拖拽中保持 pause');
}

// 6. 速度倍率：同样 160ms 内的位移按倍率成比例
{
  const run = (mult) => {
    const h = harness({ x: 200, y: FLOOR, rolls: [0.7, 0.999, 0.999] });
    h.roam.setSpeed(mult);
    h.advance(7000);                 // 跨过停顿，进入 walk
    assert.equal(h.roam.phase, 'walk', `${mult}x 时应已走路`);
    const x0 = h.pos.x;
    h.advance(160);                  // 只量一小段，避免走到目标停下
    return Math.abs(h.pos.x - x0);
  };
  const slow = run(0.65), normal = run(1), fast = run(1.5);
  assert.ok(Math.abs(fast / normal - 1.5) < 0.12, `快速应≈1.5×：${fast}/${normal}`);
  assert.ok(Math.abs(slow / normal - 0.65) < 0.12, `慢速应≈0.65×：${slow}/${normal}`);
  console.log(`  速度实测（160ms 位移）: 慢 ${slow} / 标准 ${normal} / 快 ${fast} px`);
}

console.log('PASS roam: 小段下坠 / 底线夹紧 / 连续下拖 / 走路朝向 / 点击停顿 / 忙碌静止 / 拖拽让路');

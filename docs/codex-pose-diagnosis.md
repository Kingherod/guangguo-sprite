# Codex 宿主下的姿态适配诊断（2026-10-22）

只诊断，未改任何代码、图集或版本。所用代码为 `plugin/` 1.2.4 现码。

---

## 0. 摘要

主人观察到的三件事，成因是**三个不同的 bug**，不是同一个：

| 现象 | 直接成因 | 严重度 |
|---|---|---|
| 坐下只做了一下就没了 | busy 判忙靠 mtime（8 秒窗口）→ 掉线后**漫游解冻**，`motion` 姿态压过 `waiting`（`player.js:16`）；坐姿被走路覆盖 | 高 |
| 思考动作全程没出现 | `review` 行**从未接进状态机**（`state.js:14` 只返回 5 个态）；素材、文档、Hermes 语义都有，插件这一层没接线 | 高（纯遗漏） |
| 完成任务没有庆祝蹦一下 | `jumping` 在插件里只当物理跳跃用；**没有"完成后闪一下"的节拍机制**（Hermes 有 flash beat，插件没有） | 中 |

结论：不是"没做"，是**只抄了 Hermes 的状态名与图集，没有抄它的状态机**。Hermes 那套有 7 个信号、按优先级裁决、还有一次性闪烁节拍；插件退化成 `mtime → busy → waiting` 一条链。

---

## 1. 原报告的 7 条硬事实：复核

| 原判断 | 复核 | 依据 |
|---|---|---|
| 状态机只产出 `waving/failed/waiting/unread/idle` | ✅ 对 | `src/renderer/state.js:14` 三元链，确实只有这 5 个 |
| 图集 9 行 | ✅ 对 | `src/renderer/atlas.js:3` |
| `review` 从未被产出 | ✅ 对（且比这更严重：它连"被考虑过"的痕迹都没有） | 全仓 grep 只有 `atlas.js:3` 一处出现 |
| 没有 thinking / celebrate 态 | ✅ 对 | `state.js` 全文无此二态 |
| `unread` 在播放层改写成 `waiting` | ✅ 对 | `player.js:16` |
| busy = 扫 mtime，8 秒窗口，1 秒轮询 | ✅ 对 | `activity.js:4`（`busyWindowMs=8000, intervalMs=1000`）、`:21` |
| `pose = waving ? ... : (motion?.row ?? state)`，motion 压语义态 | ✅ 对，**且这就是"坐下没了"的直接凶手** | `player.js:16` |
| busy 时漫游冻结 | ✅ 对，但只在 busy 为真时；掉线即解冻 | `roam.js:119`、`main.js:179` |

补一条原报告没提、但同样要紧的：
**任务结束后宠物会永久坐等**——`activity()` 在 busy 落回 false 且没人点过时置 `unread=true`（`state.js:7`），而 `unread → waiting`（`player.js:16`）。所以她"干完活坐着不动"，直到鼠标划过（`hover()` → `attend()`）才回 idle。

---

## 2. 四条判断的裁决

### 判断 1（坐下）：方向对，机制说浅了 → **半对**

mtime 稀疏是真的（见第 4 节数据），但**单靠 mtime 稀疏解释不了"只做一下"**：busy 掉线后状态变成 `unread`，而 `unread` 播放的**还是** `waiting`，她本该继续坐着。

真正让她"站起来"的是第三条链：`busy=false` → `roam.setBusy(false)` 解冻漫游（`main.js:179`）→ 2.5–6 秒后开始走 → `motion` 推送 `running-right/left` → `player.js:16` 里 `motion?.row` 排在 `state` 前面 → **坐姿被走路姿态覆盖**。

所以「坐等一下就没」= mtime 掉线 + 漫游接管姿态，两件事叠加。

### 判断 2（思考）：**对，但可以给出确切答案**

`review` 不是"另有含义"，它就是**思考**。仓库自己的格式文档写得很清楚：

> `docs/format.md:31` — `| 8 | review | 6 | 267 ms | thinking: hand to cheek → finger up → arms crossed |`

Hermes 侧同样把它当思考：`agent/pet/state.py:54` 的优先级表里 `(reasoning, PetState.REVIEW)`；桌面端 `store/pet.ts:128-129` 是 `if (activity.reasoning) return 'review'`。

**为什么没接进状态机**：没有特别原因，就是插件重写状态机时只实现了"忙/闲/未读/失败/挥手"五个态，`review` 作为图集行名留在了 `atlas.js`，没有任何代码产出它。属于纯遗漏，不是设计取舍。

### 判断 3（庆祝）：**半错——素材不缺，错在"没有节拍"**

`jumping` 行确实是物理跳跃用的，但它同时**就是** Hermes 定义的庆祝行：

> `agent/pet/state.py:50` — `(celebrate, PetState.JUMP)`
> `agent/pet/state.py:39` 文档串 — "explicit success beat, e.g. todos done"

也就是说：**不需要补画一行动作**，庆祝本来就该用 `jumping`。缺的是两样东西：
1. 一个"完成"信号（Codex 有 `task_complete` 事件，现在完全没读）；
2. 一个**一次性闪烁节拍**——Hermes 是 `flashPetState()` + 定时器（`store/pet.ts:172-182`），播完自动回落；插件没有这套，状态只能靠持续信号维持。

⚠️ 但有个素材缺口必须坦白：`jumping` 行 5 帧是**同一张静态图**（见 README「已知限制」）。所以哪怕接上信号，"庆祝蹦"也只是**定格一个跳跃姿势 1.6 秒**，不会有蹬地—腾空—落地。要么接受定格，要么补画 5 帧分解（另算工时）。

### 判断 4（"做了一半"）：**措辞要改** → 不是一半，是**只实现了最简化的一条链**

Hermes 的 `derive_pet_state` 有 7 个入参（`state.py:23-58`）：`error / celebrate / just_completed / awaiting_input / tool_running / reasoning / busy`，按固定优先级裁决。插件只有 1 个（`busy`）。所以不是"某个动作没做完"，是**整个语义层被砍成了一个布尔值**。

---

## 3. 三个成因的确切代码位置

```
起因 A（坐姿丢失）
  activity.js:4    busyWindowMs=8000      ← 8 秒没有新写入就判闲
  activity.js:21   busy = at-latest<=8000  ← 只看 mtime，不看内容
  main.js:179      roam?.setBusy(!!state.busy)  ← 一掉线就解冻漫游
  roam.js:119      if (dragging || !enabled || busy) return;  ← 解冻后照常走
  player.js:16     motion?.row ?? state     ← 走路姿态压过 waiting

起因 B（思考缺失）
  atlas.js:3       'review' 只作为行名存在
  state.js:14      返回值里永远没有 review
  docs/format.md:31 明确写着 review = thinking

起因 C（庆祝缺失）
  state.js:14      没有 celebrate / just_completed 分支
  player.js:16     没有一次性节拍，只认持续状态
  （Hermes 对照：state.py:50、store/pet.ts:172-182 flashPetState）
```

---

## 4. 实测数据（真实 Codex 会话，不是推测）

样本：`~/.codex/sessions/2026/10/22/rollout-2026-10-22T14-17-53-*.jsonl`
跨度 1071 秒，469 行，其中关键事件 131 个：

```
response_item/custom_tool_call     61
response_item/function_call         2   → 工具调用共 63 次
response_item/reasoning            56   → 思考 56 段
response_item/message (assistant)  10
event_msg/task_started              1
event_msg/task_complete             1
```

按时间轴逐秒模拟两种判法（同一份文件）：

| 判法 | 结果 |
|---|---|
| 现行 mtime 8 秒规则 | busy 覆盖 **71%** 时长，但**忙/闲翻转 74 次**——一次任务里她"站起来又坐下"七十多回 |
| 事件驱动（按最后事件类型） | 工具段 **61%**、思考段 **34%**、输出段 4%、任务开始 1% |

结论：**思考态本应占三分之一以上的时间，实测 0%**。而坐下态被切成 74 段碎片，观感就是"坐一下就没了"。

另外 6 个历史会话的同一指标：8 秒窗口下超过 8 秒的空档分别是 4 / 2 / 1 / 10 / 3 / 39 段（最长 72803s、926s、140s 等，长的那些是会话中断，不算）。

---

## 5. 换事件源可行吗

### Codex：可行，字段已经全部验证过

rollout 是**追加式 JSONL**，每行带 ISO 时间戳，字段足够推出全部所需状态：

| 需要 | 数据源（已实测存在） |
|---|---|
| 任务开始 | `event_msg` / `payload.type == "task_started"` |
| 思考中 | `response_item` / `"reasoning"` |
| 调用工具 | `response_item` / `"custom_tool_call"`、`"function_call"` |
| 输出内容 | `response_item` / `"message"` 且 `payload.role == "assistant"` |
| 任务完成 | `event_msg` / `"task_complete"` |
| 执行失败 | `response_item` / `*_output` 里带错误，或 `task_complete` 缺失 + 长时间静默 |

实现上只需**增量读**：记住每个文件的 offset，每秒只读新增字节（样本最大 469 行 / ~300 KB，全量读也不算贵，但增量更稳）。

**审批/等待用户输入**：本样本里**没有**独立的审批事件类型（`approval` 字样只出现在 `turn_context` 的策略配置里）。也就是说 Codex 这边"需要你确认"目前**取不到可靠信号**——这一态建议先不实现，标注未验。

### DeepSeek Harness：**未验**

`~/.dsh/sessions/**/session.v4.jsonl.zstd` 实测结构是**整份 JSON、单行、可 zstd 压缩**（不是追加日志）。本机三份样本都是空会话（解析后 `messages` 长度为 0），因此**无法判断**它有没有 reasoning / tool 事件，也无法判断写入时机。

Node 26 自带 `zlib.zstdDecompressSync`（已实测存在），技术上解压不是障碍；障碍是**内容结构未知**。

### 对另外两个宿主的影响

- **Hermes**：零影响。Hermes 不走 `activity.js`，它用进程内信号（`$petActivity` + `derive_pet_state`），本来就是事件驱动。
- **DSH**：会受影响——但如果 DSH 格式解析失败，设计上应该**回落到现行 mtime 逻辑**，不能因为改造让 DSH 从"能用"变"不能用"。

---

## 6. 改动清单与工时

按"Hermes 语义忠实版"估：

| # | 改动 | 文件 | 工时 |
|---|---|---|---|
| 1 | 新增事件解析器：增量 tail 最新 rollout，产出 `{busy, reasoning, toolRunning, justCompleted, error}` | 新建 `src/codex-events.js` | 1.5 h |
| 2 | 状态机扩到 7 态 + 优先级表（照抄 `state.py:47-56` 的顺序） | `state.js` | 1 h |
| 3 | 一次性闪烁节拍（`flash(state, ms)`），庆祝 1.6 s、失败 15 s | `state.js` + `main.js` | 0.5 h |
| 4 | 姿态优先级修正：**语义态压过漫游**；漫游只在 idle 时允许 | `player.js:16`、`roam.js` 联动 | 0.5 h |
| 5 | 单测：用固定事件序列断言 7 态与闪烁回落；补一条"事件源不可用时回落 mtime" | `test/state.js`、`test/run.js` | 1.5 h |
| 6 | 真机验证：Codex 跑一个真实任务，逐秒记录姿态，确认 think/tool/celebrate 三段都出现 | — | 1 h |
| | **小计** | | **6 h** |

可选（不在上述工时内）：

- **补画 `jumping` 的 5 帧分解**（蹬地→腾空→落地），否则庆祝只是"定格 1.6 秒"。美术 2–4 h。
- DSH 事件解析：**未验**，需先拿到有内容的 v4 会话样本；预计 +2–3 h，且可能做了也用不上。

---

## 7. 有一处必须请主人拍板的语义冲突

主人的期望是：**干活 = 坐下**、输出 = 思考、完成 = 蹦。

但 Hermes 的既定语义是：**坐等（waiting）= 卡在等你**，干活是 **running（跑动）**（`state.py:52-55`：`awaiting_input → WAITING`、`tool_running → RUN`、`busy → RUN`）。

两者冲突点只有一个：**"坐着"到底表示什么**。

- 选 A（照主人直觉）：`toolRunning → waiting(坐)`，`reasoning → review(思考)`，`task_complete → jumping(蹦)`。
  代价：与 Hermes 端语义不一致（同一个角色在两个宿主上"坐下"含义不同），好处是他不需要重新建立直觉。
- 选 B（照 Hermes 语义）：`toolRunning → running(跑)`、`awaiting_input → waiting(坐)`。
  代价：得先有"等你确认"的可靠信号，而**Codex 目前取不到**（第 5 节），会造成 `waiting` 基本不出现。

我的建议：**选 A**。理由是桌宠在桌面上的可读性优先于跨宿主语义一致；而"需要你"这件事在 Codex 侧暂时无信号，反正也播不出来。等哪天 Codex 暴露审批事件，再把 `awaiting_input` 加成 `waving` 或气泡提示即可。

---

## 8. 未验事项（不要当结论）

1. DSH v4 会话是否含 reasoning/tool 事件 —— 本机样本为空会话，**未验**。
2. Codex 是否有"等待审批"事件 —— 本样本未触发，**未验**（只确认了没有以 `approval` 命名的事件类型）。
3. Hermes 端是否真的会播 `review` / `jump` —— 只读了 `store/pet.ts` 与 `pet.test.ts` 的断言，**没有真机观察**，未验。
4. 事件驱动改造后 DSH 的表现 —— 取决于第 1 条。
5. `jumping` 定格 1.6 秒的实际观感 —— 未做，需真机看片。

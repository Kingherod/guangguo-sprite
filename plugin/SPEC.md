# 任务书 · 光国桌宠插件（Codex / DeepSeek Harness 通用）

## 一句话目标

做一个**新的桌宠插件**，让「光国」这两个宿主里也表现得和 Hermes 里一样：
平时待机呼吸眨眼、agent 干活时坐着摇、点一下挥手、出错时垂头。
不要改原来那个 `gpt-dragon-pet` 插件，**只把它当结构与做法的参考**。

## 硬约束（违反即返工）

1. **绝对不要复制或依赖参考插件里的账单 / 鉴权代码**：`dragon-station-auth*`、`*billing*`、
   `dragon-credentials*`、`mcp.mjs`、`runtime/*`。这些和钱有关，出问题后果严重。
   本项目**不做任何网络请求**，不读 token，不连站点。
2. **不写占位实现**：不许 `TODO`、不许 `return null 之后再补`、不许把状态机写成假数据。
   交上来必须是真能跑的。
3. **Windows 10 / Node 26 / 无管理员权限**。不要 `npm install` 大型依赖；
   Electron 用现成的（见「运行时约定」）。
4. 所有路径用 `path.join(__dirname, ...)`，**不许出现写死的绝对路径**。

## 现有素材（已就位，别改）

```
assets/pet/spritesheet.png   1536×1872
assets/pet/pet.json          { "id":"guangguo", "loopMs":1600, ... }
```

图集规格（这是核心，必须精确实现）：

- 单格 **192×208**，**8 列 × 9 行**，左上角为原点，`cell(col,row)` 的像素原点 = `(col*192, row*208)`
- 行序固定（0 起）：
  `0 idle` `1 running-right` `2 running-left` `3 waving` `4 jumping` `5 failed` `6 waiting` `7 running` `8 review`
- **每行帧数靠透明格推断**：从该行第 0 列往右数，遇到第一格 alpha 全为 0 就停，
  数到几就是几帧。别写死帧数，别读 JSON 里的额外字段。
- 每帧时长 = `loopMs / 帧数`。`loopMs` 从 `pet.json` 读，缺省 1600。

## 状态机（这是和 Hermes 对齐的关键，照这个做）

| 状态 | 播放行 | 进入条件 | 离开条件 |
|---|---|---|---|
| `idle` | `idle` | 默认 | 其它状态成立 |
| `waiting` | `waiting` | agent **忙**（见下） | 忙结束且窗口已被注视过 |
| `unread` | `waiting` | 忙结束，但**期间窗口没被点击过** | 用户点击 / 鼠标移上去 |
| `waving` | `waving` | 用户点击角色（位移 < 6px） | 播完**一整圈**（= `loopMs`）后回到原状态 |
| `failed` | `failed` | 最近一次会话事件是错误 | 用户点击，或 15 秒后 |

优先级：`waving` > `failed` > `waiting`/`unread` > `idle`。

### 「忙」怎么判（不要自己发明，就按这个）

Watch 一个**状态文件**，它由本插件自己的 watcher 写入，watcher 只看宿主会话文件的 mtime：

```
候选目录（存在哪个用哪个）：
  %USERPROFILE%\.codex\sessions        (Codex)
  %APPDATA%\@deepseek-ai\dsh-desktop   (dsh，递归找 *.jsonl / *.log)
判定：目录下最新的会话文件 mtime 在 8 秒内 → busy
      超过 8 秒没有新写入 → busy 结束
轮询间隔 1000ms，只 stat 不读内容（文件可能很大）
```

接到宿主事件是加分项，**但不要为了它去逆向宿主的私有格式**——mtime 这个启发式够用，
稳定性比聪明重要。把判定写成独立模块 `src/activity.js`，接口：
```js
createActivityWatcher({ roots, busyWindowMs, intervalMs }) → { start(), stop(), on(cb) }
```
`on` 回调每次状态变化给 `{ busy: boolean, lastError: boolean, at: number }`。

## 交互与窗口

- 无边框、无标题栏、背景透明、`alwaysOnTop`、不出现在任务栏、可拖拽移动。
- 窗口尺寸 = 384×416（图集单格 2 倍），内容区域正好放下；不要额外留白。
- 鼠标行为：
  - pointerdown → 记录起点；pointermove 位移 ≥ 6px 进入拖拽（移动窗口，实时跟手）
  - pointerup 位移 < 6px → 判定为**点击** → 播 `waving` 一整圈
- 右键 → 一个极简菜单：`重新载入图集` / `退出`。
- 窗口位置存到 `%APPDATA%\guangguo-pet\position.json`，下次启动还原；屏幕外则回默认位置（右下角，留 24px 边距）。

## 运行时约定

- 入口：`src/main.js`（Electron 主进程），`src/preload.js`，`src/renderer/` 下放播放器。
- 渲染必须用 **canvas + requestAnimationFrame**，`drawImage(spritesheet, sx,sy,192,208, 0,0,384,416)`。
  不要用 CSS `background-position`（抖动、且在缩放屏上会糊）。
- Electron 解析顺序：`process.env.GUANGGUO_ELECTRON` → 本项目 `node_modules/electron/dist/electron.exe`
  → 参考插件路径 `%LOCALAPPDATA%\CodexDragonPet\releases\*\node_modules\electron\dist\electron.exe`。
  找到哪个用哪个，找不到就在 stderr 说清楚「需要 electron」并 exit 2。
- 图集读不到 / 尺寸不对（≠1536×1872）→ stderr 报错并 exit 3，**绝对不要显示空白窗口**。

## 插件清单（两个宿主都要能认）

```
.codex-plugin/plugin.json     参照参考插件的字段结构：name/version/description/interface
                              （interface 里给 displayName「光国」、category、brandColor）
                              mcpServers 指向 ./.mcp.json，但 MCP 服务只提供两个只读工具：
                                guangguo_status   返回 {state, busy, frame, atlasOk}
                                guangguo_show     把窗口提到前台
.mcp.json                     command 用 electron + ELECTRON_RUN_AS_NODE 跑 src/mcp.js
.agents/plugins/marketplace.json  本地 marketplace，source.path 指向本目录
```

MCP 那层做成**最薄的一层**：stdin/stdout JSON-RPC，只实现 `initialize`、`tools/list`、`tools/call`，
不要引 SDK，不要联网。

## 自检（必做，我会拿这个验收）

实现一个命令行自检，**必须复用真实的渲染路径**（同一个 canvas 绘制函数），不要另写一套画图代码：

```bash
node src/selftest.js out/            # 用 electron 跑的话写成 npm run selftest
```

输出：
```
out/atlas-report.json     每行的帧数、每帧时长、格子是否完整（尺寸/alpha 检查）
out/state-idle.png        各状态的一帧（透明背景，384×416）
out/state-waiting.png
out/state-waving.png
out/state-failed.png
out/state-unread.png
out/frames-waiting.png    把 waiting 的 8 帧横排（看帧间差异是否正常）
```

## 验收标准（我会亲自跑，不过不做人情）

1. `node --check` 全部 JS 通过
2. `atlas-report.json` 里帧数为 `6/8/8/4/5/8/8/6/6`，与图集实际一致
3. 五张 `state-*.png` 背景透明、角色完整、五个状态画面**确实不同**
4. `frames-waiting.png` 里 8 帧有肉眼可见的左右位移，且**下盘不动**
5. 窗口能起来、点击能挥手、拖拽能移动（我会截图核对）
6. 代码里搜不到 `TODO`、`FIXME`、写死路径、网络请求

## 交付

代码全部写在当前工作目录（这已经是个 git 仓库），最后 `git add -A && git commit`。
不要写 README 以外的花哨文档；`README.md` 说明：怎么启动、怎么装进两个宿主、自检怎么跑。
不要自己尝试安装进宿主，那一步由我来做。

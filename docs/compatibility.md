# 兼容性 · Compatibility

结论：**Hermes 原生；Codex 和 DeepSeek Harness 用同一套插件机制，可以直接挂上功能完整的桌宠；
若目标插件只吃单张动图，才需要把图集导成 APNG；其它任何能画图的程序都能自己接。**

> **更正（2026-10-19）**：本文最初写的是「DeepSeek Harness 不支持桌宠」。**错的。**
> 当时我在它的 `app.asar` 里搜 `spritesheet` / `sprite`，命中的全是 CSS 注释和 K 线形态名
> （`dragonflydoji`、`morningstar` 之类），就下了结论。**该搜的是 `.agents` / `plugin.json` /
> `mcpServers`**——按这三个搜，`app.asar` 里 `.agents` 出现 3598 次、`插件` 1511 次、
> `mcpServers` 198 次：dsh 有一整套插件系统，读的就是 `.agents/plugins/` 这套 marketplace 格式。
> 桌宠正是这样被挂进去的。

| 宿主 | 能不能用 | 怎么用 |
|---|---|---|
| **Hermes 桌面端** | ✅ 原生 | 整个 `pet/` 丢进 `pets/guangguo/`，有状态联动 |
| **Codex 桌面端** | ✅ 完整桌宠 | `plugin/` 以 `.codex-plugin/plugin.json` 注册，自己开窗、自己听会话 mtime |
| **DeepSeek Harness** | ✅ 完整桌宠 | 同一条路径；两者读同一份 `.agents/plugins/marketplace.json` |
| 只吃单张动图的宠物插件 | ✅ 需转 APNG | `scripts/export_apng.py` 导出单状态 → 导入素材 |
| **任何 Electron / 网页** | ✅ 自己接 | 看 `demo/index.html`，播放逻辑不到 40 行 |

## 为什么 Codex 和 dsh 是同一个答案

因为**桌宠不是宿主的功能，是插件的功能**。这套宿主的插件格式是共通的：

```
.codex-plugin/plugin.json          ← 插件清单（name / interface / mcpServers / skills）
.mcp.json                          ← 插件自带的 MCP 服务
.agents/plugins/marketplace.json   ← 插件如何自注册到本地市场
```

桌宠插件 `gpt-dragon-pet@dragon-pet-local` 就照这套注册了自己
（`%LOCALAPPDATA%\CodexDragonPet\.agents\plugins\marketplace.json`）：

```json
{ "name": "dragon-pet-local",
  "plugins": [{ "name": "gpt-dragon-pet",
                "source": { "path": "./releases/1.0.0-D90CF0951FA4", "source": "local" } }] }
```

它的 MCP 服务是个 Electron 进程（`ELECTRON_RUN_AS_NODE=1` 跑 `runtime/dragon-mcp.mjs`），
**桌宠窗口是插件自己开的独立置顶窗口，跟宿主渲染层无关**。所以换宿主不影响桌宠，换插件才影响。
状态文件也印证了这点：`~/.codex/dragon-pet/.dshw-*.json`（`dshw` = DSH Windows）——
插件本来就是从 dsh 那边长出来的，`plugin.json` 里也写着「保留 DSH 角色」。

## 关键：宿主不吃图集，但我们自己的插件吃

**本仓库的 `plugin/` 直接读 `pet/spritesheet.png`**，九行全用：待机、走路、点击挥手、
agent 忙时坐等、出错、原地蹦。它自己 `stat` 会话文件判断忙闲（见文末会话目录表），
所以 Codex 与 dsh 上的体验和 Hermes 是同一档，不需要转格式。

需要转 APNG 的是**别人家的宠物插件**（例如 `gpt-dragon-pet`）。它们的媒体校验
（`lib/media-validation.mjs`）是这么定的：

```js
roleBytes: 20MB   maxImageDimension: 4096
maxFrames: 600    maxAnimationPixels: 128_000_000
// 接受 png / apng / gif
```

所以 8×9 图集**塞不进这种插件**，得按状态拆开导出：

```bash
python scripts/export_apng.py pet/spritesheet.png waiting out/waiting.png --scale 2
# → 384×416，8 帧，每帧 200ms，RGBA 半透明保留
```

**为什么用 APNG 不用 GIF**：GIF 只有 1 位透明。这位角色发梢和袖口有大量半透明像素
（实测 `waiting` 首帧 17.5% 的像素 alpha 在 0~255 之间），转 GIF 会糊出一圈白边。APNG 原样保留。

**只吃单图的插件做不到什么**：它显示的是一张循环动图，不会因为你 Codex/dsh 在干活就换姿势。
想要「干活坐等、跑完挥手」，要么用本仓库的 `plugin/`（它已经这么做了），
要么在第三方插件 runtime 里自己接状态源——本仓库只负责把图集导成它吃得下的格式。

## Hermes：宿主内建的状态联动

Hermes 的桌宠是宿主内建：`agent/pet/store.py` 自动发现 `pets/<slug>/`，
按 `loopMs` 和「末格是否透明」播行，**并且**从 agent 状态里推姿态——
忙时坐等、跑完未读坐等、点一下挥手。这部分行为在 `patches/hermes-desktop/` 里。

## 还没验的一件事

素材格式我核到了 `media-validation.mjs` + `resource-store.mjs` 的 `importResource`，
但**没有真的在插件界面里导入一遍**——那要动正在运行的实例。要我实测就说一声。

## 其它程序

图集是纯 PNG + 一个 JSON，没有任何私有格式。任何能
`drawImage(sheet, frame*192, row*208, 192, 208, ...)` 的引擎都能用，
`docs/format.md` 里有可直接粘的 JS 播放器和帧数探测逻辑。

## 会话目录（忙闲判定用）

| 宿主 | 会话文件位置 | 后缀 |
|---|---|---|
| Codex | `~/.codex/sessions/<年>/<月>/<日>/rollout-*.jsonl` | `.jsonl` |
| DeepSeek Harness | `~/.dsh/sessions/<workspace>/session-*/session.v4.jsonl.zstd` | `.jsonl.zstd` |

插件只 `stat` 这些文件的 `mtime`，不读内容。**注意 dsh 的会话不在 `%APPDATA%\@deepseek-ai` 下**，
早期版本只监控后者，导致 dsh 忙时桌宠不动；1.0.1 起两个根都监控，并且后缀允许二次压缩。

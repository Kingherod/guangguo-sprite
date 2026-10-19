# 光国 · Guāngguó — 九状态 Q 版桌宠图集

[English](README.md) · **简体中文**

一套手工调过的**九行动作图集**（Q 版女仆长），加上构建它、校验它、预览它的 Python 工具链，
以及一个拿来就能跑的**独立桌宠插件**——在 Hermes 上是原生接入，在 Codex / DeepSeek Harness
上是插件接入。

![走路](previews/walk.gif) ![待机](previews/idle.gif) ![坐等](previews/sit-sway.gif)

| | |
|---|---|
| **图集** | 1536 × 1872 像素，8 列 × 9 行，单格 192 × 208 |
| **行序** | `idle` `running-right` `running-left` `waving` `jumping` `failed` `waiting` `running` `review` |
| **循环** | 每行 1600 毫秒（`pet.json` 的 `loopMs`） |
| **md5** | `b3efed19621d44a0cf0b70946505f7b0`，可由 `sources/` 逐字节重建 |
| **格式说明** | [docs/format.md](docs/format.md) |
| **动作设计图** | [docs/design-sheet.png](docs/design-sheet.png) |
| **兼容性** | [docs/compatibility.md](docs/compatibility.md) |
| **许可** | 代码 MIT · 美术 CC BY-NC 4.0（[详见](#许可)） |

## 目录结构

```
pet/            spritesheet.png + pet.json          ← 拿来即用的图集
plugin/         独立桌宠（Electron，无第三方依赖）+ MCP 工具
demo/index.html                                      ← 浏览器里直接播，播放器只有几十行
docs/           format.md · making-of.md · design-sheet.png
previews/       走路 / 待机 / 坐等 GIF，走路改版前后对照
scripts/        build_atlas.py · verify_atlas.py · export_apng.py · make_gif.py · make_sheet.py
sources/        原始单帧（走路 3 张关键帧、坐等 8 张、其余状态 5 张）
patches/        Hermes 桌面端的可选补丁
```

## 快速开始

**先看看她长什么样**

```bash
python -m http.server 8899
# 打开 http://127.0.0.1:8899/demo/index.html
```

点她一下就会挥手。之所以要起本地服务器，是因为页面要读像素数据去数每行有几格，`file://` 会污染 canvas。

**把图集用到自己的程序里**

只有三条规矩：单格 192 × 208、行序按上表固定、每行末尾没用到的格子必须全透明。
播放某一行就是 `x = frame * 192` 逐格推进，`frames` 取该行非透明格数。
参考播放器与边界情况：[docs/format.md](docs/format.md)。

**从源帧重建图集**

```bash
pip install -r scripts/requirements.txt
python scripts/build_atlas.py sources out --loopms 1600
python scripts/verify_atlas.py out/spritesheet.png out/row
```

`build_atlas.py` 是确定性的：从 `sources/` 重建出的 `pet/spritesheet.png` 与原文件**逐字节一致**
（md5 `b3efed19621d44a0cf0b70946505f7b0`）。动过任何源帧、或改过任何目标高度，都该跑一次这个校验。

## 桌宠插件

`plugin/` 是一个独立的 Electron 桌宠，不依赖任何宿主：它只看 **agent 会话文件的 mtime** 来判断
对方忙不忙，然后自己开一个透明、置顶、无边框的窗口。

```bash
cd plugin
node src/launch.js            # 启动桌宠
node test/run.js              # 状态机测试
node test/roam.js             # 漫游 / 物理 / 速度测试
```

| 行为 | 具体表现 |
|---|---|
| **待机** | `idle` 行循环；停 2.5–6 秒后可能走一走、或在原地蹦一下 |
| **走路** | 平台跳跃式状态机 `pause → walk → hop → fall`，重力 5200 px/s²；每走完一个图集循环移动 0.8 个身宽，脚不打滑 |
| **走路速度** | 右键或托盘 → **漫游** → `不移动` · `慢 0.65×` · `标准 1.0×` · `快 1.5×`。192px 身高的实测是 62 / 97 / 150 px/s。倍率**同时**作用于窗口位移与走路帧速（`帧时长 ÷ 倍率`）——只加速度不加速动画，看起来就是在滑步 |
| **不移动** | 完全关掉漫游；她照样眨眼、照样点一下挥手、照样在 agent 忙时坐等 |
| **拖拽** | 拖到哪里都行；松手后只下落**自身身高的 21%**（100% 尺寸时 44 像素），落点成为新的“落脚线”。工作区底边是硬下限，永远压不穿 |
| **点击** | 按下松开位移不足 6 像素算**挥手**，不算拖拽，也**不会触发下落**；挥手优先级高于漫游姿态，所以走路中点她会立刻停下挥手，而不是被走路帧吃掉 |
| **忙时** | 会话文件持续变化时播 `waiting` 坐等，停下 8 秒后回待机；只读 mtime，不读文件内容 |
| **异常** | 会话看起来坏掉时播 `failed` 几秒 |
| **尺寸** | 右键或托盘 → `75 / 100 / 150 / 200 / 250 %`（100% = 192 × 208），写进 `%APPDATA%\guangguo-pet\settings.json` |
| **怎么找回来** | 点托盘图标显隐；右键「隐藏到托盘」进程仍活着；再双击启动器经单实例锁唤回；`guangguo_show` 可从零拉起 |
| **不联网** | 零请求、零计费/鉴权代码、零遥测 |

它同时以 Codex / DeepSeek Harness 插件的形式注册（`.codex-plugin/plugin.json`、`.mcp.json`，
只读工具 `guangguo_status` / `guangguo_show`）。也支持用一个 JSON 命令文件下指令，任何会写文件的
程序都能驱动她。

## Hermes 原生接入

把 `pet/` 丢进 `pets/guangguo/` 即可，状态机交给 Hermes：干活时坐等、点一下挥手、空闲时漫游。

**脚下的影子是量出来的，不是估的。** 原版对所有姿态都画同一个固定椭圆（宽为帧宽的 55%、居中）。
只要姿势不是大跨步站姿，这个椭圆立刻会被读成“她在飘”——坐姿的真实接地面又窄又偏：

| 行 | 实际接触带宽 | 接触中心（192px 格内） | 旧影子 |
|---|---|---|---|
| `idle` 站立 | 24 px | 92.6（≈居中） | 宽 106、居中 |
| `waiting` 坐等 | 23 px | **127.5（偏右 31 px）** | 同上 → 明显脱节 |
| `running-right` | 46 px | 123.8 | 同上 |

修法是：启动时沿 alpha 通道把每行扫一遍，记下接触带，再由它驱动椭圆——
宽取 `3.0 × 接触宽`，夹在 `[0.34, 0.55] × 帧宽`；横向中心对准接触中心（左向行镜像）；
纵向让椭圆中心落在接触底边上。同一套逻辑也让站立与走路保持贴地，所以这是通用修法，不是给坐等打的补丁。

**姿态尺度**和**影子几何**是两件独立的事。坐等行原本只有 136px 高，而立姿是 194px，同一个固定影子
因此显得离得更远；现在从 714 × 825 的源帧重算到 **160px**（不是把图集二次放大），身高差读作
“她坐着”，而不是“她变小了”。

## 兼容性

| 宿主 | 能用吗 | 怎么用 |
|---|---|---|
| **Hermes** 桌面端 | ✅ 原生 | `pet/` 丢进 `pets/guangguo/`；有状态联动（忙时坐等、点击挥手、空闲漫游） |
| **Codex** 桌面端 | ✅ 完整桌宠 | `plugin/` 以 Codex 插件注册，自己开窗、自己听会话文件 |
| **DeepSeek Harness** | ✅ 完整桌宠 | 同一条路径——同一套插件清单与 marketplace 配置 |
| 其它任何程序 | ✅ 手动 | `demo/index.html` 就是全部播放逻辑 |

如果目标引擎只认**一张循环图**（png / apng / gif，≤4096 px、≤600 帧），8 × 9 的图集塞不进去，
就导出单个状态：

```bash
python scripts/export_apng.py pet/spritesheet.png waiting out/waiting.png --scale 2
# → 384×416，8 帧 @200ms，保留 RGBA
```

用 APNG 而不用 GIF：发梢和宽袖约有 17.5% 的半透明像素，GIF 的 1-bit alpha 会把它们啃成白边。

## 怎么做的

角色设定、逐帧指令、以及每个选择背后的理由都写在 [docs/making-of.md](docs/making-of.md)。
简版：帧是用图像模型一帧一帧链式改出来的（上一帧的输出作为下一帧的输入，绝不回锚点重画），
再交给这里的 Python 工具装配；走路循环被刻意从 6 个关键帧砍到 4 个，因为多出来的“过渡帧”
恰恰是形变最集中的地方。

## 已知限制

- `jumping` 是**同一张静态图**重复 5 次——跳跃还没有动作分解，所以“蹦”看起来是弹上去，而不是蹬地。
- `running`（原地跑）两个参考客户端都没用：agent 忙时播坐等，漫游用 `running-left/right`。
- 这套图优先保证 192px 下的剪影干净，不追求动画花哨。她走的是小碎步，不是大摇大摆。
- Codex 插件的托盘图标可能被 Windows 收进“隐藏图标”溢出区，这是系统行为，不是 bug。

## 许可

- **代码**（`scripts/`、`demo/`、`plugin/`、`patches/`）—— MIT，见 [LICENSE](LICENSE)。
- **美术**（`pet/`、`sources/`、`previews/`、`docs/design-sheet.png`）—— CC BY-NC 4.0，见
  [LICENSE-ART](LICENSE-ART)。可以改、可以放进自己的桌宠、可以做直播挂件，只要署名
  **「光国 / Guāngguó by 尼乾外道」**且不商用。

角色 © 尼乾外道。原创设定，与任何现有作品无关。商用（付费产品、广告、游戏内购素材）请先联系作者。

`patches/` 针对 [Hermes](https://github.com/NousResearch/hermes)（MIT）；它是可选项，
只想要图集的人完全可以忽略。

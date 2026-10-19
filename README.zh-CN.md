# 光国 · 九态桌宠图集

[English](README.md) · **简体中文**

白毛红瞳、戴黄色贝雷帽、穿宽袖羽织的 Q 版女仆长。这里放的是一个**手工调过的九行动作图集**，
加上组装它、校验它、预览它的整套 Python 工具。

格式与 [Hermes](https://github.com/NousResearch/hermes) 桌面端兼容；图集本身是普通 PNG，
任何引擎都能用。

![走路](previews/walk.gif) ![待机](previews/idle.gif) ![坐等](previews/sit-sway.gif)

| | |
|---|---|
| **图集** | 1536 × 1872 像素，8 列 × 9 行，单格 192 × 208 |
| **行序** | `idle` `running-right` `running-left` `waving` `jumping` `failed` `waiting` `running` `review` |
| **循环** | 每行一圈 1600 毫秒（`pet.json` 的 `loopMs`） |
| **格式说明** | [docs/format.md](docs/format.md) |
| **动作设计图** | [docs/design-sheet.png](docs/design-sheet.png) |
| **兼容性** | [docs/compatibility.md](docs/compatibility.md) |
| **许可证** | 代码 MIT · 美术 CC BY-NC 4.0（[详见](#许可证)） |

## 目录里有什么

```
pet/            spritesheet.png + pet.json          ← 拿来即用
demo/index.html                                      ← 浏览器里直接播（零依赖）
docs/           格式说明 · 制作笔记 · 兼容性 · 动作设计图
previews/       走路 / 待机 / 坐等 GIF，新旧对比图
scripts/        组装、校验、导 GIF、导 APNG、出设计图、坐等摇摆变形
sources/        原始单帧（走路 3 张、坐等 8 张、其它状态 5 张）
patches/        Hermes 桌面端补丁（点一下挥手 / 干活时坐等）— 可选
```

## 快速开始

**先看它动起来**

```bash
cd guangguo-sprite
python -m http.server 8899
# 浏览器打开 http://127.0.0.1:8899/demo/index.html
```

点一下角色，她会挥手。之所以要起个本地服务，是因为 demo 要读像素来数每行帧数，
`file://` 协议下 canvas 会被浏览器判为污染。

**在自己的程序里用**

只有三条规矩：单格 192 × 208、行序固定、**每行末尾没用的格子全透明**。
播一行就是按 `x = 帧序号 * 192` 依次取格，帧数 = 该行开头连续非透明格子的个数。
`docs/format.md` 里有一份可以直接粘的 JS 播放器。

**从原始单帧重建图集**

```bash
pip install -r scripts/requirements.txt
cd scripts
python build_atlas.py ../sources ../out --loopms 1600
python verify_atlas.py ../out/spritesheet.png ../out/row
```

`build_atlas.py` 是确定性的：从 `sources/` 重建出的图集与 `pet/spritesheet.png`
**逐字节相同**（md5 `bb63c2b4d639c3a48289a822e02c9b42`）。改完任何东西，跑这一条就知道有没有跑偏。

## 可直接运行的桌宠插件（可选）

`plugin/` 是一个独立桌宠程序，播放的就是本仓库这套图集——行为和 Hermes 版一致（待机 / 走路 /
点击挥手 / agent 忙碌时坐等 / 出错状态 / 空闲自己溜达），不依赖任何宿主软件。

```bash
cd plugin
node src/launch.js          # 直接跑
node src/selftest.js out/   # 重新生成五张状态截图和帧条
```

- **尺寸**：右键 → 尺寸 → 75% / 100% / 150% / 200% / 250%（默认 100% 即 192×208，记在
  `%APPDATA%\guangguo-pet\settings.json`）
- **拖动**：按住左键移动；位移小于 6px 算点击（挥手），不算拖动。**拖起来松手只下坠身高 21%（约 44px）就站住**，
  不会一路滑到底；底边只是硬下限。之后她就在这条"落脚线"上走动，位置由你定
- **空闲漫游**：停顿 2.5–6 秒后随机走动或原地起跳，忙碌/拖拽时不动
- **关掉怎么找回来**：托盘图标单击显隐（右键可换尺寸、退出）；再次双击 `启动光国.vbs` 会唤回已有窗口
  （单实例锁），不会开第二个；在 Codex / DSH 里让 agent 调 `guangguo_show` 也能拉起来
- **忙碌判定**：只读会话目录的 `mtime`，从不读内容
- **不联网**：无任何网络请求，不含账单/鉴权代码
- **依赖**：Node 20+ 和一个 Electron 可执行文件（启动器自己找，不下载）

也能作为 Codex / DeepSeek Harness 插件运行，入口是 `.codex-plugin/plugin.json` 与 `.mcp.json`
（只读工具 `guangguo_status`、`guangguo_show`）。

## 兼容性

| 宿主 | 能不能用 | 怎么用 |
|---|---|---|
| **Hermes** 桌面端 | ✅ 原生 | `pet/` 整个丢进 `pets/guangguo/`。有状态联动：agent 干活时坐着等，点一下挥手 |
| **Codex** 桌面端 | ✅ 经桌宠插件 | 把某个状态导成 APNG，再从插件素材库导入当角色（见下） |
| **DeepSeek Harness** | ✅ 经**同一套**桌宠插件 | 路径完全一样——它读的就是同一份 `.agents/plugins/marketplace.json` |
| 其它程序 | ✅ 自己接 | `demo/index.html` 的播放逻辑约 40 行 |

Codex 和 DeepSeek Harness 答案一样，因为**桌宠是插件的功能，不是宿主的功能**：
两者都加载 `.codex-plugin/plugin.json` + `.mcp.json` + `.agents/plugins/marketplace.json`，
而桌宠窗口是插件自己开的 Electron 置顶窗。

这些插件只收 `png / apng / gif`（单边 ≤4096、≤600 帧），所以 8 × 9 图集**不能直接拖进去**，
要按状态导出：

```bash
python scripts/export_apng.py pet/spritesheet.png waiting out/waiting.png --scale 2
# → 384×416，8 帧，每帧 200ms，RGBA 半透明完整保留
```

用 APNG 不用 GIF，是因为发梢和袖口有约 17.5% 的半透明像素，GIF 的 1 位透明会糊出一圈白边。

**插件做不到的**：它只播一张循环动图，不会因为宿主在干活就换姿势；状态联动的只有 Hermes。
完整矩阵和核实依据见 [docs/compatibility.md](docs/compatibility.md)。

## 怎么做的

角色设定、逐帧要求，以及每个选择背后的「为什么」，都在
[docs/making-of.md](docs/making-of.md)。

一句话版：帧是一张一张用图像模型链式改出来的（永远拿上一帧当输入，绝不重画），
再用这里的 Python 工具组装；走路从 6 个关键帧砍到 4 个，因为多加的那两张「通过帧」
是所有变形穿帮的源头。

## 已知局限

- **`jumping` 是同一张静态图重复 5 格**——跳跃还没有动作。
- `running`（原地跑）在参考客户端里没被使用：agent 干活时改成坐等，游走用 `running-left/right`。
- 这套图集优先保证 192 像素下剪影干净，而不是动作花哨。它迈的是小步，不是大步流星。

## 许可证

- **代码**（`scripts/`、`demo/`、`patches/`）—— MIT，见 [LICENSE](LICENSE)。
- **美术**（`pet/`、`sources/`、`previews/`、`docs/design-sheet.png`）—— CC BY-NC 4.0，
  见 [LICENSE-ART](LICENSE-ART)。可以改、可以放进你自己的桌宠、可以拿去做直播挂件，
  只要署名「光国 / Guāngguó by 尼乾外道」，**别拿去卖**。商用请先联系作者。

角色形象 © 尼乾外道。原创设计，与任何已有作品无关。

`patches/` 里改的是 MIT 许可的 [Hermes](https://github.com/NousResearch/hermes)，
属于可选项，只想要图集的人可以完全无视它。

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

**给 Codex 的桌宠插件用**

```bash
python scripts/export_apng.py ../pet/spritesheet.png waiting ../out/waiting.png --scale 2
```

导出成透明 APNG 再从插件素材库导入。为什么不能直接给图集、为什么不用 GIF，
见 [docs/compatibility.md](docs/compatibility.md)。

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

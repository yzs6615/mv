# 世界上唯一的花 · 像素风 MV

《世界上唯一的花》（SMAP 2011 年中文版）的像素风 MV，4 分 37 秒。画面、动画、音效都是代码生成的，没有使用任何现成的素材图。

- 故事：灰色小镇里，所有人长得一样、笑得一样，连花都是一样的笑脸玫瑰。一个灰扑扑的小园丁捡到一颗无法识别的种子，被赛跑的人群裹挟着往前跑，后来转身离开赛道，把种子种在地图边缘的荒地上。种子发芽，周围恢复了颜色，挺过一场暴雨，长出一片花海，最后其他人也掏出了各自藏着的种子。分镜见 [STORYBOARD.md](STORYBOARD.md)。
- 重复的段落画面都不一样：两次导歌分别是 Game Boy 绿色调的爬行比赛和褐色调的送子鸟，两次副歌分别是一个人种下种子和所有人一起种下。
- 2D 和 3D：像素画用 Canvas 2D 绘制。体素城市和花朵小岛用 three.js 渲染，伪 3D 赛道用 Mode-7 方式逐行采样。所有 3D 画面都会被量化回同一套 32 色调色板。
- 每一帧都是时间的纯函数，卡点精确到帧：歌词逐字出现，换场落在小节强拍上，片尾每一声「啦」都有人跳起来。

## 规格

| 项 | 值 |
|---|---|
| 原生分辨率 | 480×270，最近邻 4 倍放大到 1920×1080 |
| 帧率 | 60 fps |
| 色板 | ENDESGA-32 |
| 字体 | Fusion Pixel 12px / 8px（中文），Press Start 2P（英文） |
| 音效 | 约 80 种 8-bit 音效，由 numpy 用方波、三角波和噪声合成，旋律类音效在降 B 大调上 |

## 运行

本地文件不进 Git：`assets/song.mp3`（歌曲）和 `mg/data/lyrics.json`（逐字时间的歌词，由 `mg/tools/align_lyrics.py` 生成）。节拍数据 `mg/data/music_map.json` 已提交。

```bash
npm install
python3 -m http.server 8000             # 在仓库根目录
# 浏览器打开 http://localhost:8000/pixel/index.html ，点击或按空格播放，←/→ 快退快进，?t=90 从 90 秒开始

npm run pixel:cues                      # 导出音效提示表 -> pixel/build/cues.json
npm run pixel:sfx                       # 合成音效并与歌曲混音 -> pixel/build/audio/mix.wav
npm run pixel:render                    # 渲染成片 -> pixel/build/only_one_pixel_1080p60.mp4
node pixel/render.mjs --sheet 33,96.5,191 --name look     # 抽帧拼图 -> pixel/build/stills/look.png
node pixel/render.mjs --range 90:112                      # 渲染某一段（带音频）
node pixel/render.mjs --bench 53,214                      # 测每帧耗时
```

渲染时用无头 Chromium 绘制每一帧（WebGL 走 SwiftShader），把 RGBA 原始像素发给 Node，ffmpeg 先无损保存原生分辨率的分块，最后统一放大编码并合成音频。分块可以续跑，加 `--force` 重渲。

## 代码结构

```
pixel/
  index.html, src/main.js      播放器 / 渲染入口（window.PX）
  src/film.js                  时间轴：场景切换（溶解、马赛克、圆形、玻璃碎裂）、整数缩放、震屏、HUD 与歌词叠加
  src/lyrics.js                逐字歌词
  src/core/                    调色板与灰色世界、像素绘图、ASCII 精灵、像素字体、逐像素后期、three.js 工具
  src/art/                     角色骨架（园丁、市民、宝宝）、花、城市、花田、道具、HUD、特效
  src/scenes/                  14 个场景文件，按歌曲顺序排列
  tools/sfx.py                 8-bit 音效合成与混音
  render.mjs                   离线渲染
```

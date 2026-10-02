# 世界上唯一的花 · MG 动画 MV

《世界上唯一的花》（SMAP 2011 年中文版）的 MG 动画 MV。全片 4 分 37 秒，每一帧都由代码绘制，用的是 Canvas 2D。画面是时间的纯函数，所以卡点能精确到帧：歌词逐字落在演唱的那一刻，换场落在小节强拍上。

- 风格：「孔版纸艺花园」。米色纸张、墨蓝色描边、色块错开 1–2 像素的孔版套色效果、纸雕投影、颗粒。歌词用霞鹜文楷，英文用 Fraunces。
- 叙事：小种子「豆豆」从被种下、被风吹走，到害怕比别人慢、开出自己的花，再把新的种子交给下一个人。完整分镜见 [STORYBOARD.md](STORYBOARD.md)。
- 片中出现的 3142 朵花，每一朵都由各自的种子数生成，没有两朵完全相同。片尾字幕里的这个数字是程序统计出来的。

## 观看与渲染

本地文件不进 Git，需要先放好：

| 文件 | 说明 |
|---|---|
| `assets/song.mp3` | 歌曲音频 |
| `mg/data/lyrics.txt` | 校对后的歌词文本（格式见下文） |
| `mg/data/lyrics.json` | 带逐字时间的歌词，由 `tools/align_lyrics.py` 生成 |

缺了歌词文件也能运行，只是画面上没有歌词。

**浏览器实时播放**（画面跟着音频走）：

```bash
python3 -m http.server 8000          # 在仓库根目录运行
# 打开 http://localhost:8000/mg/index.html ，点击或按空格播放，←/→ 快退快进 5 秒，?t=90 从 90 秒开始
```

**离线渲染**（Node + Skia，多进程，每帧原始像素直接送进 ffmpeg）：

```bash
npm install
pip install fonttools brotli && npm run mg:fonts      # 只需一次：给 Node 生成整套字体文件
npm run mg:preview                                   # 960×540 / 30fps 预览，约 4 分钟
npm run mg:render                                    # 1920×1080 / 60fps 成片 → mg/build/only_one_1080p60.mp4
node mg/render.mjs --times 12.6,96.4,207.5 --sheet look   # 抽帧看图，输出到 mg/build/stills/look/sheet.jpg
node mg/render.mjs --range 90:112 --scale 0.5 --fps 30     # 渲染某一段，带对应的音频
```

分块渲染可以续跑：已经渲好的块会跳过，加 `--force` 才会重渲。

## 歌词与节拍是怎么得到的

1. `tools/transcribe.py`：用 UVR MDX-Net 分离人声，Silero VAD 切句，SenseVoice 识别歌词并给出每个字的时间戳。模型都来自 sherpa-onnx 的 GitHub release，全程离线。
2. 唱歌时声调会丢失，识别结果里有同音错字。我用 Paraformer 和 FireRedASR 两个模型交叉核对，再结合网上公开的歌词片段，把文本校对后写进 `mg/data/lyrics.txt`。格式是：`# 段落名`，每行一句，空格表示视觉断句，`=段落名` 表示重复某一段。
3. `tools/align_lyrics.py`：把校对后的文本对齐回识别时间戳，再把每个字吸附到最近的人声起音点，生成 `lyrics.json`。片尾「啦啦啦」的每个音节也一并记录。
4. `tools/analyze_music.py`：拟合出固定 99 BPM 的节拍网格（误差中位数约 4 ms），标出小节（间奏多出半小节，主歌二起小节线后移两拍）、段落、响度包络、人声音高，写进 `mg/data/music_map.json`（这个文件会提交）。

## 代码结构

```
mg/
  index.html, src/main.js     播放器 / 渲染入口
  render.mjs, render_worker.mjs   离线渲染（主进程分块，worker 用 Skia 画并管道给 ffmpeg）
  src/core/                   数学与缓动、节拍时钟、相机、绘制工具（孔版描边）、动态字幕、纸张与颗粒
  src/art/                    花朵生成器、豆豆、小镇与花店、星球、道具、天气与粒子
  src/scenes/                 九个场景，一个文件一段，靠形状衔接和推拉镜头连成一个长镜头
  tools/                      人声分离与识别、歌词对齐、音乐分析、字体
```

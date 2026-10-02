# 发布文案 · LOVE STORY 永恒协议版

## 标题（三选一，推荐第一个）

1. **用终端字符重做《Love Story》：两段代码在第 94 小节转调时，改写了整个母体**
2. 《爱情故事 · 永恒协议》—— 只读进程 × 未签名补丁，一次未经授权的握手
3. LOVE STORY · 终端 ASCII 音乐视频 | Core_Juliet 与 Patch_Romeo 的 4 分钟

## 简介

一支完全由代码生成、在终端里实时播放的《Love Story》音乐视频。没有人脸，没有建模，画面全部是 ASCII、制表符和盲文点阵。

故事设定在一个被严格规则统治的数字母体里。女主 Core_Juliet 是核心内存区的只读进程，驻留在高耸的只读金字塔顶端，被协议永久锁定；
男主 Patch_Romeo 是底层沙盒里一段未签名的开源补丁，在防火墙眼里是随时会被垃圾回收的"入侵异常"。他伪装成一个无害的 ping 穿过
总线大厅，两人完成了一次未经母体认证的握手。然后是 Master_Firewall 的满屏 Access Denied、深夜巡逻线下的字节序列"小石子"、
端口 1989、废弃扇区、被扫描束一次次穿过的两人、深渊、Connection Lost、死锁沼泽、ALIVE_FLAG 归零——直到第 94 小节升调的那一拍，
母体的天空像玻璃一样碎裂，Romeo 带着 root 权限的金色光环降临，所有红色警告被绿色的 Override Successful 覆盖。
最后一幕是一张立起来的 git 分支图：两条分支把整个故事当作提交回放，在 `merge: Eternity Protocol` 汇合，金色和蓝色一起变成一种新的颜色。

角色是"颜文字 + 符号肢体 + 光粒"的符号人：`(^_^)` `(>_<)` `(T_T)` 是表情，`/--|--\` 是手臂，随拍蹦跳是高兴，十六分音符发抖是害怕，
整屏抖动是警报。画面严格对齐歌曲的 119 BPM 节拍网格，副歌每两小节切一次图形，每个底鼓打一次光，转调一拍不差。

屏幕各处始终有 5 到 12 个彩蛋在冒出来：系统弹窗、路过的 NPC 小人、代码注释、ASCII 印章、示波器 / 生命游戏 / 乒乓 / 月相 / 中文数字雨
这样的迷你面板，一共 100 多种，每次换一个 `--seed` 就是一套新组合——每次看都有新发现。

全片不出现任何歌词，所有屏幕文字都是原创。音乐：Taylor Swift《Love Story》。画面：Python 标准库，在你的终端里就能跑：
`python3 tui/lovestory.py --audio love_story.flac`。

## 标签

终端 / ASCII / 代码艺术 / 音乐视频 / Love Story / Taylor Swift / 程序员 / 赛博 / 彩蛋 / 节拍同步 / Python

## 封面

`release/cover.png`（1600×900）。由 `tui/matrix/cover.py` 用视频同一套字符世界渲染：左边冷蓝母体里的 Romeo，右边碎裂后的白色世界里
塔顶的 Juliet，中间一次握手；标题 LOVE STORY · 永恒协议。重新生成：

```bash
LS_CJK_FONT=/path/to/NotoSansCJKsc-Regular.otf python3 tui/matrix/cover.py release/cover.png
```

#!/usr/bin/env python3
"""Render the cover image for the Eternity Protocol edition: one frame composed from the same primitives as the video.

    LS_CJK_FONT=/path/to/NotoSansCJKsc-Regular.otf python3 tui/matrix/cover.py release/cover.png
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from core import Canvas, Music, GREY, big_text, big_width, data_path, mix, scale  # noqa: E402
from story import big_zh, big_zh_width, draw_hud  # noqa: E402
from matrix import scenes as sc, eggs as eg  # noqa: E402
from lovestory import Raster  # noqa: E402


def compose(cols=160, rows=45):
    m = Music(data_path('music_map.json'))
    t = m.bar(94) + 0.3                                   # the HUD shows the key change
    cv = Canvas(cols, rows)
    S = sc.Ctx(cv, m, t)
    W, H = S.W, S.H
    eg.set_seed(1989)
    # the cold matrix
    lanes = [int(3 + i * (H - 6) / 9) for i in range(10)]
    sc.streams(S, lanes, speed=20, alpha=0.55, packets=4)
    sc.code_rain(S, density=0.28)
    sc.threads(S, [lanes[6] - 1, lanes[8] - 1], 4, 26, alpha=0.5)
    # the read-only pyramid on the right; the white world has already opened around it
    px = W * 0.80
    top, _ = sc.pyramid(S, px, H - 1, int(H * 0.56), glow=0.35)
    S.white_c, S.white = (W * 1.02, H * 0.52), W * 0.36
    # title block
    x0 = 5
    big_text(cv, x0, 3, 'LOVE STORY', mix(sc.GOLD, sc.WHITE, 0.25), shadow=scale(sc.GOLD, 0.3))
    big_zh(cv, x0, 10, '永恒协议', sc.UNION_NEW, size=16, clear=False)
    cv.text(x0 + big_zh_width('永恒协议') + 3, 14, 'Eternity Protocol', scale(sc.UNION_NEW, 0.8))
    cv.text(x0, 19, '两段代码 · 一个心跳', sc.SILVER)
    cv.text(x0, 20, 'Core_Juliet ♀  ×  Patch_Romeo ♂', mix(sc.JULIET, sc.ROMEO, 0.5))
    cv.text(x0, 22, '终端 ASCII 音乐视频 · 119 bpm · 第 94 小节转调 · 100+ 彩蛋', scale(GREY, 1.0))
    cv.text(x0, 23, 'python3 tui/lovestory.py --audio love_story.flac', scale(sc.GREEN, 0.8))
    # the two, reaching across the crack between the worlds
    rx, ry = W * 0.42, H * 0.74
    jx, jy = px, top - 5
    sc.romeo(S, rx, ry, face='love', pose='reach_r', heading=(1.0, -0.3), halo=0.8, col=mix(sc.ROMEO, sc.WHITE, 0.25))
    # the boundary between the worlds is shattered glass
    sc.cracks(S, W * 0.70, H * 0.45, 0.55, col=mix(sc.WHITE, sc.GOLD, 0.4), n=7, seed=3)
    sc.juliet(S, jx, jy, face='love', pose='reach_l')
    S.br.line(rx * 2 + 10, ry * 4, jx * 2 - 10, (jy + 1) * 4, scale(mix(sc.ROMEO, sc.JULIET, 0.5), 0.8), step=1.6)
    mx, my = (rx + jx) / 2, (ry + jy) / 2
    cv.put(mx, my - 1, '♥', sc.UNION_NEW)
    cv.text(mx - 5, my + 1, 'SYN → ← ACK', scale(sc.UNION_NEW, 0.9))
    # a taste of the easter eggs
    eg.popup_box(S, W * 0.44, 4, 30, 3, 'achievement', eg.GOLD, 1.0)
    cv.text(W * 0.44 + 2, 5, '成就解锁：第一次握手 ✓', mix(eg.GOLD, sc.WHITE, 0.5))
    cv.text(W * 0.44 + 2, 6, '稀有度 0.01%', mix(eg.GOLD, sc.WHITE, 0.5))
    cv.text(W * 0.46, 9, '<(^_^<)  kirby_thread', eg.MAGENTA)
    cv.text(W * 0.03, 37, '// 换个 --seed 再看一遍', eg.GREEN)
    cv.text(W * 0.26, 25, '# 1989 = 13 × 153', scale(eg.GREEN, 0.8))
    cv.text(W * 0.06, 27, 'WARNING: Access Denied', scale(sc.RED, 0.8))
    cv.text(W * 0.10, 33, 'Override Successful ✓', sc.GREEN)
    # finish like a real frame
    S.br.draw(cv)
    sc.whiten(S, S.white_c[0], S.white_c[1], S.white)
    draw_hud(S)
    cv.fill(0, cv.h - 3, cv.w - 1, cv.h - 2, ' ', None)
    cv.put(2, cv.h - 3, '▌', mix(sc.JULIET, sc.ROMEO, 0.5))
    cv.text(4, cv.h - 3, '未经母体认证的初次握手：SYN，SYN-ACK。冰冷的只读空间里，第一次泛起金色的涟漪。', (236, 240, 248))
    cv.text(4, cv.h - 2, 'an unauthenticated first handshake · the first golden ripple in a read-only world', scale(GREY, 0.85))
    sc.status_bar(S)
    return cv


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else 'release/cover.png'
    cv = compose()
    img = Raster(cv.w, cv.h, 16).image(cv)
    img.save(out)
    print('wrote', out, img.size)


if __name__ == '__main__':
    main()

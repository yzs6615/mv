#!/usr/bin/env python3
"""Pre-render the big Chinese block letters used on screen into tui/data/glyphs.json.

Runtime stays standard-library only: this script needs Pillow and a CJK font (build time only).

    python3 tui/make_glyphs.py --font /path/to/NotoSansCJKsc-Regular.otf
"""
import argparse
import json
import os

CHARS = ('爱情故事终端版初见靠近阻隔秘密相逃离等待失落重逢承诺圆满拒绝已连接转调允许禁止永不断开'
         '访问被信号握手心跳两个进程之间的同一退出状态码零第小节升全音回答是支舞')


def render(font_path, size, thresh):
    from PIL import Image, ImageDraw, ImageFont
    font = ImageFont.truetype(font_path, size)
    out = {}
    for ch in CHARS:
        im = Image.new('L', (size, size), 0)
        ImageDraw.Draw(im).text((0, 0), ch, font=font, fill=255, anchor='lt')
        px = im.load()
        rows = []
        for y in range(size):
            rows.append(''.join('#' if px[x, y] >= thresh else '.' for x in range(size)))
        out[ch] = rows
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--font', default=os.environ.get('LS_CJK_FONT', ''))
    ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'glyphs.json'))
    a = ap.parse_args()
    if not a.font or not os.path.exists(a.font):
        raise SystemExit('need --font (or LS_CJK_FONT) pointing at a CJK font file')
    data = {'16': render(a.font, 16, 110), '12': render(a.font, 12, 100)}
    with open(a.out, 'w') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print('wrote', a.out, len(CHARS), 'chars')


if __name__ == '__main__':
    main()

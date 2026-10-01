#!/usr/bin/env python3
"""Contact sheet for QA: sheet.py out.jpg img1@label img2@label ..."""
import sys
from PIL import Image, ImageDraw, ImageFont

out, items = sys.argv[1], sys.argv[2:]
imgs = []
for it in items:
    p, _, label = it.rpartition('@')
    imgs.append((Image.open(p).convert('RGB'), label))
tw = 640
th = int(tw * imgs[0][0].height / imgs[0][0].width)
cols = 3 if len(imgs) > 4 else 2 if len(imgs) > 1 else 1
rows = (len(imgs) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw, rows * (th + 22)), (20, 20, 20))
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 15)
except Exception:
    font = ImageFont.load_default()
for i, (im, label) in enumerate(imgs):
    x, y = (i % cols) * tw, (i // cols) * (th + 22)
    sheet.paste(im.resize((tw, th), Image.LANCZOS), (x, y + 22))
    d.text((x + 6, y + 3), f't={label}s', fill=(230, 230, 230), font=font)
sheet.save(out, quality=88)
print('sheet', out, sheet.size)

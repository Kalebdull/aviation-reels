#!/usr/bin/env python3
"""sheet.py — contact sheet from stills, with Instagram UI zones outlined.   python3 scripts/sheet.py out.png a.png b.png ..."""
import os, re, sys
from PIL import Image, ImageDraw, ImageFont

out, files = sys.argv[1], sys.argv[2:]
W, H, cols, gap = 270, 480, min(6, max(1, len(files))), 10
rows = (len(files) + cols - 1) // cols
S = Image.new('RGB', (cols * W + (cols - 1) * gap, rows * (H + 26) + (rows - 1) * gap), '#161616')
d = ImageDraw.Draw(S)
fnt = next((ImageFont.truetype(f, 15) for f in ['/System/Library/Fonts/Supplemental/Arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'] if os.path.exists(f)), ImageFont.load_default())
k = W / 1080
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB').resize((W, H), Image.LANCZOS)
    x, y = (i % cols) * (W + gap), (i // cols) * (H + 26 + gap)
    S.paste(im, (x, y))
    # Instagram overlays: top bar, bottom caption area, right action rail
    for box in [(0, 0, 1080, 220), (0, 1500, 1080, 1920), (920, 900, 1080, 1500)]:
        d.rectangle([x + box[0] * k, y + box[1] * k, x + box[2] * k, y + box[3] * k], outline=(255, 70, 110), width=1)
    m = re.search(r'([\d.]+)s\.png$', f)
    d.text((x + 4, y + H + 5), f"{m.group(1) if m else os.path.basename(f)} s", fill='#bbbbbb', font=fnt)
S.save(out)
print('sheet →', out)

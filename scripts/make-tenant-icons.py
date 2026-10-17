"""Renders placeholder app icons and splash marks from tenant brand colour + monogram.

Real tenants upload their own 1024x1024 icon (W-1); this keeps demo tenants buildable.
Usage: pnpm icons   (reads packages/core/src/demo-tenants.json on stdin)
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.path.join(ROOT, 'node_modules/@expo-google-fonts/barlow-condensed/700Bold/BarlowCondensed_700Bold.ttf')

tenants = list(json.loads(sys.stdin.read()).values())

for t in tenants:
    out = os.path.join(ROOT, 'apps/client/assets/tenants', t['slug'])
    os.makedirs(out, exist_ok=True)
    # Icon: brand field, paper-coloured monogram, short chalk stroke underneath. No transparency.
    img = Image.new('RGB', (1024, 1024), t['brandColor'])
    d = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT, 470)
    text = t['coach']['monogram']
    box = d.textbbox((0, 0), text, font=font)
    w, h = box[2] - box[0], box[3] - box[1]
    d.text(((1024 - w) / 2 - box[0], (1024 - h) / 2 - box[1] - 40), text, font=font, fill='#F3EFE7')
    d.line([(300, 760), (520, 748), (724, 738)], fill='#F3EFE7', width=26, joint='curve')
    img.save(os.path.join(out, 'icon.png'))
    # Splash mark: monogram in brand colour on transparent background.
    sp = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
    d = ImageDraw.Draw(sp)
    font = ImageFont.truetype(FONT, 260)
    box = d.textbbox((0, 0), text, font=font)
    w, h = box[2] - box[0], box[3] - box[1]
    d.text(((512 - w) / 2 - box[0], (512 - h) / 2 - box[1]), text, font=font, fill=t['brandColor'])
    sp.save(os.path.join(out, 'splash.png'))
    print('wrote', out)

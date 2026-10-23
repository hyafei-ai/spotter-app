"""Renders placeholder app icons and splash marks from tenant brand colour + monogram, and the watch icon set.

Real tenants upload their own 1024x1024 icon (W-1); this keeps demo tenants buildable.
Usage:
  pnpm icons                                    (reads packages/core/src/demo-tenants.json on stdin; phone + watch)
  python3 scripts/make-tenant-icons.py --watch <slug> [<slug> ...]
      Watch icons only, resized from apps/client/assets/tenants/<slug>/icon.png (the tenant's own icon).
      scripts/tenant-build.mjs runs this before every iOS build with the watch, so each trainer's watch app
      gets their icon at every watchOS size (sizes: apps/client/plugins/watch/watch-icon-sizes.json).
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.path.join(ROOT, 'node_modules/@expo-google-fonts/barlow-condensed/700Bold/BarlowCondensed_700Bold.ttf')
SIZES = os.path.join(ROOT, 'apps/client/plugins/watch/watch-icon-sizes.json')


def tenant_dir(slug):
    return os.path.join(ROOT, 'apps/client/assets/tenants', slug)


def watch_icons(slug):
    """Every watchOS icon size from the tenant's 1024 icon. Opaque RGB: watchOS masks it to a circle."""
    src = os.path.join(tenant_dir(slug), 'icon.png')
    if not os.path.exists(src):
        sys.exit(f'{slug}: no icon at {src}')
    icon = Image.open(src).convert('RGB')
    out = os.path.join(tenant_dir(slug), 'watch')
    os.makedirs(out, exist_ok=True)
    for px in sorted({img['px'] for img in json.load(open(SIZES))['images']}):
        icon.resize((px, px), Image.LANCZOS).save(os.path.join(out, f'icon-{px}.png'))
    print('wrote', out)


def placeholder(t):
    out = tenant_dir(t['slug'])
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


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--watch':
        for slug in sys.argv[2:]:
            watch_icons(slug)
    else:
        for t in json.loads(sys.stdin.read()).values():
            placeholder(t)
            watch_icons(t['slug'])

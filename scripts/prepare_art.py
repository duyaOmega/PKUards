"""Convert generated originals into small WebP delivery assets; no packages installed."""
import argparse
import json
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--manifest', type=Path, required=True, help='JSON array of id/source records from image generation')
parser.add_argument('--width', type=int, default=960, help='Delivery width in pixels, default 960')
parser.add_argument('--quality', type=int, default=84, help='WebP quality, 1–100')
args = parser.parse_args()
if not 320 <= args.width <= 1920 or not 1 <= args.quality <= 100:
    parser.error('width must be 320–1920 and quality 1–100')
destination = Path(__file__).resolve().parents[1] / 'web' / 'assets' / 'art'
destination.mkdir(parents=True, exist_ok=True)
for record in json.loads(args.manifest.read_text(encoding='utf-8')):
    identifier = record['id']
    if not identifier.replace('-', '').isalnum():
        raise ValueError('Invalid asset identifier')
    with Image.open(record['source']) as original:
        image = original.convert('RGB')
        image.thumbnail((args.width, args.width), Image.Resampling.LANCZOS)
        target = destination / (identifier + '.webp')
        image.save(target, 'WEBP', quality=args.quality, method=6)
        print(f'{identifier}: {image.width}x{image.height}, {target.stat().st_size // 1024} KiB')

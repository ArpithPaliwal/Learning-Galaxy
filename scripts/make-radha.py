"""Make a Radha companion sprite sheet from the Krishna pet sheet (same pixel-art style, same 9 animation rows).
Hue remap: blue skin -> warm fair skin, yellow/orange dhoti -> rose-pink lehenga, green peacock feather -> red flower,
plus a small red bindi. Output: <out>/spritesheet.webp + pet.json (petdex layout, 192x208 frames, 8 cols x 9 rows)."""
import colorsys, json, os, sys
from PIL import Image

SRC = os.path.join(os.environ["LOCALAPPDATA"], "hermes", "pets", "krishna", "spritesheet.webp")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ["LOCALAPPDATA"], "hermes", "pets", "radha")
W, H = 192, 208

im = Image.open(SRC).convert("RGBA")
px = im.load()
out = Image.new("RGBA", im.size)
po = out.load()

def remap(r, g, b):
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    hd = h * 360
    if v < 0.22 or s < 0.12:                      # hair, outlines, whites: keep
        return r, g, b
    if 180 <= hd <= 260 and v < 0.58:             # dark blue hair highlights / shadows -> soft black-brown hair
        return tuple(round(c * 255) for c in colorsys.hsv_to_rgb(18 / 360, 0.45, v * 0.62))
    if 180 <= hd <= 250:                          # Krishna's blue skin -> warm fair skin
        nv = min(1.0, 0.55 + v * 0.48)
        return tuple(round(c * 255) for c in colorsys.hsv_to_rgb(24 / 360, min(0.42, 0.18 + s * 0.35), nv))
    if 25 <= hd <= 62:                            # yellow / orange dhoti -> rose-pink lehenga
        return tuple(round(c * 255) for c in colorsys.hsv_to_rgb(335 / 360, min(1, s * 0.95 + 0.1), v * 0.95))
    if 62 < hd < 180:                             # green peacock feather -> red-pink flower
        return tuple(round(c * 255) for c in colorsys.hsv_to_rgb(350 / 360, min(1, s + 0.15), min(1, v * 1.05)))
    if 0 <= hd < 25 or hd > 330:                  # existing reds/oranges -> deeper red (bindi/accents)
        return tuple(round(c * 255) for c in colorsys.hsv_to_rgb(350 / 360, s, v))
    return r, g, b

for y in range(im.size[1]):
    for x in range(im.size[0]):
        r, g, b, a = px[x, y]
        po[x, y] = (*remap(r, g, b), a) if a else (0, 0, 0, 0)

os.makedirs(OUT, exist_ok=True)
out.save(os.path.join(OUT, "spritesheet.webp"), lossless=True)
json.dump({"id": "radha", "displayName": "Radha",
           "description": "Radha, Krishna's companion: made from the Krishna pet sheet (same style and animations).",
           "spritesheetPath": "spritesheet.webp"}, open(os.path.join(OUT, "pet.json"), "w"), indent=2)
out.crop((0, 0, W * 4, H * 2)).save(os.path.join(os.environ.get("TMPDIR", "."), "radha_preview.png"))
print("ok", out.size, OUT)

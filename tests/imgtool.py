"""Checker image helper (Pillow). Run with: uv run --with pillow python tests/imgtool.py <cmd> ...

Commands:
  info   IMG                                  -> {"width","height"}
  crop   IMG OUT X Y W H                      (pixel coords)
  colorfrac IMG X Y W H R G B TOL             -> fraction of pixels within TOL of (R,G,B) per channel
  meancolor IMG X Y W H                       -> mean RGB of the region
  sidebyside REF GLINT OUT [--height H]       -> Reference left, Glint right, same height, labelled
"""
import argparse
import json
import sys

from PIL import Image, ImageDraw, ImageFont


def load(p):
    return Image.open(p).convert("RGB")


def cmd_info(a):
    im = load(a.img)
    print(json.dumps({"width": im.width, "height": im.height}))


def box(a, im):
    x, y, w, h = int(a.x), int(a.y), int(a.w), int(a.h)
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(im.width, x + w), min(im.height, y + h)
    return x0, y0, x1, y1


def cmd_crop(a):
    im = load(a.img)
    im.crop(box(a, im)).save(a.out)
    print(json.dumps({"out": a.out}))


def cmd_colorfrac(a):
    im = load(a.img).crop(box(a, load(a.img)))
    px = list(im.get_flattened_data()) if hasattr(im, "get_flattened_data") else list(im.getdata())
    tgt = (a.r, a.g, a.b)
    n = sum(1 for p in px if all(abs(p[i] - tgt[i]) <= a.tol for i in range(3)))
    print(json.dumps({"fraction": n / max(1, len(px)), "pixels": len(px)}))


def cmd_meancolor(a):
    im = load(a.img).crop(box(a, load(a.img)))
    px = list(im.get_flattened_data()) if hasattr(im, "get_flattened_data") else list(im.getdata())
    m = [round(sum(p[i] for p in px) / max(1, len(px)), 1) for i in range(3)]
    print(json.dumps({"mean": m, "pixels": len(px)}))


def font(size):
    for p in ["/System/Library/Fonts/SFNS.ttf", "/System/Library/Fonts/Helvetica.ttc", "/Library/Fonts/Arial.ttf"]:
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            pass
    return ImageFont.load_default()


def cmd_sidebyside(a):
    ref, gl = load(a.ref), load(a.glint)
    h = a.height or max(ref.height, gl.height)
    ref = ref.resize((round(ref.width * h / ref.height), h), Image.LANCZOS)
    gl = gl.resize((round(gl.width * h / gl.height), h), Image.LANCZOS)
    pad, label_h = 24, 64
    W = ref.width + gl.width + pad * 3
    H = h + label_h + pad
    out = Image.new("RGB", (W, H), (255, 255, 255))
    d = ImageDraw.Draw(out)
    f = font(40)
    d.text((pad, 12), "Reference", fill=(20, 20, 20), font=f)
    d.text((pad * 2 + ref.width, 12), "Glint", fill=(20, 20, 20), font=f)
    out.paste(ref, (pad, label_h))
    out.paste(gl, (pad * 2 + ref.width, label_h))
    out.save(a.out)
    print(json.dumps({"out": a.out, "width": W, "height": H}))


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = p.add_subparsers(dest="cmd")
    s = sp.add_parser("info"); s.add_argument("img"); s.set_defaults(fn=cmd_info)
    s = sp.add_parser("crop"); [s.add_argument(k) for k in ["img", "out", "x", "y", "w", "h"]]; s.set_defaults(fn=cmd_crop)
    s = sp.add_parser("colorfrac"); [s.add_argument(k) for k in ["img", "x", "y", "w", "h"]]
    [s.add_argument(k, type=int) for k in ["r", "g", "b", "tol"]]; s.set_defaults(fn=cmd_colorfrac)
    s = sp.add_parser("meancolor"); [s.add_argument(k) for k in ["img", "x", "y", "w", "h"]]; s.set_defaults(fn=cmd_meancolor)
    s = sp.add_parser("sidebyside"); [s.add_argument(k) for k in ["ref", "glint", "out"]]
    s.add_argument("--height", type=int, default=0); s.set_defaults(fn=cmd_sidebyside)
    a = p.parse_args()
    if not a.cmd:
        p.print_help()
        sys.exit(1)
    a.fn(a)


if __name__ == "__main__":
    main()

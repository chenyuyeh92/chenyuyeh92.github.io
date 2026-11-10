#!/usr/bin/env python3
"""把樂譜 PDF 轉成網站用的預覽圖：前幾行清楚，其餘直接在像素上打馬賽克。

用法：
  python3 tools/make-preview.py 樂譜.pdf love-like-you
  python3 tools/make-preview.py 樂譜.pdf love-like-you --keep 4 --out sheet-music/img
  python3 tools/make-preview.py 樂譜.pdf love-like-you --cut 1:0.62   # 自動抓錯時：第 1 頁 62% 高度以下打馬賽克

需要：poppler（pdftoppm）、Pillow。
完整 PDF 不要放進 git（.gitignore 已排除 *.pdf）。
"""
import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

DPI = 110
OUT_WIDTH = 900
MOSAIC_FACTOR = 12          # 縮到 1/12 再放大
DARK = 128                  # 灰階小於這個值算「有墨水」


def _dark_rows(gray):
    w, h = gray.size
    px = gray.load()
    return [sum(1 for x in range(w) if px[x, y] < DARK) for y in range(h)]


def _staff_lines(gray):
    """回傳每條譜線的 (y_top, y_bottom)：橫跨頁寬 40% 以上的深色列。"""
    w, _ = gray.size
    counts = _dark_rows(gray)
    lines, start = [], None
    for y, c in enumerate(counts + [0]):
        if c > 0.4 * w:
            if start is None:
                start = y
        elif start is not None:
            lines.append((start, y - 1))
            start = None
    return lines


def _staves(lines):
    """把譜線分組成五線譜，回傳 [(top, bottom), ...]。"""
    if len(lines) < 4:
        return []
    centers = [(a + b) / 2 for a, b in lines]
    gaps = sorted(centers[i + 1] - centers[i] for i in range(len(centers) - 1))
    unit = gaps[len(gaps) // 4]        # 譜線間距（取較小的那一群）
    groups, cur = [], [lines[0]]
    for prev, ln in zip(lines, lines[1:]):
        if (ln[0] + ln[1]) / 2 - (prev[0] + prev[1]) / 2 <= unit * 1.6:
            cur.append(ln)
        else:
            groups.append(cur)
            cur = [ln]
    groups.append(cur)
    return [(g[0][0], g[-1][1]) for g in groups if len(g) >= 4]


def _left_x(gray, y):
    w, _ = gray.size
    px = gray.load()
    for x in range(w):
        if px[x, y] < DARK:
            return x
    return 0


def _connected(gray, a, b):
    """兩個五線譜之間，左邊有沒有一條直線連起來（同一個大譜表）。"""
    px = gray.load()
    x0 = _left_x(gray, a[0])
    w, _ = gray.size
    for x in range(max(0, x0 - 4), min(w, x0 + 8)):
        span = range(a[1], b[0] + 1)
        dark = sum(1 for y in span if px[x, y] < DARK)
        if dark >= 0.95 * len(span):
            return True
    return False


def find_systems(img):
    """找出一頁裡每一行（大譜表）的 (top, bottom)，由上到下。標題、文字不算。"""
    gray = img.convert("L")
    staves = _staves(_staff_lines(gray))
    systems = []
    for st in staves:
        if systems and _connected(gray, systems[-1], st):
            systems[-1] = (systems[-1][0], st[1])
        else:
            systems.append(st)
    return systems


def _mosaic(img, top):
    w, h = img.size
    top = max(0, min(h, int(top)))
    if top >= h:
        return img
    region = img.crop((0, top, w, h))
    small = region.resize((max(1, w // MOSAIC_FACTOR), max(1, (h - top) // MOSAIC_FACTOR)),
                          Image.BILINEAR)
    img = img.copy()
    img.paste(small.resize(region.size, Image.NEAREST), (0, top))
    return img


def _mosaic_starts(pages, keep):
    """每一頁從哪個 y 開始打馬賽克（None = 這頁不打）。"""
    starts, seen = [], 0
    for pg in pages:
        systems = find_systems(pg)
        start = None
        for i, (top, bottom) in enumerate(systems):
            if seen + i == keep:
                if i == 0:
                    staff_h = (bottom - top) / 3
                    start = max(0, top - staff_h)
                else:
                    prev_bottom = systems[i - 1][1]
                    start = prev_bottom + 0.3 * (top - prev_bottom)   # 偏上一點，連第 5 行上方的和弦名稱也蓋住
                break
        if start is None and seen >= keep:
            start = 0
        seen += len(systems)
        starts.append(start)
    return starts


def apply_preview(pages, keep=4, cut=None):
    """前 keep 行保持原樣，之後全部打馬賽克。cut=(第幾頁, 高度比例) 手動指定起點。"""
    pages = [p.convert("RGB") for p in pages]
    if cut:
        cut_page, frac = cut
        starts = []
        for n, pg in enumerate(pages, start=1):
            if n < cut_page:
                starts.append(None)
            elif n == cut_page:
                starts.append(pg.size[1] * frac)
            else:
                starts.append(0)
    else:
        starts = _mosaic_starts(pages, keep)
    return [pg if s is None else _mosaic(pg, s) for pg, s in zip(pages, starts)]


def _font(size):
    for path in ("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
                 "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
                 "C:/Windows/Fonts/msjh.ttc",
                 "/System/Library/Fonts/PingFang.ttc"):
        if Path(path).exists():
            return ImageFont.truetype(path, size), "試看 Preview"
    return ImageFont.load_default(), "Preview"


def add_watermark(img, text=None):
    w, h = img.size
    font, default_text = _font(w // 12)
    text = text or default_text
    layer = Image.new("RGBA", (w, w // 6), (0, 0, 0, 0))
    ImageDraw.Draw(layer).text((w // 2, w // 12), text, font=font, anchor="mm",
                               fill=(120, 120, 120, 64))
    layer = layer.rotate(25, expand=True)
    base = img.convert("RGBA")
    for cy in (h // 3, 2 * h // 3):
        base.alpha_composite(layer, ((w - layer.size[0]) // 2, cy - layer.size[1] // 2))
    return base.convert("RGB")


def render_pdf(pdf):
    if not shutil.which("pdftoppm"):          # Windows 沒有 poppler 時改用 PyMuPDF（pip install pymupdf）
        import pymupdf
        doc = pymupdf.open(str(pdf))
        return [Image.frombytes("RGB", (p.width, p.height), p.samples)
                for p in (pg.get_pixmap(dpi=DPI) for pg in doc)]
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["pdftoppm", "-r", str(DPI), "-png", str(pdf), f"{tmp}/p"], check=True)
        files = sorted(Path(tmp).glob("p-*.png"), key=lambda p: int(p.stem.split("-")[-1]))
        return [Image.open(f).convert("RGB") for f in files]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf")
    ap.add_argument("name", help="輸出檔名開頭，例如 love-like-you")
    ap.add_argument("--keep", type=int, default=4, help="保留幾行清楚（預設 4）")
    ap.add_argument("--out", default="sheet-music/img")
    ap.add_argument("--cut", help="手動指定馬賽克起點，格式 頁:比例，例如 1:0.62")
    ap.add_argument("--watermark", help="浮水印文字，例如 \"Marco Yeh\"（預設「試看 Preview」）")
    args = ap.parse_args(argv)

    cut = None
    if args.cut:
        p, f = args.cut.split(":")
        cut = (int(p), float(f))

    pages = render_pdf(args.pdf)
    counts = [len(find_systems(p)) for p in pages]
    print(f"{len(pages)} 頁，每頁偵測到的行數：{counts}（共 {sum(counts)} 行）")
    if not cut and sum(counts) <= args.keep:
        sys.exit(f"只偵測到 {sum(counts)} 行，不到 {args.keep} 行，請用 --cut 手動指定。")

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for n, pg in enumerate(apply_preview(pages, args.keep, cut), start=1):
        pg = add_watermark(pg, args.watermark)
        pg = pg.resize((OUT_WIDTH, round(pg.size[1] * OUT_WIDTH / pg.size[0])), Image.LANCZOS)
        path = out / f"{args.name}-{n}.webp"
        pg.save(path, "WEBP", quality=80)
        print("寫出", path)


if __name__ == "__main__":
    main()

import importlib.util
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

spec = importlib.util.spec_from_file_location(
    "make_preview", Path(__file__).with_name("make-preview.py"))
mp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mp)

W, H = 900, 1270
LINE_GAP = 10          # 譜線間距
STAFF_H = 4 * LINE_GAP


def draw_staff(d, top, x0=60, x1=860):
    for i in range(5):
        y = top + i * LINE_GAP
        d.line([(x0, y), (x1, y)], fill=0, width=1)


def draw_system(d, top, x0=60):
    """畫一個大譜表：高音譜 + 低音譜，左邊一條直線連起來，加幾個音符。"""
    draw_staff(d, top, x0)
    bass_top = top + STAFF_H + 50
    draw_staff(d, bass_top, x0)
    d.line([(x0, top), (x0, bass_top + STAFF_H)], fill=0, width=2)
    for k in range(8):
        x = x0 + 60 + k * 90
        d.ellipse([x, top + 12 + (k % 3) * 5, x + 12, top + 20 + (k % 3) * 5], fill=0)
        d.ellipse([x, bass_top + 10, x + 12, bass_top + 18], fill=0)
    return top, bass_top + STAFF_H


def page(n_systems, first_top=150, title=False):
    img = Image.new("L", (W, H), 255)
    d = ImageDraw.Draw(img)
    if title:
        d.rectangle([350, 40, 550, 60], fill=0)   # 標題文字
    tops = []
    for i in range(n_systems):
        tops.append(draw_system(d, first_top + i * 220))
    return img.convert("RGB"), tops


def same(a, b, box):
    return ImageChops.difference(a.crop(box), b.crop(box)).getbbox() is None


def test_find_systems_synthetic():
    img, expected = page(5, title=True)
    got = mp.find_systems(img)
    assert len(got) == 5
    for (t, b), (et, eb) in zip(got, expected):
        assert abs(t - et) <= 2 and abs(b - eb) <= 2


def test_title_only_page_has_no_systems():
    img, _ = page(0, title=True)
    assert mp.find_systems(img) == []


def test_apply_preview_across_pages():
    p1, s1 = page(3, title=True)
    p2, s2 = page(3)
    out = mp.apply_preview([p1, p2], keep=4)
    assert len(out) == 2
    # 第 1 頁三行和標題都清楚
    assert same(out[0], p1, (0, 0, W, s1[2][1] + 5))
    # 第 2 頁第 1 行清楚，第 2 行開始被馬賽克
    assert same(out[1], p2, (0, 0, W, s2[0][1] + 5))
    assert not same(out[1], p2, (0, s2[1][0], W, s2[1][1]))
    assert not same(out[1], p2, (0, s2[2][0], W, s2[2][1]))


def test_fourth_system_is_last_on_page():
    p1, s1 = page(4)
    p2, s2 = page(2)
    out = mp.apply_preview([p1, p2], keep=4)
    assert same(out[0], p1, (0, 0, W, H))          # 第 1 頁完全不動
    assert not same(out[1], p2, (0, s2[0][0], W, s2[0][1]))  # 第 2 頁第 1 行就開始馬賽克


def test_manual_cut_overrides_detection():
    p1, _ = page(3)
    out = mp.apply_preview([p1], keep=4, cut=(1, 0.5))
    assert same(out[0], p1, (0, 0, W, int(H * 0.5) - 1))
    assert not same(out[0], p1, (0, int(H * 0.5), W, H))


def test_chord_symbols_above_fifth_system_are_hidden():
    p1, s1 = page(5)
    d = ImageDraw.Draw(p1)
    top5 = s1[4][0]
    d.rectangle([100, top5 - 55, 160, top5 - 40], fill=(0, 0, 0))   # 第 5 行上方的和弦名稱
    out = mp.apply_preview([p1], keep=4)
    assert not same(out[0], p1, (90, top5 - 55, 170, top5 - 47))
    assert same(out[0], p1, (0, 0, W, s1[3][1] + 15))   # 第 4 行下方加線音符還在

#!/usr/bin/env python3
"""Render the Storyman documentary-shorts template with Pillow.

All artwork is procedural. Source cards are text-only citations; no stock footage,
article screenshots, archival images or likenesses are reproduced.
"""
import argparse
import json
import math
import random
import re
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1080, 1920
PAD = 90
BW, BH = W + PAD * 2, H + PAD * 2
SAFE_X = 76
SAFE_RIGHT = W - 76

FONT_CANDIDATES = {
    'display': ['/System/Library/Fonts/Supplemental/Arial Black.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf'],
    'bold': ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf'],
    'regular': ['/System/Library/Fonts/Supplemental/Arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'],
    'serif': ['/System/Library/Fonts/Supplemental/Georgia Bold.ttf', '/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'],
    'serif_regular': ['/System/Library/Fonts/Supplemental/Georgia.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'],
    'mono': ['/System/Library/Fonts/Supplemental/Courier New Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf'],
}
FONT_PATHS = {}
for role, candidates in FONT_CANDIDATES.items():
    chosen = next((item for item in candidates if Path(item).exists()), None)
    if not chosen:
        raise RuntimeError(f'Install a TrueType font for the {role} typeface (Arial, Georgia or DejaVu).')
    FONT_PATHS[role] = chosen
_font_cache = {}


def font(role, size):
    key = (role, int(size))
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(FONT_PATHS[role], max(8, int(size)))
    return _font_cache[key]


def rgb(value):
    value = value.lstrip('#')
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))


def mix(a, b, t):
    return tuple(int(round(a[index] + (b[index] - a[index]) * t)) for index in range(3))


def vertical_gradient(size, top, bottom):
    width, height = size
    strip = Image.new('RGB', (1, height))
    pixels = strip.load()
    for y in range(height):
        pixels[0, y] = mix(top, bottom, y / max(1, height - 1))
    return strip.resize((width, height), Image.BILINEAR)


def text_width(draw, text, face, tracking=0):
    if not tracking:
        return draw.textlength(text, font=face)
    return sum(draw.textlength(char, font=face) + tracking for char in text) - tracking


def draw_tracked(draw, xy, text, face, fill, tracking=2, stroke_width=0, stroke_fill=None):
    x, y = xy
    for char in text:
        draw.text((x, y), char, font=face, fill=fill, stroke_width=stroke_width, stroke_fill=stroke_fill)
        x += draw.textlength(char, font=face) + tracking


def wrap(draw, text, face, max_width, max_lines=None, tracking=0):
    lines = []
    for word in str(text).split():
        candidate = (lines[-1] + ' ' + word) if lines else word
        if lines and text_width(draw, candidate, face, tracking) <= max_width:
            lines[-1] = candidate
        else:
            lines.append(word)
    if max_lines and len(lines) > max_lines:
        lines = lines[:max_lines]
        while lines and text_width(draw, lines[-1] + '…', face, tracking) > max_width:
            lines[-1] = lines[-1][:-1]
        lines[-1] = (lines[-1].rstrip() + '…') if lines[-1] else '…'
    return lines


def fit(draw, text, role, max_width, max_lines, high, low, tracking=0):
    size = high
    while size >= low:
        face = font(role, size)
        # Measure without truncation: wrap() stops at max_lines, which would make every size look like it fits.
        lines = wrap(draw, text, face, max_width, None, tracking)
        if len(lines) <= max_lines and all(text_width(draw, line, face, tracking) <= max_width for line in lines):
            return face, lines
        size -= 4
    face = font(role, low)
    return face, wrap(draw, text, face, max_width, max_lines, tracking)


def rounded(draw, box, radius, fill, outline=None, width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def draw_rich_text(draw, xy, line, face, base_fill, emphasis, emphasis_fill, stroke_width=0, stroke_fill=None):
    x, y = xy
    if not emphasis or emphasis.lower() not in line.lower():
        draw.text((x, y), line, font=face, fill=base_fill, stroke_width=stroke_width, stroke_fill=stroke_fill)
        return
    index = line.lower().find(emphasis.lower())
    before, hit, after = line[:index], line[index:index + len(emphasis)], line[index + len(emphasis):]
    for segment, color in ((before, base_fill), (hit, emphasis_fill), (after, base_fill)):
        if not segment:
            continue
        draw.text((x, y), segment, font=face, fill=color, stroke_width=stroke_width, stroke_fill=stroke_fill)
        x += draw.textlength(segment, font=face)


def halftone(draw, origin, color, columns=16, rows=22, spacing=30, radius=5):
    ox, oy = origin
    for row in range(rows):
        for column in range(columns):
            fade = 1 - (row / rows) * .7
            r = max(1.2, radius * fade)
            cx = ox + column * spacing + (row % 2) * spacing * .5
            cy = oy + row * spacing
            draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color)


def rule(draw, box, color, width=3):
    draw.rectangle(box, fill=color)


def make_background(theme, colors, rng):
    """Oversized plate so the crop window can drift and zoom without upscaling."""
    base = None
    ink, ink_soft = rgb(colors['ink']), rgb(colors['inkSoft'])
    red, red_deep = rgb(colors['red']), rgb(colors['redDeep'])
    paper, paper_deep = rgb(colors['paper']), rgb(colors['paperDeep'])
    gold, yellow = rgb(colors['gold']), rgb(colors['yellow'])
    forest, navy, oxblood = rgb(colors['forest']), rgb(colors['navy']), rgb(colors['oxblood'])

    if theme == 0:
        base = vertical_gradient((BW, BH), ink_soft, (7, 7, 10))
        draw = ImageDraw.Draw(base, 'RGBA')
        draw.ellipse((BW * .48, -BH * .12, BW * 1.28, BH * .56), outline=(*red, 255), width=7)
        draw.ellipse((BW * .56, -BH * .05, BW * 1.2, BH * .48), outline=(*gold, 70), width=2)
        draw.polygon([(0, BH * .72), (BW, BH * .42), (BW, BH * .47), (0, BH * .77)], fill=(*red_deep, 42))
        for index in range(12):
            y = BH * .62 + index * 26
            draw.line((0, y, BW, y - 120), fill=(*gold, 14), width=1)
        halftone(draw, (BW * .04, BH * .06), (*paper, 14))
    elif theme == 1:
        base = vertical_gradient((BW, BH), paper, paper_deep)
        draw = ImageDraw.Draw(base, 'RGBA')
        draw.rectangle((0, 0, BW * .075, BH), fill=(*red, 255))
        draw.rectangle((BW * .075, 0, BW * .082, BH), fill=(*gold, 210))
        draw.ellipse((BW * .58, BH * .52, BW * 1.3, BH * 1.18), outline=(*red, 190), width=10)
        draw.ellipse((BW * .64, BH * .58, BW * 1.24, BH * 1.12), outline=(*ink, 26), width=2)
        for index in range(9):
            y = BH * .18 + index * 44
            draw.line((BW * .1, y, BW * .5, y), fill=(*ink, 15), width=1)
        halftone(draw, (BW * .72, BH * .08), (*red, 60), columns=11, rows=16, spacing=26, radius=4)
    elif theme == 2:
        base = vertical_gradient((BW, BH), oxblood, (16, 8, 10))
        draw = ImageDraw.Draw(base, 'RGBA')
        draw.ellipse((BW * .42, BH * .1, BW * 1.08, BH * .76), fill=(*red_deep, 120))
        draw.ellipse((BW * .5, BH * .18, BW * 1.0, BH * .68), outline=(*paper, 36), width=3)
        draw.polygon([(0, BH * .86), (BW, BH * .58), (BW, BH * .64), (0, BH * .92)], fill=(*ink, 140))
        for index in range(5):
            draw.line((BW * .08, BH * .1 + index * 12, BW * .38, BH * .1 + index * 12), fill=(*gold, 110), width=2)
    elif theme == 3:
        base = vertical_gradient((BW, BH), forest, (6, 16, 14))
        draw = ImageDraw.Draw(base, 'RGBA')
        for index in range(4):
            inset = index * 54
            draw.arc((BW * .2 - inset, BH * .3 - inset, BW * 1.1 + inset, BH * 1.05 + inset), 185, 345, fill=(*gold, 80), width=3)
        draw.ellipse((BW * .06, BH * .58, BW * .46, BH * .86), fill=(*paper, 24), outline=(*paper, 60), width=2)
        draw.polygon([(0, 0), (BW * .22, 0), (BW * .08, BH)], fill=(*ink, 60))
        halftone(draw, (BW * .74, BH * .62), (*gold, 26), columns=10, rows=12, spacing=30, radius=3)
    elif theme == 4:
        base = vertical_gradient((BW, BH), navy, (6, 10, 16))
        draw = ImageDraw.Draw(base, 'RGBA')
        draw.ellipse((BW * .28, BH * .08, BW * .92, BH * .55), fill=(*red, 175))
        draw.ellipse((BW * .34, BH * .13, BW * .86, BH * .5), fill=(*red_deep, 255))
        for index in range(16):
            y = BH * .58 + index * 30
            draw.line((0, y, BW, y), fill=(*paper, max(6, 26 - index)), width=1)
        draw.arc((BW * .5, BH * .1, BW * 1.18, BH * .7), 120, 330, fill=(*gold, 130), width=4)
    else:
        base = vertical_gradient((BW, BH), paper, (216, 204, 184))
        draw = ImageDraw.Draw(base, 'RGBA')
        draw.polygon([(BW * .52, 0), (BW, 0), (BW, BH), (BW * .2, BH)], fill=(*ink, 245))
        draw.polygon([(BW * .55, 0), (BW * .585, 0), (BW * .265, BH), (BW * .23, BH)], fill=(*red, 255))
        draw.polygon([(BW * .6, 0), (BW * .61, 0), (BW * .29, BH), (BW * .28, BH)], fill=(*gold, 255))
        for index in range(11):
            y = BH * .12 + index * 46
            draw.line((BW * .08, y, BW * .46, y), fill=(*ink, 20), width=1)
        halftone(draw, (BW * .06, BH * .64), (*red, 44), columns=8, rows=10, spacing=24, radius=3)

    # Baked paper grain and a soft vignette keep the plate from looking like flat vector art.
    noise = Image.effect_noise((BW, BH), 22).convert('RGB')
    base = Image.blend(base, noise, .035)
    mask = Image.new('L', (BW, BH), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.ellipse((-BW * .18, -BH * .12, BW * 1.18, BH * 1.12), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(170)).point(lambda value: 130 + int(value * .49))
    base = Image.composite(base, Image.new('RGB', (BW, BH), (4, 4, 6)), mask)
    # A faint registration grid ties every scene to the same print system.
    grid = ImageDraw.Draw(base, 'RGBA')
    for x in range(0, BW, 120):
        grid.line((x, 0, x, BH), fill=(255, 255, 255, 7), width=1)
    return base


def crop_plate(plate, progress, direction):
    zoom = 1.028 + .045 * progress
    window_w, window_h = W / zoom, H / zoom
    travel_x = (BW - window_w) / 2
    travel_y = (BH - window_h) / 2
    cx = BW / 2 + math.sin(progress * math.pi) * 28 * direction
    cy = BH / 2 - (progress - .5) * 24 * direction
    x = max(0, min(BW - window_w, cx - window_w / 2))
    y = max(0, min(BH - window_h, cy - window_h / 2))
    return plate.crop((int(x), int(y), int(x + window_w), int(y + window_h))).resize((W, H), Image.BILINEAR)


def render_chrome(plan, colors):
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, 'RGBA')
    ink, red, red_deep = rgb(colors['ink']), rgb(colors['red']), rgb(colors['redDeep'])
    gold, paper, white = rgb(colors['gold']), rgb(colors['paper']), rgb(colors['white'])

    # Gold outer frame and thin white registration line.
    draw.rectangle((6, 6, W - 7, H - 7), outline=(*gold, 255), width=15)
    draw.rectangle((9, 9, W - 10, H - 10), outline=(*red_deep, 120), width=2)
    draw.rectangle((27, 27, W - 28, H - 28), outline=(*white, 190), width=2)
    for x, y, sx, sy in ((28, 28, 1, 1), (W - 28, 28, -1, 1), (28, H - 28, 1, -1), (W - 28, H - 28, -1, -1)):
        draw.rectangle((min(x, x + sx * 42), min(y, y + sy * 8), max(x, x + sx * 42), max(y, y + sy * 8)), fill=(*gold, 255))
        draw.rectangle((min(x, x + sx * 8), min(y, y + sy * 42), max(x, x + sx * 8), max(y, y + sy * 42)), fill=(*gold, 255))

    # Topic ribbon top-left, with a gold kicker tab and a hard offset shadow.
    topic = plan['topic']
    face, lines = fit(draw, topic.upper(), 'display', 560, 3, 58, 30, tracking=1)
    line_height = int(face.size * 1.04)
    ribbon_w = min(700, max(430, int(max(text_width(draw, line, face, 1) for line in lines) + 58)))
    ribbon_h = 44 + line_height * len(lines) + 20
    x, y = 44, 44
    draw.rectangle((x + 9, y + 9, x + ribbon_w + 9, y + ribbon_h + 9), fill=(*ink, 210))
    draw.rectangle((x, y, x + ribbon_w, y + ribbon_h), fill=(*red, 255))
    kicker = plan['kicker'][:26]
    kicker_face, _ = fit(draw, kicker, 'bold', 250, 1, 19, 13, tracking=2.4)
    kicker_w = min(ribbon_w, max(150, int(text_width(draw, kicker, kicker_face, 2.4)) + 24))
    draw.rectangle((x, y, x + kicker_w, y + 30), fill=(*gold, 255))
    draw_tracked(draw, (x + 12, y + 5), kicker, kicker_face, ink, tracking=2.4)
    for index, line in enumerate(lines):
        draw.text((x + 24, y + 38 + index * line_height), line, font=face, fill=white, stroke_width=1, stroke_fill=(30, 4, 8, 255))
    draw.rectangle((x, y + ribbon_h - 8, x + ribbon_w, y + ribbon_h), fill=(*gold, 255))
    draw.rectangle((x + 14, y + ribbon_h + 16, x + 14 + 96, y + ribbon_h + 21), fill=(*white, 150))

    # Circular brand seal top-right.
    cx, cy, radius = W - 104, 116, 62
    draw.ellipse((cx - radius - 7, cy - radius - 7, cx + radius + 7, cy + radius + 7), fill=(*gold, 255))
    draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=(*red, 255), outline=(*white, 235), width=3)
    draw.ellipse((cx - radius + 9, cy - radius + 9, cx + radius - 9, cy + radius - 9), outline=(*gold, 160), width=2)
    mark = plan['brandMark'] or 'S'
    mark_face = font('display', 54 if len(mark) <= 1 else 42)
    mark_w = draw.textlength(mark, font=mark_face)
    draw.text((cx - mark_w / 2, cy - 33), mark, font=mark_face, fill=white, stroke_width=2, stroke_fill=(60, 5, 10, 255))
    for angle in (-90, -18, 54, 126, 198):
        rad = math.radians(angle)
        draw.ellipse((cx + math.cos(rad) * 44 - 2, cy + math.sin(rad) * 44 - 2, cx + math.cos(rad) * 44 + 2, cy + math.sin(rad) * 44 + 2), fill=(*gold, 230))

    # Handle watermark bottom-left.
    handle = plan['handle']
    draw.rectangle((54, 1798, 74, 1818), fill=(*red, 255))
    draw.text((86, 1784), handle, font=font('display', 34), fill=(*white, 255), stroke_width=3, stroke_fill=(20, 12, 8, 235))
    draw_tracked(draw, (86, 1832), 'DOCUMENTARY SHORTS', font('bold', 15), (*white, 235), tracking=3.2, stroke_width=1, stroke_fill=(20, 12, 8, 200))
    return layer


def render_scene_layers(scene, plan, colors, theme):
    headline = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    support = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    hdraw, sdraw = ImageDraw.Draw(headline, 'RGBA'), ImageDraw.Draw(support, 'RGBA')
    ink, ink_soft = rgb(colors['ink']), rgb(colors['inkSoft'])
    red, red_deep = rgb(colors['red']), rgb(colors['redDeep'])
    gold, paper, white = rgb(colors['gold']), rgb(colors['paper']), rgb(colors['white'])
    on_light = theme in (1, 5)
    main = ink if on_light else white
    accent = red if on_light else gold
    body = ink_soft if on_light else paper
    stroke = 0 if on_light else 6
    stroke_fill = None if on_light else (8, 8, 10, 255)
    kind = scene['kind']
    content_bottom = 1400 if not scene.get('source') else 1440
    header_top = 560 if kind == 'opening' else 610
    emphasis = scene.get('emphasis') or ''

    if kind == 'opening':
        face, lines = fit(hdraw, scene['headline'], 'display', SAFE_RIGHT - SAFE_X - 20, 4, 112, 64, tracking=1)
        y = 640
        hdraw.rectangle((SAFE_X, y - 42, SAFE_X + 84, y - 32), fill=(*red, 255))
        hdraw.text((SAFE_X, y - 18), 'THE STORY', font=font('bold', 24), fill=(*accent, 255))
        y += 34
        for line in lines:
            hdraw.text((SAFE_X + 2, y + 5), line, font=face, fill=(*ink, 90) if not on_light else (*paper_deep, 160))
            hdraw.text((SAFE_X, y), line, font=face, fill=(*main, 255), stroke_width=stroke, stroke_fill=stroke_fill)
            y += int(face.size * 1.06)
        hdraw.rectangle((SAFE_X, y + 18, SAFE_X + 210, y + 27), fill=(*gold, 255))
        y += 62
        face_s, lines_s = fit(sdraw, scene['support'], 'bold', SAFE_RIGHT - SAFE_X - 30, 3, 52, 34)
        for line in lines_s:
            sdraw.text((SAFE_X, y), line, font=face_s, fill=(*body, 255), stroke_width=2 if not on_light else 0, stroke_fill=(8, 8, 10, 255))
            y += int(face_s.size * 1.26)
    elif kind in ('stat', 'timeline'):
        if kind == 'timeline':
            year = scene.get('stat') or scene['headline']
            x0 = SAFE_X + 12
            hdraw.line((x0 + 8, 470, x0 + 8, 1290), fill=(*gold, 180), width=4)
            for index in range(7):
                hdraw.ellipse((x0 + 1, 560 + index * 98, x0 + 15, 574 + index * 98), fill=(*(red if index == 3 else gold), 230))
            face, _ = fit(hdraw, year, 'display', 640, 1, 272, 150, tracking=0)
            hdraw.text((x0 + 48, 540), 'THE YEAR', font=font('bold', 24), fill=(*accent, 255))
            hdraw.text((x0 + 44, 580), year, font=face, fill=(*main, 255), stroke_width=stroke, stroke_fill=stroke_fill)
            hdraw.rectangle((x0 + 48, 860, x0 + 300, 873), fill=(*red, 255))
        else:
            stat = scene.get('stat') or scene['headline']
            face, _ = fit(hdraw, stat, 'display', 900, 1, 254, 120, tracking=0)
            stat_w = hdraw.textlength(stat, font=face)
            label = 'THE NUMBER'
            label_face = font('bold', 26)
            label_w = hdraw.textlength(label, font=label_face)
            hdraw.text(((W - label_w) / 2, 650), label, font=label_face, fill=(*accent, 255))
            hdraw.text(((W - stat_w) / 2, 700), stat, font=face, fill=(*main, 255), stroke_width=stroke, stroke_fill=stroke_fill)
            underline_w = min(760, max(240, stat_w * .82))
            hdraw.polygon([((W - underline_w) / 2, 1032), ((W + underline_w) / 2, 1019), ((W + underline_w) / 2 + 12, 1041), ((W - underline_w) / 2 - 6, 1055)], fill=(*red, 255))
        face_s, lines_s = fit(sdraw, scene['support'], 'bold', SAFE_RIGHT - SAFE_X - 40, 3, 50, 32)
        y = 1110 if kind == 'stat' else 930
        for line in lines_s:
            width = sdraw.textlength(line, font=face_s)
            sdraw.text(((W - width) / 2, y), line, font=face_s, fill=(*body, 255), stroke_width=2 if not on_light else 0, stroke_fill=(8, 8, 10, 255))
            y += int(face_s.size * 1.28)
    elif kind == 'quote':
        hdraw.text((SAFE_X - 8, 560), '“', font=font('serif', 240), fill=(*red, 255))
        face, lines = fit(hdraw, scene['headline'], 'serif_regular', SAFE_RIGHT - SAFE_X - 40, 5, 108, 58)
        y = 720
        for line in lines:
            hdraw.text((SAFE_X + 44, y), line, font=face, fill=(*main, 255), stroke_width=stroke - 2 if stroke else 0, stroke_fill=stroke_fill)
            y += int(face.size * 1.2)
        hdraw.rectangle((SAFE_X + 44, y + 16, SAFE_X + 240, y + 23), fill=(*gold, 255))
        y += 46
        face_s, lines_s = fit(sdraw, scene['support'], 'bold', SAFE_RIGHT - SAFE_X - 60, 3, 46, 30)
        for line in lines_s:
            if y > content_bottom - 40:
                break
            sdraw.text((SAFE_X + 44, y), line, font=face_s, fill=(*body, 255), stroke_width=2 if not on_light else 0, stroke_fill=(8, 8, 10, 255))
            y += int(face_s.size * 1.26)
    else:
        face, lines = fit(hdraw, scene['headline'].upper(), 'display', SAFE_RIGHT - SAFE_X - 20, 5, 176, 78, tracking=1)
        total_h = int(face.size * 1.05) * len(lines)
        y = 760 - total_h // 2
        for line in lines:
            draw_rich_text(hdraw, (SAFE_X, y), line, face, main, emphasis.upper(), accent, stroke, stroke_fill)
            y += int(face.size * 1.06)
        hdraw.polygon([(SAFE_X, y + 18), (SAFE_X + 152, y + 10), (SAFE_X + 158, y + 24), (SAFE_X + 4, y + 32)], fill=(*red, 255))
        y += 82
        face_s, lines_s = fit(sdraw, scene['support'], 'bold', SAFE_RIGHT - SAFE_X - 30, 3, 50, 30)
        for line in lines_s:
            if y > content_bottom - 40:
                break
            sdraw.text((SAFE_X, y), line, font=face_s, fill=(*body, 255), stroke_width=2 if not on_light else 0, stroke_fill=(8, 8, 10, 255))
            y += int(face_s.size * 1.26)

    if scene.get('source'):
        source = scene['source']
        domain = str(source.get('domain') or urlparse(str(source.get('url', ''))).hostname or '').replace('www.', '')[:64]
        title = str(source.get('title') or '').strip()
        box = (SAFE_X, 1512, SAFE_X + 700, 1652)
        sdraw.rectangle((box[0] + 8, box[1] + 8, box[2] + 8, box[3] + 8), fill=(*ink, 120))
        rounded(sdraw, box, 8, (*paper, 246), (*ink, 150), 2)
        sdraw.rectangle((box[0], box[1], box[0] + 12, box[3]), fill=(*red, 255))
        sdraw.text((box[0] + 30, box[1] + 16), 'RESEARCH SOURCE', font=font('bold', 18), fill=(*red, 255))
        sdraw.text((box[0] + 30, box[1] + 44), domain, font=font('bold', 28), fill=(*ink, 255))
        face_t, lines_t = fit(sdraw, title, 'regular', 630, 2, 25, 18)
        for index, line in enumerate(lines_t):
            sdraw.text((box[0] + 30, box[1] + 82 + index * 27), line, font=face_t, fill=(*ink_soft, 230))
        sdraw.ellipse((box[2] - 54, box[1] + 18, box[2] - 18, box[1] + 54), outline=(*gold, 255), width=3)
        sdraw.text((box[2] - 42, box[1] + 24), 'i', font=font('serif', 24), fill=(*gold, 255))
    return headline, support


def render_cta(plan, colors):
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, 'RGBA')
    ink, red, red_deep = rgb(colors['ink']), rgb(colors['red']), rgb(colors['redDeep'])
    gold, paper, white = rgb(colors['gold']), rgb(colors['paper']), rgb(colors['white'])
    draw.rectangle((SAFE_X + 10, 1586, W - SAFE_X + 10, 1724), fill=(*ink, 150))
    draw.rectangle((SAFE_X, 1576, W - SAFE_X, 1714), fill=(*red, 255))
    draw.rectangle((SAFE_X, 1576, W - SAFE_X, 1588), fill=(*gold, 255))
    draw.text((SAFE_X + 34, 1604), plan['cta']['title'], font=font('display', 46), fill=white, stroke_width=1, stroke_fill=(70, 8, 12, 255))
    draw.text((SAFE_X + 36, 1662), plan['cta']['subtitle'], font=font('bold', 27), fill=paper)
    cx, cy = W - SAFE_X - 86, 1645
    draw.ellipse((cx - 42, cy - 42, cx + 42, cy + 42), fill=(*gold, 255), outline=(*white, 220), width=2)
    draw.text((cx - 20, cy - 26), '→', font=font('display', 46), fill=ink)
    return layer


def render_frame(plate, chrome, headline, support, plan, scene, colors, second, cta, progress, number, total):
    frame = crop_plate(plate, progress, 1 if scene['background'] % 2 == 0 else -1).convert('RGBA')
    local = max(0.0, min(1.0, (second - scene['start']) / max(.001, scene['end'] - scene['start'])))
    enter = min(1.0, local / .42)
    eased = 1 - (1 - enter) ** 3
    support_enter = min(1.0, max(0.0, (local - .08) / .42))
    support_eased = 1 - (1 - support_enter) ** 3
    # The red corner tick grows into the scene, then settles into the frame.
    tick = int(96 * min(1.0, local / .3))
    draw = ImageDraw.Draw(frame, 'RGBA')
    if scene.get('kind') != 'opening':
        draw.rectangle((SAFE_X, 500, SAFE_X + max(8, tick), 509), fill=(*rgb(colors['red']), 255))
    if scene.get('kind') in ('stat', 'timeline'):
        draw.rectangle((W - SAFE_X - max(8, tick), 500, W - SAFE_X, 509), fill=(*rgb(colors['gold']), 255))
    frame.paste(headline, (0, int((1 - eased) * 52)), headline)
    frame.paste(support, (0, int((1 - support_eased) * 30)), support)
    if scene.get('cta'):
        cta_start = max(scene['start'], scene['end'] - 3.8)
        if second >= cta_start:
            reveal = min(1.0, (second - cta_start) / .35)
            shifted = int((1 - reveal) * 70)
            frame.paste(cta, (0, shifted), cta)
    frame.paste(chrome, (0, 0), chrome)
    draw = ImageDraw.Draw(frame, 'RGBA')
    counter = f'{number:02d} / {total:02d}'
    counter_face = font('bold', 24)
    counter_w = draw.textlength(counter, font=counter_face)
    draw.rectangle((W - 86 - counter_w - 32, 1793, W - 86 - counter_w - 20, 1805), fill=(*rgb(colors['red']), 255))
    draw.text((W - 86 - counter_w, 1784), counter, font=counter_face, fill=(*rgb(colors['gold']), 255))
    draw.rectangle((46, 1888, W - 47, 1892), fill=(*rgb(colors['ink']), 70))
    draw.rectangle((46, 1888, 46 + max(3, int((W - 93) * min(1, progress))), 1892), fill=(*rgb(colors['gold']), 255))
    return frame.convert('RGB')


def sample_times(start, end, fps):
    times = []
    step = 1 / fps
    value = start
    while value < end - 1e-6:
        times.append(round(value, 6))
        value += step
    if not times or times[-1] < end - 1e-6:
        times.append(round(end, 6))
    return times


def validate(plan):
    if plan.get('version') != 2 or plan.get('renderer') != 'pillow-documentary-shorts-v2':
        raise RuntimeError('Unsupported scene manifest version or renderer.')
    fmt = plan.get('format') or {}
    if fmt.get('width') != W or fmt.get('height') != H or fmt.get('fps') != 30:
        raise RuntimeError('The documentary renderer requires 1080x1920 at 30fps.')
    duration = float(plan.get('duration') or 0)
    if not (0 < duration <= 7200):
        raise RuntimeError('Scene manifest duration is invalid.')
    scenes = plan.get('scenes') or []
    if not scenes:
        raise RuntimeError('Scene manifest has no scenes.')
    cursor = 0.0
    for index, scene in enumerate(scenes):
        if scene.get('kind') not in ('opening', 'phrase', 'stat', 'timeline', 'quote'):
            raise RuntimeError(f'Unknown scene kind at index {index}.')
        start, end = float(scene.get('start', -1)), float(scene.get('end', -1))
        if start < cursor - .01 or end <= start:
            raise RuntimeError(f'Scene {index} has invalid or overlapping timing.')
        if start > cursor + .05:
            raise RuntimeError(f'Scene {index} leaves an uncovered gap.')
        if not str(scene.get('headline') or '').strip():
            raise RuntimeError(f'Scene {index} has no headline.')
        if len(str(scene.get('support') or '')) > 2000:
            raise RuntimeError(f'Scene {index} support text is too long.')
        source = scene.get('source')
        if source:
            parsed = urlparse(str(source.get('url') or ''))
            if parsed.scheme not in ('http', 'https') or not source.get('domain') or not source.get('title'):
                raise RuntimeError(f'Scene {index} has an invalid source card.')
        cursor = end
    if abs(cursor - duration) > .05:
        raise RuntimeError('Scenes do not cover the full narration duration.')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    plan = json.loads(Path(args.manifest).read_text())
    validate(plan)
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    # Drop frames from a previous render so stale images can never leak into a new master.
    for stale in output.glob('frame_*.jpg'):
        stale.unlink()
    for stale in output.glob('frame_*.png'):
        stale.unlink()
    (output / 'frames.txt').unlink(missing_ok=True)
    colors = plan['design']['palette']
    rng = random.Random(20261117)
    plates = [make_background(theme, colors, rng) for theme in range(6)]
    chrome = render_chrome(plan, colors)
    cta = render_cta(plan, colors)
    duration = float(plan['duration'])
    fps = int(plan['format'].get('motionFps') or 8)
    concat = []
    last_path = None
    frame_index = 0
    previous_second = 0.0
    total = len(plan['scenes'])
    for number, scene in enumerate(plan['scenes'], start=1):
        theme = scene['background'] % 6
        if scene['kind'] == 'opening':
            theme = 0
        elif scene['kind'] == 'quote':
            theme = 1
        elif scene['kind'] in ('stat', 'timeline'):
            theme = 4 if theme % 2 else 2
        headline, support = render_scene_layers(scene, plan, colors, theme)
        times = sample_times(float(scene['start']), float(scene['end']), fps)
        for second in times:
            cover = render_frame(plates[theme], chrome, headline, support, plan, scene, colors, second, cta, second / duration, number, total)
            path = output / f'frame_{frame_index:05d}.jpg'
            cover.save(path, quality=93, subsampling=1, optimize=False)
            if last_path is not None:
                concat.append(f"file '{last_path}'")
                concat.append(f'duration {max(.001, second - previous_second):.6f}')
            last_path = str(path).replace("'", "'\\''")
            previous_second = second
            frame_index += 1
    if last_path:
        concat += [f"file '{last_path}'", f'duration {max(.001, duration - previous_second):.6f}', f"file '{last_path}'"]
    (output / 'frames.txt').write_text('\n'.join(concat) + '\n')
    # Cover uses the opening beat after its entrance animation has settled.
    opening = plan['scenes'][0]
    headline, support = render_scene_layers(opening, plan, colors, 0)
    still = render_frame(plates[0], chrome, headline, support, plan, opening, colors, min(opening['end'] - .01, opening['start'] + .55), cta, 0, 1, total)
    still.save(output / 'cover.png')


if __name__ == '__main__':
    main()

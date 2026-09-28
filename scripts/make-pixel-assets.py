"""Draw the game's native-resolution sprite atlas and bitmap typeface."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

ROOT = Path(__file__).resolve().parents[1] / "public"
ROOT.mkdir(exist_ok=True)
COLORS = ["#d4f27a", "#62e6a5", "#93ca62", "#9df1d6", "#c1df80", "#5fcb87", "#b8f0a5", "#78b889"]


def shade(hex_color, amount):
    rgb = tuple(int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
    if amount > 0:
        rgb = tuple(round(c + (255 - c) * amount) for c in rgb)
    else:
        rgb = tuple(round(c * (1 + amount)) for c in rgb)
    return "#%02x%02x%02x" % rgb


def sprite(stage, color, enemy=False):
    tile = Image.new("RGBA", (24, 24))
    d = ImageDraw.Draw(tile)
    ink = "#321822" if enemy else "#15383a"
    base = color
    lite = shade(base, .38)
    dark = shade(base, -.35)
    eye = "#1b2631" if not enemy else "#fff1b6"

    def rect(box, fill): d.rectangle(box, fill=fill)
    def poly(points, fill): d.polygon(points, fill=fill)
    def oval(box, fill): d.ellipse(box, fill=fill)

    if enemy:
        if stage == 0:  # spiked phage
            for x, y in [(10, 0), (2, 5), (18, 3), (0, 12), (20, 11), (5, 19), (17, 20)]:
                rect((x, y, x + 3, y + 4), ink)
                rect((x + 1, y + 1, x + 2, y + 3), base)
            oval((3, 4, 21, 21), ink); oval((5, 6, 19, 19), base)
            rect((7, 8, 11, 12), lite); rect((14, 11, 17, 13), eye)
            rect((7, 16, 16, 17), dark)
        elif stage == 1:  # shark
            poly([(0, 12), (6, 7), (18, 7), (23, 11), (18, 16), (6, 16)], ink)
            poly([(1, 11), (7, 9), (18, 9), (22, 11), (18, 14), (7, 14)], base)
            poly([(9, 8), (12, 1), (16, 8)], ink); poly([(11, 8), (12, 4), (14, 8)], lite)
            poly([(3, 11), (0, 4), (0, 19)], ink)
            rect((18, 10, 19, 11), eye); rect((14, 15, 19, 16), lite)
        elif stage == 2:  # predator with mane and claws
            poly([(3, 6), (5, 3), (17, 4), (21, 8), (20, 17), (3, 18)], ink)
            rect((5, 7, 18, 15), base); rect((7, 6, 15, 9), lite)
            poly([(5, 5), (5, 1), (10, 5)], ink); poly([(15, 5), (19, 1), (19, 8)], ink)
            rect((7, 16, 9, 22), ink); rect((16, 16, 18, 22), ink)
            rect((5, 20, 10, 21), lite); rect((15, 20, 20, 21), lite)
            rect((16, 8, 17, 9), eye); rect((19, 12, 22, 13), dark)
        elif stage == 3:  # giant red primate
            oval((5, 1, 18, 12), ink); oval((7, 3, 17, 11), base)
            rect((3, 10, 20, 20), ink); rect((6, 11, 17, 18), base)
            rect((1, 12, 5, 22), ink); rect((19, 12, 23, 22), ink)
            rect((5, 20, 9, 23), dark); rect((16, 20, 20, 23), dark)
            rect((10, 5, 12, 8), lite); rect((14, 6, 15, 7), eye)
        else:  # dinosaur
            poly([(0, 14), (6, 10), (7, 7), (16, 7), (20, 9), (23, 7), (23, 14), (18, 17), (8, 18)], ink)
            poly([(2, 13), (8, 9), (16, 9), (21, 11), (21, 14), (17, 15), (8, 16)], base)
            for x, y in [(7, 7), (11, 6), (15, 6), (19, 7)]: poly([(x, y + 2), (x + 2, y - 3), (x + 4, y + 2)], dark)
            rect((9, 17, 12, 23), ink); rect((16, 16, 19, 22), ink)
            rect((19, 10, 20, 11), eye); rect((20, 15, 23, 16), lite)
    else:
        if stage == 0:  # cell with membrane and nucleus
            for x, y in [(10, 0), (1, 10), (20, 8), (7, 20), (17, 21)]: rect((x, y, x + 2, y + 2), dark)
            oval((2, 2, 21, 21), ink); oval((4, 4, 19, 19), base)
            rect((6, 5, 12, 7), lite); rect((5, 8, 7, 12), lite)
            rect((10, 9, 16, 15), dark); rect((11, 10, 14, 12), lite)
        elif stage == 1:  # fish
            poly([(1, 12), (0, 5), (7, 9), (14, 5), (22, 8), (24, 12), (21, 16), (14, 19), (7, 15), (0, 19)], ink)
            poly([(2, 12), (8, 10), (14, 7), (21, 9), (22, 13), (14, 17), (8, 14)], base)
            poly([(9, 9), (12, 3), (15, 8)], dark)
            rect((10, 10, 17, 11), lite); rect((18, 10, 19, 11), eye)
        elif stage == 2:  # four-legged animal
            poly([(1, 14), (6, 9), (15, 9), (18, 6), (22, 7), (23, 13), (18, 16), (6, 17)], ink)
            poly([(4, 13), (7, 11), (17, 11), (20, 9), (21, 13), (17, 14), (6, 15)], base)
            rect((6, 16, 9, 22), ink); rect((16, 15, 19, 22), ink)
            rect((9, 10, 15, 11), lite); rect((20, 9, 21, 10), eye)
            rect((0, 11, 4, 13), dark)
        elif stage == 3:  # primate
            oval((6, 1, 18, 12), ink); oval((8, 3, 16, 10), base)
            rect((5, 11, 19, 19), ink); rect((7, 12, 17, 18), base)
            rect((2, 12, 5, 21), base); rect((19, 12, 22, 21), base)
            rect((7, 19, 10, 23), dark); rect((15, 19, 18, 23), dark)
            rect((11, 4, 13, 6), lite); rect((15, 6, 16, 7), eye)
        else:  # human
            rect((8, 1, 16, 10), ink); rect((9, 3, 15, 9), lite)
            rect((8, 2, 16, 4), dark); rect((14, 5, 15, 6), eye)
            rect((7, 10, 17, 17), ink); rect((8, 11, 16, 16), base)
            rect((3, 11, 6, 18), base); rect((18, 11, 21, 18), base)
            rect((7, 18, 10, 23), dark); rect((14, 18, 17, 23), dark)
            rect((10, 12, 14, 13), lite)
    return tile


atlas = Image.new("RGBA", (5 * 24, 9 * 24))
for row, color in enumerate(COLORS):
    for stage in range(5): atlas.alpha_composite(sprite(stage, color), (stage * 24, row * 24))
for stage in range(5): atlas.alpha_composite(sprite(stage, "#a7293b", enemy=True), (stage * 24, 8 * 24))
atlas.save(ROOT / "pixel-sprites.png", optimize=True)

# Five 24-pixel biomes. The first four tiles in each row are walkable ground;
# the last four are transparent plants, rocks and relics placed on top.
FLOORS = [
    ("#0a4667", "#105675", "#1b6882", "#3b8998"),
    ("#0b6283", "#147391", "#2889a1", "#69b4b3"),
    ("#315a39", "#3b6840", "#538048", "#86aa55"),
    ("#4b583a", "#596947", "#6f7850", "#9a9d65"),
    ("#554638", "#66523e", "#7b6145", "#a17c53"),
]


def ground(stage, variant):
    base, shade1, shade2, light = FLOORS[stage]
    tile = Image.new("RGBA", (24, 24), base)
    d = ImageDraw.Draw(tile)
    ox, oy = (variant * 5) % 9, (variant * 7) % 11
    if stage < 2:
        # Hard, stepped light bands on the ocean floor.
        for x, y, w in [(2, 4, 8), (13, 10, 9), (5, 17, 10)]:
            x, y = (x + ox) % 18, (y + oy) % 21
            d.rectangle((x, y, x + w, y + 1), fill=shade1)
            d.rectangle((x + 2, y + 2, x + w - 3, y + 2), fill=shade2)
        for x, y in [(3, 21), (20, 3), (17, 19)]:
            d.rectangle(((x + ox) % 24, (y + oy) % 24, (x + ox) % 24 + 1, (y + oy) % 24 + 1), fill=light if stage == 1 else shade2)
        if stage == 1:
            d.rectangle((4 + variant, 6, 7 + variant, 7), fill=light)
            d.rectangle((5 + variant, 8, 5 + variant, 8), fill=shade2)
    elif stage == 2:
        # Soil is visible between blades, with small color clusters.
        for x, y in [(2, 3), (15, 5), (7, 15), (19, 19)]:
            x, y = (x + ox) % 21, (y + oy) % 22
            d.rectangle((x, y, x + 2, y + 1), fill=shade1)
            d.point((x + 1, y - 1), fill=shade2)
        d.rectangle((9 + variant, 9, 11 + variant, 9), fill=light)
        d.point((10 + variant, 8), fill=shade2)
    elif stage == 3:
        for x, y in [(2, 2), (13, 6), (6, 13), (18, 19)]:
            x, y = (x + ox) % 21, (y + oy) % 21
            d.rectangle((x, y, x + 3, y + 2), fill=shade1)
            d.point((x + 2, y + 1), fill=shade2)
        d.rectangle((2 + variant, 19, 9 + variant, 19), fill=light)
        d.rectangle((4 + variant, 20, 7 + variant, 20), fill=shade2)
    else:
        # Angular stone seams, chips and dust for the human era.
        for x, y in [(2, 5), (15, 3), (8, 16), (19, 20)]:
            x, y = (x + ox) % 20, (y + oy) % 21
            d.rectangle((x, y, x + 3, y + 1), fill=shade1)
            d.point((x + 4, y + 2), fill=shade2)
        d.line([(4 + variant, 11), (7 + variant, 11), (7 + variant, 13), (10 + variant, 13)], fill=shade2, width=1)
        d.rectangle((12, 17 + variant, 15, 18 + variant), fill=light)
    return tile


def decor(stage, variant):
    tile = Image.new("RGBA", (24, 24))
    d = ImageDraw.Draw(tile)
    def r(box, fill): d.rectangle(box, fill=fill)
    if stage < 2:
        if variant == 0:  # waving kelp
            r((9, 12, 11, 23), "#133e4b"); r((9, 12, 10, 21), "#368b74")
            r((5, 10, 9, 12), "#4dac7f"); r((11, 15, 17, 17), "#4dac7f")
            r((10, 5, 12, 12), "#277066"); r((8, 3, 10, 6), "#7fca83")
        elif variant == 1:  # branching coral
            red = "#ec8f7e" if stage == 1 else "#8d7893"
            r((5, 19, 19, 22), "#18445a"); r((10, 9, 13, 20), red)
            r((5, 10, 8, 16), red); r((6, 15, 12, 17), red)
            r((17, 5, 19, 16), red); r((12, 14, 19, 16), red)
            r((4, 8, 8, 9), "#ffe0a0"); r((16, 3, 20, 4), "#ffe0a0")
        elif variant == 2:  # shells and pebbles
            r((3, 15, 13, 20), "#194558"); r((5, 13, 11, 18), "#bea891")
            r((6, 14, 7, 16), "#eee0bd"); r((9, 14, 9, 17), "#ece1c4")
            r((16, 19, 21, 22), "#6e8e92"); r((17, 18, 20, 20), "#acd1c1")
        else:  # anemone and bubbles
            r((5, 19, 19, 21), "#154458")
            for x, h in [(7, 14), (11, 10), (15, 12), (18, 15)]:
                r((x, h, x + 1, 20), "#86afa2")
                r((x - 1, h - 2, x + 2, h), "#cbdfb0")
            r((19, 5, 20, 6), "#8ad6da"); r((21, 2, 22, 3), "#8ad6da")
    elif stage == 2:
        if variant == 0:  # flowering grass
            for x, y in [(5, 13), (11, 9), (18, 13)]:
                r((x, y, x + 1, 21), "#244c35")
                r((x - 2, y + 3, x + 3, y + 4), "#7aaf4b")
                r((x - 1, y - 1, x + 2, y + 1), "#f6cf8f")
        elif variant == 1:  # bush
            r((2, 12, 21, 21), "#213f31"); r((4, 8, 18, 18), "#57834a")
            r((7, 6, 15, 14), "#79a75b"); r((5, 12, 8, 13), "#add179")
            r((15, 10, 18, 11), "#add179")
        elif variant == 2:  # small boulder
            r((4, 15, 21, 22), "#2d4637"); r((6, 12, 19, 20), "#7e8d75")
            r((8, 10, 16, 15), "#a8b69b"); r((9, 11, 12, 12), "#dce4c1")
        else:  # red mushrooms
            r((7, 14, 9, 21), "#e1d7ab"); r((15, 16, 17, 21), "#e1d7ab")
            r((4, 11, 12, 14), "#9f3543"); r((13, 14, 20, 16), "#ad4c4e")
            r((6, 11, 7, 12), "#f8e3b4"); r((16, 14, 17, 14), "#f8e3b4")
    elif stage == 3:
        if variant == 0:  # tree stump, seen from above
            r((3, 9, 21, 22), "#273d2e"); r((5, 6, 19, 18), "#805d3e")
            r((7, 8, 17, 16), "#b88b52"); r((9, 10, 15, 14), "#745134")
            r((11, 11, 13, 12), "#c7a376")
        elif variant == 1:  # fern
            r((10, 4, 12, 23), "#294532")
            for y, w in [(6, 3), (9, 6), (12, 9), (16, 7)]:
                r((11 - w, y, 10, y + 1), "#8aa863")
                r((12, y + 2, 12 + w, y + 3), "#759957")
        elif variant == 2:  # roots and leaves
            r((2, 16, 21, 19), "#473b2e"); r((7, 13, 17, 16), "#665037")
            r((4, 10, 9, 12), "#98a66d"); r((14, 11, 19, 13), "#b1a16a")
        else:  # speckled egg in a nest
            r((4, 17, 20, 21), "#63462f"); r((6, 14, 18, 18), "#9b7040")
            r((9, 7, 15, 17), "#f2e3bd"); r((7, 10, 17, 16), "#f2e3bd")
            r((11, 10, 12, 11), "#bb9c75")
    else:
        if variant == 0:  # fallen timber
            r((2, 12, 22, 19), "#2d2d2c"); r((3, 10, 20, 16), "#9a693f")
            r((5, 11, 17, 12), "#d49a59"); r((5, 14, 10, 15), "#664735")
            r((18, 10, 21, 16), "#debc87")
        elif variant == 1:  # stacked stones
            r((3, 16, 21, 22), "#332f2d"); r((4, 13, 13, 20), "#939184")
            r((12, 10, 21, 19), "#797f7c"); r((13, 11, 17, 12), "#c7bba2")
            r((6, 14, 9, 15), "#d1c7a8")
        elif variant == 2:  # amber embers
            r((3, 18, 21, 20), "#3f322c"); r((7, 16, 15, 18), "#9d392c")
            r((11, 11, 14, 17), "#e8793a"); r((12, 8, 12, 12), "#f6c56c")
            r((18, 16, 19, 17), "#f3a453")
        else:  # angular cracks
            d.line([(2, 9), (9, 9), (9, 14), (17, 14), (17, 20)], fill="#302d2c", width=2)
            r((4, 6, 8, 7), "#a18460"); r((14, 5, 18, 6), "#a18460")
    return tile


world_tiles = Image.new("RGBA", (8 * 24, 5 * 24))
for stage in range(5):
    for variant in range(4):
        world_tiles.alpha_composite(ground(stage, variant), (variant * 24, stage * 24))
        world_tiles.alpha_composite(decor(stage, variant), ((variant + 4) * 24, stage * 24))
world_tiles.save(ROOT / "world-tiles.png", optimize=True)

# The three menu states use the same hand-placed tile motifs as the game field.
for name, stage in [("sea", 0), ("forest", 3), ("stone", 4)]:
    backdrop = Image.new("RGBA", (96, 96))
    for y in range(4):
        for x in range(4):
            variant = (x * 3 + y * 5) % 4
            backdrop.alpha_composite(ground(stage, variant), (x * 24, y * 24))
            if x == 3 and y == 2:
                backdrop.alpha_composite(decor(stage, (x + y) % 4), (x * 24, y * 24))
    backdrop.save(ROOT / f"menu-{name}.png", optimize=True)

# Turn each native-resolution bitmap pixel into an unfiltered square font outline.
# One tile is 8 × 12 source pixels; French accents and lower case are included.
source = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", 10)
chars = "".join(chr(n) for n in range(32, 127)) + "ÀÂÄÆÇÉÈÊËÎÏÔÖŒÙÛÜŸàâäæçéèêëîïôöœùûüÿ’«»·–—°…€▶●○"
glyph_order = [".notdef"] + [f"uni{ord(c):04X}" for c in dict.fromkeys(chars)]
glyphs, metrics, cmap = {}, {}, {}
for char in dict.fromkeys(chars):
    image = Image.new("L", (9, 13))
    draw = ImageDraw.Draw(image)
    draw.text((0, 10), char, font=source, fill=255, anchor="ls", stroke_width=0)
    pen = TTGlyphPen(None)
    for y in range(13):
        x = 0
        while x < 9:
            if image.getpixel((x, y)) < 110:
                x += 1; continue
            start = x
            while x < 9 and image.getpixel((x, y)) >= 110: x += 1
            a, b, top, bottom = start * 100, x * 100, 1000 - y * 100, 1000 - (y + 1) * 100
            pen.moveTo((a, bottom)); pen.lineTo((b, bottom)); pen.lineTo((b, top)); pen.lineTo((a, top)); pen.closePath()
    name = f"uni{ord(char):04X}"
    glyphs[name] = pen.glyph(); metrics[name] = (760, 0); cmap[ord(char)] = name
glyphs[".notdef"] = TTGlyphPen(None).glyph(); metrics[".notdef"] = (760, 0)
fb = FontBuilder(1000, isTTF=True)
fb.setupGlyphOrder(glyph_order); fb.setupCharacterMap(cmap)
fb.setupGlyf(glyphs); fb.setupHorizontalMetrics(metrics)
fb.setupHorizontalHeader(ascent=1000, descent=-300)
fb.setupNameTable({"familyName": "Cellule Pixel", "styleName": "Regular", "uniqueFontIdentifier": "Cellule Pixel 1.0", "fullName": "Cellule Pixel", "psName": "CellulePixel"})
fb.setupOS2(sTypoAscender=1000, sTypoDescender=-300, usWinAscent=1000, usWinDescent=300)
fb.setupPost(); fb.setupMaxp()
fb.save(ROOT / "cellule-pixel.ttf")
print("Generated sprites, biome tiles, menu tiles and bitmap font")

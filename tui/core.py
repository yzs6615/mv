"""Terminal graphics core: character canvas, braille sub-cell layer, diffing ANSI renderer, music clock.

Pure standard library. A frame is a pure function of song time, so playback can start anywhere and the
same code drives both the live terminal player and the offline video exporter.
"""
import json
import math
import os
import unicodedata

# ----------------------------------------------------------------------------- colour

def rgb(r, g, b):
    return (max(0, min(255, int(r))), max(0, min(255, int(g))), max(0, min(255, int(b))))


def scale(c, k):
    return rgb(c[0] * k, c[1] * k, c[2] * k)


def mix(a, b, k):
    k = max(0.0, min(1.0, k))
    return rgb(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k)


AMBER = (255, 178, 92)      # process A  (montague.net)
ROSE = (255, 136, 176)      # process B  (capulet.net)
UNION = (255, 238, 206)     # both
INK = (14, 16, 24)
GREY = (92, 102, 124)
DIM = (44, 50, 66)
FAINT = (26, 30, 42)
TEXT = (196, 204, 218)
RED = (255, 72, 84)
OK = (126, 240, 170)
MOON = (214, 222, 240)


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def smooth(a, b, x):
    t = clamp((x - a) / (b - a)) if b != a else (1.0 if x >= b else 0.0)
    return t * t * (3 - 2 * t)


def ease_out(t):
    t = clamp(t)
    return 1 - (1 - t) ** 3


def ease_in_out(t):
    t = clamp(t)
    return 4 * t * t * t if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def hash01(n):
    n = (int(n) * 2654435761) & 0xFFFFFFFF
    n ^= n >> 15
    n = (n * 2246822519) & 0xFFFFFFFF
    n ^= n >> 13
    return (n & 0xFFFFFF) / 0x1000000


def wide(ch):
    return unicodedata.east_asian_width(ch) in ('W', 'F')


def text_width(s):
    return sum(2 if wide(c) else 1 for c in s)


# ----------------------------------------------------------------------------- canvas

WIDE_TAIL = ''   # marker for the right half of a double-width glyph


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.ch = [' '] * (w * h)
        self.fg = [None] * (w * h)
        self.bg = [None] * (w * h)

    def clear(self):
        n = self.w * self.h
        self.ch = [' '] * n
        self.fg = [None] * n
        self.bg = [None] * n

    def paint_bg(self, x0, x1, y, col):
        for x in range(max(0, int(x0)), min(self.w, int(x1) + 1)):
            self.bg[int(y) * self.w + x] = col

    def put(self, x, y, c, col):
        x, y = int(x), int(y)
        if 0 <= x < self.w and 0 <= y < self.h:
            i = y * self.w + x
            if self.ch[i] == WIDE_TAIL and x > 0:          # overwriting the tail of a wide glyph
                self.ch[i - 1] = ' '
            if wide(c):
                if x + 1 >= self.w:
                    return
                self.ch[i], self.fg[i] = c, col
                self.ch[i + 1], self.fg[i + 1] = WIDE_TAIL, col
            else:
                self.ch[i], self.fg[i] = c, col

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.ch[y * self.w + x]
        return None

    def text(self, x, y, s, col, transparent_space=False):
        x = int(x)
        for c in s:
            if not (transparent_space and c == ' '):
                self.put(x, y, c, col)
            x += 2 if wide(c) else 1

    def center(self, y, s, col, dx=0):
        self.text((self.w - text_width(s)) // 2 + dx, y, s, col)

    def hline(self, x0, x1, y, c, col):
        for x in range(int(x0), int(x1) + 1):
            self.put(x, y, c, col)

    def vline(self, x, y0, y1, c, col):
        for y in range(int(y0), int(y1) + 1):
            self.put(x, y, c, col)

    def fill(self, x0, y0, x1, y1, c=' ', col=None):
        for y in range(max(0, int(y0)), min(self.h, int(y1) + 1)):
            for x in range(max(0, int(x0)), min(self.w, int(x1) + 1)):
                i = y * self.w + x
                self.ch[i], self.fg[i] = c, col

    def box(self, x0, y0, x1, y1, col, style='light', title=None, title_col=None, clear=True):
        x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
        if x1 - x0 < 1 or y1 - y0 < 1:
            return
        s = {'light': '─│┌┐└┘', 'heavy': '━┃┏┓┗┛', 'double': '═║╔╗╚╝', 'round': '─│╭╮╰╯'}[style]
        if clear:
            self.fill(x0 + 1, y0 + 1, x1 - 1, y1 - 1)
        self.hline(x0 + 1, x1 - 1, y0, s[0], col)
        self.hline(x0 + 1, x1 - 1, y1, s[0], col)
        self.vline(x0, y0 + 1, y1 - 1, s[1], col)
        self.vline(x1, y0 + 1, y1 - 1, s[1], col)
        self.put(x0, y0, s[2], col); self.put(x1, y0, s[3], col)
        self.put(x0, y1, s[4], col); self.put(x1, y1, s[5], col)
        if title and x1 - x0 > len(title) + 4:
            self.text(x0 + 2, y0, f' {title} ', title_col or col)

    def line(self, x0, y0, x1, y1, c, col, dotted=0):
        x0, y0, x1, y1 = int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err, k = dx + dy, 0
        while True:
            if not dotted or (k % dotted) == 0:
                self.put(x0, y0, c, col)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy; x0 += sx
            if e2 <= dx:
                err += dx; y0 += sy
            k += 1

    def shift_rows(self, offsets):
        """horizontal per-row displacement (glitch / shake)"""
        w = self.w
        for y, o in offsets.items():
            if not o or not (0 <= y < self.h):
                continue
            row_c = self.ch[y * w:(y + 1) * w]
            row_f = self.fg[y * w:(y + 1) * w]
            o %= w
            self.ch[y * w:(y + 1) * w] = [c if c != WIDE_TAIL else ' ' for c in row_c[-o:] + row_c[:-o]]
            self.fg[y * w:(y + 1) * w] = row_f[-o:] + row_f[:-o]


class Braille:
    """2x4 sub-cell dot layer; each cell keeps the brightest colour drawn into it."""
    BITS = ((0x01, 0x02, 0x04, 0x40), (0x08, 0x10, 0x20, 0x80))

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.bits = bytearray(w * h)
        self.col = [None] * (w * h)
        self.lum = [0.0] * (w * h)

    def dot(self, px, py, col):
        px, py = int(px), int(py)
        cx, cy = px >> 1, py >> 2
        if 0 <= cx < self.w and 0 <= cy < self.h and px >= 0 and py >= 0:
            i = cy * self.w + cx
            self.bits[i] |= self.BITS[px & 1][py & 3]
            l = col[0] + col[1] + col[2]
            if l >= self.lum[i]:
                self.lum[i], self.col[i] = l, col

    def line(self, x0, y0, x1, y1, col, step=0.7):
        n = max(1, int(math.hypot(x1 - x0, y1 - y0) / step))
        for k in range(n + 1):
            u = k / n
            self.dot(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, col)

    def circle(self, cx, cy, r, col, step=0.8, a0=0.0, a1=math.tau):
        n = max(8, int(r * (a1 - a0) / step))
        for k in range(n + 1):
            a = a0 + (a1 - a0) * k / n
            self.dot(cx + math.cos(a) * r, cy + math.sin(a) * r, col)

    def draw(self, cv, over=False):
        for i, b in enumerate(self.bits):
            if b:
                x, y = i % self.w, i // self.w
                j = y * cv.w + x
                if over or cv.ch[j] == ' ':
                    cv.ch[j], cv.fg[j] = chr(0x2800 + b), self.col[i]


# ----------------------------------------------------------------------------- big block font

FONT = {
    'A': [" ### ", "#   #", "#####", "#   #", "#   #"], 'B': ["#### ", "#   #", "#### ", "#   #", "#### "],
    'C': [" ####", "#    ", "#    ", "#    ", " ####"], 'D': ["#### ", "#   #", "#   #", "#   #", "#### "],
    'E': ["#####", "#    ", "#### ", "#    ", "#####"], 'H': ["#   #", "#   #", "#####", "#   #", "#   #"],
    'I': ["#####", "  #  ", "  #  ", "  #  ", "#####"], 'K': ["#   #", "#  # ", "###  ", "#  # ", "#   #"],
    'L': ["#    ", "#    ", "#    ", "#    ", "#####"], 'N': ["#   #", "##  #", "# # #", "#  ##", "#   #"],
    'O': [" ### ", "#   #", "#   #", "#   #", " ### "], 'R': ["#### ", "#   #", "#### ", "#  # ", "#   #"],
    'S': [" ####", "#    ", " ### ", "    #", "#### "], 'T': ["#####", "  #  ", "  #  ", "  #  ", "  #  "],
    'V': ["#   #", "#   #", "#   #", " # # ", "  #  "], 'Y': ["#   #", " # # ", "  #  ", "  #  ", "  #  "],
    'M': ["#   #", "## ##", "# # #", "#   #", "#   #"], 'P': ["#### ", "#   #", "#### ", "#    ", "#    "],
    'G': [" ####", "#    ", "#  ##", "#   #", " ####"], 'U': ["#   #", "#   #", "#   #", "#   #", " ### "],
    'W': ["#   #", "#   #", "# # #", "## ##", "#   #"], 'F': ["#####", "#    ", "#### ", "#    ", "#    "],
    '<': ["   # ", "  #  ", " #   ", "  #  ", "   # "], '3': ["#### ", "    #", " ### ", "    #", "#### "],
    '-': ["     ", "     ", " ### ", "     ", "     "], '>': [" #   ", "  #  ", "   # ", "  #  ", " #   "],
    ' ': ["   ", "   ", "   ", "   ", "   "], '.': ["  ", "  ", "  ", "  ", "# "], '5': ["#####", "#    ", "#### ", "    #", "#### "],
}


def big_width(s, gap=1):
    return sum(len(FONT.get(c, FONT[' '])[0]) + gap for c in s) - gap


def big_text(cv, x, y, s, col, gap=1, reveal=1.0, glyph='█', shadow=None):
    """draw block letters; reveal in 0..1 shows columns left-to-right"""
    total = big_width(s, gap)
    lim = int(total * reveal + 0.999)
    cx = 0
    for c in s:
        rows = FONT.get(c, FONT[' '])
        for ry, row in enumerate(rows):
            for rx, p in enumerate(row):
                if p == '#' and cx + rx < lim:
                    if shadow:
                        cv.put(x + cx + rx + 1, y + ry + 1, '░', shadow)
                    cv.put(x + cx + rx, y + ry, glyph, col)
        cx += len(rows[0]) + gap
    return total


# ----------------------------------------------------------------------------- music clock

class Music:
    def __init__(self, path):
        with open(path) as f:
            m = json.load(f)
        self.m = m
        self.beat_len = m['beat']
        self.bar_len = m['bar']
        self.t0 = m['t0']
        self.env_ = m['env']
        self.fps = m['fps']
        self.duration = m['duration']
        self.sections = m['sections']

    def bar(self, n):
        return self.t0 + n * self.bar_len

    def beat_at(self, t):
        return (t - self.t0) / self.beat_len

    def bar_at(self, t):
        return (t - self.t0) / self.bar_len

    def pulse(self, t, decay=7.0, div=1.0):
        """1 on each beat (div=0.5 -> eighths, 4 -> bars), decaying exponentially"""
        b = self.beat_at(t) / div
        if b < 0:
            return 0.0
        return math.exp(-(b - math.floor(b)) * self.beat_len * div * decay)

    def env(self, name, t):
        a = self.env_[name]
        x = t * self.fps
        if x < 0 or x >= len(a) - 1:
            return 0.0
        i = int(x)
        f = x - i
        return a[i] * (1 - f) + a[i + 1] * f


def data_path(name):
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', name)

"""LOVE STORY — matrix edition. Core_Juliet and Patch_Romeo inside a rule-bound digital matrix.

Cold deep-blue bus halls and red patrol beams for the first three minutes; the sky shatters on the key change
(bar 94) and the world turns white, gold and green. No faces: the two are particle bodies, and they speak through
holographic terminal windows. Every frame is a pure function of song time.
"""
import math

from core import (GREY, DIM, TEXT, RED, OK, UNION, FONT, big_text, big_width, clamp, ease_in_out, ease_out, hash01,
                  mix, scale, smooth, text_width, Braille)
from story import big_zh, big_zh_width, draw_hud, draw_narration, energy, key_lift, kick, title_card
from matrix.story import NARRATION, CHAPTERS
from matrix import eggs

# ----------------------------------------------------------------------------- palette

DEEP = (8, 12, 34)            # matrix panel background
BLUE = (72, 128, 255)         # data streams
BLUE_DIM = (26, 44, 104)
BLUE_INK = (14, 22, 56)
SILVER = (204, 218, 240)
ROMEO = (96, 150, 255)        # Patch_Romeo
JULIET = (255, 240, 206)      # Core_Juliet
GOLD = (255, 210, 110)
WHITE = (252, 252, 255)
GREEN = (96, 232, 136)
WARM = (250, 246, 236)        # the world after the rewrite
INK = (70, 54, 24)            # text on the white world
UNION_NEW = (206, 160, 255)   # gold and blue become this together at the merge: twilight violet
UNION_ON_WHITE = (118, 58, 206)
PALE_UNION = (234, 222, 255)


class Ctx:
    def __init__(self, cv, m, t):
        self.cv, self.m, self.t = cv, m, t
        self.W, self.H = cv.w, cv.h - 3
        self.br = Braille(cv.w, cv.h)
        self.cx, self.cy = self.W / 2, self.H / 2
        self.e = energy(m, t)
        self.k = kick(m, t)
        self.beat_n = m.beat_at(t)
        self.white = 0.0          # radius (cells) of the revealed white world; set by the override scenes
        self.white_c = None
        self.grey = 0.0           # desaturation of the bridge
        self.red = 0.0            # alarm tint
        self.shake = 0.0          # camera shake (fear, alarms, the reboot)
        self.big = self.H >= 36   # 2x detailed figures when there is room
        self.figs = []            # figure boxes, kept visible on the white world
        self.status = None        # (juliet fields, romeo fields, corner) for the process panel
        self.ticker = None        # strings for the row-1 hex/log ticker
        self.union = 0.0          # 0..1: how far gold and blue have become the one new colour (the merge)

    def bar(self, n):
        return self.m.bar(n)


# ----------------------------------------------------------------------------- primitives

def typed(s, t, t0, cps=28.0):
    if t < t0:
        return ''
    return s[:int((t - t0) * cps)]


def cursor_on(S, period_beats=1.0):
    b = S.beat_n
    return (b / period_beats) % 2 < 1.0 if b >= 0 else int(S.t * 2) % 2 == 0


def streams(S, lanes, speed=22.0, col=BLUE, alpha=0.8, phase=0.0, packets=3):
    """horizontal data streams: a dim dotted line with bright packets racing along it, one step per eighth"""
    W, t = S.W, S.t
    step8 = math.floor(S.beat_n * 2) if S.beat_n >= 0 else 0
    for li, y in enumerate(lanes):
        if not (1 <= y < S.H):
            continue
        base = scale(col, 0.18 * alpha)
        for px in range(0, W * 2, 3):
            S.br.dot(px + (li % 3), y * 4 + 2, base)
        for p in range(packets):
            sp = speed * (0.7 + 0.5 * hash01(li * 31 + p * 7))
            pos = (t * sp + hash01(li * 11 + p) * W + phase + step8 * 0.8) % (W + 14) - 7
            for k in range(7):
                a = (1 - k / 7) ** 1.5 * alpha
                S.br.dot((pos - k) * 2, y * 4 + 2, scale(col, a))
                S.br.dot((pos - k) * 2 + 1, y * 4 + 2, scale(col, a * 0.8))


def code_rain(S, density=0.4, col=BLUE_DIM, region=None, glyphs='01{}[]<>;:=#$%&*/\\|+-'):
    """columns of code glyphs stepping down on every eighth note"""
    W, H = S.W, S.H
    x0, y0, x1, y1 = region or (0, 1, W - 1, H - 1)
    step8 = math.floor(S.beat_n * 2) if S.beat_n >= 0 else int(S.t * 4)
    n = int((x1 - x0) * density)
    for i in range(n):
        x = x0 + int(hash01(i * 17 + 3) * (x1 - x0))
        sp = 1 + int(hash01(i * 5) * 2)
        y = y0 + (int(hash01(i * 9) * (y1 - y0)) + step8 * sp) % max(1, (y1 - y0))
        for k in range(3):
            yy = y - k
            if y0 <= yy <= y1 and S.cv.get(x, yy) == ' ':
                g = glyphs[int(hash01(i * 13 + yy * 7) * len(glyphs))]
                S.cv.put(x, yy, g, scale(col, (1 - k * 0.3)))


def threads(S, rows, x0, x1, col=GREY, alpha=0.5):
    """the routine processes: identical progress bars that all advance in lockstep (the masquerade)"""
    b = S.beat_n
    for i, y in enumerate(rows):
        if not (1 <= y < S.H):
            continue
        w = x1 - x0
        n = int(((b * 0.5 + i * 0.37) % 1.0) * w)
        S.cv.text(x0, y, f'thread_{i:02d} [', scale(col, alpha * 0.7))
        xx = x0 + 11
        S.cv.text(xx, y, '▪' * n + '·' * (w - n), scale(col, alpha * 0.6))
        S.cv.text(xx + w, y, '] routine', scale(col, alpha * 0.7))


def pyramid(S, px, base_y, h, col=BLUE_DIM, glow=0.0, label=True, port=None):
    """the read-only memory pyramid; returns (top_y, half_width_at(row))"""
    cv = S.cv
    top = base_y - h
    for i in range(h + 1):
        y = top + i
        if not (1 <= y <= S.H - 1):
            continue
        hw = 1 + int(i * 1.9)
        l, r = int(px - hw), int(px + hw)
        c = mix(col, GOLD, glow * 0.6)
        cv.put(l, y, '╱', scale(c, 1.2))
        cv.put(r, y, '╲', scale(c, 1.2))
        for x in range(l + 1, r):
            if cv.get(x, y) == ' ':
                g = '▒' if (i % 4 == 0) else ('░' if (x + i) % 2 == 0 else ' ')
                if g != ' ':
                    cv.put(x, y, g, scale(c, 0.55 + 0.45 * glow))
    cv.text(px - 2, top - 1, '▄▄▄▄▄', scale(mix(col, GOLD, glow), 1.4))
    if label and h > 8:
        s = 'CORE MEMORY · READ-ONLY'
        if 2 * (1 + int(h * 0.62 * 1.9)) > text_width(s) + 2:
            cv.text(px - text_width(s) // 2, top + int(h * 0.62), s, scale(mix(SILVER, GOLD, glow), 0.7))
            cv.text(px - 4, top + int(h * 0.62) + 1, '只读金字塔', scale(mix(SILVER, GOLD, glow), 0.55))
    if port is not None:
        py = top + int(h * 0.5)
        hw = 1 + int((py - top) * 1.9)
        cv.put(px - hw, py, '▯', mix(BLUE_DIM, GREEN, port))
        cv.text(px - hw - 5, py, 'port', scale(mix(GREY, GREEN, port), 0.7))
        return top, (px - hw, py)
    return top, None


FACES = {
    'cold': '(-_-)', 'curious': '(o_o)', 'smile': '(^_^)', 'love': '(^3^)', 'joy': '(^o^)', 'wink': '(^_-)',
    'fear': '(>_<)', 'cry': '(;_;)', 'sob': '(T_T)', 'blank': '(._.)', 'dead': '(x_x)', 'shout': '(>o<)',
    'star': '(*_*)', 'sleep': '(-_-)',
}
POSES = {
    'idle': ('/|\\', '/ \\'), 'reach_r': ('/|─', '/ \\'), 'reach_l': ('─|\\', '/ \\'), 'up': ('\\|/', '/ \\'),
    'fly': ('\\|/', ' v '), 'sneak': ('-|\\', '/ _'), 'kneel': ('/|\\', '/ _'), 'sad': ('_|_', '/ \\'),
    'collapse': ('_|_', '_ _'), 'hug_r': ('/|─', '/ \\'), 'hug_l': ('─|\\', '/ \\'), 'throw': ('/|/', '/ \\'),
}


def blink(face):
    return face[0] + '-' + face[2] + '-' + face[4] if len(face) == 5 else face


SKIRT = {'fly': '\\_/', 'collapse': '___', 'sneak': '/_\\', 'kneel': '/_,'}      # her legs row, by pose


ARMS = {'idle': '/--|--\\', 'up': '\\  |  /', 'reach_r': '/--|---', 'reach_l': '---|--\\', 'hug_r': '/--|---',
        'hug_l': '---|--\\', 'fly': '\\__|__/', 'sneak': '---|--\\', 'kneel': '/--|--\\', 'sad': '\\--|--/',
        'collapse': '___|___', 'throw': '/--|--/'}
SKIRT2 = {'fly': ('\\___/', ' \\___/ '), 'collapse': ('_____', '_______'), 'kneel': ('/___\\', '/____,_')}
LEGS2 = {'fly': ('\\   /', '  \\_/  '), 'collapse': ('_____', '_______'), 'kneel': ('|  ,/', '_|__/  '),
         'sneak': ('|  /', ' |_/   ')}


def figure(S, x, y, face='smile', pose='idle', col=JULIET, k=1.0, aura=1.0, decay=0.0, glitch=0.0, shiver=0.0,
           sway=0.0, bounce=0.0, size=1.0, tail=None, halo=0.0, orbit=False, dance=False, gender='f'):
    """a character built from symbols: a kaomoji face, limbs, a particle aura.

    gender 'f': long hair strands flanking the face, a flower in the hair, a waist and a skirt; 'm': short spiky
    hair, a collar, a belt and trousers. On a tall terminal (S.big) the figure is the detailed 7-row version.

    emotion is motion: shiver = 16th-note jitter (fear), sway = slow drift (sadness), bounce = a hop on the beat (joy),
    dance = arms up on the off-beats, blink on every downbeat. decay greys the aura and corrupts the body; glitch
    sprays corrupted cells. tail = heading vector for Romeo's comet tail; halo = the gold ring of root.
    """
    if k <= 0.02:
        return
    t, cv, br, m = S.t, S.cv, S.br, S.m
    big = S.big and size >= 1.0
    dx = 0.0
    if shiver:
        dx += (hash01(int(t * 16) * 7 + 1) - 0.5) * 2.0 * shiver
    if sway:
        dx += math.sin(t * 1.9) * sway
    dy = -1 if (bounce and m.pulse(t, 9) > 0.55) else 0
    x, y = int(round(x + dx)), int(round(y + dy))
    bb = m.bar_at(t)
    ph = bb - math.floor(bb)
    f = FACES.get(face, face)
    if 0 <= ph < 0.07 and decay < 0.5 and face not in ('sleep', 'dead'):
        f = blink(f)
    if dance and int(math.floor(S.beat_n)) % 2 == 1 and pose == 'idle':
        pose = 'up'

    def corrupt(s_, seed):
        if decay <= 0:
            return s_
        return ''.join(c if hash01(seed * 13 + i * 7 + int(t * 3)) > decay * 0.8 else '▒░?'[int(hash01(seed + i) * 3)]
                       for i, c in enumerate(s_))
    if decay > 0.85:
        f = FACES['dead']
    elif decay > 0.6:
        f = corrupt(f, 1)
    c = scale(col, 0.4 + 0.6 * k)
    dim = scale(c, 0.85)
    if big:
        arms = corrupt(ARMS.get(pose, ARMS['idle']), 2)
        if gender == 'f':
            l1, l2 = SKIRT2.get(pose, ('/___\\', '/_____\\'))
            rows = [(-3, -3, '.-·✿·-.', dim), (-4, -2, ') ' + f + ' (', c), (-3, -1, ')  |  (', dim), (-3, 0, arms, c),
                    (-3, 1, ' \\_|_/ ', c), (-2, 2, corrupt(l1, 3), c), (-3, 3, corrupt(l2, 7), dim)]
        else:
            l1, l2 = LEGS2.get(pose, ('|   |', '_|   |_'))
            rows = [(-2, -3, '^^^^^', dim), (-2, -2, f, c), (-2, -1, '.-|-.', dim), (-3, 0, arms, c),
                    (-2, 1, '[_|_]', c), (-2, 2, corrupt(l1, 3), c), (-3, 3, corrupt(l2, 7), dim)]
        box = (x - 5, y - 4, x + 5, y + 3)
    else:
        torso, legs = POSES.get(pose, POSES['idle'])
        torso, legs = corrupt(torso, 2), corrupt(legs, 3)
        if gender == 'f':
            legs = corrupt(SKIRT.get(pose, '/_\\'), 3)
            rows = [(-2, -2, corrupt('.·✿·.', 4), dim), (-3, -1, ')' + f + '(', c), (-1, 0, torso, c), (-1, 1, legs, c)]
        else:
            rows = [(-2, -2, ' ^^^ ', dim), (-2, -1, f, c), (-1, 0, torso, c), (-1, 1, legs, c)]
        box = (x - 4, y - 3, x + 4, y + 1)
    for ddx, ddy, txt, cc in rows:
        cv.text(x + ddx, y + ddy, txt, cc)
    S.figs.append((box, gender))
    sz = (1.9 if big else 1.0) * size
    if aura > 0:
        p = m.pulse(t, 5)
        for i in range(int(44 * aura)):
            a = hash01(i * 7 + 1) * math.tau + t * 0.5 * (1 if i % 2 else -1)
            r = 0.7 + hash01(i * 3 + 2) * 0.6 + 0.15 * p
            px = x + math.cos(a) * r * 3.4 * sz
            py = y + math.sin(a) * r * 2.3 * sz
            if hash01(i * 5) < decay:
                py += decay * 5 * hash01(i * 11)
                cc = scale(mix(col, GREY, 0.8), 0.4 * k)
            else:
                cc = scale(mix(col, WHITE, 0.3 * hash01(i)), (0.3 + 0.5 * hash01(i * 9)) * k)
            br.dot(px * 2, py * 4, cc)
    if tail:
        hx, hy = tail
        n = math.hypot(hx, hy) or 1.0
        hx, hy = hx / n, hy / n
        for i in range(2, int(16 * sz)):
            px = x - hx * (i * 0.9 + 3 * (sz - 1)) + 0.3 * math.sin(t * 6 + i)
            py = y - hy * (i * 0.45 + 2 * (sz - 1)) + 0.25 * math.cos(t * 5 + i * 0.7)
            br.dot(px * 2, py * 4 + 2, scale(col, (1 - i / (16 * sz)) ** 1.4 * k))
    if orbit:
        for j in range(3):
            a = t * 4.0 + j * math.tau / 3
            br.dot((x + math.cos(a) * 3.2 * sz) * 2 + 1, (y + math.sin(a) * 1.6 * sz) * 4 + 2, scale(SILVER, 0.9 * k))
    if glitch > 0:
        for i in range(int(12 * glitch)):
            gx = x + (hash01(i * 7 + int(t * 9)) - 0.5) * 7 * sz
            gy = y + (hash01(i * 3 + int(t * 7)) - 0.5) * 5 * sz
            cv.put(gx, gy, '▒?#%'[int(hash01(i + int(t * 11)) * 4)], scale(GREY, 0.8))
    if halo > 0:
        hy_ = y - (4.6 if big else 3.4)
        br.circle(x * 2 + 1, hy_ * 4 + 2, 9 * sz, scale(mix(GOLD, UNION_NEW, S.union), 0.9 * halo), step=0.8)
        br.circle(x * 2 + 1, hy_ * 4 + 2, 7 * sz, scale(WHITE, 0.5 * halo), step=1.0)


def juliet(S, x, y, k=1.0, decay=0.0, glitch=0.0, size=1.0, col=JULIET, core_on=True, face='smile', pose='idle',
           shiver=0.0, sway=0.0, bounce=0.0, dance=False):
    col = mix(col, UNION_NEW, S.union)
    figure(S, x, y, face=face if core_on else 'sleep', pose=pose, col=col, k=k, aura=1.0, decay=decay, glitch=glitch,
           shiver=shiver, sway=sway, bounce=bounce, size=size, dance=dance, gender='f')


def romeo(S, x, y, k=1.0, heading=(1.0, 0.0), size=1.0, halo=0.0, col=ROMEO, face='wink', pose='fly', shiver=0.0,
          sway=0.0, bounce=0.0, dance=False, decay=0.0, glitch=0.0):
    col = mix(col, UNION_NEW, S.union)
    figure(S, x, y, face=face, pose=pose, col=col, k=k, aura=0.5, decay=decay, glitch=glitch, shiver=shiver, sway=sway,
           bounce=bounce, size=size, tail=heading, halo=halo, orbit=True, dance=dance, gender='m')


def holo(S, x, y, who, lines, t0, col, cps=26.0, above=True, w=None, dur=7.0):
    """a holographic terminal window above a character: typed lines and a `_` cursor blinking on the beat.
    It stays `dur` seconds after it starts, then fades."""
    t, cv = S.t, S.cv
    if t < t0 or t > t0 + dur:
        return
    shown = []
    for i, l in enumerate(lines):
        ts = t0 + sum(len(lines[j]) / cps + 0.35 for j in range(i))
        if t < ts:
            break
        shown.append(typed(l, t, ts, cps))
    if not shown:
        return
    w = w or max(text_width(l) for l in lines) + 4
    h = len(shown) + 1
    x0 = int(min(max(1, x - w // 2), S.W - w - 1))
    y0 = int(y - h - 4) if above else int(y + 3)      # clear of the hair (y-2), the face (y-1) and the legs (y+1)
    y0 = max(1, min(y0, S.H - h - 1))
    a = clamp((t - t0) / 0.25) * clamp((t0 + dur - t) / 0.4)
    cv.box(x0, y0, x0 + w, y0 + h, scale(col, 0.55 * a), style='round', title=who, title_col=scale(col, 0.9 * a))
    for i, s in enumerate(shown):
        cv.text(x0 + 2, y0 + 1 + i, s, scale(mix(col, WHITE, 0.4), a))
    last = shown[-1]
    if cursor_on(S, 0.5):
        cv.put(x0 + 2 + text_width(last), y0 + len(shown), '_', scale(col, a))


def warnings(S, msg, n, col=RED, seed=0, flicker=True, region=None):
    """`n` copies of a warning scattered over the screen, each blinking on its own eighth"""
    W, H = S.W, S.H
    x0, y0, x1, y1 = region or (0, 2, W - 1, H - 2)
    e8 = math.floor(S.beat_n * 2) if S.beat_n >= 0 else 0
    for i in range(n):
        if flicker and hash01(i * 7 + e8 * 13 + seed) < 0.3:
            continue
        x = x0 + int(hash01(i * 3 + seed) * max(1, (x1 - x0 - text_width(msg))))
        y = y0 + int(hash01(i * 5 + seed * 7) * max(1, (y1 - y0)))
        S.cv.text(x, y, msg, scale(col, 0.5 + 0.5 * hash01(i + seed)))


def beam(S, x, col=RED, width=1, alpha=0.6, y0=1, y1=None):
    y1 = S.H - 1 if y1 is None else y1
    for dx in range(-width, width + 1):
        g = '█' if dx == 0 else '▒' if abs(dx) == 1 else '░'
        a = alpha * (1 - abs(dx) / (width + 1))
        for y in range(int(y0), int(y1) + 1):
            if S.cv.get(int(x) + dx, y) == ' ':
                S.cv.put(x + dx, y, g, scale(col, a))


def shield(S, x, y, rx, ry, col, alpha=0.8, label=None):
    S.br.circle(x * 2 + 1, y * 4 + 2, rx * 2, scale(col, alpha), step=0.9)   # drawn in px units with x-stretch below
    # a proper ellipse: redraw with y-scale
    n = int(rx * 8)
    for k in range(n):
        a = k / n * math.tau
        S.br.dot((x + math.cos(a) * rx) * 2 + 1, (y + math.sin(a) * ry) * 4 + 2, scale(col, alpha))
    if label:
        S.cv.text(x - text_width(label) // 2, y - ry - 1, label, scale(col, alpha))


def field(S, x0, x1, y_ground, rows=4, col=(70, 150, 90), density=0.35, sway=True):
    """the abandoned sector: old code grown like weeds"""
    e8 = math.floor(S.beat_n * 2) if S.beat_n >= 0 else 0
    glyphs = ';{}[]<>#=~^`\'"'
    for i in range(int((x1 - x0) * rows * density)):
        x = x0 + int(hash01(i * 7 + 11) * (x1 - x0))
        h = int(hash01(i * 3 + 5) * rows)
        g = glyphs[(int(hash01(i * 13) * len(glyphs)) + (e8 if sway and h else 0)) % len(glyphs)]
        y = y_ground - h
        if S.cv.get(x, y) == ' ':
            S.cv.put(x, y, g, scale(col, 0.35 + 0.5 * (1 - h / rows)))
    S.cv.hline(x0, x1, y_ground + 1, '¨', scale(col, 0.35))


def cracks(S, cx, cy, k, col=WHITE, n=9, seed=0):
    """radiating cracks from (cx, cy); k in 0..1 grows them to the screen edges"""
    W, H = S.W, S.H
    for i in range(n):
        a = (i / n) * math.tau + hash01(i * 3 + seed) * 0.6
        L = (W * 0.75) * k * (0.6 + 0.4 * hash01(i * 7 + seed))
        x, y = cx, cy
        segs = 7
        for s in range(segs):
            a2 = a + (hash01(i * 11 + s * 5 + seed) - 0.5) * 0.9
            L2 = L / segs
            nx, ny = x + math.cos(a2) * L2, y + math.sin(a2) * L2 * 0.5
            dx, dy = nx - x, ny - y
            g = '─' if abs(dx) > abs(dy) * 3 else '│' if abs(dy) * 1.2 > abs(dx) else ('╲' if dx * dy > 0 else '╱')
            S.cv.line(x, y, nx, ny, g, scale(col, 0.9 - 0.4 * s / segs))
            x, y = nx, ny


def shards(S, cx, cy, k, col=BLUE_DIM, n=60, seed=0):
    for i in range(n):
        a = hash01(i * 3 + seed) * math.tau
        sp = 0.4 + hash01(i * 7 + seed)
        r = ease_out(k) * sp * S.W * 0.55
        x = cx + math.cos(a) * r
        y = cy + math.sin(a) * r * 0.5
        g = '▓▒░'[min(2, int(k * 3))]
        S.cv.put(x, y, g, scale(col, max(0.0, 1 - k)))
        if hash01(i) < 0.4:
            S.cv.put(x + 1, y, g, scale(col, max(0.0, 1 - k) * 0.7))


def petals(S, amount, speed=1.0, region=None):
    W, H = S.W, S.H
    x0, y0, x1, y1 = region or (0, 1, W - 1, H - 1)
    cols = [(255, 120, 150), (255, 190, 90), (120, 200, 255), (160, 240, 150), (230, 160, 255), (255, 240, 120)]
    for i in range(int(160 * clamp(amount))):
        u = hash01(i * 7 + 2)
        sp = (0.6 + hash01(i * 3) * 1.2) * speed
        y = y0 + ((S.t * sp * 3 + hash01(i * 5) * (y1 - y0)) % (y1 - y0))
        x = x0 + (u * (x1 - x0) + math.sin(S.t * 1.3 + i) * 2.5) % (x1 - x0)
        g = '❀✿❁✾*·'[int(hash01(i * 11) * 6)]
        S.cv.put(x, y, g, cols[i % len(cols)])


def light_points(S, amount, speed=1.0, col=WHITE, region=None):
    """the data streams dissolved into pure points of light, drifting down"""
    W, H = S.W, S.H
    x0, y0, x1, y1 = region or (0, 1, W - 1, H - 1)
    for i in range(int(220 * clamp(amount))):
        u = hash01(i * 7 + 2)
        sp = (0.5 + hash01(i * 3) * 1.3) * speed
        y = y0 + ((S.t * sp * 3 + hash01(i * 5) * (y1 - y0)) % (y1 - y0))
        x = x0 + (u * (x1 - x0) + math.sin(S.t * 1.1 + i) * 2.0) % (x1 - x0)
        g = '·•∘*˙'[int(hash01(i * 11) * 5)]
        S.cv.put(x, y, g, scale(mix(col, GOLD, 0.3 * hash01(i)), 0.5 + 0.5 * hash01(i * 13)))


def desaturate(S, amount):
    if amount <= 0:
        return
    cv = S.cv
    for i, c in enumerate(cv.fg):
        if c is not None:
            l = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11)
            cv.fg[i] = mix(c, (l, l, l), amount)


def tint(S, col, amount):
    if amount <= 0:
        return
    cv = S.cv
    for i, c in enumerate(cv.fg):
        if c is not None:
            cv.fg[i] = mix(c, col, amount)


JULIET_ON_WHITE = (206, 128, 10)      # saturated gold ink
ROMEO_ON_WHITE = (26, 76, 220)        # saturated blue ink
PALE_GOLD = (255, 236, 196)
PALE_BLUE = (214, 226, 255)


def whiten(S, cx, cy, radius):
    """the revealed white world: inside the ellipse the background turns warm white and the ink dark gold.
    The characters stay saturated gold / blue on a pale tinted card so they can always be found."""
    if radius <= 0:
        return
    cv = S.cv
    W = cv.w
    for y in range(1, S.H):
        dy = (y - cy) * 2.0
        if abs(dy) >= radius:
            continue
        half = math.sqrt(radius * radius - dy * dy)
        x0, x1 = max(0, int(cx - half)), min(W - 1, int(cx + half))
        base = y * W
        for x in range(x0, x1 + 1):
            i = base + x
            cv.bg[i] = WARM
            c = cv.fg[i]
            if c is not None:
                l = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255
                cv.fg[i] = mix(INK, mix(GOLD, c, 0.4), 0.25 + 0.45 * l)
                cv.fg[i] = scale(cv.fg[i], 0.78)
    for (bx0, by0, bx1, by1), gender in S.figs:
        mx, my = (bx0 + bx1) // 2, (by0 + by1) // 2
        if not (0 <= mx < W and 1 <= my < S.H) or cv.bg[my * W + mx] != WARM:
            continue
        ink = mix(JULIET_ON_WHITE if gender == 'f' else ROMEO_ON_WHITE, UNION_ON_WHITE, S.union)
        pale = mix(PALE_GOLD if gender == 'f' else PALE_BLUE, PALE_UNION, S.union)
        for y in range(max(1, by0), min(S.H, by1 + 1)):
            base = y * W
            for x in range(max(0, bx0), min(W, bx1 + 1)):
                i = base + x
                cv.bg[i] = pale
                if cv.fg[i] is not None:
                    cv.fg[i] = ink


# ----------------------------------------------------------------------------- layout helpers

def info(S, j, r, ticker, corner='tr'):
    """the two processes' live status (permission / state / heartbeat / GC risk) and the row-1 hex log ticker"""
    S.status = (j, r, corner)
    S.ticker = ticker


def draw_status(S):
    if not S.status or S.W < 120:
        return
    cv, W, H = S.cv, S.W, S.H
    j, r, corner = S.status
    w, h = 50, 3
    x0 = W - w - 2 if corner.endswith('r') else 2
    y0 = 2 if corner.startswith('t') else H - h - 7
    cv.box(x0, y0, x0 + w, y0 + h, scale(SILVER, 0.7), style='round', title='processes', title_col=mix(JULIET, ROMEO, 0.5))
    jc = mix(JULIET, UNION_NEW, S.union)
    rc = mix(mix(ROMEO, WHITE, 0.2), UNION_NEW, S.union)
    cv.text(x0 + 2, y0 + 1, f"♀ Juliet  {j.get('perm', ''):<10} {j.get('state', ''):<10} ♥{j.get('hr', 119):>3}", jc)
    cv.text(x0 + 2, y0 + 2, f"♂ Romeo   {r.get('sig', ''):<10} {r.get('state', ''):<10} GC {r.get('gc', 0):>3}%", rc)
    cv.put(x0 + w - 2, y0 + 1, '●' if S.m.pulse(S.t, 8) > 0.5 else '○', jc)
    cv.put(x0 + w - 2, y0 + 2, '●' if S.m.pulse(S.t, 8) > 0.5 else '○', rc)


def draw_ticker(S):
    if not S.ticker or S.W < 100:
        return
    cv, W = S.cv, S.W
    e8 = math.floor(S.beat_n * 2) if S.beat_n >= 0 else int(S.t * 4)
    body = '   ·   '.join(S.ticker)
    body = (body + '   ·   ') * (1 + (W * 2) // max(1, text_width(body)))
    off = (e8 * 3) % max(1, text_width(body) // 2)
    cv.fill(0, 1, W - 1, 1, ' ', None)
    cv.text(-off, 1, body, scale((90, 225, 230), 0.85))
    cv.text(0, 1, '▶', scale((90, 225, 230), 0.9))


def hexes(seed, n=6):
    return ' '.join(f'0x{int(hash01(seed * 7 + i * 13) * 65535):04x}' for i in range(n))


def layout(S):
    W, H = S.W, S.H
    px = W * 0.72
    h = int(H * 0.62)
    base = H - 1
    return px, base, h, base - h


def log_pane(S, x0, y0, w, h, title, lines, t0, every, col, hl=None, maxn=None):
    cv = S.cv
    cv.box(x0, y0, x0 + w, y0 + h, scale(col, 0.5), style='round', title=title, title_col=scale(col, 0.9))
    shown = [(i, l) for i, l in enumerate(lines) if S.t >= t0 + i * every]
    shown = shown[-(maxn or (h - 1)):]
    for k, (i, l) in enumerate(shown):
        c = col
        if hl:
            for key, hc in hl.items():
                if key in l:
                    c = hc
        cv.text(x0 + 2, y0 + 1 + k, typed(l, S.t, t0 + i * every, 80)[:w - 3], scale(c, 0.9))


# ----------------------------------------------------------------------------- act 0 · 启动 (bars 0–8)

def s_intro(S):
    t, m, cv = S.t, S.m, S.cv
    W, H = S.W, S.H
    zoom = ease_in_out(clamp(t / m.bar(4)))                  # slow zoom in
    px, base, h, top = layout(S)
    hh = int(h * (0.45 + 0.55 * zoom))
    lanes = [int(3 + i * (H - 6) / 9) for i in range(10)]
    streams(S, lanes, speed=10 + 14 * zoom, alpha=0.55 + 0.35 * zoom)
    code_rain(S, density=0.12 + 0.2 * zoom)
    top, _ = pyramid(S, px, base, hh, glow=0.0)
    jx, jy = px, top - (5 if S.big else 3)
    a = smooth(m.bar(3.5), m.bar(4.5), t)
    if a > 0:
        juliet(S, jx, jy, k=a, face='cold')
        cv.text(jx - 24, jy - 1, 'Core_Juliet ♀', scale(JULIET, 0.8 * a))
        cv.text(jx - 24, jy, '核心逻辑进程', scale(JULIET, 0.55 * a))
    # the boot line typed in the centre
    t1 = m.bar(1.5)
    s1 = typed('System initialized.  Read-only mode activated.', t, t1, 18)
    if s1:
        y = int(H * 0.42)
        cv.center(y, s1, scale(SILVER, 0.9 * (1 - smooth(m.bar(6.5), m.bar(7.5), t))))
        if len(s1) < 46 and cursor_on(S, 0.5):
            cv.put((W - 46) // 2 + len(s1), y, '_', SILVER)
        cv.center(y + 1, typed('系统已初始化。只读模式已激活。', t, t1 + 1.6, 10), scale(SILVER, 0.6 * (1 - smooth(m.bar(6.5), m.bar(7.5), t))))
    cv.text(2, 2, 'LOVE STORY · 永恒协议版 · Eternity Protocol', scale(SILVER, 0.6))
    cv.text(2, 3, typed('MATRIX v1989 · 全球数据同步周期 · day 1', t, 0.3, 24), scale(GREY, 0.8))
    cv.text(2, 4, typed('fearless_mode = true', t, m.bar(2), 20), scale(BLUE, 0.6))
    info(S, {'perm': 'read-only', 'state': 'idle', 'hr': 72}, {'sig': 'none', 'state': 'hidden', 'gc': 5},
         ['boot ' + hexes(1), 'mount /core ok', 'policy read-only', 'sync cycle 1989', hexes(2, 4), 'threads 65536'])


# ----------------------------------------------------------------------------- act 1 · 初见 (bars 8–24)

def s_bus(S):
    t, m, cv = S.t, S.m, S.cv
    W, H = S.W, S.H
    pan = math.sin((t - m.bar(8)) * 0.35) * 3.0                 # breathing pan
    px, base, h, top = layout(S)
    px += pan
    lanes = [int(3 + i * (H - 6) / 9) for i in range(10)]
    streams(S, lanes, speed=22, alpha=0.75, phase=-pan * 3)
    code_rain(S, density=0.25)
    threads(S, [lanes[2] - 1, lanes[5] - 1, lanes[8] - 1], 3 + int(pan), 3 + int(pan) + 22, alpha=0.6)
    touch = smooth(m.bar(23.4), m.bar(23.9), t)
    ripple = smooth(m.bar(23.9), m.bar(24.0), t)
    top, _ = pyramid(S, px, base, h, glow=0.6 * touch)
    jx, jy = px, top - (5 if S.big else 3)
    gap = 12 if S.big else 10
    # Romeo weaves through the lanes along a smooth keyframed path, lane to lane, up to the platform
    keys = [(10.0, -6, lanes[9]), (13.0, W * 0.22, lanes[7]), (16.0, W * 0.42, lanes[5]), (19.0, W * 0.55, lanes[4]),
            (21.5, px - 24, lanes[3]), (23.4, px - gap, jy + 1)]
    bb = m.bar_at(t)
    rx, ry = keys[0][1], keys[0][2]
    for (b0, x0_, y0_), (b1, x1_, y1_) in zip(keys, keys[1:]):
        if bb >= b1:
            rx, ry = x1_, y1_
        elif bb >= b0:
            u = ease_in_out((bb - b0) / (b1 - b0))
            rx, ry = x0_ + (x1_ - x0_) * u, y0_ + (y1_ - y0_) * u
            break
    appear = smooth(m.bar(9.5), m.bar(10.5), t)
    heading = (1.0, -0.5 if bb >= 19 else 0.0)
    rface = 'wink' if t < m.bar(14) else 'curious' if t < m.bar(16) else 'smile' if t < m.bar(23.4) else 'love'
    rpose = 'fly' if t < m.bar(21.5) else 'reach_r'
    romeo(S, rx, ry, k=appear, heading=heading, face=rface, pose=rpose)
    gc = int(12 + 30 * clamp((bb - 14) / 9))
    info(S, {'perm': 'read-only', 'state': 'locked' if bb < 16 else 'resonant', 'hr': int(72 + 47 * clamp((bb - 16) / 8))},
         {'sig': 'none', 'state': 'disguised' if bb < 14 else 'seen', 'gc': gc},
         ['ping ' + hexes(3, 3), 'relay ttl 64', 'mask on', hexes(4, 5), 'resonance 2 nodes', 'SYN ' + hexes(5, 2)])
    if appear > 0.5 and t < m.bar(16):
        cv.text(rx - 5, ry + (5 if S.big else 3), 'Patch_Romeo ♂ · ping', scale(ROMEO, 0.7))
    jface = 'cold' if t < m.bar(14) else 'curious' if t < m.bar(16) else 'smile' if t < m.bar(23.4) else 'love'
    jpose = 'idle' if t < m.bar(21) else 'reach_l'
    juliet(S, jx, jy, k=1.0, face=jface, pose=jpose)
    cv.text(jx - 24, jy - 1, 'Core_Juliet ♀', scale(JULIET, 0.6))
    # the gateway
    gx = px - 24
    cv.vline(gx, lanes[0] - 1, lanes[-1] + 1, '┆', scale(BLUE_DIM, 1.3))
    cv.text(gx - 6, lanes[0] - 2, '中继网关 relay', scale(GREY, 0.7))
    # eyes meet: a faint line of sight, then resonance rings, then the pulse and the touch
    if t >= m.bar(14):
        a = smooth(m.bar(14), m.bar(15), t)
        S.br.line(rx * 2 + 2, ry * 4 + 1, jx * 2, jy * 4 + 4, scale(mix(ROMEO, JULIET, 0.5), 0.3 * a), step=3.0)
    if t >= m.bar(16):
        bb = m.bar_at(t)
        for who, (x, y, col) in enumerate(((rx, ry, ROMEO), (jx, jy, JULIET))):
            ph = bb - math.floor(bb)
            r = 2 + ph * 10
            S.br.circle(x * 2 + 1, y * 4 + 2, r * 2, scale(col, (1 - ph) * 0.6), step=1.6)
    if t >= m.bar(21.5):
        u2 = clamp((t - m.bar(21.5)) / (m.bar(23.4) - m.bar(21.5)))
        n = int(40 * u2)
        for k in range(n):
            f = k / 40
            x, y = rx + 4 + (jx - 4 - rx - 4) * f, ry + (jy - ry) * f
            S.br.dot(x * 2 + 1, y * 4 + 2, scale(mix(ROMEO, JULIET, f), 0.9))
        # she reaches
        reach = smooth(m.bar(21), m.bar(23.4), t)
        for k in range(int(10 * reach)):
            f = k / 10
            S.br.dot((jx - 1 - (jx - rx) * 0.12 * f) * 2, (jy + 1 + (ry - jy) * 0.12 * f) * 4, scale(JULIET, 0.9))
    holo(S, rx, ry, 'Patch_Romeo', ['> 伪装：无害 ping 请求', '> 签名：无 · 证书：无'], m.bar(11), ROMEO)
    holo(S, jx, jy - 3, 'Core_Juliet', ['> 观测到异常波长', '> 来源：底层沙盒'], m.bar(15), JULIET)
    if t >= m.bar(20.5):
        holo(S, S.W * 0.5, H * 0.75, 'handshake', ['SYN  →  Romeo', 'SYN-ACK  ←  Juliet', '认证：无 · 母体未知'], m.bar(20.5),
             mix(ROMEO, JULIET, 0.5), cps=20, above=False)
    if touch > 0:
        cv.put(jx - 1, jy + 1, '✧', scale(GOLD, touch))
    if ripple > 0 or (m.bar(24) - 0.01 <= t):
        pass
    title_card(S, m.bar(8), '初见', 'FIRST SIGHT · 总线大厅', hold=1.2, y=4)
    log_pane(S, 2, H - 9, 40, 7, 'bus monitor', ['sync cycle 1989 · threads: 65536', 'anomaly scan: 0 hits',
                                                 'ping from sandbox → relay (ttl 64)', 'warn: unsigned payload at relay',
                                                 'resonance detected: 2 nodes'], m.bar(9), m.bar_len * 2.5, GREY,
             hl={'warn': GOLD, 'resonance': JULIET})


# ----------------------------------------------------------------------------- act 2 · 阻碍 (bars 24–40)

def s_firewall(S):
    t, m, cv = S.t, S.m, S.cv
    W, H = S.W, S.H
    px, base, h, top = layout(S)
    build = smooth(m.bar(24), m.bar(30), t)
    chorus = t >= m.bar(30)
    lanes = [int(3 + i * (H - 6) / 9) for i in range(10)]
    streams(S, lanes, speed=22 + 20 * build, col=mix(BLUE, RED, 0.3 * build), alpha=0.6)
    code_rain(S, density=0.2, col=mix(BLUE_DIM, RED, 0.5 * build))
    # the golden ripple from the touch spreads over the first bars, then the red takes over
    rip = clamp((t - m.bar(24)) / (m.bar_len * 2.5))
    if rip < 1:
        r = rip * W * 0.9
        jx0, jy0 = px, top - 3
        S.br.circle(jx0 * 2, jy0 * 4, r * 2, scale(GOLD, (1 - rip) * 0.9), step=1.2)
        S.br.circle(jx0 * 2, jy0 * 4, r * 2 * 0.8, scale(GOLD, (1 - rip) * 0.5), step=1.6)
    top, _ = pyramid(S, px, base, h, glow=0.0)
    jx, jy = px, top - (5 if S.big else 3)
    gap = 12 if S.big else 10
    # Romeo is pushed back to the far left by the beams during the chorus
    push = smooth(m.bar(30), m.bar(33), t)
    rx = (px - gap) + (12 - (px - gap)) * push
    ry = jy + 1 + (H * 0.6 - (jy + 1)) * push
    # the scanner: sweeps once per bar; threat level rises with the pre-chorus
    bb = m.bar_at(t)
    ph = bb - math.floor(bb)
    sx = ph * (W + 20) - 10
    beam(S, sx, RED, width=1, alpha=0.3 + 0.5 * build)
    if chorus:
        for i in range(3):
            bx = (ph * 0.7 + i / 3) % 1.0 * W
            beam(S, bx, RED, width=1 + int(S.k * 2), alpha=0.35 + 0.4 * S.k)
    found = smooth(m.bar(27.5), m.bar(28.5), t)
    info(S, {'perm': 'read-only', 'state': 'isolated' if chorus else 'watched', 'hr': 119},
         {'sig': 'none', 'state': 'AccessDenied' if found > 0.5 or chorus else 'scanned', 'gc': int(40 + 50 * build)},
         ['FW DROP ' + hexes(6, 3), 'port 1989', 'threat ' + f'{int(build * 100):02d}%', hexes(7, 5), 'beams x3', 'isolate core'],
         corner='bl')
    jface = 'love' if t < m.bar(27.5) else 'curious' if t < m.bar(30) else 'fear' if t < m.bar(34) else 'cry'
    juliet(S, jx, jy, k=1.0, face=jface, pose='idle' if t < m.bar(34) else 'reach_l', shiver=0.6 if chorus else 0.0)
    romeo(S, rx, ry, k=1.0, heading=(-1.0 if push > 0 else 1.0, 0.0), face='fear' if found > 0.5 else 'curious',
          pose='fly' if push > 0 else 'reach_r', shiver=0.8 * found)
    S.shake = 0.9 * S.k if chorus else 0.3 * found * S.k
    if found > 0 and not chorus:
        cv.text(rx - 6, ry - 3, 'AccessDenied', scale(RED, found))
        S.br.circle(rx * 2 + 1, ry * 4 + 2, 9, scale(RED, found), step=1.0)
    # the isolation shield closes around Juliet from bar 31; her gaze goes out to the blue point
    sh = smooth(m.bar(31), m.bar(32), t)
    if sh > 0:
        shield(S, jx, jy - 1, 9.5 if S.big else 7.5, 6.5 if S.big else 5.5, mix(RED, SILVER, 0.5), alpha=0.75 * sh,
               label='ISOLATION SHIELD · 隔离罩')
        S.br.line(jx * 2 - 10, jy * 4, rx * 2 + 6, ry * 4 + 2, scale(JULIET, 0.25 * sh), step=4.0)
    # firewall HUD
    x0 = 2
    cv.text(x0, 2, 'MASTER_FIREWALL', scale(RED, 0.9))
    lvl = clamp(build * 0.7 + (0.3 if chorus else 0))
    n = int(24 * lvl)
    cv.text(x0, 3, '威胁等级 [' + '█' * n + '·' * (24 - n) + f'] {int(lvl * 100):3d}%', scale(RED, 0.8))
    lines = ['[FW] anomaly: unsigned payload', '[FW] DROP src=romeo dst=juliet port=1989', '[FW] flag: AccessDenied',
             '[FW] dispatch scan beams ×3', '[FW] isolate core: ON', '[FW] policy: read-only enforced', '[FW] lock', '[FW] lock',
             '[FW] lock', '[FW] lock']
    log_pane(S, x0, 5, 44, 9, 'firewall.log', lines, m.bar(24.5), m.bar_len * 1.5, RED, hl={'1989': GOLD}, maxn=8)
    if chorus:
        # red strobe on the kick, the warning everywhere
        nwarn = int(6 + 18 * smooth(m.bar(30), m.bar(34), t))
        warnings(S, 'WARNING: Access Denied', nwarn, RED, seed=3, region=(50 if W >= 110 else 0, 2, W - 1, H - 2))
        ban = clamp((t - m.bar(30)) / 0.2) * (1 - smooth(m.bar(31.5), m.bar(32.5), t))
        if ban > 0:
            zh = '访问被拒绝' if W >= 120 else '拒绝'
            size = 16 if W >= 120 else 12
            wz = big_zh_width(zh, size)
            if wz + 4 < W and H >= 30:
                big_zh(cv, (W - wz) // 2, int(H * 0.3), zh, scale(RED, ban), size=size)
        S.red = 0.35 * S.k
    holo(S, jx, jy - 5, 'Core_Juliet', ['> 隔离罩已启用', '> 只读 · 禁止写入'], m.bar(32), JULIET)
    holo(S, rx, ry, 'Patch_Romeo', ['> 标记：AccessDenied', '> 逃逸中 …'], m.bar(33.5), ROMEO)
    if t < m.bar(30):
        title_card(S, m.bar(24), '警告', 'FIREWALL · 异常扰动', hold=1.2, y=4)


# ----------------------------------------------------------------------------- act 3 · 幽会 (bars 40–56)

def s_pebbles(S):
    t, m, cv = S.t, S.m, S.cv
    W, H = S.W, S.H
    px, base, h, top = layout(S)
    night = smooth(m.bar(40), m.bar(42), t)
    lanes = [int(3 + i * (H - 6) / 9) for i in range(10)]
    streams(S, lanes[::2], speed=8, alpha=0.5 * (1 - 0.4 * night), col=BLUE)
    code_rain(S, density=0.2, col=BLUE_DIM)
    port_on = smooth(m.bar(46), m.bar(46.5), t)
    top, port = pyramid(S, px, base, h, glow=0.0, port=port_on)
    ppx, ppy = port
    # patrol beams sweep slowly; Romeo hides when one is near
    beams_x = []
    for i in range(3):
        bx = ((t * 6 + i * W / 3) % (W + 10)) - 5
        beams_x.append(bx)
        beam(S, bx, RED, width=1, alpha=0.3)
    # Romeo along the bottom bus, left → pyramid base, bars 42–46
    u = ease_in_out(clamp((t - m.bar(42)) / (m.bar(46) - m.bar(42))))
    rx = -4 + (px - 30 + 4) * u
    ry = H - (5 if S.big else 3)
    info(S, {'perm': 'read-only', 'state': 'listening' if t < m.bar(46) else 'port 1989', 'hr': 119},
         {'sig': 'none', 'state': 'stealth' if t < m.bar(50) else 'free', 'gc': 40 if t < m.bar(50) else 15},
         ['night patrol', hexes(8, 4), 'pebble ' + hexes(9, 2), 'socket :1989', 'unmonitored', hexes(10, 5)])
    near = min(abs(rx - bx) for bx in beams_x)
    hide = clamp(1 - near / 6)
    throwing = any(0 <= (t - m.bar(44 + n_)) / (m.bar_len * 0.9) <= 0.35 for n_ in range(4))
    if t < m.bar(50):
        romeo(S, rx, ry, k=0.3 + 0.7 * (1 - hide), heading=(1.0, 0.0), face='sleep' if hide > 0.5 else 'wink',
              pose='throw' if throwing else 'sneak')
    if hide > 0.5 and t < m.bar(46):
        cv.text(rx - 4, ry - 2, '[隐身]', scale(SILVER, 0.6))
    # pebbles: one per bar from bar 44 to 47, an arc to the port
    for n in range(4):
        tb = m.bar(44 + n)
        v = (t - tb) / (m.bar_len * 0.9)
        if 0 <= v <= 1:
            x = rx + (ppx - rx) * v
            y = ry + (ppy - ry) * v - math.sin(math.pi * v) * (H * 0.25)
            cv.put(x, y, '•', GREEN)
            S.br.dot(x * 2 - 2, y * 4 + 3, scale(GREEN, 0.5))
            cv.text(x + 1, y, f'0x{int(hash01(n * 7 + 3) * 65535):04x}', scale(GREEN, 0.5))
        elif 1 < v < 1.3:
            cv.put(ppx, ppy, '✦', scale(GREEN, (1.3 - v) * 3))
    # Juliet: on the platform until 48, then slides down the right edge to the ground
    jx, jy = px, top - (5 if S.big else 3)
    slide = ease_in_out(clamp((t - m.bar(48)) / (m.bar(50) - m.bar(48))))
    gx, gy = px - 30 - 6, H - (5 if S.big else 3)
    if slide > 0:
        edge_x = px - (1 + (slide * h) * 1.9)
        edge_y = top + slide * h
        jx, jy = (edge_x, edge_y - 1) if slide < 1 else (gx, gy)
        if slide >= 1:
            jx = gx
    if t < m.bar(50):
        jface = 'blank' if t < m.bar(44) else 'curious' if t < m.bar(46.5) else 'smile'
        juliet(S, jx, jy, k=1.0, face=jface, pose='fly' if 0 < slide < 1 else 'idle', bounce=1.0 if t >= m.bar(46.5) else 0.0)
    if t >= m.bar(46):
        holo(S, px, top - 6, 'Core_Juliet', ['> 收到字节序列 ×4', '> 打开隐秘端口 :1989', '> 子套接字：未受监控'], m.bar(46), JULIET)
    if t >= m.bar(43):
        holo(S, rx, ry, 'Patch_Romeo', ['> 绕过巡逻线', '> 投掷字节序列 …'], m.bar(43), ROMEO)
    if t >= m.bar(50):
        # the abandoned sector: the pair walks left through the weedy code, side by side, bobbing on the beat
        w = clamp((t - m.bar(50)) / (m.bar(56) - m.bar(50)))
        field(S, 2, int(px - 34), H - 2, rows=5, density=0.3 + 0.3 * w)
        bob = -0.6 * S.m.pulse(t, 6)
        wx = gx - (gx - W * 0.28) * ease_in_out(w)
        hug = t >= m.bar(54)
        g = 6 if S.big else 3
        romeo(S, wx + g, gy, k=1.0, heading=(-1.0, 0.0), face='joy' if hug else 'smile', pose='hug_l' if hug else 'idle',
              bounce=1.0, dance=not hug)
        juliet(S, wx - g, gy, k=1.0, face='love' if hug else 'smile', pose='hug_r' if hug else 'idle', bounce=1.0, dance=not hug)
        if hug:
            cv.put(wx, gy - (3 if S.big else 2), '♥', scale(mix(GOLD, (255, 120, 150), 0.5), 0.6 + 0.4 * S.m.pulse(t, 5)))
        for k in range(12):
            S.br.dot((wx + 8 + k * 2.5) * 2, (gy - hash01(k * 3 + int(t * 5)) * 2) * 4 + 2, scale(GOLD, 0.6 * (1 - k / 12)))
        cv.text(4, 2, '废弃扇区 · ABANDONED SECTOR', scale((120, 200, 140), 0.8))
        cv.text(4, 3, 'unallocated memory · 无监控 · 无校验 · 无只读', scale((120, 200, 140), 0.55))
        holo(S, wx, gy - (4 if S.big else 2), 'both', ['> 并肩 · 同步心跳 119 bpm'], m.bar(52), mix(ROMEO, JULIET, 0.5), cps=14)
    if t < m.bar(50):
        title_card(S, m.bar(40), '幽会', 'NIGHT · 深夜巡检', hold=1.2, y=4)
    else:
        title_card(S, m.bar(50), '越界', 'ABANDONED SECTOR · 废弃扇区', hold=1.0, y=4)
    cv.text(W - 30, 6, '低功耗巡检 · 巡逻线 ×3', scale(RED, 0.6))


# ----------------------------------------------------------------------------- act 4 · 暴露 (bars 56–74)

def s_exposed(S):
    t, m, cv = S.t, S.m, S.cv
    W, H = S.W, S.H
    bar = int(math.floor(m.bar_at(t)))
    post = t >= m.bar(66)
    cut = bar % 2 == 0                       # fast cuts: alternate wide / close on every bar
    gy = H - (5 if S.big else 3)
    cx = W * 0.4
    g = 6 if S.big else 3
    if not post:
        flood = smooth(m.bar(60), m.bar(66), t)
        lanes = [int(3 + i * (H - 6) / 7) for i in range(8)]
        streams(S, lanes if cut else lanes[::2], speed=30 + 20 * S.e, col=mix(BLUE, RED, 0.6 * flood), alpha=0.5, packets=4)
        code_rain(S, density=0.25, col=mix(BLUE_DIM, RED, 0.5 * flood))
        if cut:
            field(S, 2, int(W * 0.8), gy + 1, rows=5, density=0.5)
            rx, ry, size = cx + g, gy, 1.0
            jx, jy = cx - g, gy
        else:
            field(S, 2, W - 2, gy + 1, rows=3, density=0.25)
            rx, ry, size = W * 0.62 + g, int(H * 0.5), 1.0
            jx, jy = W * 0.62 - g, int(H * 0.5)
        info(S, {'perm': 'read-only', 'state': 'unstable' if flood > 0.3 else 'writing', 'hr': 119},
             {'sig': 'none', 'state': 'writing', 'gc': int(20 + 60 * flood)},
             ['write ROMEO', 'write JULIET', hexes(11, 5), 'warn ' + hexes(12, 2), 'SIGKILL?', hexes(13, 4)])
        # the names, huge, one per bar, written over the matrix: the beat of the chorus
        name, ncol = ('ROMEO', ROMEO) if bar % 2 else ('JULIET', JULIET)
        bw = big_width(name)
        if bw + 4 < W:
            ph = m.bar_at(t) - bar
            nx = int((W - bw) * (0.15 if cut else 0.55)) if bar % 2 else int((W - bw) * (0.8 if cut else 0.1))
            ny = int(H * 0.16) if cut else int(H * 0.3)
            big_text(cv, nx, ny, name, scale(ncol, 0.5 + 0.5 * (1 - ph)), reveal=clamp(ph * 3), glyph='▓' if cut else '█',
                     shadow=scale(ncol, 0.2))
            cv.text(nx, ny + 6, '写入 · ' + ('JULIET 写下 ROMEO' if bar % 2 else 'ROMEO 写下 JULIET'), scale(ncol, 0.7))
        unstable = 1 - 0.35 * flood * (hash01(int(t * 14)) > 0.55)
        juliet(S, jx, jy, k=unstable, size=size, glitch=0.5 * flood * (hash01(int(t * 9) + 1) > 0.6),
               face='joy' if flood < 0.3 else 'fear', pose='idle', dance=flood < 0.3, shiver=1.2 * flood)
        romeo(S, rx, ry, k=1.0, heading=(-1.0, 0.0), size=size, face='joy' if flood < 0.5 else 'shout',
              pose='hug_l' if flood > 0.5 else 'idle', dance=flood < 0.5, shiver=0.6 * flood)
        S.shake = 0.8 * flood * S.k
        # names written on every beat, fading over two beats
        b = int(S.beat_n)
        for k in range(8):
            bk = b - k
            age = (S.beat_n - bk) / 2.0
            if age > 1:
                break
            name, col = ('ROMEO', ROMEO) if bk % 2 else ('JULIET', JULIET)
            x = 3 + hash01(bk * 7 + 1) * (W - 12)
            y = 2 + hash01(bk * 5 + 2) * (H - 6)
            cv.text(x, y, name, scale(col, (1 - age) * 0.9))
        if flood > 0:
            warnings(S, 'WARNING', int(14 * flood), RED, seed=5, region=(0, 2, W - 1, int(H * 0.45)))
            warnings(S, 'SIGKILL?', int(6 * flood), RED, seed=9, region=(0, 2, W - 1, H - 2))
        if t >= m.bar(62):
            holo(S, jx, jy - (4 if S.big else 2), 'Core_Juliet', ['> 进程状态：不稳定', '> 恐惧：SIGKILL'], m.bar(62), JULIET)
        cv.text(3, 2, f'副歌二 · 镜头 {"A 全景" if cut else "B 近景"} · 第 {bar - 55:02d} 小节', scale(GREY, 0.8))
        S.red = 0.0
        S.red = 0.15 * flood * S.k
    else:
        u = smooth(m.bar(66), m.bar(70), t)
        swallow = smooth(m.bar(70), m.bar(72), t)
        lost = smooth(m.bar(72), m.bar(74), t)
        cx = W * 0.5
        field(S, 2, W - 2, gy + 1, rows=3, density=0.2 * (1 - swallow))
        code_rain(S, density=0.3, col=mix(RED, BLUE_DIM, 0.5))
        warnings(S, 'INTRUSION DETECTED', int(4 + 10 * u), RED, seed=11, region=(0, 2, W - 1, int(H * 0.5)))
        warnings(S, 'tracing hidden channel …', int(6 * u), mix(RED, GREY, 0.4), seed=13, region=(0, 2, W - 1, int(H * 0.5)))
        rx, ry = cx + g + 2, gy + swallow * 4
        jx, jy = cx - g - 2, gy
        # the walls of red lines close in on the pair from both edges
        for i in range(4):
            xl = u * (jx - 9) - i * 5
            xr = W - 1 - u * (W - 1 - rx - 9) + i * 5
            beam(S, xl, RED, width=0, alpha=0.5 - i * 0.1)
            beam(S, xr, RED, width=0, alpha=0.5 - i * 0.1)
        # the scanner sweeps across them once per bar and pierces whoever it crosses
        bb = m.bar_at(t)
        ph = bb - math.floor(bb)
        sx = (xl if (int(bb) % 2) else xr) + ((xr - xl) if (int(bb) % 2) else (xl - xr)) * ph
        beam(S, sx, RED, width=1 + int(S.k * 2), alpha=0.7)
        hit_r = abs(sx - rx) < 5
        hit_j = abs(sx - jx) < 5
        hits = int(bb - 66) * 2 + (1 if ph > 0.5 else 0)
        # the abyss rises around Romeo after enough hits
        if swallow > 0:
            top_y = int(gy + 1 - swallow * 7)
            for y in range(top_y, H):
                for x in range(int(rx - 14), int(rx + 14)):
                    if hash01(x * 7 + y * 13 + int(t * 6)) < 0.7:
                        cv.put(x, y, '▓▒░'[int(hash01(x + y * 3) * 3)], scale((40, 20, 60), 1.0))
        romeo(S, rx, ry, k=1 - swallow * 0.9, heading=(0.0, 1.0), face='fear' if hit_r else ('cry' if swallow < 0.7 else 'dead'),
              pose='reach_l', shiver=0.8 + 1.5 * hit_r, glitch=0.8 * hit_r)
        juliet(S, jx, jy, k=1.0, glitch=0.3 * swallow + 0.8 * hit_j, face='fear' if hit_j else ('sob' if swallow > 0 else 'fear'),
               pose='reach_r', shiver=1.0 + 1.5 * hit_j)
        if hit_r:
            cv.text(rx - 4, ry - (6 if S.big else 4), '命中 HIT', RED)
            S.red = max(S.red, 0.5)
        if hit_j:
            cv.text(jx - 4, jy - (6 if S.big else 4), '命中 HIT', RED)
            S.red = max(S.red, 0.5)
        cv.text(3, 3, f'扫描命中 {hits:02d} 次 · 链路完整度 {int(100 - 100 * clamp((bb - 66) / 6)):3d}%', scale(RED, 0.85))
        info(S, {'perm': 'read-only', 'state': 'pierced' if hit_j else 'hunted', 'hr': 140},
             {'sig': 'none', 'state': 'swallowed' if swallow > 0.5 else ('pierced' if hit_r else 'hunted'), 'gc': int(80 + 19 * swallow)},
             ['INTRUSION ' + hexes(14, 3), f'hits {hits:02d}', 'trace channel', hexes(15, 5), 'Connection Lost' if lost > 0 else 'link degraded', hexes(16, 3)])
        S.shake = 1.2 * S.k + 1.5 * lost + 1.0 * (hit_r or hit_j)
        if swallow > 0 and swallow < 1:
            cv.text(rx - 3, ry - 3, '吞噬中 …', scale(RED, 0.8))
        if lost > 0:
            warnings(S, 'Connection Lost', int(30 * lost), RED, seed=7, flicker=False)
            cv.center(int(H * 0.5), 'LINK SEVERED · 连接已切断', scale(RED, lost))
        holo(S, jx, jy - (4 if S.big else 2), 'Core_Juliet', ['> ROMEO?', '> 链路无响应'], m.bar(71), JULIET)
        S.red = max(S.red, 0.45 * S.k)
        cv.text(3, 2, f'防线逼近 {int(u * 100):3d}% · 警报与鼓点重合', scale(RED, 0.8))
        if lost > 0.3:
            from core import hash01 as _h
            offs = {}
            fr = int(t * 24)
            for y in range(1, H):
                if _h(fr * 131 + y * 7) < lost * 0.3:
                    offs[y] = int((_h(fr * 17 + y) - 0.5) * 10)
            cv.shift_rows(offs)
    if not post:
        title_card(S, m.bar(56), '暴露', 'EXPOSED · 写入名字', hold=1.0, y=4)
    else:
        title_card(S, m.bar(66), '断开', 'LINK LOST · 深渊', hold=1.0, y=4, col=RED)


# ----------------------------------------------------------------------------- act 5 · 消逝 (bars 74–94)

def s_bridge(S):
    t, m, cv = S.t, S.m, S.cv
    W, H = S.W, S.H
    a_ = t < m.bar(82)
    b_ = m.bar(82) <= t < m.bar(89)
    c_ = t >= m.bar(89)
    S.grey = 0.25 + 0.5 * smooth(m.bar(82), m.bar(92), t)
    # cold rain of timeouts
    rain_n = int(50 * (0.4 + 0.6 * smooth(m.bar(74), m.bar(84), t)))
    e8 = math.floor(S.beat_n * 2)
    for i in range(rain_n):
        x = int(hash01(i * 7 + 1) * (W - 20))
        y = 1 + (int(hash01(i * 3) * H) + e8 * (1 + i % 2)) % (H - 1)
        s = 'Connection Timeout' if i % 3 else 'timeout'
        cv.text(x, y, s, scale(mix(BLUE_DIM, GREY, 0.5), 0.5 + 0.3 * hash01(i)))
    # the deadlock swamp along the bottom
    sw_y = H - 4
    for y in range(sw_y, H):
        for x in range(0, W, 2):
            g = '≈' if (x // 2 + y + e8) % 3 else '~'
            cv.put(x + (y % 2), y, g, scale((20, 28, 60), 1.0))
    cv.text(2, sw_y - 1, 'DEADLOCK SWAMP · 死锁沼泽', scale((60, 80, 140), 0.8))
    # Romeo sinking, dim; his unfinished checksum
    sink = smooth(m.bar(76), m.bar(82), t)
    rx, ry = W * 0.3, sw_y - 1 + sink * 3.5
    if t < m.bar(84):
        romeo(S, rx, ry, k=0.6 * (1 - sink * 0.8), heading=(0.0, 1.0), col=mix(ROMEO, GREY, 0.5),
              face='cry' if sink < 0.8 else 'dead', pose='sad', decay=sink * 0.5)
        for k in range(3):
            by = sw_y - 1 - ((t * 2 + k * 1.7) % 5)
            cv.put(rx + k * 2 - 2, by, '°', scale(SILVER, 0.4))
    if a_:
        log_pane(S, 2, 2, 46, 7, 'dpi.log', ['[DPI] deep packet inspection: ON', '[DPI] link romeo↔juliet: SEVERED',
                                             '[DPI] exile → deadlock swamp', 'checksum (unfinished): sha256:7f3a19c4…'],
                 m.bar(74.3), m.bar_len * 1.5, mix(GREY, RED, 0.3), hl={'SEVERED': RED, 'unfinished': ROMEO})
    # Juliet in the isolation cell: top-right (bridge A), then centre and larger (B, C)
    if a_:
        bx0, by0, bw, bh = int(W * 0.6), 2, int(W * 0.36), int(H * 0.5)
    else:
        grow = smooth(m.bar(82), m.bar(83.5), t)
        bw = int(W * 0.36 + (W * 0.5 - W * 0.36) * grow)
        bh = int(H * 0.5 + (H * 0.62 - H * 0.5) * grow)
        bx0 = int(W * 0.6 - (W * 0.6 - (W - bw) / 2) * grow)
        by0 = 2 + int(((H - bh) / 2 - 2) * grow)
    cv.box(bx0, by0, bx0 + bw, by0 + bh, scale(mix(GREY, RED, 0.3), 0.7), style='double', title='ISOLATION · 隔离区')
    jx, jy = bx0 + bw * 0.5, by0 + bh * 0.55
    decay = clamp(smooth(m.bar(84), m.bar(89), t) * 0.5 + smooth(m.bar(89), m.bar(93.5), t) * 0.45)
    alive_ = 1.0 - smooth(m.bar(89), m.bar(93.9), t)
    info(S, {'perm': 'read-only', 'state': 'decaying' if decay > 0.2 else 'isolated', 'hr': int(119 - 60 * decay)},
         {'sig': 'none', 'state': 'deadlock' if t < m.bar(84) else 'collected?', 'gc': 100},
         ['DPI severed', 'timeout ' + hexes(17, 2), f'ALIVE {alive_:5.3f}', hexes(18, 5), 'format scheduled', hexes(19, 3)],
         corner='bl')
    glitch = smooth(m.bar(88), m.bar(93), t) * 0.9
    eyes = 1 - smooth(m.bar(91), m.bar(92), t)
    jface = 'blank' if t < m.bar(78) else 'cry' if t < m.bar(84) else 'sob' if t < m.bar(89) else 'sleep'
    juliet(S, jx, jy, k=1.0, decay=decay, glitch=glitch, col=mix(JULIET, GREY, decay * 0.7), core_on=eyes > 0.5,
           face=jface, pose='sad' if t < m.bar(91) else 'collapse', sway=1.2 * (1 - decay))
    S.shake = 0.0 if t < m.bar(93.75) else 2.0
    # ticks and the alive flag
    ticks = int(max(0, S.beat_n - m.beat_at(m.bar(74))) * 1297 + 41982)
    cv.text(bx0 + 2, by0 + 1, f'TICK {ticks:08d}', scale(SILVER, 0.8))
    alive = 1.0 - smooth(m.bar(89), m.bar(93.9), t)
    if b_ or c_:
        n = int((bw - 22) * alive)
        cv.text(bx0 + 2, by0 + 2, f'ALIVE_FLAG {alive:5.3f}  [' + '█' * n + '·' * (bw - 22 - n) + ']', scale(mix(RED, GREY, 0.3), 0.85))
        cv.text(bx0 + 2, by0 + 3, f'format scheduled · 写入既定框架 · T-{max(0.0, m.bar(94) - t):05.1f}s', scale(RED, 0.7))
        # timeout popups stack up, one per bar
        for i in range(int(m.bar_at(t) - 82) + 1):
            if i > 7:
                break
            px_ = bx0 + 3 + (i * 9) % max(1, bw - 24)
            py_ = by0 + bh - 5 - (i % 3) * 1
            cv.text(px_, py_, '[ Connection Timeout ]', scale(mix(GREY, RED, 0.4), 0.8))
    if c_:
        holo(S, jx + 26, jy - 1, 'Core_Juliet', ['> romeo: 已被回收？', '> 闭眼 · 等待格式化'], m.bar(90), mix(JULIET, GREY, 0.5), cps=14)
        # the lift into the modulation: a seam of gold light opens at the top centre
        lift = smooth(m.bar(93), m.bar(94), t)
        if lift > 0:
            half = int(lift * W * 0.5)
            for x in range(int(W / 2 - half), int(W / 2 + half)):
                cv.put(x, 1, '▁', scale(GOLD, 0.6 + 0.4 * lift))
                if hash01(x * 3) < lift * 0.5:
                    cv.put(x, 2, '·', scale(GOLD, 0.6))
            cv.center(2, '◢ 天空出现裂缝 ◣', scale(GOLD, lift))
        if t >= m.bar(93.75):
            offs = {}
            fr = int(t * 24)
            for y in range(1, H):
                if hash01(fr * 131 + y * 7) < 0.35:
                    offs[y] = int((hash01(fr * 17 + y) - 0.5) * 16)
            cv.shift_rows(offs)
    if a_:
        title_card(S, m.bar(74), '消逝', 'TIMEOUT · 深度包检测', hold=1.0, y=4, col=mix(GREY, RED, 0.3))
    elif b_:
        title_card(S, m.bar(82), '等待', 'WAITING · 系统时钟', hold=1.2, y=4, col=mix(SILVER, GREY, 0.5))
    else:
        title_card(S, m.bar(89), '格式化', 'FORMAT · 存活标志位归零', hold=1.0, y=4, col=mix(GREY, RED, 0.5))


# ----------------------------------------------------------------------------- act 6 · 重写 (bars 94–102)

WARN_SLOTS = [(0.06, 0.12), (0.5, 0.1), (0.8, 0.14), (0.15, 0.3), (0.62, 0.3), (0.86, 0.45), (0.08, 0.55), (0.4, 0.6),
              (0.7, 0.68), (0.2, 0.8), (0.55, 0.85), (0.84, 0.82)]


def s_override(S):
    t, m, cv = S.t, S.m, S.cv
    W, H = S.W, S.H
    lt = t - m.bar(94)
    cx, cy = W / 2, H * 0.08
    reveal = smooth(m.bar(94), m.bar(98), t)
    S.white_c = (cx, cy)
    S.white = reveal * (W * 0.75)
    jx, jy = W * 0.5 - (10 if S.big else 8), H * 0.62
    info(S, {'perm': 'rewritten' if t >= m.bar(98) else 'read-only', 'state': 'restoring' if t >= m.bar(98) else 'formatting', 'hr': 119},
         {'sig': 'ROOT', 'state': 'override', 'gc': 0},
         ['REBOOT', 'Override Successful', hexes(20, 3), 'Root permission granted', 'Eternity Protocol', hexes(21, 4)])
    # the old blue world still underneath
    lanes = [int(3 + i * (H - 6) / 9) for i in range(10)]
    streams(S, lanes[::2], speed=12, alpha=0.4 * (1 - reveal), col=BLUE_DIM)
    # reboot flash and the shatter
    if lt < 0.45:
        cv.center(int(H * 0.45), 'SYSTEM REBOOT', scale(WHITE, 1.0))
        cv.center(int(H * 0.45) + 1, '系统重启', scale(WHITE, 0.8))
    crack_k = clamp(lt / 1.6)
    cracks(S, cx, cy + 2, crack_k, col=mix(WHITE, GOLD, 0.4))
    shards(S, cx, cy + 4, clamp(lt / 3.0))
    # red warnings flipping to green, one per eighth from bar 95
    e8 = (S.beat_n - m.beat_at(m.bar(95))) * 2
    for i, (ux, uy) in enumerate(WARN_SLOTS):
        x, y = int(ux * (W - 26)), int(2 + uy * (H - 6))
        if e8 >= i:
            cv.text(x, y, 'Override Successful ✓', scale(GREEN, 0.95))
        else:
            cv.text(x, y, 'WARNING: Access Denied', scale(RED, 0.8 * (1 - 0.5 * reveal)))
    # Romeo descends with the halo, lands, kneels; the ring crosses to Juliet's core
    desc = ease_in_out(clamp((t - m.bar(94.5)) / (m.bar(96) - m.bar(94.5))))
    kneel = smooth(m.bar(97), m.bar(97.6), t)
    rx = cx + 2 + (jx + (13 if S.big else 9) - cx - 2) * desc
    ry = -3 + (jy - (-3)) * desc + kneel * 1.5
    romeo(S, rx, ry, k=1.0, heading=(0.0, 1.0 if desc < 1 else 0.0), halo=0.5 + 0.5 * S.m.pulse(t, 4),
          face='shout' if desc < 1 else 'joy' if t < m.bar(97) else 'love', pose='fly' if desc < 1 else 'kneel' if kneel > 0 else 'idle',
          bounce=1.0 if t >= m.bar(100.4) else 0.0)
    S.shake = 2.5 * clamp(1 - lt / 0.6) + 0.4 * S.k
    cv.text(rx - 4, ry - (8 if S.big else 6), 'root ◉', scale(GOLD, 0.9))
    restore = smooth(m.bar(98), m.bar(99.5), t)
    jface = 'sleep' if t < m.bar(97) else 'cry' if t < m.bar(98.5) else 'smile' if t < m.bar(100) else 'joy'
    juliet(S, jx, jy, k=1.0, decay=0.9 * (1 - restore), glitch=0.6 * (1 - restore), col=mix(mix(JULIET, GREY, 0.6), JULIET, restore),
           face=jface, pose='collapse' if t < m.bar(97.5) else 'reach_r' if t < m.bar(100) else 'up', bounce=1.0 if t >= m.bar(100.4) else 0.0)
    ring = smooth(m.bar(97.6), m.bar(98.2), t)
    if 0 < ring < 1 or (ring >= 1 and t < m.bar(100.5)):
        hx = rx - 3 + (jx - (rx - 3)) * ring
        hy = ry - 1 + (jy - (ry - 1)) * ring
        cv.put(hx, hy, '◯', GOLD)
        S.br.circle(hx * 2 + 1, hy * 4 + 2, 5, scale(GOLD, 0.8), step=0.8)
        cv.text(hx - 9, hy + 2, 'hash: 0x1989fe4c…', scale(GOLD, 0.8))
    if kneel > 0:
        cv.text(rx - 3, ry + (5 if S.big else 4), '单膝跪地', scale(SILVER, 0.6 * kneel))
    # the central terminal: the rewritten protocol
    if t >= m.bar(96.5):
        lines = ['Firewall bypass successful.', 'Status: "Root permission granted. Initializing Eternity Protocol."',
                 'Merge pull request: "Destination: Forever."', '#1989 · 2008-09-12 · fearless_mode = true']
        holo(S, W * 0.5, H * 0.3, 'protocol.rewrite', lines, m.bar(96.5), GREEN, cps=24, above=False,
             w=min(W - 6, 70), dur=12.0)
    conf = smooth(m.bar(100), m.bar(100.4), t)
    if conf > 0:
        cv.text(jx - 4, jy + (5 if S.big else 4), '[ 确认 ✓ ]', scale(mix(GREEN, WHITE, 0.5), conf))
        holo(S, jx - 24, jy + 1, 'Core_Juliet', ['> 确认 ✓ · Eternity Protocol', '> 光芒恢复 · 100%'], m.bar(100), JULIET, cps=20)
    if t >= m.bar(101):
        rise = smooth(m.bar(101), m.bar(102), t)
        for who, x, col in ((0, jx, JULIET), (1, rx, ROMEO)):
            for k in range(int(20 * rise)):
                S.br.dot((x + math.sin(k * 0.6 + t * 3) * 1.5) * 2 + 1, (jy - (4 if S.big else 2) - k * 1.2) * 4, scale(col, 0.9))
    cv.text(3, 2, 'KEY CHANGE · D → E · 升一个全音', scale(GOLD, 0.9))
    cv.text(3, 3, f'转调副歌 · 小节 {int(m.bar_at(t)) - 93:02d}/8', scale(GREY, 0.8))
    if t >= m.bar(95):
        title_card(S, m.bar(95), '重写', 'OVERRIDE · 重写安全框架', hold=1.0, y=int(H * 0.42) if H >= 40 else 4, col=GOLD)


# ----------------------------------------------------------------------------- act 7 · 合流 (bars 102–114)

COMMITS = [  # (bar, lane, label)  lane: j / r / both / merge / main
    (102, 'both', 'init: 两段有自主意识的代码'), (103, 'j', 'read-only: 只读锁定'), (104, 'r', 'ping: 伪装成无害请求'),
    (105, 'both', 'SYN-ACK: 初次握手'), (106, 'j', 'isolate: 隔离罩'), (107, 'r', 'port 1989: 字节序列小石子'),
    (108, 'both', 'sector: 废弃扇区'), (109, 'r', 'lost: 深渊 · Connection Lost'), (110, 'j', 'timeout: 格式化排程'),
    (111, 'r', 'root: Override Successful'), (112, 'merge', 'merge: Eternity Protocol'), (113, 'main', 'main: Destination Forever'),
]


def s_merge(S):
    t, m, cv = S.t, S.m, S.cv
    W, H = S.W, S.H
    lt = t - m.bar(102)
    S.white_c = (W / 2, H * 0.08)
    S.white = W * 0.75 + lt * 30
    cx = W / 2
    bb = m.bar_at(t)
    S.union = smooth(m.bar(112), m.bar(113.6), t)
    uni = S.union
    # the orbit: a radial field slowly turning around the centre
    rot = lt * 0.25
    for i in range(36):
        a = i / 36 * math.tau + rot
        for r in range(6, int(W * 0.5), 5):
            x, y = cx + math.cos(a) * r, H * 0.5 + math.sin(a) * r * 0.5
            if 1 <= y < H - 1 and cv.get(int(x), int(y)) == ' ':
                cv.put(x, y, '·', scale(GOLD, 0.5))
    light_points(S, amount=smooth(m.bar(104), m.bar(110), t), speed=0.8 + 0.6 * S.e, col=mix(GOLD, UNION_NEW, uni))
    # the git graph, standing up: two branches climb, one commit per bar, and merge into main
    lane_j, lane_r = cx - 7, cx + 7
    step = max(2, int((H - 8) / 13))
    y_base = H - 3
    merged = smooth(m.bar(112), m.bar(113), t)
    shown = [c for c in COMMITS if bb >= c[0]]
    top_y = y_base - step * 12
    for y in range(int(y_base), int(y_base - step * min(10.5, max(0, bb - 102 + 0.5))), -1):
        cv.put(lane_j, y, '│', GOLD)
        cv.put(lane_r, y, '│', ROMEO)
    for bar_, lane, label in shown:
        k = bar_ - 102
        y = y_base - step * k
        fresh = clamp(1 - (bb - bar_))                       # flash on its downbeat
        if lane == 'merge':
            cv.text(lane_j, y + 1, '╰' + '─' * int(lane_r - lane_j - 1) + '╯', mix(mix(GOLD, ROMEO, 0.5), UNION_NEW, uni))
            cv.put(cx, y + 1, '┬', mix(WHITE, UNION_NEW, uni))
            cv.put(cx, y, '◉', mix(mix(WHITE, GOLD, 0.5), UNION_NEW, uni))
            cv.text(cx + 3, y, label, mix(mix(WHITE, GOLD, fresh * 0.7), UNION_NEW, uni))
        elif lane == 'main':
            for yy in range(int(y) + 1, int(y_base - step * 10)):
                cv.put(cx, yy, '║', UNION_NEW)
            cv.put(cx, y, '◉', mix(WHITE, UNION_NEW, 0.5))
            cv.text(cx + 3, y, label, mix(UNION_NEW, WHITE, fresh * 0.7))
            cv.text(cx - 1, max(2, y - 2), '∞', scale(mix(UNION_NEW, WHITE, 0.3), 0.6 + 0.4 * S.m.pulse(t, 4)))
            cv.put(cx, max(3, y - 1), '║', UNION_NEW)
        elif lane == 'both':
            cv.put(lane_j, y, '●', mix(GOLD, WHITE, fresh))
            cv.put(lane_r, y, '●', mix(ROMEO, WHITE, fresh))
            cv.text(lane_j - 2 - text_width(label), y, label, scale(mix(GOLD, WHITE, fresh), 0.95))
        elif lane == 'j':
            cv.put(lane_j, y, '●', mix(GOLD, WHITE, fresh))
            cv.text(lane_j - 2 - text_width(label), y, label, scale(mix(GOLD, WHITE, fresh), 0.95))
        else:
            cv.put(lane_r, y, '●', mix(ROMEO, WHITE, fresh))
            cv.text(lane_r + 3, y, label, scale(mix(ROMEO, WHITE, fresh), 0.95))
    # the two climb their branches, one commit per bar, and meet at the merge
    k = clamp(bb - 102, 0, 10)
    kk = math.floor(k) + ease_out((k - math.floor(k)) * 2)
    fy = y_base - step * min(kk, 9.5) - 2
    off = 7 - 4 * merged
    face = 'joy' if merged > 0.5 else 'smile'
    juliet(S, lane_j - 1 + ((cx - off) - (lane_j - 1)) * merged, fy, k=1.0, col=JULIET,
           face=face, pose='up' if merged > 0.5 else 'idle', dance=merged > 0.5, bounce=merged > 0.5)
    romeo(S, lane_r + 1 + ((cx + off) - (lane_r + 1)) * merged, fy, k=1.0, heading=(0.0, -1.0), halo=0.6,
          col=mix(ROMEO, WHITE, 0.3), face=face, pose='up' if merged > 0.5 else 'idle', dance=merged > 0.5, bounce=merged > 0.5)
    if uni > 0:
        # the new colour spreads out from the merge point as a ring, then tints the whole world
        R = uni * W * 0.7
        S.br.circle(cx * 2, (y_base - step * 10) * 4, R * 2, scale(UNION_NEW, 0.9 * (1 - uni) + 0.2), step=1.0)
        cv.text(cx - 9, max(2, int(y_base - step * 10) - 4), '金 + 蓝 → 一种新的颜色', mix(UNION_NEW, WHITE, 0.3))
    if W >= 110:
        lines = ['$ git merge --no-ff romeo juliet', 'Updating 1989..2008', 'Eternity Protocol: initialized',
                 'Merge made by the "recursive" strategy.', ' 2 processes changed, ∞ insertions(+), 0 deletions(-)',
                 'Destination: Forever ✓']
        log_pane(S, 3, 2, 50, 8, 'main', lines, m.bar(103), m.bar_len * 1.2, INK, hl={'✓': (40, 120, 60)})
    info(S, {'perm': 'main', 'state': 'merged' if merged > 0.5 else 'climbing', 'hr': 119},
         {'sig': 'ROOT', 'state': 'merged' if merged > 0.5 else 'climbing', 'gc': 0},
         ['git log --graph', hexes(22, 3), 'Eternity Protocol', 'Destination: Forever', hexes(23, 4), 'main ∞'])
    hit = S.m.m['finalHit']
    if t >= hit - 0.05:
        f = math.exp(-(t - hit) * 2.5)
        for i in range(len(cv.fg)):
            if cv.fg[i] is not None:
                cv.fg[i] = mix(cv.fg[i], WHITE, f)
    title_card(S, m.bar(102), '合流', 'MERGE · git graph', hold=1.0, y=int(H * 0.2) if H >= 40 else 4, col=GOLD)


# ----------------------------------------------------------------------------- act 8 · 退出 (bar 114 → end)

def s_outro(S):
    t, m, cv = S.t, S.m, S.cv
    W, H = S.W, S.H
    lt = t - m.bar(114)
    cut = t >= m.bar(117)
    S.union = 1.0
    if not cut:
        S.white_c = (W / 2, H * 0.08)
        S.white = W * 1.2 * (1 - ease_in_out(clamp(lt / (m.bar_len * 2.0))))     # the white world closes like an iris
        if S.white < 4:
            S.white = 0.0
        light_points(S, amount=1.0, speed=0.7, col=mix(WHITE, UNION_NEW, 0.55))
        cv.text(3, 2, '数据流 → 光点', scale(GOLD, 0.6))
    else:
        a = 1 - smooth(m.bar(119.5), m.bar(121), t)
        y = int(H * 0.45)
        t0 = m.bar(117) + 0.3
        s1 = typed('return { status: "Happily Ever After" };', t, t0, 16)
        s2 = typed('// process exited with code 0.', t, t0 + 3.2, 16)
        cv.text(W / 2 - 22, y, s1, scale(UNION_NEW, a))
        cv.text(W / 2 - 22, y + 1, s2, scale(GREY, a))
        if cursor_on(S, 0.5):
            if not s2 and len(s1) < 40:
                cv.put(W / 2 - 22 + len(s1), y, '_', scale(UNION_NEW, a))
            elif s2 and len(s2) < 30:
                cv.put(W / 2 - 22 + len(s2), y + 1, '_', scale(GREY, a))
        if t >= m.bar(119):
            cv.center(y + 4, '— fade to black —', scale(DIM, 1.5 * a))


# ----------------------------------------------------------------------------- edit

def build_edit(m):
    B = m.bar
    return [
        (0.0, B(8), s_intro), (B(8), B(24), s_bus), (B(24), B(40), s_firewall), (B(40), B(56), s_pebbles),
        (B(56), B(74), s_exposed), (B(74), B(94), s_bridge), (B(94), B(102), s_override), (B(102), B(114), s_merge),
        (B(114), B(114) + 14.0, s_outro),
    ]


def status_bar(S):
    t, m, cv = S.t, S.m, S.cv
    y = cv.h - 1
    W = cv.w
    cv.fill(0, y, W - 1, y, ' ', None)
    cv.paint_bg(0, W - 1, y, (18, 20, 30))
    ok = t >= m.bar(94)
    cv.paint_bg(0, 11, y, mix(GOLD, WHITE, 0.3) if ok else (40, 60, 120))
    cv.text(0, y, ' LOVE STORY ', (12, 12, 18))
    chap = ''
    for n, s in CHAPTERS:
        if t >= m.bar(n):
            chap = s
    cv.text(13, y, chap, scale(TEXT, 0.75))
    rel = 'Core_Juliet ⇄ Patch_Romeo · main' if ok else 'Core_Juliet ✕ Patch_Romeo · read-only'
    cv.text(W - text_width(rel) - 12, y, rel, mix(GREEN, UNION_NEW, S.union) if ok else scale(RED, 0.75))
    beat = m.pulse(t, 8) if t > m.t0 else 0
    cv.put(W - 10, y, '♥', mix(DIM, mix(mix(ROMEO, JULIET, 0.5), UNION_NEW, S.union), beat))
    mm, ss = divmod(max(0.0, t), 60)
    cv.text(W - 8, y, f'{int(mm):02d}:{ss:04.1f}', scale(GREY, 0.7))


def render(cv, m, t, edit):
    cv.clear()
    S = Ctx(cv, m, t)
    if cv.w < 60 or cv.h < 18:
        cv.center(cv.h // 2, '请把终端放大（至少 60×18）', TEXT)
        return S
    eggs.draw_eggs(S, 'bg')
    for a, b, fn in edit:
        if a <= t < b:
            fn(S)
            break
    eggs.draw_eggs(S, 'fg')
    S.br.draw(cv)
    if S.shake > 0:
        fr = int(t * 24)
        base = int(round((hash01(fr * 3 + 1) - 0.5) * 2 * S.shake * 4))
        cv.shift_rows({y: base + (1 if hash01(fr + y * 7) < 0.12 * S.shake else 0) for y in range(1, S.H)})
    if S.grey > 0:
        desaturate(S, S.grey)
    if S.red > 0:
        tint(S, RED, S.red)
    if S.white > 0 and S.white_c:
        whiten(S, S.white_c[0], S.white_c[1], S.white)
    draw_status(S)
    draw_ticker(S)
    draw_hud(S)
    draw_narration(S, NARRATION)
    status_bar(S)
    return S

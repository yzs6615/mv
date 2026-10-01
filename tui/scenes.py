"""LOVE STORY — terminal edition. The visual narrative.

Two processes, A (amber, montague.net) and B (rose, capulet.net), are forbidden to talk by the system's
policy. They find each other, are walled apart, love in secret, escape, lose the signal, wait, and finally
complete the handshake. No figures — only lights, cursors, paths, packets and windows.

Every scene is a pure function of song time t (seconds). Bar n starts at m.bar(n).
"""
import math
import random

from core import (AMBER, ROSE, UNION, GREY, DIM, FAINT, TEXT, RED, OK, MOON, Braille, big_text, big_width,
                  clamp, ease_in_out, ease_out, hash01, mix, scale, smooth, text_width)

R = random.Random(1597)
STARS = [(R.random(), R.random(), R.random() ** 2, R.random() * 6.28) for _ in range(520)]
CROWD = [(R.random() * 6.28, 0.25 + R.random() * 0.7, R.random() * 6.28, 0.6 + R.random() * 0.8) for _ in range(26)]
RAIN = [(R.random(), R.random(), 0.6 + R.random() * 0.9, R.choice('|:╎¦.')) for _ in range(260)]
HEX = '0123456789abcdef'
NODES_L = [(R.random(), R.random()) for _ in range(30)]
NODES_R = [(R.random(), R.random()) for _ in range(30)]


class Ctx:
    def __init__(self, cv, m, t):
        self.cv, self.m, self.t = cv, m, t
        self.W, self.H = cv.w, cv.h - 1          # last row is the status bar
        self.br = Braille(cv.w, cv.h)
        self.cx, self.cy = self.W / 2, self.H / 2

    def B(self, n):
        return self.m.bar(n)

    def lt(self, bar0):
        return self.t - self.m.bar(bar0)

    def beat(self):
        return self.m.beat_at(self.t)


# ----------------------------------------------------------------------------- shared vocabulary

def light(S, x, y, col, k=1.0, halo=True, core='●'):
    """a living point of light: core glyph + braille halo that breathes on the beat"""
    if k <= 0.02:
        return
    c = scale(col, 0.35 + 0.65 * k)
    if halo:
        p = S.m.pulse(S.t, 5)
        r = (2.2 + 1.6 * p) * (0.6 + 0.6 * k)
        S.br.circle(x * 2 + 1, y * 4 + 2, r * 2.2, scale(col, 0.28 * k), step=1.1)
        S.br.circle(x * 2 + 1, y * 4 + 2, r * 1.2, scale(col, 0.5 * k), step=0.9)
    S.cv.put(x, y, core, c)


def moon_disc(S, x, y, r, col=MOON):
    """filled braille moon with a soft terminator and a faint halo"""
    cx, cy, R2 = x * 2, y * 4, r * 4
    for py in range(int(cy - R2), int(cy + R2) + 1):
        for px in range(int(cx - R2), int(cx + R2) + 1):
            d = math.hypot((px - cx), (py - cy))
            if d <= R2:
                shade = 0.55 + 0.45 * (1 - d / R2) - 0.25 * (hash01(px * 7 + py * 13) < 0.18)
                S.br.dot(px, py, scale(col, shade))
    S.br.circle(cx, cy, R2 + 3, scale(col, 0.18), step=1.6)


def stars(S, amount=1.0, drift=0.0, rise=0.0, bright=1.0, region=None):
    if amount <= 0:
        return
    W, H, cv, t = S.W, S.H, S.cv, S.t
    x0, y0, x1, y1 = region or (0, 0, W - 1, H - 1)
    n = int(len(STARS) * clamp(amount))
    for i in range(n):
        u, v, d, ph = STARS[i]
        u = (u - drift * (0.3 + d) * t * 0.01) % 1.0
        v = (v - rise * (0.3 + d) * t * 0.01) % 1.0
        x = x0 + u * (x1 - x0)
        y = y0 + v * (y1 - y0)
        tw = 0.55 + 0.45 * math.sin(t * (1.3 + d * 3) + ph)
        b = (0.25 + 0.75 * d) * tw * bright
        g = '·' if d < 0.35 else '.' if d < 0.6 else '+' if d < 0.85 else '*'
        if cv.get(int(x), int(y)) == ' ':
            cv.put(x, y, g, scale((150, 165, 205), b))


def typed(s, t, t0, cps=28.0):
    if t < t0:
        return ''
    return s[:int((t - t0) * cps)]


def cursor_on(S, period_beats=1.0):
    return (S.beat() / period_beats) % 2 < 1.0


def chapter(S, t0, num, zh, en):
    """chapter header typed in the top-left corner"""
    dt = S.t - t0
    if dt < 0 or dt > 4.8:
        return
    a = clamp(dt / 0.25) * clamp((4.8 - dt) / 0.8)
    s = f'# {num} · '
    txt = typed(f'{zh} · {en}', S.t, t0 + 0.15, 22)
    S.cv.text(2, 1, s, scale(GREY, a))
    S.cv.text(2 + text_width(s), 1, txt, scale(TEXT, a))
    if dt < 3.2 and cursor_on(S, 0.5):
        S.cv.put(2 + text_width(s) + text_width(txt), 1, '▌', scale(AMBER, a))


def log_lines(S, x, y, lines, t0, every, col=GREY, maxn=None, cps=60, hl=None):
    """lines appear one per `every` seconds from t0, typed; optional scrolling window"""
    shown = [(i, l) for i, l in enumerate(lines) if S.t >= t0 + i * every]
    if maxn:
        shown = shown[-maxn:]
    for k, (i, l) in enumerate(shown):
        s = typed(l, S.t, t0 + i * every, cps)
        c = col
        if hl:
            for key, hc in hl.items():
                if key in l:
                    c = hc
        S.cv.text(x, y + k, s, c)


def packet(S, x0, y0, x1, y1, u, col, glyph='•', trail=6):
    if not (0 <= u <= 1):
        return
    for k in range(trail, -1, -1):
        uu = u - k * 0.012
        if uu < 0:
            continue
        x, y = x0 + (x1 - x0) * uu, y0 + (y1 - y0) * uu
        if k == 0:
            S.cv.put(x, y, glyph, col)
        else:
            S.br.dot(x * 2 + 1, y * 4 + 2, scale(col, 0.7 * (1 - k / (trail + 1))))


def ecg(S, y, col, amp=1.6):
    """heart monitor trace in braille along row y; spikes land on the beats"""
    W = S.W
    for px in range(0, W * 2):
        tt = S.t - (W * 2 - px) * 0.012
        b = S.m.beat_at(tt)
        ph = b - math.floor(b)
        v = 0.0
        if ph < 0.06:
            v = -math.sin(ph / 0.06 * math.pi) * 0.3
        elif ph < 0.12:
            v = math.sin((ph - 0.06) / 0.06 * math.pi) * 1.0
        elif ph < 0.18:
            v = -math.sin((ph - 0.12) / 0.06 * math.pi) * 0.45
        k = px / (W * 2)
        S.br.dot(px, y * 4 + 2 - v * amp * 4, scale(col, 0.25 + 0.75 * k))


def glitch(S, amount, seed=0):
    if amount <= 0:
        return
    offs = {}
    fr = int(S.t * 24)
    for y in range(S.H):
        if hash01(fr * 131 + y * 7 + seed) < amount * 0.35:
            offs[y] = int((hash01(fr * 17 + y) - 0.5) * 12 * amount)
    S.cv.shift_rows(offs)


def window(S, x0, y0, x1, y1, title, col, style='round', clear=True):
    S.cv.box(x0, y0, x1, y1, col, style=style, title=title, title_col=col, clear=clear)


# ----------------------------------------------------------------------------- 0 · BOOT (bars 0–8)

BOOT = [
    '[  0.000] verona-os 1597 booting on /dev/heart',
    '[  0.252] mount /sky ............................ ok',
    '[  0.504] mount /city  (households: 2) .......... ok',
    '[  0.756] net  montague.net   10.15.97.0/25    up',
    '[  1.008] net  capulet.net    10.15.97.128/25  up',
    '[  1.260] firewall  montague.net <-> capulet.net : DENY',
    '[  1.512] masquerade.service ................. started',
    '[  1.764] spawn  pid 1597  proc A  [montague]   ok',
    '[  2.016] spawn  pid 1597  proc B  [capulet]    ok',
    '[  2.268] warn   two processes share one heartbeat',
]


def s_boot(S):
    t, cv, m = S.t, S.cv, S.m
    fade = 1 - smooth(m.bar(6), m.bar(7.5), t)
    hl = {'DENY': RED, 'proc A': AMBER, 'proc B': ROSE, 'warn': UNION}
    if fade > 0:
        x = 3
        for i, l in enumerate(BOOT):
            t0 = 0.35 + i * m.beat_len * 0.5 * 1.5
            if t < t0:
                break
            c = GREY
            for k, v in hl.items():
                if k in l:
                    c = v
            cv.text(x, 2 + i, typed(l, t, t0, 90), scale(c, fade * (0.55 if c is GREY else 1)))
        # the command
        t1 = m.bar(2.5)
        y = 3 + len(BOOT)
        cmd = typed('./love_story --as A --to B', t, t1, 16)
        if t > m.bar(2):
            cv.text(x, y, 'verona:~$ ', scale(AMBER, fade))
            cv.text(x + 10, y, cmd, scale(TEXT, fade))
            if t < m.bar(4) and cursor_on(S):
                cv.put(x + 10 + len(cmd), y, '▌', scale(AMBER, fade))
    # title
    t2 = m.bar(4)
    if t >= t2:
        title = 'LOVE STORY'
        w = big_width(title)
        if w + 4 <= S.W:
            x0, y0 = int((S.W - w) / 2), int(S.H * 0.38)
            rev = ease_in_out((t - t2) / (m.bar_len * 1.0))
            dis = clamp((t - m.bar(7)) / (m.bar_len * 1.0))
            if dis <= 0:
                big_text(cv, x0, y0, title, mix(GREY, UNION, rev), reveal=rev, shadow=scale(AMBER, 0.25))
            else:
                # the title evaporates upward into stars (light rises)
                cx = 0
                for ch in title:
                    from core import FONT
                    rows = FONT.get(ch, FONT[' '])
                    for ry, row in enumerate(rows):
                        for rx, p in enumerate(row):
                            if p != '#':
                                continue
                            h = hash01((cx + rx) * 31 + ry * 7)
                            k = clamp((dis - h * 0.5) / 0.5)
                            yy = y0 + ry - k * k * (6 + 14 * h)
                            g = '█▓▒░·'[min(4, int(k * 5))]
                            cv.put(x0 + cx + rx, yy, g, scale(UNION, 1 - 0.7 * k))
                    cx += len(rows[0]) + 1
            sub_a = clamp((t - t2 - 1.2) / 1.0) * (1 - dis)
            cv.center(y0 + 7, 'a love story between two processes', scale(TEXT, sub_a * 0.8))
            cv.center(y0 + 8, '两 个 进 程 之 间 的 爱 情 故 事', scale(GREY, sub_a))
            cv.center(y0 + 10, 'music  Taylor Swift · Love Story        code  Opus 5.5', scale(DIM, sub_a * 1.6))
        else:
            cv.center(int(S.H * 0.45), typed('L O V E   S T O R Y', t, t2, 10), UNION)
    stars(S, amount=smooth(m.bar(6), m.bar(8), t), bright=0.7)
    # A and B blink into existence
    a = smooth(m.bar(7.3), m.bar(7.9), t)
    if a > 0:
        light(S, S.W * 0.2, S.H * 0.72, AMBER, a)
        light(S, S.W * 0.79, S.H * 0.3, ROSE, a)


# ----------------------------------------------------------------------------- 1 · STARS (bars 8–16)

def s_stars(S):
    t, m, cv = S.t, S.m, S.cv
    dip = smooth(m.bar(11.6), m.bar(12.2), t) * (1 - smooth(m.bar(15.2), m.bar(16), t))
    stars(S, amount=1.0, drift=0.8, bright=1.0 - 0.55 * dip)
    ax, ay = S.W * 0.2, S.H * 0.72
    bx, by = S.W * 0.79, S.H * 0.3
    # each downbeat both send a ping ring; rings grow, and in the quiet bars they reach each other
    reach = 0.55 + 0.55 * smooth(m.bar(12), m.bar(15.5), t)
    for who, (x, y, col) in enumerate(((ax, ay, AMBER), (bx, by, ROSE))):
        b = m.bar_at(t)
        for k in range(3):
            ph = (b - math.floor(b)) + k
            if ph > 3:
                continue
            r = ph / 3 * S.W * reach * 0.5
            a = (1 - ph / 3) ** 1.5 * (0.5 + 0.5 * dip)
            S.br.circle(x * 2 + 1, y * 4 + 2, r * 2, scale(col, 0.45 * a), step=2.2)
    light(S, ax, ay, AMBER, 1.0)
    light(S, bx, by, ROSE, 1.0)
    la = smooth(m.bar(9), m.bar(10), t)
    cv.text(ax + 3, ay + 1, 'A  pid 1597  montague.net', scale(AMBER, 0.45 * la))
    cv.text(bx - 26, by - 1, 'B  pid 1597  capulet.net', scale(ROSE, 0.45 * la))
    # they notice each other: "unknown signal" on both sides
    q = smooth(m.bar(13.5), m.bar(14), t)
    if q > 0:
        cv.text(ax + 3, ay - 1, '? unknown signal  →', scale(TEXT, q * 0.8))
        cv.text(bx - 21, by + 1, '←  unknown signal ?', scale(TEXT, q * 0.8))
    chapter(S, m.bar(8), '01', '初见', 'FIRST SIGHT')


# ----------------------------------------------------------------------------- 2 · MASQUERADE MESH (bars 16–24)

def crowd_phase(S, t):
    """integrated dance clock: full speed, then time almost stops at first sight, then resumes"""
    m = S.m
    ts = m.bar(19)
    if t < ts:
        return t
    k = 3.0
    slow = ts + 0.04 * (t - ts) + 0.96 * (1 - math.exp(-k * (t - ts))) / k
    tr = m.bar(24)
    if t < tr:
        return slow
    sl_tr = ts + 0.04 * (tr - ts) + 0.96 * (1 - math.exp(-k * (tr - ts))) / k
    return sl_tr + 0.45 * (t - tr)


def crowd(S, part=0.0, fade=1.0, ph=None):
    if fade <= 0:
        return
    W, H, cv = S.W, S.H, S.cv
    ph = S.t if ph is None else ph
    for i, (a0, rr, sp, rad) in enumerate(CROWD):
        ang = a0 + ph * 0.12 * (1 if i % 2 else -0.8)
        ccx = S.cx + math.cos(ang) * rr * W * 0.42
        ccy = S.cy + math.sin(ang) * rr * H * 0.36
        # part the crowd away from the centre row
        dy = ccy - S.cy
        ccy += math.copysign(part * H * 0.3 * (1 - min(1, abs(dy) / (H * 0.5))), dy if dy else 1)
        spin = sp + ph * 2.1 * rad
        ox, oy = math.cos(spin) * 2.2, math.sin(spin) * 1.0
        c = scale(GREY, (0.55 + 0.25 * math.sin(i)) * fade)
        S.br.line((ccx - ox) * 2 + 1, (ccy - oy) * 4 + 2, (ccx + ox) * 2 + 1, (ccy + oy) * 4 + 2, scale(DIM, fade))
        cv.put(ccx - ox, ccy - oy, 'o', c)
        cv.put(ccx + ox, ccy + oy, 'o', c)


def s_ball(S):
    t, m, cv = S.t, S.m, S.cv
    stars(S, amount=0.35, drift=0.3, bright=0.5)
    ph = crowd_phase(S, t)
    crowd(S, ph=ph)
    enter = ease_out((t - m.bar(16)) / (m.bar_len * 2.2))
    ax, ay = -2 + (S.W * 0.16 + 2) * enter, S.H * 0.55
    bx, by = S.W * 0.8, S.H * 0.42
    slow = smooth(m.bar(19), m.bar(19.6), t)
    # first sight: a ping crosses the room
    tp = m.bar(18)
    u = (t - tp) / (m.bar_len * 1.0)
    if t >= tp:
        sight = smooth(tp, m.bar(19), t)
        S.br.line(ax * 2 + 1, ay * 4 + 2, (ax + (bx - ax) * min(1, u)) * 2 + 1, (ay + (by - ay) * min(1, u)) * 4 + 2,
                  scale(mix(AMBER, ROSE, 0.5), 0.35 + 0.3 * slow), step=1.6)
        packet(S, ax, ay, bx, by, u, AMBER)
        if u > 1:
            packet(S, bx, by, ax, ay, (t - m.bar(19)) / m.bar_len, ROSE)
    light(S, ax, ay, AMBER, 0.8 + 0.4 * slow)
    light(S, bx, by, ROSE, 0.8 + 0.4 * slow)
    # console pane: the ping that changed everything
    pw = 50
    if S.W > 90:
        x0, y0 = S.W - pw - 3, S.H - 8
        window(S, x0, y0, x0 + pw, y0 + 6, 'A@montague', scale(AMBER, 0.6))
        lines = ['$ ping B', '64 bytes from B: seq=1 ttl=64 time=0.001 ms',
                 'heartbeat  72 bpm → 119 bpm', 'everything else: paused']
        log_lines(S, x0 + 2, y0 + 1, lines, tp, m.bar_len * 1.0, col=TEXT,
                  hl={'119': AMBER, 'paused': GREY, 'from B': ROSE})
    if slow > 0:
        cv.text(S.W * 0.5 - 6, 2, 'time ×0.04', scale(GREY, slow * 0.7))


# ----------------------------------------------------------------------------- 3 · CLOSER (bars 24–30)

def s_approach(S):
    t, m, cv = S.t, S.m, S.cv
    stars(S, amount=0.35, drift=0.3, bright=0.5)
    part = smooth(m.bar(24), m.bar(26), t)
    crowd(S, part=part, ph=crowd_phase(S, t), fade=1 - 0.4 * part)
    # step closer on every beat
    b0 = m.beat_at(m.bar(24))
    b = m.beat_at(t) - b0
    steps = 22
    k = min(steps, math.floor(b) + ease_out((b - math.floor(b)) * 3))
    prog = k / steps
    yy = S.H * 0.5
    ax = S.W * 0.16 + (S.cx - 3 - S.W * 0.16) * prog
    bx = S.W * 0.84 - (S.W * 0.84 - S.cx - 3) * prog
    S.br.line(ax * 2 + 3, yy * 4 + 2, bx * 2 - 1, yy * 4 + 2, scale(mix(AMBER, ROSE, 0.5), 0.25), step=3)
    light(S, ax, yy, AMBER, 0.9 + 0.3 * prog)
    light(S, bx, yy, ROSE, 0.9 + 0.3 * prog)
    d = int(round((bx - ax) * 1.0))
    cv.center(int(yy) + 3, f'distance  {d:>3}', scale(TEXT, 0.7))
    ecg(S, S.H - 3, mix(AMBER, ROSE, 0.5))
    chapter(S, m.bar(24), '02', '靠近', 'CLOSER')


# ----------------------------------------------------------------------------- 4 · THE WALTZ (bars 30–40)

def waltz_pos(S, t, t0, R0):
    ph = (t - t0)
    trav = ph * 0.35
    ccx = S.cx + math.cos(trav) * S.W * 0.06
    ccy = S.cy + math.sin(trav) * S.H * 0.05
    th = ph * math.tau / (S.m.bar_len * 1.0)
    r = R0 * (1 + 0.32 * math.sin(th * 2.5) + 0.1 * math.sin(ph * 0.9))
    ax = ccx + math.cos(th) * r * 2.0
    ay = ccy + math.sin(th) * r
    bx = ccx - math.cos(th) * r * 2.0
    by = ccy - math.sin(th) * r
    return ax, ay, bx, by


def s_waltz(S):
    t, m, cv = S.t, S.m, S.cv
    t0 = m.bar(30)
    grow = smooth(m.bar(30), m.bar(31), t)
    big = smooth(m.bar(35.5), m.bar(36.5), t)
    stars(S, amount=0.5 + 0.5 * big, drift=0.4, rise=0.6, bright=0.6 + 0.4 * big)
    # the crowd evaporates upward
    fade = 1 - smooth(t0, m.bar(31), t)
    if fade > 0:
        for i, (a0, rr, sp, rad) in enumerate(CROWD):
            x = S.cx + math.cos(a0) * rr * S.W * 0.42
            y = S.cy + math.sin(a0) * rr * S.H * 0.36 - (1 - fade) * 8 * (0.5 + rad)
            cv.put(x, y, '·', scale(GREY, fade))
    R0 = (S.H * 0.18) * (0.3 + 0.7 * grow) * (1 + 0.45 * big)
    energy = 0.6 + 0.4 * S.m.env('rms', t)
    # trails: the dance paints epicycloids in two colours
    for k in range(1, 140):
        tt = t - k * 0.035
        if tt < t0:
            break
        ax, ay, bx, by = waltz_pos(S, tt, t0, R0)
        f = (1 - k / 140) ** 1.4 * energy
        S.br.dot(ax * 2 + 1, ay * 4 + 2, scale(AMBER, f))
        S.br.dot(bx * 2 + 1, by * 4 + 2, scale(ROSE, f))
    ax, ay, bx, by = waltz_pos(S, t, t0, R0)
    S.br.line(ax * 2 + 1, ay * 4 + 2, bx * 2 + 1, by * 4 + 2, scale(UNION, 0.18), step=2.5)
    # packets exchanged on every beat
    b = m.beat_at(t)
    u = b - math.floor(b)
    if int(b) % 2:
        packet(S, ax, ay, bx, by, u, AMBER, trail=4)
    else:
        packet(S, bx, by, ax, ay, u, ROSE, trail=4)
    light(S, ax, ay, AMBER, 1.0)
    light(S, bx, by, ROSE, 1.0)
    # a small <3 rises from their midpoint on every downbeat
    bb = m.bar_at(t)
    ph = bb - math.floor(bb)
    if ph < 0.75:
        mx, my = (ax + bx) / 2, (ay + by) / 2 - ph * 4
        cv.text(mx - 1, my, '<3', scale(UNION, (1 - ph / 0.75) * 0.9))


# ----------------------------------------------------------------------------- 5 · FIREWALL (bars 40–42)

def s_firewall(S):
    t, m, cv = S.t, S.m, S.cv
    t0 = m.bar(40)
    lt = t - t0
    drop = ease_out(lt / 0.35)
    stars(S, amount=0.3, bright=0.3)
    wx = int(S.cx)
    hgt = int(S.H * drop)
    for y in range(hgt):
        for dx, g in ((-3, '░'), (-2, '▒'), (-1, '▓'), (0, '█'), (1, '▓'), (2, '▒'), (3, '░')):
            cv.put(wx + dx, y, g, scale(RED, 0.9 - abs(dx) * 0.17))
    push = ease_out(lt / 0.6)
    light(S, S.W * (0.38 - 0.14 * push), S.H * 0.5, AMBER, 0.75)
    light(S, S.W * (0.62 + 0.14 * push), S.H * 0.5, ROSE, 0.75)
    ban = clamp((lt - 0.15) / 0.2) * (1 - smooth(2.6, 3.6, lt))
    if ban > 0:
        txt = 'ACCESS DENIED'
        w = big_width(txt)
        y0 = int(S.H * 0.2)
        if w + 4 < S.W:
            cv.fill((S.W - w) // 2 - 2, y0 - 1, (S.W + w) // 2 + 2, y0 + 5)
            big_text(cv, (S.W - w) // 2, y0, txt, scale(RED, ban))
        else:
            cv.center(y0 + 2, '[ ACCESS DENIED ]', scale(RED, ban))
        cv.center(y0 + 7, 'iptables: DROP  montague.net  →  capulet.net', scale(TEXT, ban * 0.8))
        cv.center(y0 + 8, 'policy source: /etc/families.conf   (immutable)', scale(GREY, ban))
    if lt < 0.6:
        glitch(S, 1.0 - lt / 0.6, 3)
    chapter(S, t0, '03', '阻隔', 'FIREWALL')


# ----------------------------------------------------------------------------- 6 · ENCRYPTED (bars 42–50)

def s_balcony(S):
    t, m, cv = S.t, S.m, S.cv
    t0 = m.bar(42)
    lt = t - t0
    W, H = S.W, S.H
    stars(S, amount=0.25, bright=0.35)
    # upper pane: the balcony (capulet), lower pane: the garden (montague)
    tx0, ty0, tx1, ty1 = int(W * 0.52), 2, int(W * 0.93), int(H * 0.42)
    gx0, gy0, gx1, gy1 = int(W * 0.07), int(H * 0.58), int(W * 0.6), H - 2
    window(S, tx0, ty0, tx1, ty1, 'capulet:/balcony  [ro]', scale(ROSE, 0.7))
    window(S, gx0, gy0, gx1, gy1, 'montague:/garden', scale(AMBER, 0.7))
    # balcony pane: moon, sky, railing
    mx, my = tx0 + (tx1 - tx0) * 0.75, ty0 + 3.5
    moon_disc(S, mx, my, 2.6)
    stars(S, amount=0.15, region=(tx0 + 1, ty0 + 1, tx1 - 1, ty1 - 4), bright=0.6)
    ry = ty1 - 3
    for x in range(tx0 + 2, tx1 - 1):
        cv.put(x, ry, '╤' if (x - tx0) % 3 == 0 else '═', scale(GREY, 0.8))
        cv.put(x, ry + 1, '│' if (x - tx0) % 3 == 0 else ' ', scale(DIM, 1))
    bx, by = tx0 + (tx1 - tx0) * 0.38, ry - 1
    light(S, bx, by, ROSE, 0.95)
    # garden pane: grass and flowers growing on the beat
    gy = gy1 - 1
    for x in range(gx0 + 1, gx1):
        cv.put(x, gy, ',.;:\'`'[(x * 7) % 6], scale((70, 110, 80), 0.6))
    grow = clamp(lt / (m.bar_len * 6))
    for i in range(int((gx1 - gx0) / 4)):
        x = gx0 + 2 + i * 4 + int(hash01(i) * 3)
        h = int((1.5 + hash01(i * 3) * 3.5) * smooth(hash01(i * 5) * 0.6, hash01(i * 5) * 0.6 + 0.4, grow))
        for k in range(h):
            cv.put(x, gy - 1 - k, '|', (60, 120, 80))
        if h > 0:
            cv.put(x, gy - 1 - h, '@' if i % 3 else '*', mix(ROSE, AMBER, hash01(i)))
    ax, ay = gx0 + (gx1 - gx0) * 0.3, gy - 3
    light(S, ax, ay, AMBER, 0.95)
    # a vine of light climbs from the garden toward the balcony across the gap
    vg = smooth(m.bar(44), m.bar(49.5), t)
    pts = []
    sx, sy = gx1 - 3, gy0
    ex, ey = tx0 + 3, ty1
    n = 120
    for k in range(int(n * vg)):
        u = k / n
        x = sx + (ex - sx) * u + math.sin(u * 14) * 2.2
        y = sy + (ey - sy) * u
        pts.append((x, y))
        S.br.dot(x * 2 + 1, y * 4 + 2, mix(AMBER, ROSE, u))
        if k % 9 == 4:
            S.br.dot(x * 2 + 3, y * 4 + 1, scale(mix(AMBER, ROSE, u), 0.6))
    # encrypted messages float upward; early ones bounce off, later ones decrypt into <3
    for i in range(10):
        st = t0 + 0.6 + i * m.bar_len * 0.75
        u = (t - st) / (m.bar_len * 1.6)
        if not (0 <= u <= 1.25):
            continue
        hexs = ' '.join(HEX[int(hash01(i * 13 + j) * 16)] + HEX[int(hash01(i * 7 + j * 3) * 16)] for j in range(4))
        x = gx0 + 6 + (i * 7) % max(1, (gx1 - gx0 - 18))
        y = gy - 4 - u * (gy - 4 - ty1 + 2)
        passed = i >= 4
        if not passed and y < gy0 - 1:
            y = gy0 - 1
            cv.text(x, y, 'EACCES', scale(RED, clamp(1.25 - u) * 2))
            continue
        if passed and y < ty1:
            cv.text(min(max(x, tx0 + 2), tx1 - 4), max(y, ty0 + 2), '<3', scale(ROSE, clamp(1.25 - u) * 4))
        else:
            cv.text(x, y, hexs, scale(AMBER, 0.75))
    # replies fall from the balcony in the second half
    for i in range(4):
        st = m.bar(46) + i * m.bar_len
        u = (t - st) / m.bar_len
        if 0 <= u <= 1:
            x = bx + 2
            y = by + 1 + u * (gy0 - by - 1)
            cv.text(x, y, '<3' if y > gy0 - 2 else '░▒▓', scale(ROSE, 0.9))
    if t > m.bar(47):
        cv.text(tx0 + 2, ty0 + 1, typed('gpg: decryption ok · key: [secret]', t, m.bar(47), 30), scale(OK, 0.7))
    chapter(S, t0, '04', '秘密相爱', 'ENCRYPTED')


# ----------------------------------------------------------------------------- 7 · PERMISSION MAZE (bars 50–56)

_MAZE = {}


def maze(cols, rows):
    key = (cols, rows)
    if key in _MAZE:
        return _MAZE[key]
    rr = random.Random(77)
    walls = {}
    seen = {(0, rows // 2)}
    stack = [(0, rows // 2)]
    edges = set()
    while stack:
        x, y = stack[-1]
        nb = [(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= x + dx < cols and 0 <= y + dy < rows and (x + dx, y + dy) not in seen]
        if not nb:
            stack.pop()
            continue
        n = rr.choice(nb)
        edges.add(((x, y), n)); edges.add((n, (x, y)))
        seen.add(n)
        stack.append(n)
    # BFS distances from the entrance and the path to B
    start, goal = (0, rows // 2), (cols - 1, rows // 2)
    dist = {start: 0}
    prev = {}
    q = [start]
    for c in q:
        x, y = c
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (x + dx, y + dy)
            if (c, n) in edges and n not in dist:
                dist[n] = dist[c] + 1
                prev[n] = c
                q.append(n)
    path = [goal]
    while path[-1] != start:
        path.append(prev[path[-1]])
    path.reverse()
    _MAZE[key] = (edges, dist, path)
    return _MAZE[key]


def s_maze(S):
    t, m, cv = S.t, S.m, S.cv
    t0 = m.bar(50)
    side = 34 if S.W > 110 else 0
    mw = S.W - side - 4
    cols, rows = max(6, (mw - 1) // 4), max(4, (S.H - 4) // 2)
    edges, dist, path = maze(cols, rows)
    ox, oy = 2, 2
    maxd = max(dist.values())
    search = smooth(t0, m.bar(54), t)
    frontier = search * maxd
    found = smooth(m.bar(54), m.bar(54.6), t)
    # cells: visited glow, walls drawn as box lines
    for (x, y), d in dist.items():
        px, py = ox + x * 4 + 2, oy + y * 2 + 1
        if d < frontier - 1.5:
            cv.put(px, py, '·', scale(AMBER, 0.35))
        elif d < frontier:
            cv.put(px, py, '▓', scale(AMBER, 0.9))
    for y in range(rows):
        for x in range(cols):
            px, py = ox + x * 4, oy + y * 2
            cv.put(px, py, '+', DIM)
            if ((x, y), (x + 1, y)) not in edges:
                cv.put(px + 4, py + 1, '│', scale(GREY, 0.7))
            if ((x, y), (x, y + 1)) not in edges:
                cv.text(px + 1, py + 2, '───', scale(GREY, 0.7))
    cv.hline(ox, ox + cols * 4, oy, '─', scale(GREY, 0.7))
    cv.vline(ox, oy, oy + rows * 2, '│', scale(GREY, 0.7))
    # locked directories
    for i in range(7):
        lx, ly = int(hash01(i * 3 + 1) * (cols - 2)) + 1, int(hash01(i * 5 + 2) * rows)
        if (lx, ly) not in path and dist.get((lx, ly), 0) < frontier:
            cv.text(ox + lx * 4 + 1, oy + ly * 2 + 1, '[x]', scale(RED, 0.8))
    # the hidden route lights up
    if found > 0:
        n = int(len(path) * found)
        for i, (x, y) in enumerate(path[:n]):
            c = mix(AMBER, ROSE, i / len(path))
            cv.put(ox + x * 4 + 2, oy + y * 2 + 1, '◆', c)
            if i + 1 < n:
                x2, y2 = path[i + 1]
                cv.put(ox + (x + x2) * 2 + 2, oy + (y + y2) + 1, '━' if y == y2 else '┃', scale(c, 0.8))
        u = (t - m.bar(54.6)) / (m.bar_len * 1.4)
        if 0 <= u <= 1:
            x, y = path[min(len(path) - 1, int(u * len(path)))]
            cv.put(ox + x * 4 + 2, oy + y * 2 + 1, '●', UNION)
    sx, sy = path[0]
    light(S, ox + sx * 4 + 2, oy + sy * 2 + 1, AMBER, 1.0)
    gx, gy = path[-1]
    light(S, ox + gx * 4 + 2, oy + gy * 2 + 1, ROSE, 1.0)
    if side:
        x0 = S.W - side - 1
        window(S, x0, 2, S.W - 2, S.H - 2, 'A@montague: ~', scale(AMBER, 0.6))
        errs = ['$ cd /capulet', 'cd: Permission denied', '$ sudo -u capulet ls', 'A is not in the sudoers file.',
                '  This incident will be reported.', '$ chmod 777 /capulet/heart', 'chmod: Operation not permitted',
                '$ ssh B@capulet', 'ssh: Connection refused', '$ find / -name "*route*"', '/garden/.secret/route',
                '$ ./route --quiet', 'route found  (hidden · encrypted)']
        log_lines(S, x0 + 2, 3, errs, t0 + 0.2, m.beat_len * 1.75, col=TEXT, maxn=S.H - 6, cps=70,
                  hl={'denied': RED, 'refused': RED, 'not permitted': RED, 'reported': RED, 'sudoers': RED,
                      'found': OK, '.secret': AMBER})


# ----------------------------------------------------------------------------- 8 · ESCAPE (bars 56–74)

def skyline(S, x, layer, col, speed):
    """parallax silhouettes of a sleeping city drawn with block elements"""
    H = S.H
    base = H - 3
    for sx in range(S.W):
        wx = sx + int(S.t * speed)
        h = hash01((wx // (3 + layer * 2)) * 97 + layer * 1000)
        hh = int((2 + h * (5 + layer * 4)) * (0.6 + 0.4 * layer))
        top = base - hh - layer * 2
        for y in range(top, base - (0 if layer == 0 else layer)):
            if S.cv.get(sx, y) == ' ':
                ch = '█' if layer == 0 else '▓' if layer == 1 else '░'
                lit = hash01(wx * 13 + y * 31) < 0.07 and layer < 2
                S.cv.put(sx, y, '▪' if lit else ch, (230, 170, 90) if lit else col)


def helix(S, t, sep=0.0, amp=2.0, x_head=None, hop=0.0):
    x_head = S.W * 0.62 if x_head is None else x_head
    yc = S.H * 0.42 - hop
    pts = []
    for k in range(0, int(x_head * 2)):
        px = x_head * 2 - k
        tt = t - k * 0.02
        ph = tt * 7.0 - k * 0.09
        ya = yc * 4 + math.sin(ph) * amp * 4 - sep * 4
        yb = yc * 4 + math.sin(ph + math.pi) * amp * 4 + sep * 4
        f = (1 - k / (x_head * 2)) ** 0.8
        S.br.dot(px, ya, scale(AMBER, f))
        S.br.dot(px, yb, scale(ROSE, f))
        if k % 14 == 0 and sep < 1.0:
            S.br.line(px, ya, px, yb, scale(UNION, 0.12 * f), step=2)
    ya = yc + math.sin(t * 7.0) * amp - sep
    yb = yc + math.sin(t * 7.0 + math.pi) * amp + sep
    light(S, x_head, ya, AMBER, 1.0, halo=False)
    light(S, x_head, yb, ROSE, 1.0, halo=False)
    return ya, yb


def s_escape(S):
    t, m, cv = S.t, S.m, S.cv
    t0 = m.bar(56)
    stars(S, amount=0.7, drift=2.5, bright=0.8)
    # hop over DENY gates on every second downbeat
    bb = m.bar_at(t)
    ph = bb - math.floor(bb)
    hop = math.sin(math.pi * clamp(ph / 0.5)) * 3.0 if int(math.floor(bb)) % 2 == 0 else 0.0
    helix(S, t, amp=1.6 + 0.6 * S.m.env('rms', t), hop=hop)
    for k in range(3):
        gx = S.W - ((t - t0) * 22 + k * 41) % (S.W + 30)
        cv.text(gx, S.H * 0.42 + 4, '[DENY]', scale(RED, 0.6))
        cv.vline(int(gx) + 3, int(S.H * 0.42) + 5, S.H - 4, '┊', scale(RED, 0.3))
    skyline(S, 0, 0, (16, 18, 28), 30)
    skyline(S, 0, 1, (26, 30, 44), 16)
    skyline(S, 0, 2, (34, 38, 56), 8)
    cv.hline(0, S.W - 1, S.H - 3, '═', scale(GREY, 0.5))
    for x in range(S.W):
        if (x + int(t * 40)) % 6 == 0:
            cv.put(x, S.H - 2, '─', scale(DIM, 1))
    cv.text(2, S.H - 2, 'tunnel: encrypted · route: hidden · tempo: 119 bpm', scale(OK, 0.55))
    chapter(S, t0, '05', '逃离', 'ESCAPE')


def s_trace(S):
    t, m, cv = S.t, S.m, S.cv
    t0 = m.bar(66)
    u = smooth(t0, m.bar(74), t)
    stars(S, amount=0.6, drift=2.5, bright=0.6)
    sep = smooth(m.bar(70), m.bar(74), t) * S.H * 0.18
    helix(S, t, amp=1.6 + 1.4 * u, sep=sep)
    skyline(S, 0, 0, (20, 14, 18), 30)
    skyline(S, 0, 1, (32, 22, 28), 16)
    cv.hline(0, S.W - 1, S.H - 3, '═', scale(RED, 0.3))
    # red IDS scanning beam sweeps once per bar
    bb = m.bar_at(t)
    sx = (bb - math.floor(bb)) * (S.W + 20) - 10
    for y in range(S.H):
        for dx in range(-2, 3):
            if cv.get(int(sx) + dx, y) == ' ':
                cv.put(sx + dx, y, '░' if abs(dx) > 1 else '▒', scale(RED, 0.45 - abs(dx) * 0.12))
    # trace lines creep from both edges toward the streams
    yc = int(S.H * 0.42)
    reach = u * S.W * 0.45
    cv.line(0, 2, reach, yc - 1, '·', scale(RED, 0.6), dotted=2)
    cv.line(S.W - 1, S.H - 4, S.W - 1 - reach, yc + 1, '·', scale(RED, 0.6), dotted=2)
    # trace progress
    w = 26
    x0 = S.W - w - 4
    cv.text(x0, 2, 'IDS  unauthorized link', scale(RED, 0.85))
    n = int(w * u)
    cv.text(x0, 3, '[' + '█' * n + '·' * (w - n) + f'] {int(u * 100):3d}%', scale(RED, 0.75))
    glitch(S, smooth(m.bar(72), m.bar(74), t) * 0.8, 9)


# ----------------------------------------------------------------------------- 9 · STORM (bars 74–82)

def s_storm(S):
    t, m, cv = S.t, S.m, S.cv
    t0 = m.bar(74)
    W, H = S.W, S.H
    # glyph rain (ink falls)
    dens = 0.55 + 0.45 * S.m.env('rms', t)
    for i, (u, v, sp, g) in enumerate(RAIN[:int(len(RAIN) * dens)]):
        y = (v * H + t * sp * 14) % H
        x = u * W
        cv.put(x, y, g, scale((90, 104, 140), 0.35 + 0.4 * sp))
    # jagged crack splitting the screen
    crack = []
    for y in range(H):
        x = W / 2 + (hash01(y * 7 + 3) - 0.5) * 3 + math.sin(y * 0.7) * 1.5
        crack.append(x)
        cv.put(x, y, '╱' if hash01(y) < 0.5 else '╲', scale(RED, 0.5))
        cv.put(x + 1, y, ' ', None)
    # lightning on chosen downbeats
    flash = 0.0
    for n in (75, 77, 79, 80.5):
        dt = t - m.bar(n)
        if 0 <= dt < 0.5:
            flash = max(flash, math.exp(-dt * 9))
            for y in range(H):
                cv.put(crack[y] + (hash01(y * 3 + n) - 0.5) * 2, y, '┃', scale(UNION, 0.6 + 0.4 * flash))
    ax, ay = W * 0.22, H * 0.55
    bx, by = W * 0.78, H * 0.45
    light(S, ax, ay, AMBER, 0.8)
    light(S, bx, by, ROSE, 0.8)
    # signals hit the crack and scatter
    b = m.beat_at(t)
    u = b - math.floor(b)
    k = int(math.floor(b))
    if k % 2 == 0:
        x = ax + (W / 2 - 1 - ax) * u
        cv.put(x, ay, '•', AMBER)
        if u > 0.9:
            cv.text(W / 2 - 3, ay, '×', RED)
    else:
        x = bx - (bx - W / 2 - 2) * u
        cv.put(x, by, '•', ROSE)
        if u > 0.9:
            cv.text(W / 2 + 2, by, '×', RED)
    cv.text(3, H - 4, 'montague:/outside', scale(AMBER, 0.6))
    log_lines(S, 3, H - 3, ['send(): Connection reset by peer', 'packet loss 87%  · retrying'], t0 + 1, m.bar_len * 2,
              col=scale(RED, 0.7), maxn=2)
    cv.text(W - 22, 2, 'capulet:/locked', scale(ROSE, 0.6))
    log_lines(S, W - 34, 3, ['recv(): no route to host', 'waiting for A …'], t0 + 2, m.bar_len * 2,
              col=scale(RED, 0.7), maxn=2)
    if flash > 0:
        # brief inversion flash
        for i in range(len(cv.fg)):
            if cv.fg[i] is not None:
                cv.fg[i] = mix(cv.fg[i], (255, 255, 255), flash * 0.7)
        for y in range(0, H, 1):
            for x in range(0, W, 3):
                if cv.get(x, y) == ' ' and hash01(x * 7 + y * 13 + int(t * 24)) < 0.25 * flash:
                    cv.put(x, y, '░', scale((200, 210, 240), flash * 0.5))


# ----------------------------------------------------------------------------- 10 · WAITING (bars 82–89)

def s_waiting(S):
    t, m, cv = S.t, S.m, S.cv
    t0 = m.bar(82)
    W, H = S.W, S.H
    stars(S, amount=0.06, bright=0.25)
    w, h = min(56, W - 6), 9
    x0, y0 = int((W - w) / 2), int((H - h) / 2)
    window(S, x0, y0, x0 + w, y0 + h, 'B@capulet: ~', scale(ROSE, 0.55))
    cv.text(x0 + 2, y0 + 1, 'B@capulet:~$ ', scale(ROSE, 0.75))
    cv.text(x0 + 15, y0 + 1, typed('wait --for A --timeout never', t, t0 + 0.4, 18), TEXT)
    spin = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'[int(t * 6) % 10]
    days = int(1 + (clamp((t - t0) / (m.bar(89) - t0)) ** 1.6) * 364)
    cv.text(x0 + 2, y0 + 3, f'{spin} waiting for A …   day {days:03d}', scale(TEXT, 0.8))
    lines = [f'ping A: request timed out  (seq {i + 1})' for i in range(7)]
    log_lines(S, x0 + 2, y0 + 5, lines, t0 + m.bar_len * 0.5, m.bar_len, col=scale(GREY, 0.8), maxn=3, cps=50)
    light(S, x0 + w - 4, y0 + h - 1.5, ROSE, 0.45 + 0.15 * S.m.pulse(t, 3))
    # the season passes at the edges of the screen: slow falling ink leaves
    for i in range(14):
        u = hash01(i * 11)
        y = ((t - t0) * (0.8 + hash01(i) * 0.8) + hash01(i * 5) * H) % H
        x = u * W + math.sin(t * 0.7 + i) * 2
        if not (x0 - 1 <= x <= x0 + w + 1 and y0 - 1 <= y <= y0 + h + 1):
            cv.put(x, y, '❧' if i % 4 == 0 else ',', scale(GREY, 0.35))
    chapter(S, t0, '06', '等待', 'WAITING')


# ----------------------------------------------------------------------------- 11 · TIMEOUT (bars 89–94)

def s_timeout(S):
    t, m, cv = S.t, S.m, S.cv
    t0 = m.bar(89)
    W, H = S.W, S.H
    shrink = smooth(t0, m.bar(91.5), t)
    w = int(min(56, W - 6) * (1 - shrink) + 2 * shrink)
    h = int(9 * (1 - shrink) + 2 * shrink)
    x0, y0 = int((W - w) / 2), int((H - h) / 2)
    fade = 1 - smooth(m.bar(90.5), m.bar(91.6), t)
    if fade > 0.02 and w > 4:
        window(S, x0, y0, x0 + w, y0 + h, 'B@capulet: ~' if w > 20 else '', scale(ROSE, 0.5 * fade))
        if w > 30:
            cv.text(x0 + 2, y0 + 2, 'connection timed out.', scale(RED, 0.7 * fade))
            cv.text(x0 + 2, y0 + 4, typed('is the signal gone?', t, t0 + 1.5, 12), scale(GREY, fade))
    # the lonely prompt: slows, dims
    dim = 1 - 0.75 * smooth(m.bar(90), m.bar(92.5), t)
    period = 1 + smooth(m.bar(90), m.bar(92), t) * 1.5
    if cursor_on(S, period):
        cv.text(W / 2 - 2, H / 2, 'B$', scale(ROSE, 0.6 * dim))
        cv.put(W / 2 + 1, H / 2, '▌', scale(ROSE, dim))
    elif shrink > 0.9:
        cv.text(W / 2 - 2, H / 2, 'B$', scale(ROSE, 0.35 * dim))
    # a signal returns: a single amber point crossing the dark
    tsig = m.bar(93)
    if t >= tsig:
        u = ease_in_out((t - tsig) / (m.bar(94) - tsig))
        sx = W - 2 - (W - 2 - (W / 2 + 3)) * u
        for k in range(1, 40):
            xx = sx + k * 1.2
            if xx < W:
                S.br.dot(xx * 2, H / 2 * 4 + 2, scale(AMBER, (1 - k / 40) * 0.8))
        light(S, sx, H / 2, AMBER, 0.6 + 0.4 * u)
        cv.text(sx - 2, H / 2 + 2, 'incoming', scale(AMBER, 0.5 * (1 - u)))
        cv.text(sx - 5, H / 2 - 2, 'signal: A', scale(AMBER, 0.6 * (1 - u)))
    chapter(S, t0, '07', '失落', 'TIMEOUT')


# ----------------------------------------------------------------------------- 12 · HANDSHAKE (bars 94–102)

def panes(S, n_levels, col, t, t0):
    """recursive tiling: the closed void opens into a structured, connected terminal"""
    W, H = S.W, S.H
    rects = [(0, 0, W - 1, H - 1)]
    out = []
    for lv in range(n_levels):
        nxt = []
        for (x0, y0, x1, y1) in rects:
            if (x1 - x0) > (y1 - y0) * 2.2:
                xm = (x0 + x1) // 2
                nxt += [(x0, y0, xm, y1), (xm, y0, x1, y1)]
            else:
                ym = (y0 + y1) // 2
                nxt += [(x0, y0, x1, ym), (x0, ym, x1, y1)]
        rects = nxt
        out.append(rects)
    return out


def s_handshake(S):
    t, m, cv = S.t, S.m, S.cv
    t0 = m.bar(94)
    W, H = S.W, S.H
    lt = t - t0
    # unfolding window lattice: one level per eighth note, from the centre outward
    levels = panes(S, 4, GREY, t, t0)
    opened = clamp(lt / (m.beat_len * 0.5 * 4))
    for lv, rects in enumerate(levels):
        a = clamp((lt - lv * m.beat_len * 0.5) / 0.25)
        if a <= 0:
            continue
        fade = 1 - 0.75 * smooth(m.bar(97), m.bar(101.5), t)
        for (x0, y0, x1, y1) in rects:
            S.cv.box(x0, y0, x1, y1, scale(mix(AMBER, ROSE, hash01(x0 * 3 + y0)), 0.18 * a * fade), style='light', clear=False)
    stars(S, amount=0.3 + 0.6 * opened, bright=0.8, rise=1.0)
    # firewall shards fly outward and become stars
    for i in range(70):
        ang = hash01(i * 3) * math.tau
        sp = 0.3 + hash01(i * 7)
        r = ease_out(lt / 2.5) * sp * W * 0.6
        x = W / 2 + math.cos(ang) * r
        y = H / 2 + math.sin(ang) * r * 0.5
        g = '█▓▒░·'[min(4, int(lt * 2))]
        cv.put(x, y, g, scale(RED if lt < 0.8 else UNION, max(0, 1 - lt / 3)))
    meet = ease_out(lt / (m.bar_len * 0.8))
    ax, bx = W / 2 - 14 + 6 * meet, W / 2 + 14 - 6 * meet
    y = H / 2
    S.br.line(ax * 2 + 3, y * 4 + 2, bx * 2 - 1, y * 4 + 2, scale(UNION, 0.45), step=1.4)
    light(S, ax, y, AMBER, 1.2)
    light(S, bx, y, ROSE, 1.2)
    if lt < 0.4:
        for i in range(len(cv.fg)):
            if cv.fg[i] is not None:
                cv.fg[i] = mix(cv.fg[i], UNION, 1 - lt / 0.4)
    # the handshake, one step per bar
    steps = [(94, 'A → B', 'SYN', AMBER), (95, 'B → A', 'SYN-ACK', ROSE), (96, 'A → B', 'ACK', AMBER)]
    for k, (n, d, msg, col) in enumerate(steps):
        ts = m.bar(n)
        if t < ts:
            continue
        u = (t - ts) / (m.beat_len * 2)
        if k == 1:
            packet(S, bx, y, ax, y, u, col)
        else:
            packet(S, ax, y, bx, y, u, col)
        cv.text(W / 2 - 13, y - 10 + k * 1, f'{d}   {msg}', scale(col, 0.9))
        cv.text(W / 2 + 4, y - 10 + k * 1, typed('✓' if u > 1 else '…', t, ts, 4), OK if u > 1 else GREY)
    if t >= m.bar(97):
        a = smooth(m.bar(97), m.bar(97.3), t) * (1 - smooth(m.bar(99.2), m.bar(100), t))
        txt = 'CONNECTED'
        w = big_width(txt)
        if w + 4 < W:
            if a > 0.02:
                big_text(cv, (W - w) // 2, int(y + 3), txt, scale(mix(OK, UNION, smooth(m.bar(97.3), m.bar(99), t)), a),
                         reveal=smooth(m.bar(97), m.bar(97.3), t))
        else:
            cv.center(int(y + 4), 'CONNECTED', OK)
        rule_y = int(y + 10)
        if rule_y < H - 1:
            s = 'policy  montague.net <-> capulet.net :  DENY'
            x0 = (W - len(s) - 9) // 2
            cv.text(x0, rule_y, s, scale(TEXT, a * 0.8))
            if t > m.bar(98):
                xd = x0 + s.index('DENY')
                cv.text(xd - 2, rule_y, '~~DENY~~', scale(RED, 0.55))
                cv.text(xd + 8, rule_y, typed('ALLOW', t, m.bar(98) + 0.3, 12), OK)
    # the promise: a ring closes around them
    if t >= m.bar(98):
        u = smooth(m.bar(98), m.bar(101.6), t)
        S.br.circle(W, y * 4 + 2, 25, scale(UNION, 0.7), step=0.8, a0=-math.pi / 2, a1=-math.pi / 2 + math.tau * u)
        S.br.circle(W, y * 4 + 2, 22, scale(mix(AMBER, ROSE, 0.5), 0.4), step=1.1, a0=-math.pi / 2, a1=-math.pi / 2 + math.tau * u)
        cv.text(W / 2 - 8, y - 12, typed('SO_KEEPALIVE = ∞', t, m.bar(99), 10), scale(UNION, 0.8))
    if t < m.bar(98):
        chapter(S, t0, '08', '重逢', 'SIGNAL')
    else:
        chapter(S, m.bar(98), '09', '承诺', 'HANDSHAKE')


# ----------------------------------------------------------------------------- 13 · CONNECTED (bars 102–114)

def s_finale(S):
    t, m, cv = S.t, S.m, S.cv
    t0 = m.bar(102)
    W, H = S.W, S.H
    lt = t - t0
    cx, cy = W / 2, H / 2
    gather = smooth(m.bar(111), m.bar(113.5), t)
    stars(S, amount=1.0, rise=1.6, bright=1.0)
    # rotating rose curve (k = 4 petals... 8) — the open, luminous mandala
    rot = lt * 0.35
    Rr = min(W * 0.5, H * 0.95) * 0.48 * (1 - 0.7 * gather)
    e = 0.7 + 0.3 * S.m.env('rms', t)
    n = 900
    for i in range(n):
        th = i / n * math.tau
        r = Rr * math.cos(4 * th + rot * 0.5)
        x = cx * 2 + math.cos(th + rot) * r * 2 * 2
        y = cy * 4 + math.sin(th + rot) * r * 4 * 0.98
        S.br.dot(x, y, scale(mix(AMBER, ROSE, (math.sin(th * 2 + lt) + 1) / 2), 0.55 * e))
    # two households' networks, now all routed through the centre
    lit = smooth(t0, m.bar(108), t)
    for side, nodes, col in ((-1, NODES_L, AMBER), (1, NODES_R, ROSE)):
        for i, (u, v) in enumerate(nodes):
            ang = (v - 0.5) * 2.4 + (math.pi if side < 0 else 0)
            rr = (0.55 + 0.4 * u) * (1 - 0.6 * gather)
            x = cx + math.cos(ang) * rr * W * 0.47
            y = cy + math.sin(ang) * rr * H * 0.47
            on = hash01(i * 7 + (side + 2)) < lit
            if on:
                S.br.line(x * 2 + 1, y * 4 + 2, cx * 2 + 1, cy * 4 + 2, scale(col, 0.3), step=2.4)
                cv.put(x, y, '◉', col)
            else:
                cv.put(x, y, 'o', scale(GREY, 0.6))
    # the joined pair: two lights orbiting tightly, union glow
    th = lt * math.tau / m.bar_len
    rr = 2.0 * (1 - gather) + 0.4
    light(S, cx + math.cos(th) * rr * 2, cy + math.sin(th) * rr, AMBER, 1.2)
    light(S, cx - math.cos(th) * rr * 2, cy - math.sin(th) * rr, ROSE, 1.2)
    p = S.m.pulse(t, 4, 4.0)
    S.br.circle(cx * 2 + 1, cy * 4 + 2, 10 + 30 * (1 - p), scale(UNION, 0.4 * p), step=1.2)
    cv.text(cx - 1, cy - 3, '<3', scale(UNION, 0.6 + 0.4 * S.m.pulse(t, 3)))
    # rising light everywhere
    for i in range(60):
        u = hash01(i * 3 + 1)
        y = H - ((lt * (2 + hash01(i) * 4) + hash01(i * 9) * H) % H)
        cv.put(u * W, y, '·' if i % 3 else '˙', scale(mix(AMBER, ROSE, hash01(i * 5)), 0.6))
    # the final hit
    hit = S.m.m['finalHit']
    if t >= hit - 0.05:
        f = math.exp(-(t - hit) * 2.5)
        for i in range(len(cv.fg)):
            if cv.fg[i] is not None:
                cv.fg[i] = mix(cv.fg[i], UNION, f)
    chapter(S, t0, '10', '圆满', 'CONNECTED')


# ----------------------------------------------------------------------------- 14 · EXIT 0 (bar 114 → end)

CREDITS = [
    ('LOVE STORY · terminal edition', UNION),
    ('爱 情 故 事 · 终 端 版', TEXT),
    ('music   Taylor Swift — “Love Story”', GREY),
    ('written in code by Opus 5.5', GREY),
]


def s_outro(S):
    t, m, cv = S.t, S.m, S.cv
    t0 = m.bar(114)
    W, H = S.W, S.H
    lt = t - t0
    stars(S, amount=0.25 * (1 - smooth(8, 12, lt)), rise=1.0, bright=0.5)
    y = int(H * 0.4)
    on = cursor_on(S)
    a = 1 - smooth(10.5, 12.5, lt)
    cv.put(W / 2 - 1, y, '▌' if on else ' ', scale(AMBER, a))
    cv.put(W / 2 + 1, y, '▌' if on else ' ', scale(ROSE, a))
    cv.center(y + 2, typed('process exited with status 0', t, t0 + 0.6, 20), scale(GREY, 0.8 * a))
    for i, (s, c) in enumerate(CREDITS):
        ts = t0 + 2.2 + i * 1.1
        ca = clamp((t - ts) / 0.8) * a
        cv.center(y + 5 + i * (2 if i == 0 else 1) + (1 if i > 0 else 0), s, scale(c, ca))


# ----------------------------------------------------------------------------- edit

def build_edit(m):
    B = m.bar
    return [
        (0.0, B(8), s_boot), (B(8), B(16), s_stars), (B(16), B(24), s_ball), (B(24), B(30), s_approach),
        (B(30), B(40), s_waltz), (B(40), B(42), s_firewall), (B(42), B(50), s_balcony), (B(50), B(56), s_maze),
        (B(56), B(66), s_escape), (B(66), B(74), s_trace), (B(74), B(82), s_storm), (B(82), B(89), s_waiting),
        (B(89), B(94), s_timeout), (B(94), B(102), s_handshake), (B(102), B(114), s_finale), (B(114), B(114) + 14.0, s_outro),
    ]


CHAPTERS = [(8, '01 初见'), (24, '02 靠近'), (40, '03 阻隔'), (42, '04 秘密相爱'), (56, '05 逃离'), (82, '06 等待'),
            (89, '07 失落'), (94, '08 重逢'), (98, '09 承诺'), (102, '10 圆满')]


def status_bar(S):
    t, m, cv = S.t, S.m, S.cv
    y = cv.h - 1
    W = cv.w
    cv.fill(0, y, W - 1, y, ' ', None)
    cv.paint_bg(0, W - 1, y, (18, 20, 30))
    ok_ = t >= m.bar(94)
    cv.paint_bg(0, 11, y, mix(AMBER, ROSE, 0.5) if ok_ else (70, 78, 98))
    cv.text(0, y, ' LOVE STORY ', (12, 12, 18))
    chap = ''
    for n, s in CHAPTERS:
        if t >= m.bar(n):
            chap = s
    cv.text(13, y, chap, scale(TEXT, 0.7))
    ok = t >= m.bar(94)
    rel = 'montague.net ⇄ capulet.net' if ok else 'montague.net ✕ capulet.net'
    cv.text(W - text_width(rel) - 12, y, rel, OK if ok else scale(RED, 0.7))
    beat = m.pulse(t, 8) if t > m.t0 else 0
    cv.put(W - 10, y, '♥', mix(DIM, mix(AMBER, ROSE, 0.5), beat))
    mm, ss = divmod(max(0.0, t), 60)
    cv.text(W - 8, y, f'{int(mm):02d}:{ss:04.1f}', scale(GREY, 0.7))
    return y


def render(cv, m, t, edit):
    cv.clear()
    S = Ctx(cv, m, t)
    if cv.w < 60 or cv.h < 18:
        cv.center(cv.h // 2, 'please enlarge the terminal (min 60×18)', TEXT)
        return S
    for a, b, fn in edit:
        if a <= t < b:
            fn(S)
            break
    S.br.draw(cv)
    status_bar(S)
    return S

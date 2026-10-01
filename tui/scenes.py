"""LOVE STORY — terminal edition. The visual narrative (Chinese-first, beat-driven).

Two processes, A (amber, montague.net) and B (rose, capulet.net), are forbidden to talk by the system's
policy. They find each other, are walled apart, love in secret, escape, lose the signal, wait, and finally
complete the handshake. No figures — only lights, cursors, paths, packets and windows.

Every scene is a pure function of song time t (seconds). Bar n starts at m.bar(n). The pacing of each scene
follows story.energy(): verses are slow and sparse, choruses cut on bars and hit on every kick.
"""
import math
import random

from core import (AMBER, ROSE, UNION, GREY, DIM, FAINT, TEXT, RED, OK, MOON, Braille, big_text, big_width,
                  clamp, ease_in_out, ease_out, hash01, mix, scale, smooth, text_width)
from story import (big_zh, big_zh_width, draw_hud, draw_narration, energy, key_lift, kick, lifted, title_card)

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
        self.W, self.H = cv.w, cv.h - 3          # bottom rows: narration (2) + status bar (1)
        self.br = Braille(cv.w, cv.h)
        self.cx, self.cy = self.W / 2, self.H / 2
        self.e = energy(m, t)                    # section pacing 0..1.3
        self.k = kick(m, t)                      # kick accent (beats 1 and 3)

    def B(self, n):
        return self.m.bar(n)

    def lt(self, bar0):
        return self.t - self.m.bar(bar0)

    def beat(self):
        return self.m.beat_at(self.t)


# ----------------------------------------------------------------------------- shared vocabulary

def light(S, x, y, col, k=1.0, halo=True, core='●'):
    """a living point of light: core glyph + braille halo that breathes on the beat (faster when the song drives)"""
    if k <= 0.02:
        return
    c = scale(col, 0.35 + 0.65 * k)
    if halo:
        p = S.m.pulse(S.t, 3.5 + 4.5 * S.e)
        r = (2.2 + 1.6 * p) * (0.6 + 0.6 * k)
        S.br.circle(x * 2 + 1, y * 4 + 2, r * 2.2, scale(col, 0.28 * k), step=1.1)
        S.br.circle(x * 2 + 1, y * 4 + 2, r * 1.2, scale(col, 0.5 * k), step=0.9)
    S.cv.put(x, y, core, c)


def burst(S, x, y, col, rmax=14.0, beats=2.0, amp=1.0):
    """a ring that leaves the point on every kick and fades over `beats` beats"""
    b = S.m.beat_at(S.t)
    if b < 0 or amp <= 0.02:
        return
    ph = (b % beats) / beats
    r = 2 + ph * rmax
    S.br.circle(x * 2 + 1, y * 4 + 2, r, scale(col, (1 - ph) ** 1.6 * amp), step=1.0 + ph * 2.5)


def moon_disc(S, x, y, r, col=MOON):
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
    x0, y0, x1, y1 = region or (0, 1, W - 1, H - 1)
    n = int(len(STARS) * clamp(amount))
    sp = 0.5 + S.e                                 # the sky moves with the song
    kb = 1 + 0.25 * S.k * S.e
    for i in range(n):
        u, v, d, ph = STARS[i]
        u = (u - drift * sp * (0.3 + d) * t * 0.01) % 1.0
        v = (v - rise * sp * (0.3 + d) * t * 0.01) % 1.0
        x = x0 + u * (x1 - x0)
        y = y0 + v * (y1 - y0)
        tw = 0.55 + 0.45 * math.sin(t * (1.3 + d * 3) + ph)
        b = (0.25 + 0.75 * d) * tw * bright * kb
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
    """chapter header typed in the top-left corner (row 1, under the HUD)"""
    dt = S.t - t0
    if dt < 0 or dt > 6.0:
        return
    a = clamp(dt / 0.25) * clamp((6.0 - dt) / 0.8)
    s = f'第 {num} 章 · '
    txt = typed(f'{zh} · {en}', S.t, t0 + 0.15, 18)
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


def beat_log(S, x, y, t0, maker, maxn, every_beats=1.0, col=GREY, hl=None, cps=90, limit=None):
    """one line per beat (or per `every_beats`), newest at the bottom; maker(i) -> line text"""
    every = S.m.beat_len * every_beats
    n = int((S.t - t0) / every) + 1
    if n <= 0:
        return
    if limit:
        n = min(n, limit)
    first = max(0, n - maxn)
    for k, i in enumerate(range(first, n)):
        l = maker(i)
        if not l:
            continue
        s = typed(l, S.t, t0 + i * every, cps)
        c = col
        if hl:
            for key, hc in hl.items():
                if key in l:
                    c = hc
        age = (S.t - (t0 + i * every)) / (every * maxn)
        S.cv.text(x, y + k, s, scale(c, 1 - 0.45 * clamp(age)))


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
    for y in range(1, S.H):
        if hash01(fr * 131 + y * 7 + seed) < amount * 0.35:
            offs[y] = int((hash01(fr * 17 + y) - 0.5) * 12 * amount)
    S.cv.shift_rows(offs)


def window(S, x0, y0, x1, y1, title, col, style='round', clear=True):
    S.cv.box(x0, y0, x1, y1, col, style=style, title=title, title_col=col, clear=clear)


def meter(S, x, y, label, u, w=12, col=TEXT):
    n = int(round(clamp(u) * w))
    S.cv.text(x, y, label, scale(col, 0.8))
    S.cv.text(x + text_width(label) + 1, y, '▮' * n + '▯' * (w - n), scale(col, 0.9))


# ----------------------------------------------------------------------------- 0 · BOOT (bars 0–8)

BOOT = [
    '[  0.000] 维罗纳OS 1597 启动于 /dev/heart',
    '[  0.252] 挂载 /天空 ..................................... 完成',
    '[  0.504] 挂载 /城市（两个家族）.......................... 完成',
    '[  0.756] 网络  montague.net   10.15.97.0/25     已上线',
    '[  1.008] 网络  capulet.net    10.15.97.128/25   已上线',
    '[  1.260] 防火墙  montague.net ⇄ capulet.net ： 禁止',
    '[  1.512] 假面舞会服务 ................................. 已启动',
    '[  1.764] 启动  pid 1597  进程 A  [蒙太古]      完成',
    '[  2.016] 启动  pid 1597  进程 B  [凯普莱特]    完成',
    '[  2.268] 警告  两个进程共用同一个心跳',
]


def s_boot(S):
    t, cv, m = S.t, S.cv, S.m
    fade = 1 - smooth(m.bar(6), m.bar(7.5), t)
    hl = {'禁止': RED, '进程 A': AMBER, '进程 B': ROSE, '警告': UNION}
    if fade > 0:
        x = 3
        for i, l in enumerate(BOOT):
            t0 = 0.35 + i * m.beat_len * 0.75
            if t < t0:
                break
            c = GREY
            for k, v in hl.items():
                if k in l:
                    c = v
            cv.text(x, 2 + i, typed(l, t, t0, 90), scale(c, fade * (0.6 if c is GREY else 1)))
        t1 = m.bar(2.5)
        y = 3 + len(BOOT)
        cmd = typed('./love_story --as A --to B', t, t1, 16)
        if t > m.bar(2):
            cv.text(x, y, 'verona:~$ ', scale(AMBER, fade))
            cv.text(x + 10, y, cmd, scale(TEXT, fade))
            if t < m.bar(4) and cursor_on(S):
                cv.put(x + 10 + len(cmd), y, '▌', scale(AMBER, fade))
    # title: LOVE STORY in block letters, 爱情故事 in big Chinese underneath
    t2 = m.bar(4)
    if t >= t2:
        title = 'LOVE STORY'
        w = big_width(title)
        zh = '爱情故事'
        size = 16 if S.W >= 120 else 12
        wz = big_zh_width(zh, size)
        tall = S.H >= 36
        if w + 4 <= S.W:
            x0, y0 = int((S.W - w) / 2), (max(15, int(S.H * 0.3)) if tall else int(S.H * 0.3))
            rev = ease_in_out((t - t2) / (m.bar_len * 1.0))
            dis = clamp((t - m.bar(7)) / (m.bar_len * 1.0))
            if dis <= 0:
                big_text(cv, x0, y0, title, mix(GREY, UNION, rev), reveal=rev, shadow=scale(AMBER, 0.25))
            else:
                cx = 0
                from core import FONT
                for ch in title:
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
            yz = y0 + 7
            if tall and wz + 4 <= S.W:
                rz = clamp((t - m.bar(4.5)) / (m.beat_len * 2))
                big_zh(cv, (S.W - wz) // 2, yz - int(dis * 4), zh, mix(AMBER, ROSE, 0.5), size=size, reveal=rz,
                       alpha=1 - dis, clear=dis <= 0)
                ys = yz + size // 2 + 1
            else:
                cv.center(yz, '爱 情 故 事', scale(UNION, (1 - dis) * clamp((t - m.bar(4.5)) / 0.5)))
                ys = yz + 2
            sub_a = clamp((t - t2 - 1.6) / 1.0) * (1 - dis)
            cv.center(ys, '两个进程之间的爱情故事', scale(TEXT, sub_a))
            cv.center(ys + 1, 'a love story between two processes', scale(GREY, sub_a * 0.9))
            cv.center(ys + 3, '音乐  Taylor Swift · Love Story      画面  全部由代码生成', scale(DIM, sub_a * 1.7))
        else:
            cv.center(int(S.H * 0.45), typed('爱 情 故 事', t, t2, 6), UNION)
    stars(S, amount=smooth(m.bar(6), m.bar(8), t), bright=0.7)
    a = smooth(m.bar(7.3), m.bar(7.9), t)
    if a > 0:
        light(S, S.W * 0.2, S.H * 0.72, AMBER, a)
        light(S, S.W * 0.79, S.H * 0.3, ROSE, a)


# ----------------------------------------------------------------------------- 1 · 初见 (bars 8–16)

def s_stars(S):
    t, m, cv = S.t, S.m, S.cv
    dip = smooth(m.bar(11.6), m.bar(12.2), t) * (1 - smooth(m.bar(15.2), m.bar(16), t))
    stars(S, amount=1.0, drift=0.8, bright=1.0 - 0.5 * dip)
    ax, ay = S.W * 0.2, S.H * 0.72
    bx, by = S.W * 0.79, S.H * 0.3
    dist = math.hypot((bx - ax), (by - ay) * 2)
    # each downbeat both send a ping ring; the rings grow, and in the quiet bars they reach each other
    reach = 0.55 + 0.6 * smooth(m.bar(12), m.bar(15.5), t)
    bb = m.bar_at(t)
    radii = []
    for who, (x, y, col) in enumerate(((ax, ay, AMBER), (bx, by, ROSE))):
        for k in range(3):
            ph = (bb - math.floor(bb)) + k
            if ph > 3:
                continue
            r = ph / 3 * S.W * reach * 0.5
            a = (1 - ph / 3) ** 1.3 * (0.75 + 0.35 * dip)
            S.br.circle(x * 2 + 1, y * 4 + 2, r * 2, scale(col, 0.9 * a), step=1.5 + ph * 0.6)
            if k == 0:
                radii.append(r)
    # the ripples touch: a spark at the meeting point
    if radii and radii[0] + radii[1] >= dist * 0.5 and t > m.bar(12):
        u = radii[0] / (radii[0] + radii[1])
        mx, my = ax + (bx - ax) * u, ay + (by - ay) * u
        ph = bb - math.floor(bb)
        sp = clamp(1 - ph * 1.5)
        cv.put(mx, my, '✧', scale(UNION, 0.4 + 0.6 * sp))
        cv.text(mx + 2, my, '相触', scale(UNION, 0.7 * sp))
    light(S, ax, ay, AMBER, 1.0)
    light(S, bx, by, ROSE, 1.0)
    la = smooth(m.bar(9), m.bar(10), t)
    cv.text(ax + 3, ay + 1, 'A  进程 1597  montague.net', scale(AMBER, 0.6 * la))
    cv.text(bx - 26, by - 1, 'B  进程 1597  capulet.net', scale(ROSE, 0.6 * la))
    q = smooth(m.bar(13.5), m.bar(14), t)
    if q > 0:
        cv.text(ax + 3, ay - 1, '? 未知信号  →', scale(TEXT, q * 0.85))
        cv.text(bx - 18, by + 1, '←  未知信号 ?', scale(TEXT, q * 0.85))
    # probe log: one line per downbeat
    if S.W >= 110:
        x0, y0 = S.W - 40, 3
        window(S, x0 - 1, y0 - 1, S.W - 2, y0 + 7, '探测日志 · A@montague', scale(AMBER, 0.55))

        def mk(i):
            if i < 5:
                return f'第 {i + 1:02d} 次探测  半径 {int(20 + i * 18):3d}  … 无回应'
            if i == 5:
                return f'第 {i + 1:02d} 次探测  … 涟漪相触'
            return '收到未知信号  来源：10.15.97.1xx'
        beat_log(S, x0 + 1, y0, m.bar(8), mk, maxn=7, every_beats=4, col=GREY,
                 hl={'无回应': scale(GREY, 0.8), '相触': UNION, '未知信号': ROSE})
    title_card(S, m.bar(8), '初见', 'FIRST SIGHT · 两个光点互相发现')
    chapter(S, m.bar(8), '01', '初见', 'FIRST SIGHT')


# ----------------------------------------------------------------------------- 2 · 假面舞会 (bars 16–24)

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
    tp = m.bar(18)
    u = (t - tp) / (m.bar_len * 1.0)
    if t >= tp:
        S.br.line(ax * 2 + 1, ay * 4 + 2, (ax + (bx - ax) * min(1, u)) * 2 + 1, (ay + (by - ay) * min(1, u)) * 4 + 2,
                  scale(mix(AMBER, ROSE, 0.5), 0.35 + 0.3 * slow), step=1.6)
        packet(S, ax, ay, bx, by, u, AMBER)
        if u > 1:
            packet(S, bx, by, ax, ay, (t - m.bar(19)) / m.bar_len, ROSE)
    light(S, ax, ay, AMBER, 0.8 + 0.4 * slow)
    light(S, bx, by, ROSE, 0.8 + 0.4 * slow)
    cv.text(ax + 2, ay + 1, 'A', scale(AMBER, 0.8))
    cv.text(bx + 2, by - 1, 'B', scale(ROSE, 0.8))
    # the masks: every pair is a pair of strangers
    if S.W >= 110:
        n_pairs = len(CROWD)
        cv.text(3, 3, f'节点 {n_pairs} 对 · 全部戴面具 · 旋转中', scale(GREY, 0.8))
        cv.text(3, 4, f'舞曲时钟 ×{(0.04 if slow > 0.5 else 1.0):.2f}', scale(GREY, 0.8))
    pw = 54
    if S.W > 90:
        x0, y0 = S.W - pw - 3, S.H - 9
        window(S, x0, y0, x0 + pw, y0 + 7, 'A@montague', scale(AMBER, 0.6))
        lines = ['$ ping B', '来自 B 的 64 字节：序号=1  往返 0.001 毫秒', '心率  72 bpm → 119 bpm',
                 '其他一切：暂停', '$ whois B  →  capulet.net（禁止通信）']
        log_lines(S, x0 + 2, y0 + 1, lines, tp, m.bar_len * 1.0, col=TEXT,
                  hl={'119': AMBER, '暂停': GREY, '来自 B': ROSE, '禁止': RED})
    if slow > 0:
        cv.text(S.W * 0.5 - 6, 2, '时间 ×0.04', scale(UNION, slow * 0.8))
    title_card(S, m.bar(16), '靠近', 'CLOSER · 假面舞会')
    chapter(S, m.bar(16), '02', '靠近', 'CLOSER')


# ----------------------------------------------------------------------------- 3 · 靠近 (bars 24–30, pre-chorus)

def s_approach(S):
    t, m, cv = S.t, S.m, S.cv
    build = smooth(m.bar(24), m.bar(30), t)
    stars(S, amount=0.35 + 0.55 * build, drift=0.3 + build, bright=0.5 + 0.4 * build)
    part = smooth(m.bar(24), m.bar(26), t)
    crowd(S, part=part, ph=crowd_phase(S, t), fade=1 - 0.5 * part)
    b0 = m.beat_at(m.bar(24))
    b = m.beat_at(t) - b0
    steps = 22
    k = min(steps, math.floor(b) + ease_out((b - math.floor(b)) * 3))
    prog = k / steps
    yy = S.H * 0.5
    ax = S.W * 0.16 + (S.cx - 3 - S.W * 0.16) * prog
    bx = S.W * 0.84 - (S.W * 0.84 - S.cx - 3) * prog
    S.br.line(ax * 2 + 3, yy * 4 + 2, bx * 2 - 1, yy * 4 + 2, scale(mix(AMBER, ROSE, 0.5), 0.25 + 0.3 * build), step=3)
    light(S, ax, yy, AMBER, 0.9 + 0.3 * prog)
    light(S, bx, yy, ROSE, 0.9 + 0.3 * prog)
    burst(S, ax, yy, AMBER, rmax=10, amp=0.5 * build)
    burst(S, bx, yy, ROSE, rmax=10, amp=0.5 * build)
    d = int(round((bx - ax) * 1.0))
    cv.center(int(yy) + 3, f'距离  {d:>3} 格', scale(TEXT, 0.8))
    hr = int(72 + 47 * build)
    cv.center(int(yy) + 4, f'心率  {hr:>3} bpm', scale(mix(AMBER, ROSE, 0.5), 0.8))
    ecg(S, S.H - 3, mix(AMBER, ROSE, 0.5), amp=1.2 + 1.2 * build)
    if S.W >= 110:
        meter(S, 3, 3, '预副歌 · 能量', build, w=16)
        x0 = S.W - 36
        window(S, x0 - 1, 2, S.W - 2, 10, '每一拍', scale(mix(AMBER, ROSE, 0.5), 0.5))
        beat_log(S, x0 + 1, 3, m.bar(24), lambda i: f'拍 {i + 1:02d}  靠近 1 格   距离 {max(0, 56 - i * 2.5):5.1f}',
                 maxn=7, col=GREY, limit=24)
    chapter(S, m.bar(24), '02', '靠近', 'CLOSER')


# ----------------------------------------------------------------------------- 4 · 第一支舞 (bars 30–40, chorus 1)

def waltz_pos(S, t, t0, R0, kf):
    ph = (t - t0)
    trav = ph * 0.35
    ccx = S.cx + math.cos(trav) * S.W * 0.06
    ccy = S.cy + math.sin(trav) * S.H * 0.05
    th = ph * math.tau / (S.m.bar_len * 1.0)
    r = R0 * (1 + 0.32 * math.sin(th * kf) + 0.1 * math.sin(ph * 0.9))
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
    stars(S, amount=0.5 + 0.5 * big, drift=0.4, rise=0.6 + 0.6 * big, bright=0.6 + 0.4 * big)
    fade = 1 - smooth(t0, m.bar(31), t)
    if fade > 0:
        for i, (a0, rr, sp, rad) in enumerate(CROWD):
            x = S.cx + math.cos(a0) * rr * S.W * 0.42
            y = S.cy + math.sin(a0) * rr * S.H * 0.36 - (1 - fade) * 8 * (0.5 + rad)
            cv.put(x, y, '·', scale(GREY, fade))
    R0 = (S.H * 0.18) * (0.3 + 0.7 * grow) * (1 + 0.45 * big)
    en = 0.6 + 0.4 * S.m.env('rms', t)
    # the figure changes every two bars: a cut on the downbeat
    bar = int(math.floor(m.bar_at(t)))
    kf = (2.5, 3.5, 1.5, 4.5, 2.5)[((bar - 30) // 2) % 5]
    for k in range(1, 140):
        tt = t - k * 0.035
        if tt < t0:
            break
        ax, ay, bx, by = waltz_pos(S, tt, t0, R0, kf)
        f = (1 - k / 140) ** 1.4 * en
        S.br.dot(ax * 2 + 1, ay * 4 + 2, scale(AMBER, f))
        S.br.dot(bx * 2 + 1, by * 4 + 2, scale(ROSE, f))
    ax, ay, bx, by = waltz_pos(S, t, t0, R0, kf)
    S.br.line(ax * 2 + 1, ay * 4 + 2, bx * 2 + 1, by * 4 + 2, scale(UNION, 0.18), step=2.5)
    b = m.beat_at(t)
    u = b - math.floor(b)
    if int(b) % 2:
        packet(S, ax, ay, bx, by, u, AMBER, trail=4)
    else:
        packet(S, bx, by, ax, ay, u, ROSE, trail=4)
    light(S, ax, ay, AMBER, 1.0)
    light(S, bx, by, ROSE, 1.0)
    mx, my = (ax + bx) / 2, (ay + by) / 2
    burst(S, mx, my, UNION, rmax=18 + 10 * big, amp=0.55)
    bb = m.bar_at(t)
    ph = bb - math.floor(bb)
    if ph < 0.75:
        cv.text(mx - 1, my - ph * 4, '<3', scale(UNION, (1 - ph / 0.75) * 0.9))
    # packet ledger on the right: one line per beat
    if S.W >= 120:
        x0 = S.W - 40
        window(S, x0 - 1, 2, S.W - 2, 12, '数据包 · 每一拍', scale(UNION, 0.45))

        def mk(i):
            who = 'A → B' if i % 2 else 'B → A'
            return f'拍 {i + 1:02d}  {who}  {32 + int(hash01(i) * 96):3d} 字节  确认'
        beat_log(S, x0 + 1, 3, t0, mk, maxn=9, col=GREY, hl={'A → B': AMBER, 'B → A': ROSE}, cps=120)
        cv.text(3, 3, f'图形 #{((bar - 30) // 2) % 5 + 1}  玫瑰线 k={kf}', scale(GREY, 0.8))
        cv.text(3, 4, f'副歌一 · 小节 {bar - 29:02d}/10', scale(GREY, 0.8))
    title_card(S, t0, '第一支舞', 'FIRST DANCE · 副歌', hold=1.2)


# ----------------------------------------------------------------------------- 5 · 阻隔 (bars 40–42)

def s_firewall(S):
    t, m, cv = S.t, S.m, S.cv
    t0 = m.bar(40)
    lt = t - t0
    drop = ease_out(lt / 0.35)
    stars(S, amount=0.3, bright=0.3)
    wx = int(S.cx)
    hgt = int(S.H * drop)
    for y in range(1, hgt):
        for dx, g in ((-3, '░'), (-2, '▒'), (-1, '▓'), (0, '█'), (1, '▓'), (2, '▒'), (3, '░')):
            cv.put(wx + dx, y, g, scale(RED, 0.9 - abs(dx) * 0.17))
    push = ease_out(lt / 0.6)
    light(S, S.W * (0.38 - 0.14 * push), S.H * 0.5, AMBER, 0.75)
    light(S, S.W * (0.62 + 0.14 * push), S.H * 0.5, ROSE, 0.75)
    ban = clamp((lt - 0.15) / 0.2) * (1 - smooth(2.9, 3.8, lt))
    if ban > 0:
        size = 16 if S.W >= 120 else 12
        zh = '访问被拒绝' if S.W >= 120 else '拒绝'
        wz = big_zh_width(zh, size)
        y0 = int(S.H * 0.16)
        if wz + 4 < S.W and S.H >= 30:
            big_zh(cv, (S.W - wz) // 2, y0, zh, scale(RED, ban), size=size)
            yb = y0 + size // 2 + 1
        else:
            cv.center(y0 + 2, '[ 访 问 被 拒 绝 ]', scale(RED, ban))
            yb = y0 + 4
        cv.center(yb, 'ACCESS DENIED', scale(RED, ban * 0.8))
        cv.center(yb + 2, 'iptables: 丢弃  montague.net  →  capulet.net', scale(TEXT, ban * 0.85))
        cv.center(yb + 3, '规则来源：/etc/families.conf   （不可修改）', scale(GREY, ban))
    if lt < 0.6:
        glitch(S, 1.0 - lt / 0.6, 3)
    chapter(S, t0, '03', '阻隔', 'FIREWALL')


# ----------------------------------------------------------------------------- 6 · 秘密相爱 (bars 42–50)

def s_balcony(S):
    t, m, cv = S.t, S.m, S.cv
    t0 = m.bar(42)
    lt = t - t0
    W, H = S.W, S.H
    stars(S, amount=0.25, bright=0.35)
    tx0, ty0, tx1, ty1 = int(W * 0.52), 2, int(W * 0.93), int(H * 0.42)
    gx0, gy0, gx1, gy1 = int(W * 0.07), int(H * 0.58), int(W * 0.6), H - 1
    window(S, tx0, ty0, tx1, ty1, 'capulet:/阳台  [只读]', scale(ROSE, 0.7))
    window(S, gx0, gy0, gx1, gy1, 'montague:/花园', scale(AMBER, 0.7))
    mx, my = tx0 + (tx1 - tx0) * 0.75, ty0 + 3.5
    moon_disc(S, mx, my, 2.6)
    stars(S, amount=0.15, region=(tx0 + 1, ty0 + 1, tx1 - 1, ty1 - 4), bright=0.6)
    ry = ty1 - 3
    for x in range(tx0 + 2, tx1 - 1):
        cv.put(x, ry, '╤' if (x - tx0) % 3 == 0 else '═', scale(GREY, 0.8))
        cv.put(x, ry + 1, '│' if (x - tx0) % 3 == 0 else ' ', scale(DIM, 1))
    bx, by = tx0 + (tx1 - tx0) * 0.38, ry - 1
    light(S, bx, by, ROSE, 0.95)
    cv.text(bx + 2, by, 'B', scale(ROSE, 0.8))
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
    cv.text(ax + 2, ay, 'A', scale(AMBER, 0.8))
    vg = smooth(m.bar(44), m.bar(49.5), t)
    sx, sy = gx1 - 3, gy0
    ex, ey = tx0 + 3, ty1
    n = 120
    for k in range(int(n * vg)):
        u = k / n
        x = sx + (ex - sx) * u + math.sin(u * 14) * 2.2
        y = sy + (ey - sy) * u
        S.br.dot(x * 2 + 1, y * 4 + 2, mix(AMBER, ROSE, u))
        if k % 9 == 4:
            S.br.dot(x * 2 + 3, y * 4 + 1, scale(mix(AMBER, ROSE, u), 0.6))
    # encrypted letters float upward; the first four bounce, later ones decrypt into <3
    sent = 0
    for i in range(10):
        st = t0 + 0.6 + i * m.bar_len * 0.75
        u = (t - st) / (m.bar_len * 1.6)
        if t >= st:
            sent = i + 1
        if not (0 <= u <= 1.25):
            continue
        hexs = ' '.join(HEX[int(hash01(i * 13 + j) * 16)] + HEX[int(hash01(i * 7 + j * 3) * 16)] for j in range(4))
        x = gx0 + 6 + (i * 7) % max(1, (gx1 - gx0 - 18))
        y = gy - 4 - u * (gy - 4 - ty1 + 2)
        passed = i >= 4
        if not passed and y < gy0 - 1:
            y = gy0 - 1
            cv.text(x, y, f'第{i + 1}封 退回 EACCES', scale(RED, clamp(1.25 - u) * 2))
            continue
        if passed and y < ty1:
            cv.text(min(max(x, tx0 + 2), tx1 - 4), max(y, ty0 + 2), '<3', scale(ROSE, clamp(1.25 - u) * 4))
        else:
            cv.text(x, y, hexs, scale(AMBER, 0.75))
            cv.text(x, y + 1, f'第{i + 1}封', scale(AMBER, 0.45))
    for i in range(4):
        st = m.bar(46) + i * m.bar_len
        u = (t - st) / m.bar_len
        if 0 <= u <= 1:
            x = bx + 2
            y = by + 1 + u * (gy0 - by - 1)
            cv.text(x, y, '<3' if y > gy0 - 2 else '░▒▓', scale(ROSE, 0.9))
    if t > m.bar(47):
        cv.text(tx0 + 2, ty0 + 1, typed('gpg: 解密成功 · 密钥：[秘密]', t, m.bar(47), 30), scale(OK, 0.75))
    # the ledger between the panes
    if W >= 110:
        x0, y0 = 3, 3
        cv.text(x0, y0, f'已发 {sent:02d} 封 · 退回 {min(sent, 4):02d} 封 · 送达 {max(0, sent - 4):02d} 封', scale(TEXT, 0.8))
        cv.text(x0, y0 + 1, '白天：敌对家族 · 夜里：加密信道', scale(GREY, 0.8))
        cv.text(x0, y0 + 2, '算法 AES-256 · 密钥只有两个进程知道', scale(GREY, 0.8))
    title_card(S, t0, '秘密', 'ENCRYPTED · 加密信道', hold=1.2, y=int(H * 0.44))
    chapter(S, t0, '04', '秘密相爱', 'ENCRYPTED')


# ----------------------------------------------------------------------------- 7 · 权限迷宫 (bars 50–56, pre-chorus 2)

_MAZE = {}


def maze(cols, rows):
    key = (cols, rows)
    if key in _MAZE:
        return _MAZE[key]
    rr = random.Random(77)
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
    side = 38 if S.W > 116 else 0
    mw = S.W - side - 4
    cols, rows = max(6, (mw - 1) // 4), max(4, (S.H - 5) // 2)
    edges, dist, path = maze(cols, rows)
    ox, oy = 2, 3
    maxd = max(dist.values())
    build = smooth(t0, m.bar(56), t)
    search = ease_in_out(smooth(t0, m.bar(54), t))        # the search accelerates with the pre-chorus
    frontier = search * maxd
    found = smooth(m.bar(54), m.bar(54.6), t)
    flash = S.m.pulse(t, 6)
    for (x, y), d in dist.items():
        px, py = ox + x * 4 + 2, oy + y * 2 + 1
        if d < frontier - 1.5:
            cv.put(px, py, '·', scale(AMBER, 0.35))
        elif d < frontier:
            cv.put(px, py, '▓', scale(AMBER, 0.6 + 0.4 * flash))
    # walls: clean box drawing, corners only where walls meet
    wc = scale(GREY, 0.55)
    for y in range(rows):
        for x in range(cols):
            px, py = ox + x * 4, oy + y * 2
            if ((x, y), (x + 1, y)) not in edges:
                cv.put(px + 4, py + 1, '│', wc)
            if ((x, y), (x, y + 1)) not in edges:
                cv.text(px + 1, py + 2, '───', wc)
    for y in range(rows + 1):
        for x in range(cols + 1):
            px, py = ox + x * 4, oy + y * 2
            up = cv.get(px, py - 1) == '│'
            dn = cv.get(px, py + 1) == '│'
            lf = cv.get(px - 1, py) == '─'
            rt = cv.get(px + 1, py) == '─'
            n = up + dn + lf + rt
            if n == 0:
                continue
            if n == 1:
                g = '╵' if up else '╷' if dn else '╴' if lf else '╶'
            elif up and dn and not lf and not rt:
                g = '│'
            elif lf and rt and not up and not dn:
                g = '─'
            else:
                g = {(1, 0, 1, 0): '┘', (1, 0, 0, 1): '└', (0, 1, 1, 0): '┐', (0, 1, 0, 1): '┌', (1, 1, 1, 0): '┤',
                     (1, 1, 0, 1): '├', (1, 0, 1, 1): '┴', (0, 1, 1, 1): '┬', (1, 1, 1, 1): '┼'}[(up, dn, lf, rt)]
            cv.put(px, py, g, wc)
    cv.hline(ox, ox + cols * 4, oy, '─', wc)
    cv.vline(ox, oy, oy + rows * 2, '│', wc)
    cv.put(ox, oy, '┌', wc)
    cv.put(ox + cols * 4, oy, '┐' if cv.get(ox + cols * 4, oy + 1) == '│' else '─', wc)
    cv.put(ox, oy + rows * 2, '└', wc)
    for i in range(7):
        lx, ly = int(hash01(i * 3 + 1) * (cols - 2)) + 1, int(hash01(i * 5 + 2) * rows)
        if (lx, ly) not in path and dist.get((lx, ly), 0) < frontier:
            cv.text(ox + lx * 4 + 1, oy + ly * 2 + 1, '[x]', scale(RED, 0.8))
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
    visited = sum(1 for d in dist.values() if d < frontier)
    cv.text(ox, 2, f'权限迷宫 · 已搜索 {visited:3d}/{len(dist)} 格 · 禁止 {min(7, int(frontier / maxd * 9)):d} 处', scale(TEXT, 0.8))
    if side:
        x0 = S.W - side - 1
        window(S, x0, 2, S.W - 2, S.H - 1, 'A@montague: ~', scale(AMBER, 0.6))
        errs = ['$ cd /capulet', 'cd: 权限不够 (Permission denied)', '$ sudo -u capulet ls',
                'A 不在 sudoers 文件中。', '  此事将被报告。', '$ chmod 777 /capulet/heart', 'chmod: 不允许的操作',
                '$ ssh B@capulet', 'ssh: 连接被拒绝', '$ find / -name "*route*"', '/garden/.secret/route',
                '$ ./route --quiet', '找到路线（隐藏 · 加密）', '$ ./route --go', '出发。']
        log_lines(S, x0 + 2, 3, errs, t0 + 0.2, m.beat_len * 1.6, col=TEXT, maxn=S.H - 5, cps=70,
                  hl={'权限不够': RED, '拒绝': RED, '不允许': RED, '报告': RED, 'sudoers': RED,
                      '找到': OK, '.secret': AMBER, '出发': UNION})
        meter(S, x0 + 2, S.H - 2, '预副歌', build, w=side - 14, col=mix(AMBER, ROSE, 0.5))


# ----------------------------------------------------------------------------- 8 · 逃离 (bars 56–74)

def skyline(S, x, layer, col, speed):
    H = S.H
    base = H - 2
    lit_k = 1 + 0.6 * S.k
    for sx in range(S.W):
        wx = sx + int(S.t * speed)
        h = hash01((wx // (3 + layer * 2)) * 97 + layer * 1000)
        hh = int((2 + h * (5 + layer * 4)) * (0.6 + 0.4 * layer))
        top = base - hh - layer * 2
        for y in range(top, base - (0 if layer == 0 else layer)):
            if S.cv.get(sx, y) == ' ':
                ch = '█' if layer == 0 else '▓' if layer == 1 else '░'
                lit = hash01(wx * 13 + y * 31) < 0.07 and layer < 2
                S.cv.put(sx, y, '▪' if lit else ch, scale((230, 170, 90), min(1.0, 0.7 * lit_k)) if lit else col)


def helix(S, t, sep=0.0, amp=2.0, x_head=None, hop=0.0):
    x_head = S.W * 0.62 if x_head is None else x_head
    yc = S.H * 0.42 - hop
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
    bb = m.bar_at(t)
    ph = bb - math.floor(bb)
    hop = math.sin(math.pi * clamp(ph / 0.5)) * 3.0 if int(math.floor(bb)) % 2 == 0 else 0.0
    helix(S, t, amp=1.6 + 0.6 * S.m.env('rms', t) + 0.5 * S.k, hop=hop)
    gates = int((t - t0) / (m.bar_len * 2)) + 1
    for k in range(3):
        gx = S.W - ((t - t0) * 22 + k * 41) % (S.W + 30)
        cv.text(gx, S.H * 0.42 + 4, '[拒绝]', scale(RED, 0.7))
        cv.vline(int(gx) + 3, int(S.H * 0.42) + 5, S.H - 3, '┊', scale(RED, 0.3))
    skyline(S, 0, 0, (16, 18, 28), 30)
    skyline(S, 0, 1, (26, 30, 44), 16)
    skyline(S, 0, 2, (34, 38, 56), 8)
    cv.hline(0, S.W - 1, S.H - 2, '═', scale(GREY, 0.5))
    for x in range(S.W):
        if (x + int(t * 40)) % 6 == 0:
            cv.put(x, S.H - 1, '─', scale(DIM, 1))
    cv.text(2, S.H - 1, '隧道：加密 · 路线：隐藏 · 速度：119 bpm', scale(OK, 0.6))
    if S.W >= 110:
        x0 = S.W - 34
        window(S, x0 - 1, 2, S.W - 2, 9, '闸门', scale(RED, 0.45))
        beat_log(S, x0 + 1, 3, t0, lambda i: f'闸门 #{i + 1:02d}  [拒绝]  →  已跳过', maxn=6, every_beats=8,
                 col=GREY, hl={'已跳过': OK})
        cv.text(3, 3, f'副歌二 · 已过 {gates:02d} 道闸门 · 丢包 0%', scale(TEXT, 0.8))
    title_card(S, t0, '逃离', 'ESCAPE · 两条数据流', hold=1.2)
    chapter(S, t0, '05', '逃离', 'ESCAPE')


def s_trace(S):
    t, m, cv = S.t, S.m, S.cv
    t0 = m.bar(66)
    u = smooth(t0, m.bar(74), t)
    stars(S, amount=0.6, drift=2.5, bright=0.6)
    sep = smooth(m.bar(70), m.bar(74), t) * S.H * 0.18
    helix(S, t, amp=1.6 + 1.4 * u + 0.4 * S.k, sep=sep)
    skyline(S, 0, 0, (20, 14, 18), 30)
    skyline(S, 0, 1, (32, 22, 28), 16)
    cv.hline(0, S.W - 1, S.H - 2, '═', scale(RED, 0.3))
    bb = m.bar_at(t)
    sx = (bb - math.floor(bb)) * (S.W + 20) - 10
    for y in range(1, S.H):
        for dx in range(-2, 3):
            if cv.get(int(sx) + dx, y) == ' ':
                cv.put(sx + dx, y, '░' if abs(dx) > 1 else '▒', scale(RED, 0.45 - abs(dx) * 0.12))
    yc = int(S.H * 0.42)
    reach = u * S.W * 0.45
    cv.line(0, 2, reach, yc - 1, '·', scale(RED, 0.6), dotted=2)
    cv.line(S.W - 1, S.H - 4, S.W - 1 - reach, yc + 1, '·', scale(RED, 0.6), dotted=2)
    w = 26
    x0 = S.W - w - 4
    cv.text(x0, 2, 'IDS 入侵检测 · 未授权链路', scale(RED, 0.9))
    n = int(w * u)
    cv.text(x0, 3, '[' + '█' * n + '·' * (w - n) + f'] {int(u * 100):3d}%', scale(RED, 0.8))
    if S.W >= 110:
        sweeps = int(bb - 66) + 1
        beat_log(S, x0, 5, t0, lambda i: f'扫描 #{i + 1:02d}  可疑流量 {min(99, 12 + i * 11):2d}%  定位中', maxn=5,
                 every_beats=4, col=scale(RED, 0.7))
        cv.text(3, 3, f'已被扫描 {sweeps:02d} 次 · 链路完整度 {int(100 - 100 * smooth(m.bar(70), m.bar(74), t)):3d}%',
                scale(TEXT, 0.8))
    glitch(S, smooth(m.bar(72), m.bar(74), t) * 0.8, 9)
    title_card(S, m.bar(70), '信号', 'TRACE · 链路被撕开', hold=1.0, col=RED)


# ----------------------------------------------------------------------------- 9 · 暴雨 (bars 74–82)

def s_storm(S):
    t, m, cv = S.t, S.m, S.cv
    t0 = m.bar(74)
    W, H = S.W, S.H
    dens = 0.55 + 0.45 * S.m.env('rms', t)
    for i, (u, v, sp, g) in enumerate(RAIN[:int(len(RAIN) * dens)]):
        y = 1 + (v * H + t * sp * 14) % (H - 1)
        x = u * W
        cv.put(x, y, g, scale((90, 104, 140), 0.35 + 0.4 * sp))
    crack = []
    for y in range(1, H):
        x = W / 2 + (hash01(y * 7 + 3) - 0.5) * 3 + math.sin(y * 0.7) * 1.5
        crack.append(x)
        cv.put(x, y, '╱' if hash01(y) < 0.5 else '╲', scale(RED, 0.5))
        cv.put(x + 1, y, ' ', None)
    flash = 0.0
    for n in (75, 77, 79, 80.5):
        dt = t - m.bar(n)
        if 0 <= dt < 0.5:
            flash = max(flash, math.exp(-dt * 9))
            for y in range(1, H):
                cv.put(crack[y - 1] + (hash01(y * 3 + n) - 0.5) * 2, y, '┃', scale(UNION, 0.6 + 0.4 * flash))
    ax, ay = W * 0.22, H * 0.55
    bx, by = W * 0.78, H * 0.45
    light(S, ax, ay, AMBER, 0.8)
    light(S, bx, by, ROSE, 0.8)
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
    tries = int(b - m.beat_at(t0)) + 1
    cv.text(3, H - 5, 'montague:/外面', scale(AMBER, 0.7))
    log_lines(S, 3, H - 4, ['send()：连接被对端重置', f'丢包 87% · 重试中', f'重试 {tries:02d} 次 · 全部失败'], t0 + 1,
              m.bar_len * 2, col=scale(RED, 0.75), maxn=3)
    cv.text(W - 24, 2, 'capulet:/被锁', scale(ROSE, 0.7))
    log_lines(S, W - 34, 3, ['recv()：无法到达主机', '等待 A …', f'重试 {tries:02d} 次 · 全部失败'], t0 + 2,
              m.bar_len * 2, col=scale(RED, 0.75), maxn=3)
    if flash > 0:
        for i in range(len(cv.fg)):
            if cv.fg[i] is not None:
                cv.fg[i] = mix(cv.fg[i], (255, 255, 255), flash * 0.7)
        for y in range(1, H, 1):
            for x in range(0, W, 3):
                if cv.get(x, y) == ' ' and hash01(x * 7 + y * 13 + int(t * 24)) < 0.25 * flash:
                    cv.put(x, y, '░', scale((200, 210, 240), flash * 0.5))
    title_card(S, t0, '断开', 'STORM · 连接被重置', hold=1.0, col=RED)


# ----------------------------------------------------------------------------- 10 · 等待 (bars 82–89)

def s_waiting(S):
    t, m, cv = S.t, S.m, S.cv
    t0 = m.bar(82)
    W, H = S.W, S.H
    stars(S, amount=0.06, bright=0.25)
    w, h = min(60, W - 6), 11
    x0, y0 = int((W - w) / 2), int((H - h) / 2)
    window(S, x0, y0, x0 + w, y0 + h, 'B@capulet: ~', scale(ROSE, 0.55))
    cv.text(x0 + 2, y0 + 1, 'B@capulet:~$ ', scale(ROSE, 0.75))
    cv.text(x0 + 15, y0 + 1, typed('wait --for A --timeout never', t, t0 + 0.4, 18), TEXT)
    spin = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'[int(t * 6) % 10]
    beats = max(0.0, m.beat_at(t) - m.beat_at(t0))
    days = int(1 + beats * 13)
    cv.text(x0 + 2, y0 + 3, f'{spin} 等待 A …   第 {days:03d} 天   （每一拍过去 13 天）', scale(TEXT, 0.8))
    # a calendar fills one cell per beat
    cal_w = min(28, w - 6)
    for i in range(cal_w * 2):
        on = i < beats * 2
        cv.put(x0 + 2 + i % cal_w, y0 + 5 + i // cal_w, '▪' if on else '·', scale(ROSE if on else DIM, 0.7 if on else 1))
    lines = [f'ping A：请求超时（序号 {i + 1}）' for i in range(7)]
    log_lines(S, x0 + 2, y0 + 8, lines, t0 + m.bar_len * 0.5, m.bar_len, col=scale(GREY, 0.8), maxn=3, cps=50)
    light(S, x0 + w - 4, y0 + h - 1.5, ROSE, 0.45 + 0.15 * S.m.pulse(t, 3))
    for i in range(14):
        u = hash01(i * 11)
        y = 1 + ((t - t0) * (0.8 + hash01(i) * 0.8) + hash01(i * 5) * H) % (H - 1)
        x = u * W + math.sin(t * 0.7 + i) * 2
        if not (x0 - 1 <= x <= x0 + w + 1 and y0 - 1 <= y <= y0 + h + 1):
            cv.put(x, y, '❧' if i % 4 == 0 else ',', scale(GREY, 0.35))
    title_card(S, t0, '等待', 'WAITING · 不设超时', hold=1.4, y=4)
    chapter(S, t0, '06', '等待', 'WAITING')


# ----------------------------------------------------------------------------- 11 · 失落 (bars 89–94)

def s_timeout(S):
    t, m, cv = S.t, S.m, S.cv
    t0 = m.bar(89)
    W, H = S.W, S.H
    shrink = smooth(t0, m.bar(91.5), t)
    w = int(min(60, W - 6) * (1 - shrink) + 2 * shrink)
    h = int(11 * (1 - shrink) + 2 * shrink)
    x0, y0 = int((W - w) / 2), int((H - h) / 2)
    fade = 1 - smooth(m.bar(90.5), m.bar(91.6), t)
    if fade > 0.02 and w > 4:
        window(S, x0, y0, x0 + w, y0 + h, 'B@capulet: ~' if w > 20 else '', scale(ROSE, 0.5 * fade))
        if w > 30:
            cv.text(x0 + 2, y0 + 2, '连接超时。', scale(RED, 0.75 * fade))
            cv.text(x0 + 2, y0 + 4, typed('信号消失了吗？', t, t0 + 1.5, 6), scale(GREY, fade))
    dim = 1 - 0.75 * smooth(m.bar(90), m.bar(92.5), t)
    period = 1 + smooth(m.bar(90), m.bar(92), t) * 1.5
    if cursor_on(S, period):
        cv.text(W / 2 - 2, H / 2, 'B$', scale(ROSE, 0.6 * dim))
        cv.put(W / 2 + 1, H / 2, '▌', scale(ROSE, dim))
    elif shrink > 0.9:
        cv.text(W / 2 - 2, H / 2, 'B$', scale(ROSE, 0.35 * dim))
    tsig = m.bar(93)
    if t >= tsig:
        u = ease_in_out((t - tsig) / (m.bar(94) - tsig))
        sx = W - 2 - (W - 2 - (W / 2 + 3)) * u
        for k in range(1, 40):
            xx = sx + k * 1.2
            if xx < W:
                S.br.dot(xx * 2, H / 2 * 4 + 2, scale(AMBER, (1 - k / 40) * 0.8))
        light(S, sx, H / 2, AMBER, 0.6 + 0.4 * u)
        cv.text(sx - 2, H / 2 + 2, '正在接入', scale(AMBER, 0.6 * (1 - u)))
        cv.text(sx - 5, H / 2 - 2, '信号：A', scale(AMBER, 0.7 * (1 - u)))
        # the lift into the modulation: a ladder of tones rises on the right
        for i in range(8):
            a = clamp((u * 9 - i) / 1.0)
            if a > 0:
                yy = H * 0.8 - i * (H * 0.6 / 8)
                cv.text(W - 14, yy, '─' * (4 + i), scale(mix(AMBER, UNION, i / 8), 0.5 * a))
        cv.text(W - 14, H * 0.8 + 1, '升调准备 ↑', scale(UNION, 0.7 * u))
    title_card(S, t0, '失落', 'TIMEOUT · 窗口缩小', hold=1.2, y=4)
    chapter(S, t0, '07', '失落', 'TIMEOUT')


# ----------------------------------------------------------------------------- 12 · 重逢 / 承诺 (bars 94–102, key change)

def panes(S, n_levels):
    W, H = S.W, S.H
    rects = [(0, 1, W - 1, H - 1)]
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
    levels = panes(S, 4)
    opened = clamp(lt / (m.beat_len * 0.5 * 4))
    for lv, rects in enumerate(levels):
        a = clamp((lt - lv * m.beat_len * 0.5) / 0.25)
        if a <= 0:
            continue
        fade = 1 - 0.75 * smooth(m.bar(97), m.bar(101.5), t)
        for (x0, y0, x1, y1) in rects:
            S.cv.box(x0, y0, x1, y1, scale(mix(AMBER, ROSE, hash01(x0 * 3 + y0)), 0.18 * a * fade), style='light', clear=False)
    stars(S, amount=0.3 + 0.6 * opened, bright=0.9, rise=1.4)
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
    burst(S, (ax + bx) / 2, y, UNION, rmax=26, amp=0.6)
    if lt < 0.4:
        for i in range(len(cv.fg)):
            if cv.fg[i] is not None:
                cv.fg[i] = mix(cv.fg[i], UNION, 1 - lt / 0.4)
    # the modulation, named
    ka = clamp(lt / 0.3) * (1 - smooth(m.bar(96.5), m.bar(97), t))
    if ka > 0:
        cv.center(2, '♪ 转调  D 大调 → E 大调  · 升一个全音 ↑', scale(UNION, ka))
    if H >= 36:                                   # handshake steps sit between the title card and the lights
        sx, sy = W / 2 - 16, max(13, int(y - 6))
    else:                                         # cramped terminal: to the left of the lights instead
        sx, sy = 2, int(y) - 1
    steps = [(94, 'A → B', 'SYN', '请求同步', AMBER), (95, 'B → A', 'SYN-ACK', '收到，确认', ROSE),
             (96, 'A → B', 'ACK', '确认', AMBER)]
    for k, (n, d, msg, zh, col) in enumerate(steps):
        ts = m.bar(n)
        if t < ts:
            continue
        u = (t - ts) / (m.beat_len * 2)
        if k == 1:
            packet(S, bx, y, ax, y, u, col)
        else:
            packet(S, ax, y, bx, y, u, col)
        cv.text(sx, sy + k, f'{d}   {msg:<8} {zh}', scale(col, 0.9))
        cv.text(sx + 26, sy + k, typed('✓' if u > 1 else '…', t, ts, 4), OK if u > 1 else GREY)
    if t >= m.bar(97):
        a = smooth(m.bar(97), m.bar(97.3), t) * (1 - smooth(m.bar(99.4), m.bar(100.2), t))
        size = 16 if W >= 120 else 12
        zh = '已连接'
        wz = big_zh_width(zh, size)
        if wz + 4 < W and a > 0.02 and H >= 36:
            big_zh(cv, (W - wz) // 2, int(y + 4), zh, scale(mix(OK, UNION, smooth(m.bar(97.3), m.bar(99), t)), a),
                   size=size, reveal=smooth(m.bar(97), m.bar(97.4), t))
            cv.center(int(y + 4) + size // 2 + 1, 'CONNECTED', scale(OK, a * 0.8))
            rule_y = int(y + 4) + size // 2 + 3
        else:
            cv.center(int(y + 4), '已 连 接 · CONNECTED', scale(OK, a))
            rule_y = int(y + 6)
        if rule_y < H - 1:
            s = '策略  montague.net ⇄ capulet.net ：  禁止'
            x0 = (W - text_width(s) - 9) // 2
            cv.text(x0, rule_y, s, scale(TEXT, a * 0.85))
            if t > m.bar(98):
                xd = x0 + text_width(s) - 4
                cv.text(xd - 2, rule_y, '~~禁止~~', scale(RED, 0.6))
                cv.text(xd + 8, rule_y, typed('允许', t, m.bar(98) + 0.3, 6), OK)
    if t >= m.bar(98):
        u = smooth(m.bar(98), m.bar(101.6), t)
        S.br.circle(W, y * 4 + 2, 25, scale(UNION, 0.7), step=0.8, a0=-math.pi / 2, a1=-math.pi / 2 + math.tau * u)
        S.br.circle(W, y * 4 + 2, 22, scale(mix(AMBER, ROSE, 0.5), 0.4), step=1.1, a0=-math.pi / 2, a1=-math.pi / 2 + math.tau * u)
        cv.text(sx + 4 if H >= 36 else sx, sy - 1 if H >= 36 else sy + 4, typed('SO_KEEPALIVE = ∞   永不断开', t, m.bar(99), 10), scale(UNION, 0.85))
    if W >= 120:
        x0 = 3
        cv.text(x0, 3, f'转调副歌 · 小节 {int(m.bar_at(t)) - 93:02d}/8', scale(GREY, 0.8))
        lines = ['握手：三步', '  1. A → B  SYN', '  2. B → A  SYN-ACK', '  3. A → B  ACK', '状态：已建立',
                 '策略：已改写', '保活：∞']
        log_lines(S, x0, 5, lines, m.bar(94), m.beat_len * 2, col=GREY, cps=40,
                  hl={'已建立': OK, '已改写': OK, '∞': UNION})
    if t < m.bar(98):
        title_card(S, t0, '重逢', 'SIGNAL · 转调', hold=1.0, y=4)
        chapter(S, t0, '08', '重逢', 'SIGNAL')
    else:
        title_card(S, m.bar(98), '承诺', 'HANDSHAKE · 规则改写', hold=1.0, y=4)
        chapter(S, m.bar(98), '09', '承诺', 'HANDSHAKE')


# ----------------------------------------------------------------------------- 13 · 圆满 (bars 102–114)

def s_finale(S):
    t, m, cv = S.t, S.m, S.cv
    t0 = m.bar(102)
    W, H = S.W, S.H
    lt = t - t0
    cx, cy = W / 2, H / 2
    gather = smooth(m.bar(111), m.bar(113.5), t)
    stars(S, amount=1.0, rise=1.6, bright=1.0)
    rot = lt * 0.35
    Rr = min(W * 0.5, H * 0.95) * 0.48 * (1 - 0.7 * gather)
    e = 0.7 + 0.3 * S.m.env('rms', t)
    bar = int(math.floor(m.bar_at(t)))
    petals = (4, 5, 3, 6, 4, 8)[((bar - 102) // 2) % 6]           # the figure changes every two bars
    n = 900
    for i in range(n):
        th = i / n * math.tau
        r = Rr * math.cos(petals * th + rot * 0.5)
        x = cx * 2 + math.cos(th + rot) * r * 2 * 2
        y = cy * 4 + math.sin(th + rot) * r * 4 * 0.98
        S.br.dot(x, y, scale(mix(AMBER, ROSE, (math.sin(th * 2 + lt) + 1) / 2), 0.55 * e))
    lit = smooth(t0, m.bar(108), t)
    routed = 0
    for side, nodes, col in ((-1, NODES_L, AMBER), (1, NODES_R, ROSE)):
        for i, (u, v) in enumerate(nodes):
            ang = (v - 0.5) * 2.4 + (math.pi if side < 0 else 0)
            rr = (0.55 + 0.4 * u) * (1 - 0.6 * gather)
            x = cx + math.cos(ang) * rr * W * 0.47
            y = cy + math.sin(ang) * rr * H * 0.47
            on = hash01(i * 7 + (side + 2)) < lit
            if on:
                routed += 1
                S.br.line(x * 2 + 1, y * 4 + 2, cx * 2 + 1, cy * 4 + 2, scale(col, 0.3), step=2.4)
                cv.put(x, y, '◉', col)
            else:
                cv.put(x, y, 'o', scale(GREY, 0.6))
    th = lt * math.tau / m.bar_len
    rr = 2.0 * (1 - gather) + 0.4
    light(S, cx + math.cos(th) * rr * 2, cy + math.sin(th) * rr, AMBER, 1.2)
    light(S, cx - math.cos(th) * rr * 2, cy - math.sin(th) * rr, ROSE, 1.2)
    p = S.m.pulse(t, 4, 4.0)
    S.br.circle(cx * 2 + 1, cy * 4 + 2, 10 + 30 * (1 - p), scale(UNION, 0.4 * p), step=1.2)
    burst(S, cx, cy, UNION, rmax=30, amp=0.5)
    cv.text(cx - 1, cy - 3, '<3', scale(UNION, 0.6 + 0.4 * S.m.pulse(t, 3)))
    for i in range(60):
        u = hash01(i * 3 + 1)
        y = H - ((lt * (2 + hash01(i) * 4) + hash01(i * 9) * H) % (H - 1))
        cv.put(u * W, y, '·' if i % 3 else '˙', scale(mix(AMBER, ROSE, hash01(i * 5)), 0.6))
    if W >= 120:
        cv.text(3, 3, f'终章副歌 · 小节 {bar - 101:02d}/12 · 玫瑰线 {petals} 瓣', scale(GREY, 0.8))
        cv.text(3, 4, f'已接入节点 {routed:02d}/60 · 两个家族 · 一个心跳', scale(GREY, 0.8))
        x0 = W - 44
        window(S, x0 - 1, 2, W - 2, 10, '路由表 · 每一拍', scale(UNION, 0.4))

        def mk(i):
            l, r = NODES_L[i % 30], NODES_R[(i * 7) % 30]
            return f'10.15.97.{int(l[0] * 126):03d} → A⇄B → 10.15.97.{128 + int(r[0] * 126):03d}  ok'
        beat_log(S, x0 + 1, 3, t0, mk, maxn=7, col=GREY, hl={'ok': OK}, cps=140)
    hit = S.m.m['finalHit']
    if t >= hit - 0.05:
        f = math.exp(-(t - hit) * 2.5)
        for i in range(len(cv.fg)):
            if cv.fg[i] is not None:
                cv.fg[i] = mix(cv.fg[i], UNION, f)
    title_card(S, t0, '圆满', 'CONNECTED · 两个家族一个节点', hold=1.4, y=4)
    chapter(S, t0, '10', '圆满', 'CONNECTED')


# ----------------------------------------------------------------------------- 14 · 退出 (bar 114 → end)

CREDITS = [
    ('爱情故事 · 终端版', UNION),
    ('LOVE STORY · terminal edition', TEXT),
    ('音乐   Taylor Swift — Love Story', GREY),
    ('画面   全部由代码生成 · 无歌词', GREY),
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
    cv.center(y + 2, typed('进程退出，状态码 0', t, t0 + 0.6, 8), scale(GREY, 0.85 * a))
    cv.center(y + 3, typed('process exited with status 0', t, t0 + 0.6, 20), scale(DIM, 1.6 * a))
    for i, (s, c) in enumerate(CREDITS):
        ts = t0 + 2.6 + i * 1.1
        ca = clamp((t - ts) / 0.8) * a
        cv.center(y + 6 + i, s, scale(c, ca))


# ----------------------------------------------------------------------------- edit

def build_edit(m):
    B = m.bar
    return [
        (0.0, B(8), s_boot), (B(8), B(16), s_stars), (B(16), B(24), s_ball), (B(24), B(30), s_approach),
        (B(30), B(40), s_waltz), (B(40), B(42), s_firewall), (B(42), B(50), s_balcony), (B(50), B(56), s_maze),
        (B(56), B(66), s_escape), (B(66), B(74), s_trace), (B(74), B(82), s_storm), (B(82), B(89), s_waiting),
        (B(89), B(94), s_timeout), (B(94), B(102), s_handshake), (B(102), B(114), s_finale), (B(114), B(114) + 14.0, s_outro),
    ]


CHAPTERS = [(8, '01 初见'), (16, '02 靠近'), (40, '03 阻隔'), (42, '04 秘密相爱'), (56, '05 逃离'), (82, '06 等待'),
            (89, '07 失落'), (94, '08 重逢'), (98, '09 承诺'), (102, '10 圆满'), (114, '退出')]


def status_bar(S):
    t, m, cv = S.t, S.m, S.cv
    y = cv.h - 1
    W = cv.w
    cv.fill(0, y, W - 1, y, ' ', None)
    cv.paint_bg(0, W - 1, y, (18, 20, 30))
    ok = t >= m.bar(94)
    cv.paint_bg(0, 9, y, mix(AMBER, ROSE, 0.5) if ok else (70, 78, 98))
    cv.text(0, y, ' 爱情故事 ', (12, 12, 18))
    chap = ''
    for n, s in CHAPTERS:
        if t >= m.bar(n):
            chap = s
    cv.text(11, y, chap, scale(TEXT, 0.75))
    rel = 'montague.net ⇄ capulet.net · 已连接' if ok else 'montague.net ✕ capulet.net · 禁止'
    cv.text(W - text_width(rel) - 12, y, rel, OK if ok else scale(RED, 0.75))
    beat = m.pulse(t, 8) if t > m.t0 else 0
    cv.put(W - 10, y, '♥', mix(DIM, mix(AMBER, ROSE, 0.5), beat))
    mm, ss = divmod(max(0.0, t), 60)
    cv.text(W - 8, y, f'{int(mm):02d}:{ss:04.1f}', scale(GREY, 0.7))
    return y


def render(cv, m, t, edit):
    cv.clear()
    S = Ctx(cv, m, t)
    if cv.w < 60 or cv.h < 18:
        cv.center(cv.h // 2, '请把终端放大（至少 60×18）', TEXT)
        return S
    for a, b, fn in edit:
        if a <= t < b:
            fn(S)
            break
    S.br.draw(cv)
    # after the modulation everything sits a step higher: a little whiter, a little warmer
    lift = key_lift(m, t)
    if lift > 0:
        for i in range(len(cv.fg)):
            c = cv.fg[i]
            if c is not None:
                cv.fg[i] = mix(c, (255, 250, 236), lift * 0.12)
    draw_hud(S)
    draw_narration(S)
    status_bar(S)
    return S

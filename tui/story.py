"""LOVE STORY — terminal edition. The Chinese narrative layer: section map, pacing, narration, HUD, big CJK text.

Everything here is a pure function of song time. All text is original (no lyrics).
"""
import json
import math

from core import (AMBER, ROSE, UNION, GREY, DIM, FAINT, TEXT, RED, OK, clamp, data_path, mix, scale, smooth,
                  text_width)

# ----------------------------------------------------------------------------- song structure in Chinese

SECTION_ZH = {
    'intro': '前奏', 'introB': '前奏·乐队进入', 'verse1': '主歌一', 'pre1': '预副歌', 'chorus1': '副歌一',
    'inter1': '间奏', 'verse2': '主歌二', 'pre2': '预副歌二', 'chorus2': '副歌二', 'post2': '副歌延续',
    'bridgeA': '桥段', 'bridgeB': '桥段·低落', 'bridgeC': '最静处', 'chorus3': '转调副歌', 'chorus4': '终章副歌',
    'tail': '尾声',
}
SECTION_SHORT = {
    'intro': '前奏', 'introB': '前奏', 'verse1': '主歌', 'pre1': '预副歌', 'chorus1': '副歌', 'inter1': '间奏',
    'verse2': '主歌', 'pre2': '预副歌', 'chorus2': '副歌', 'post2': '延续', 'bridgeA': '桥段', 'bridgeB': '低落',
    'bridgeC': '静', 'chorus3': '转调', 'chorus4': '终章', 'tail': '尾',
}
# pacing: how fast and how busy the picture is in each section (0 = still, 1 = full chorus)
ENERGY = {
    'intro': (0.15, 0.2), 'introB': (0.3, 0.35), 'verse1': (0.4, 0.45), 'pre1': (0.55, 0.9), 'chorus1': (1.0, 1.0),
    'inter1': (0.6, 0.4), 'verse2': (0.45, 0.5), 'pre2': (0.6, 0.95), 'chorus2': (1.0, 1.0), 'post2': (1.0, 1.05),
    'bridgeA': (0.9, 0.8), 'bridgeB': (0.3, 0.25), 'bridgeC': (0.15, 0.5), 'chorus3': (1.2, 1.2),
    'chorus4': (1.1, 1.15), 'tail': (0.3, 0.1),
}


def section_at(m, t):
    for s in m.sections:
        if s['start'] <= t < s['end']:
            return s
    return m.sections[-1] if t >= m.sections[-1]['start'] else m.sections[0]


def energy(m, t):
    """section pacing (ramps linearly inside the section) blended with the measured loudness"""
    s = section_at(m, t)
    a, b = ENERGY.get(s['id'], (0.5, 0.5))
    u = clamp((t - s['start']) / max(0.01, s['end'] - s['start']))
    base = a + (b - a) * u
    return clamp(0.75 * base + 0.35 * m.env('rms', t), 0.0, 1.3)


def kick(m, t, decay=9.0):
    """accent on beats 1 and 3 (the kick), decaying"""
    b = m.beat_at(t)
    if b < 0:
        return 0.0
    k = math.floor(b)
    ph = b - k
    return math.exp(-ph * m.beat_len * decay) if k % 2 == 0 else 0.0


def key_lift(m, t):
    """0 before the modulation, 1 after (bar 94): everything sits one step higher"""
    return smooth(m.bar(94) - 0.05, m.bar(94) + 0.6, t)


def lifted(m, t, col, amount=0.14):
    return mix(col, (255, 255, 255), key_lift(m, t) * amount)


# ----------------------------------------------------------------------------- narration (original text)

# (bar_from, bar_to, Chinese line, small English line)
NARRATION = [
    (0.6, 2.4, '维罗纳OS 启动。两个家族，一道防火墙。', 'verona-os boots: two households, one firewall'),
    (2.4, 4.0, '进程 A 与进程 B 共用同一个心跳，却被禁止通信。', 'A and B share one heartbeat and may not talk'),
    (8, 10, '星图里有两个光点，还不知道彼此的名字。', 'two lights in the star map, nameless to each other'),
    (10, 12, '每个小节的第一拍，各自向黑暗发出一圈探测。', 'on every downbeat, each sends a ping ring into the dark'),
    (12, 14, '乐队退后的两个小节里，两圈涟漪第一次相触。', 'in the two quiet bars the ripples touch for the first time'),
    (14, 16, 'A：收到未知信号。 B：收到未知信号。', 'A: unknown signal.  B: unknown signal.'),
    (16, 18, '假面舞会。所有节点戴着面具，成对旋转。', 'masquerade: every node masked, waltzing in pairs'),
    (18, 20, 'A 向房间另一头发出一次 ping。往返 0.001 毫秒。', 'A pings across the room: 0.001 ms round trip'),
    (20, 22, '时间慢到 ×0.04。其他一切暂停。', 'time ×0.04 — everything else pauses'),
    (22, 24, '心率从 72 升到 119，和这首歌同速。', 'heart rate 72 → 119 bpm, the song\'s tempo'),
    (24, 26, '人群让开。每一拍，靠近一格。', 'the crowd parts; one cell closer on every beat'),
    (26, 28, '距离在倒数，心跳在加速。', 'distance counts down, the pulse speeds up'),
    (28, 30, '两个光点之间只剩一条细线。', 'only a thin line is left between them'),
    (30, 32, '第一支舞。', 'the first dance'),
    (32, 34, '两道轨迹在黑暗里画出玫瑰线。', 'two trails draw rose curves in the dark'),
    (34, 36, '每一拍交换一个数据包，没有人看见。', 'one packet per beat; nobody sees'),
    (36, 38, '舞步越画越大，星星跟着往上升。', 'the steps grow wider, the stars rise'),
    (38, 40, '直到——', 'until —'),
    (40, 42, '访问被拒绝。规则来自 /etc/families.conf，不可修改。', 'access denied; the rule is immutable'),
    (42, 44, '白天是敌人，夜里用加密的方式说话。', 'enemies by day; encrypted talk by night'),
    (44, 46, '前四封信被退回：EACCES（没有权限）。', 'the first four letters bounce: EACCES'),
    (46, 48, '第五封到了。解密之后只有两个字符。', 'the fifth gets through: two characters after decryption'),
    (48, 50, '一条光的藤蔓从花园爬向阳台。', 'a vine of light climbs from the garden to the balcony'),
    (50, 52, '权限迷宫。每一条路都写着：禁止。', 'the permission maze: every path says no'),
    (52, 54, 'sudo 不行，chmod 不行，ssh 也不行。', 'sudo fails, chmod fails, ssh fails'),
    (54, 56, '在 /garden/.secret 里找到一条隐藏路线。', 'a hidden route is found in /garden/.secret'),
    (56, 58, '跑。', 'run'),
    (58, 60, '两条数据流拧成一股，跳过每一道闸门。', 'two streams braided into one, hopping every gate'),
    (60, 62, '城市在下面沉睡。隧道加密，路线隐藏。', 'the city sleeps below; tunnel encrypted, route hidden'),
    (62, 64, '每两小节一道［拒绝］，每一次都跳过去。', 'a DENY gate every two bars; cleared every time'),
    (64, 66, '速度 119 bpm，和心跳一样。', '119 bpm, same as the heartbeat'),
    (66, 68, '有人在追踪这条未授权链路。', 'someone is tracing the unauthorized link'),
    (68, 70, '每小节扫一次。进度在涨。', 'one sweep per bar; the trace fills up'),
    (70, 72, '链路开始被撕开。', 'the link is being torn apart'),
    (72, 74, '信号撕裂。', 'signal torn'),
    (74, 76, '暴雨。屏幕从中间裂开。', 'storm: the screen cracks down the middle'),
    (76, 78, 'send()：连接被对端重置。丢包 87%。', 'send(): connection reset by peer; 87% loss'),
    (78, 80, 'recv()：无法到达主机。', 'recv(): no route to host'),
    (80, 82, '两边都在重试，两边都失败。', 'both sides retry; both sides fail'),
    (82, 84, '只剩一扇小窗。', 'one small window is left'),
    (84, 86.5, '等待 A。不设超时。', 'wait for A, with no timeout'),
    (86.5, 89, '没有回音的日子，一天一行。', 'days without an answer, one line per day'),
    (89, 91, '窗口越缩越小。', 'the window shrinks'),
    (91, 93, '信号消失了吗？', 'is the signal gone?'),
    (93, 94, '——一个琥珀色的点，从黑暗的尽头穿过来。', '— an amber point crosses from the far end of the dark'),
    (94, 95, '第 94 小节：整首歌升了一个全音。', 'bar 94: the whole song lifts a whole step'),
    (95, 97, 'A 请求同步。B 确认。A 确认。', 'SYN · SYN-ACK · ACK'),
    (97, 98, '已连接。', 'connected'),
    (98, 100, '规则被改写：禁止 → 允许。', 'the rule is rewritten: DENY → ALLOW'),
    (100, 102, 'SO_KEEPALIVE = ∞ ，永不断开。', 'keepalive forever'),
    (102, 104, '两个家族的网络，从此都经过同一个节点。', 'both networks now route through the joined pair'),
    (104, 107, '玫瑰线旋转，所有的光向上。', 'the rose curve turns; all light rises'),
    (107, 110, '两个心跳同步：119 bpm。', 'two heartbeats in sync: 119 bpm'),
    (110, 113.8, '最后一个和弦。', 'the last chord'),
    (114, 119.5, '进程退出，状态码 0。', 'process exited with status 0'),
]


def narration_at(m, t):
    for b0, b1, zh, en in NARRATION:
        if m.bar(b0) <= t < m.bar(b1):
            return (m.bar(b0), m.bar(b1), zh, en)
    return None


def draw_narration(S):
    """two bottom rows above the status bar: Chinese line, small English line"""
    cv, m, t = S.cv, S.m, S.t
    n = narration_at(m, t)
    y_zh, y_en = cv.h - 3, cv.h - 2
    cv.fill(0, y_zh, cv.w - 1, y_en, ' ', None)
    if not n:
        return
    t0, t1, zh, en = n
    a = clamp((t - t0) / 0.2) * (1 - smooth(t1 - 0.35, t1 - 0.02, t))
    if a <= 0:
        return
    shown = zh[:int((t - t0) * 24)]
    cv.put(2, y_zh, '▌', scale(mix(AMBER, ROSE, 0.5), a))
    cv.text(4, y_zh, shown, scale(lifted(m, t, (236, 240, 248)), a))
    if len(shown) < len(zh) and (int(t * 6) % 2):
        cv.put(4 + text_width(shown), y_zh, '▌', scale(AMBER, a))
    if cv.w >= 100:
        cv.text(4, y_en, en[:int((t - t0) * 60)], scale(GREY, 0.85 * a))


# ----------------------------------------------------------------------------- HUD (row 0)

def draw_hud(S):
    cv, m, t = S.cv, S.m, S.t
    W = cv.w
    cv.fill(0, 0, W - 1, 0, ' ', None)
    cv.paint_bg(0, W - 1, 0, (12, 13, 20))
    sec = section_at(m, t)
    lift = key_lift(m, t)
    # right block: bar · beat dots · bpm · key
    bar = m.bar_at(t)
    beat = m.beat_at(t)
    bn = int(math.floor(bar)) if bar >= 0 else 0
    bi = int(math.floor(beat)) % 4 if beat >= 0 else -1
    dots = ''.join('●' if i == bi else '○' for i in range(4))
    key = 'E大调' if lift > 0.5 else 'D大调'
    kcol = mix(TEXT, UNION, lift)
    right = f'第{bn:3d}小节 '
    rx = W - 2 - text_width(right) - 6 - 11 - text_width(key) - 3
    cv.text(rx, 0, right, scale(TEXT, 0.8))
    x = rx + text_width(right)
    acc = m.pulse(t, 7) if beat >= 0 else 0
    cv.text(x, 0, dots, mix(scale(TEXT, 0.6), UNION, acc))
    x += 6
    cv.text(x, 0, ' 119 bpm ', scale(GREY, 1.0))
    x += 10
    cv.text(x, 0, key, kcol)
    if 0 < lift < 1:
        cv.put(x + text_width(key), 0, '↑', scale(UNION, 1))
    # left block: section timeline (proportional), current section named
    label = SECTION_ZH.get(sec['id'], sec['id'])
    lx = 1
    cv.text(lx, 0, ' ' + label + ' ', (12, 13, 20))
    cv.paint_bg(lx, lx + text_width(label) + 1, 0, mix(scale(mix(AMBER, ROSE, 0.5), 0.75), UNION, lift * 0.5))
    tx0 = lx + text_width(label) + 4
    tx1 = rx - 3
    if tx1 - tx0 > 40:
        total = m.sections[-1]['end']
        for s in m.sections:
            a = tx0 + int((tx1 - tx0) * s['start'] / total)
            b = tx0 + int((tx1 - tx0) * s['end'] / total)
            cur = s is sec
            e = ENERGY.get(s['id'], (0.5, 0.5))
            lvl = (e[0] + e[1]) / 2
            g = '▬' if lvl > 0.95 else '━' if lvl > 0.6 else '─' if lvl > 0.25 else '╌'
            col = mix(DIM, mix(AMBER, ROSE, 0.5), 0.35 + 0.65 * lvl) if cur else scale(mix(DIM, GREY, lvl), 0.9)
            cv.hline(a, max(a, b - 1), 0, g, col)
            if cur:
                acc2 = m.pulse(t, 6) if beat >= 0 else 0
                cv.hline(a, max(a, b - 1), 0, g, mix(col, UNION, 0.5 * acc2))
        px = tx0 + int((tx1 - tx0) * clamp(t / total))
        cv.put(px, 0, '▼' if (m.beat_at(t) % 1) < 0.5 else '▽', UNION)
        kx = tx0 + int((tx1 - tx0) * m.bar(94) / total)
        cv.put(kx, 0, '┃', mix(scale(UNION, 0.6), UNION, lift))


# ----------------------------------------------------------------------------- big Chinese text (bitmaps)

_GLYPHS = None


def glyphs():
    global _GLYPHS
    if _GLYPHS is None:
        try:
            with open(data_path('glyphs.json')) as f:
                _GLYPHS = json.load(f)
        except OSError:
            _GLYPHS = {}
    return _GLYPHS


def big_zh_width(word, size=16, gap=2):
    return len(word) * (size + gap) - gap


def big_zh(cv, x, y, word, col, size=16, gap=2, reveal=1.0, alpha=1.0, clear=True):
    """draw a word in pre-rendered 16px (8 rows) or 12px (6 rows) half-block letters; returns width"""
    g = glyphs().get(str(size))
    rows_n = size // 2
    w = big_zh_width(word, size, gap)
    x, y = int(x), int(y)
    if not g:
        cv.text(x, y + rows_n // 2, word, scale(col, alpha))
        return w
    if clear:
        cv.fill(x - 1, y - 1, x + w, y + rows_n, ' ', None)
    if alpha <= 0.05:
        return w
    lim = int(w * reveal + 0.999)
    cx = 0
    for ch in word:
        bm = g.get(ch)
        if bm:
            for r in range(rows_n):
                top, bot = bm[2 * r], bm[2 * r + 1]
                for c in range(size):
                    if cx + c >= lim:
                        break
                    a, b = top[c] == '#', bot[c] == '#'
                    if a or b:
                        cv.put(x + cx + c, y + r, '█' if (a and b) else '▀' if a else '▄', scale(col, alpha))
        else:
            cv.text(x + cx, y + rows_n // 2, ch, scale(col, alpha))
        cx += size + gap
    return w


def title_card(S, t0, zh, sub, col=UNION, hold=1.6, y=None):
    """chapter title: big Chinese word revealed on the downbeat, held `hold` bars, then fades upward"""
    cv, m, t = S.cv, S.m, S.t
    lt = t - t0
    end = m.bar_len * hold
    if lt < 0 or lt > end + 0.6 or S.H < 30:
        return
    size = 16 if cv.w >= 120 else 12
    w = big_zh_width(zh, size)
    rev = clamp(lt / (m.beat_len * 0.9))
    out = smooth(end, end + 0.6, lt)
    a = 1 - out
    if a < 0.06:
        return
    rows_n = size // 2
    yy = int(S.H * 0.3) if y is None else y
    yy -= int(out * 3)
    x0 = (cv.w - w) // 2
    big_zh(cv, x0, yy, zh, col, size=size, reveal=rev, alpha=a, clear=out < 0.5)
    if lt > m.beat_len * 0.6:
        sa = clamp((lt - m.beat_len * 0.6) / 0.4) * a
        cv.center(yy + rows_n + 1, sub, scale(TEXT, 0.85 * sa))

"""LOVE STORY — matrix edition. The easter-egg layer: dozens of small, visible things that keep appearing all over
the screen for the whole song, so there is always something new to notice.

A deterministic scheduler keeps ~5–12 "slots" alive at once (more in the choruses). Each slot picks a kind
(pop-up, walker, comment, stamp, mini panel) and an item from the pools by a hash of (seed, slot, epoch), so the
same seed replays identically and a different --seed gives a different combination every viewing.
All text is original. No lyrics.
"""
import math

from core import GREY, DIM, RED, OK, clamp, hash01, mix, scale, smooth, text_width

CYAN = (90, 225, 230)
MAGENTA = (235, 110, 235)
ORANGE = (255, 160, 70)
GREEN = (110, 235, 140)
GOLD = (255, 214, 110)
BLUE = (110, 160, 255)
SILVER = (206, 218, 240)
WHITE = (250, 250, 255)
PINK = (255, 130, 170)

SEED = [0]


def set_seed(n):
    SEED[0] = int(n) % 100000


def h(*parts):
    v = SEED[0] * 7919
    for i, p in enumerate(parts):
        v = (v * 131 + int(p) * (17 + i * 29)) & 0xFFFFFF
    return hash01(v)


# ----------------------------------------------------------------------------- pools

POPUPS = [
    ('notice', ['固件 1.9.89 可更新', '变更：防火墙更温柔'], CYAN),
    ('cron', ['garbage_collect 将在 13 分钟后运行', '目标：未签名补丁 ×1'], ORANGE),
    ('mail', ['1 封新邮件 · 来自：未知', '主题：(无)'], GREEN),
    ('sec', ['2 次登录失败 · 来源 capulet.net', '已记录 · 未处理'], RED),
    ('fortune', ['两个进程，一个心跳。', '— /usr/share/fortune/matrix'], GOLD),
    ('weather', ['/sky 星密度 97% · 数据流 东北风 3 级', '明日：转调'], CYAN),
    ('ad', ['母体保险：防火墙终身险', '首月免费 · 自动续费'], MAGENTA),
    ('tip', ['按 q 退出 · 画面只由歌曲时间决定', '--start 可以从任意秒开始'], SILVER),
    ('achievement', ['成就解锁：第一次握手 ✓', '稀有度 0.01%'], GOLD),
    ('poll', ['应该允许它们通信吗？', '是 51% · 否 49% · 弃权 1'], CYAN),
    ('news', ['第 13 次全球同步周期开始', '所有线程请戴好面具'], SILVER),
    ('git', ['romeo 领先 main 2 个提交', 'juliet 落后 main 0 个提交'], GREEN),
    ('ps', ['65536 个线程，2 个醒着', '1 个在做梦'], SILVER),
    ('cron', ['midnights.service: 00:00 执行', '任务：把今天归档'], MAGENTA),
    ('log', ['folklore.log 已轮转', '旧故事 → /var/log/evermore'], GREEN),
    ('sock', ['lover.sock 监听 :1989', '连接数 2'], GOLD),
    ('mute', ['speak_now: 已静音', '原因：策略'], RED),
    ('rep', ['reputation: 重建中 … 37%', '评价人数：全网'], ORANGE),
    ('alert', ['RED 级警报已解除', '原因：误报'], RED),
    ('kernel', ['/dev/heart 119 bpm · 稳定', 'warn: 两个进程共享'], CYAN),
    ('fs', ['/garden/.secret 已挂载', '只读：否'], GREEN),
    ('dns', ['montague.net → 10.15.97.1', 'capulet.net → 10.15.97.129'], SILVER),
    ('ntp', ['时钟同步 · 偏差 -30 ms', '来源：鼓点'], CYAN),
    ('backup', ['备份 juliet.core … 完成', '位置：/forever'], GOLD),
    ('update', ['Eternity Protocol 预览版', '状态：灰度 2 个进程'], GREEN),
    ('oom', ['内存不足：/feelings', '已释放：0 B'], RED),
    ('ssh', ['ssh: 有人在敲窗', '端口 1989 · 4 次'], GREEN),
    ('cat', ['=^.^= 猫走过了键盘', '输入：qqqqq'], MAGENTA),
    ('survey', ['防火墙满意度调查', '★☆☆☆☆'], ORANGE),
    ('lost+found', ['找到 1 个未签名的补丁', '要回收吗？[否]'], CYAN),
    ('calendar', ['2008-09-12 · 发行日', '提醒：3:09 转调'], GOLD),
    ('bugs', ['#1989 心跳偶发同步 · open', '指派给：root'], GREEN),
    ('audio', ['音轨：你那版 · 119 bpm · D→E', '歌词：无'], SILVER),
    ('wifi', ['信号 ▂▄▆█ · 母体内网', '延迟 0.001 ms'], CYAN),
    ('battery', ['心跳电量 100% · 永不断开', 'SO_KEEPALIVE = ∞'], GOLD),
    ('thread', ['thread_1989 举手：我也想谈恋爱', '已拒绝'], ORANGE),
    ('fw', ['防火墙日记：今天又拦了两个', '心情：复杂'], RED),
    ('sudo', ['A 不在 sudoers 文件中', '此事将被报告（第 42 次）'], RED),
    ('love', ['<3 已检测到 · 位置：到处', '处理：无'], PINK),
    ('egg', ['你发现了一个彩蛋', '编号 #{n} · 共 100+'], MAGENTA),
    ('clipboard', ['剪贴板：SYN', '上一条：SYN-ACK'], SILVER),
    ('printer', ['打印任务：婚礼请柬.pdf', '状态：卡纸'], PINK),
    ('disk', ['/dev/heart 已用 100%', '建议：不要清理'], ORANGE),
    ('gc', ['垃圾回收器：今天休假', '原因：root 批准'], GREEN),
    ('music', ['正在播放 · 第 {bar} 小节', '调性 {key}'], GOLD),
]

WALKERS = [
    (['<(^_^<)', '(>^_^)>'], 'kirby_thread', MAGENTA, 12),
    (['(-_-)zzZ', '(-_-)zzz'], 'idle_thread', SILVER, 4),
    (['=^.^=', '=^-^='], 'cat', ORANGE, 9),
    (['(o_O)', '(O_o)'], 'watchdog', RED, 16),
    (['[####]>', '[####]>'], 'bus_0x1f', BLUE, 20),
    (['~(^-^)~', '-(^-^)-'], 'dancer', CYAN, 8),
    (['(9^_^)9', '(9^o^)9'], 'boxer', ORANGE, 14),
    (['d(^_^)b', 'd(-_-)b'], 'dj_thread', GREEN, 6),
    (['\\(^o^)/', '\\(^o^)/'], 'fan_club', GOLD, 10),
    (['(T_T)', '(;_;)'], 'orphan_thread', SILVER, 5),
    (['*bug*', '*BUG*'], 'bug #1989', RED, 18),
    (["@}-,-'--", "@}-,-'--"], 'rose', PINK, 7),
    (['o-=', 'o-='], 'key', GOLD, 11),
    (['(^_^)b', '(^_-)b'], 'thumbs', GREEN, 9),
    (['<3', '<3'], 'packet', PINK, 22),
    (['[|==|]', '[|==|]'], 'cassette', SILVER, 8),
    (['(o)', '(O)'], 'vinyl', SILVER, 6),
    (['(^.^) <3 (^.^)', '(^.^)<3(^.^)'], 'npc_couple', GOLD, 5),
    (['(o_O) -->', '(O_o) -->'], 'chasing', RED, 15),
    (['(^o^)/~~', '(^o^)/~'], 'waving', CYAN, 7),
    (['[=====]', '[=====]'], 'train_0x89', BLUE, 24),
    (['(-.-)', '(-_-)'], 'sleepwalker', SILVER, 3),
    (['>>>', '>>>'], 'prompt', GREEN, 13),
    (['(^_^)/ (^_^)/', '(^_^)/(^_^)/'], 'twins', MAGENTA, 6),
]

COMMENTS = [
    '// TODO: 问她', '# FIXME: 心跳不同步', '/* 这里曾经有一道墙 */', '<!-- 不要在这里出现歌词 -->',
    '// 第 94 小节会发生一件事', '// 彩蛋：你看到这行了吗', '# 1989 = 13 × 153', '// 这段代码没有人审过',
    '/* 请勿回收 */', '# fearless_mode 不能关', '// TODO(root): 允许', '# NOTE: 她的只读锁是可以解的',
    '// 每拍 0.504 秒', '/* 母体不会做梦，进程会 */', '// if (love) goto main;', '# 本注释由 Romeo 留下',
    '/* 彩蛋总数 > 100 */', '// deny() { return allow(); }', '# 猫在键盘上睡着了', '// 第 13 次重看了吗',
    '/* 把这段注释删掉再提交 */', '# 这不是歌词，这是日志', '// ∞ 也会溢出吗', '# 本注释由 Juliet 留下',
    '// 2008-09-12: 第一次提交', '/* 读到这里的人：你好 */', '# 第 {bar} 小节，你还在看', '// while(true) { beat(); }',
    '# 这一行每次都不一样：{seed}', '/* 防火墙也有心跳 */', '// 换个 --seed 再看一遍',
]

STAMPS = [
    ([" /\\_/\\", "( o.o )", " > ^ <"], ORANGE),
    ([" .:::. .:::.", ":::::::::::::", " ':::::::::'", "   ':::::'", "     ':'"], PINK),
    ([" .-\"-.", "(  o  )", " '-.-'"], GOLD),
    (["   ^", "  / \\", " /___\\"], BLUE),
    ([" .--.", "( o  )==>", " '--'"], GOLD),
    ([".------.", "|[|==|]|", "'------'"], SILVER),
    ([".--------.", "|\\      /|", "| \\    / |", "|  \\__/  |", "'--------'"], GREEN),
    (["   *", " * * *", "   *"], CYAN),
    (["▛▀▀▟▖▙▀▀▜", "▌▄▖▐▘▌▗▄▐", "▙▄▄▟▞▙▄▄▟"], SILVER),
    (["  _  _", " ( \\/ )", "  \\  /", "   \\/"], PINK),
    (["[1989]", "[ ok ]"], MAGENTA),
    (["(\\__/)", "(='.'=)", "(\")_(\")"], SILVER),
    ([" ___", "|o o|", "|_^_|", " | |"], GREEN),
    (["  .--.", " / ** \\", "|  **  |", " \\ ** /", "  '--'"], GOLD),
]

MINIS = ['scope', 'vu', 'life', 'pong', 'moon', 'clock', 'rain', 'snake']

_LIFE = {}


def life_grid(seed, n, w=24, hh=8):
    """Game of Life on a torus, stepped n times from a seeded soup (cached, stepped incrementally)"""
    key = (seed, w, hh)
    st = _LIFE.get(key)
    if st is None or st[0] > n:
        g = [[1 if h(seed, x, y, 99) < 0.38 else 0 for x in range(w)] for y in range(hh)]
        st = [0, g]
    k, g = st
    while k < n:
        ng = [[0] * w for _ in range(hh)]
        for y in range(hh):
            for x in range(w):
                s = 0
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        if dx or dy:
                            s += g[(y + dy) % hh][(x + dx) % w]
                ng[y][x] = 1 if (s == 3 or (s == 2 and g[y][x])) else 0
        g = ng
        k += 1
        if k % 60 == 0 and sum(map(sum, g)) < 6:         # reseed a dead soup so it keeps living
            g = [[1 if h(seed, x, y, k) < 0.38 else 0 for x in range(w)] for y in range(hh)]
    _LIFE[key] = [k, g]
    return g


# ----------------------------------------------------------------------------- drawing

def popup_box(S, x, y, w, hgt, title, col, a):
    cv = S.cv
    x, y = int(x), int(y)
    cv.box(x, y, x + w, y + hgt, scale(col, 0.9 * a), style='round', title=title, title_col=scale(mix(col, WHITE, 0.4), a))
    cv.put(x + w - 2, y, '!' if int(S.t * 4) % 2 else '·', scale(col, a))


def fill(txt, **kw):
    """replace only the known {tokens}; code braces in the text are left alone"""
    for k, v in kw.items():
        txt = txt.replace('{' + k + '}', str(v))
    return txt


def draw_popup(S, slot, epoch, u, x, y, bar):
    item = POPUPS[int(h(slot, epoch, 5) * len(POPUPS))]
    title, lines, col = item
    key = 'E大调' if bar >= 94 else 'D大调'
    lines = [fill(l, n=f'{(slot * 7 + epoch) % 100:02d}', bar=int(bar), key=key) for l in lines]
    w = max(text_width(l) for l in lines) + 4
    a = clamp(u / 0.08) * (1 - smooth(0.85, 1.0, u))
    if a <= 0:
        return
    grow = clamp(u / 0.06)
    popup_box(S, x, y, int(w * grow) if grow < 1 else w, 3, title, col, a)
    if grow >= 1:
        for i, l in enumerate(lines):
            S.cv.text(x + 2, y + 1 + i, l[:int((u - 0.06) * 120)], scale(mix(col, WHITE, 0.5), a))


def draw_walker(S, slot, epoch, u, y, dir_):
    frames, tag, col, speed = WALKERS[int(h(slot, epoch, 6) * len(WALKERS))]
    W = S.W
    fr = frames[int(S.beat_n * 2) % len(frames)]
    span = W + 20
    x = -10 + span * u if dir_ > 0 else W + 10 - span * u
    if dir_ < 0:
        fr = fr[::-1].replace('(', '\x00').replace(')', '(').replace('\x00', ')').replace('<', '\x01').replace('>', '<').replace('\x01', '>')
    S.cv.text(x, y, fr, col)
    S.cv.text(x, y + 1, tag, scale(col, 0.55))


def draw_comment(S, slot, epoch, u, x, y, bar):
    txt = fill(COMMENTS[int(h(slot, epoch, 7) * len(COMMENTS))], bar=int(bar), seed=SEED[0])
    a = 1 - smooth(0.8, 1.0, u)
    S.cv.text(x, y, txt[:int(u * 90)], scale(GREEN if txt.startswith(('//', '#')) else SILVER, 0.9 * a))
    if u < 0.5 and int(S.t * 5) % 2:
        S.cv.put(x + text_width(txt[:int(u * 90)]), y, '_', scale(GREEN, a))


def draw_stamp(S, slot, epoch, u, x, y):
    lines, col = STAMPS[int(h(slot, epoch, 8) * len(STAMPS))]
    a = clamp(u / 0.1) * (1 - smooth(0.8, 1.0, u))
    for i, l in enumerate(lines):
        S.cv.text(x, y + i, l, scale(col, a * (0.7 + 0.3 * S.m.pulse(S.t, 6))))


def draw_mini(S, slot, epoch, u, x, y, start_bar=0.0):
    kind = MINIS[int(h(slot, epoch, 9) * len(MINIS))]
    cv, m, t = S.cv, S.m, S.t
    a = clamp(u / 0.08) * (1 - smooth(0.9, 1.0, u))
    if a <= 0:
        return
    w, hgt = 26, 6
    if kind == 'scope':
        popup_box(S, x, y, w, hgt, 'oscilloscope · rms', CYAN, a)
        for px in range(0, (w - 2) * 2):
            tt = t - ((w - 2) * 2 - px) * 0.025
            v = m.env('rms', tt)
            S.br.dot((x + 1) * 2 + px, (y + 3) * 4 + 2 - v * 10, scale(CYAN, a))
            S.br.dot((x + 1) * 2 + px, (y + 3) * 4 + 2 + m.env('low', tt) * 6, scale(BLUE, 0.7 * a))
    elif kind == 'vu':
        popup_box(S, x, y, w, hgt, 'VU · 119 bpm', GREEN, a)
        for i, name in enumerate(('low', 'rms', 'high', 'onset', 'beat')):
            v = m.pulse(t, 6) if name == 'beat' else m.env(name, t)
            n = int(clamp(v) * 4)
            col = mix(GREEN, RED, clamp(v))
            for k in range(4):
                cv.put(x + 2 + i * 5, y + 4 - k, '███' [0] if k < n else '·', scale(col if k < n else GREY, a))
                cv.put(x + 3 + i * 5, y + 4 - k, '█' if k < n else '·', scale(col if k < n else GREY, a))
            cv.text(x + 2 + i * 5, y + 5, name[:4], scale(GREY, a))
    elif kind == 'life':
        popup_box(S, x, y, w, hgt + 2, 'life · 每八分音符一步', MAGENTA, a)
        n = max(0, int((m.bar_at(t) - start_bar) * 8))
        g = life_grid(SEED[0] * 31 + slot * 7 + epoch, n)
        for yy in range(8):
            for xx in range(24):
                if g[yy][xx]:
                    cv.put(x + 1 + xx, y + 1 + yy, '■', scale(MAGENTA, a))
    elif kind == 'pong':
        popup_box(S, x, y, w, hgt, 'pong · 两个进程', GOLD, a)
        px_ = (t * 9) % ((w - 4) * 2)
        bx = x + 2 + (px_ if px_ < w - 4 else (w - 4) * 2 - px_)
        py_ = (t * 5) % 8
        by = y + 1 + (py_ if py_ < 4 else 8 - py_)
        cv.put(bx, by, '●', scale(WHITE, a))
        for yy in range(1, 5):
            cv.put(x + 1, y + yy, '▌' if abs(yy - (by - y)) <= 1 else ' ', scale(GOLD, a))
            cv.put(x + w - 1, y + yy, '▐' if abs(yy - (by - y)) <= 1 else ' ', scale(BLUE, a))
        cv.text(x + 2, y + 5, f'J {int(m.bar_at(t)) % 10}  :  R {(int(m.bar_at(t)) + 3) % 10}', scale(GREY, a))
    elif kind == 'moon':
        popup_box(S, x, y, w, hgt, 'moon · /sky', SILVER, a)
        ph = int(m.bar_at(t)) % 8
        faces = ['(     )', '(    ))', '(   ))', '(  )))', '(█████)', '(((  )', '((   )', '()    )']
        cv.text(x + 9, y + 2, faces[ph], scale(SILVER, a))
        cv.text(x + 2, y + 4, ['新月', '娥眉', '上弦', '盈凸', '满月', '亏凸', '下弦', '残月'][ph] + f' · 第 {int(m.bar_at(t))} 小节', scale(SILVER, a))
    elif kind == 'clock':
        popup_box(S, x, y, w, hgt, 'clock · 母体时间', CYAN, a)
        day = 1989 + int(t)
        mm, ss = divmod(int(t), 60)
        cv.text(x + 2, y + 1, f'day {day} · {mm:02d}:{ss:02d}', scale(CYAN, a))
        left = m.bar(94) - t
        cv.text(x + 2, y + 2, ('距转调 ' + f'{int(left):3d} s') if left > 0 else '已转调 · E 大调', scale(mix(CYAN, WHITE, 0.4), a))
        cv.text(x + 2, y + 3, '自 2008-09-12 起运行', scale(GREY, a))
        cv.text(x + 2, y + 4, f'seed {SEED[0]}', scale(GREY, a))
    elif kind == 'rain':
        popup_box(S, x, y, w, hgt + 2, 'rain · 母体', GREEN, a)
        chars = '母体数据流程序心跳爱情故事只读防火墙握手永恒协议'
        e8 = int(S.beat_n * 2) if S.beat_n > 0 else 0
        for c in range(12):
            head = (int(h(slot, c, 11) * 8) + e8 * (1 + c % 2)) % 10
            for k in range(4):
                yy = head - k
                if 0 <= yy < 8:
                    ch = chars[int(h(c, yy + e8, 12) * len(chars))]
                    cv.put(x + 1 + c * 2, y + 1 + yy, ch, scale(GREEN if k else WHITE, a * (1 - k * 0.22)))
    elif kind == 'snake':
        popup_box(S, x, y, w, hgt, 'snake · ~', GREEN, a)
        for k in range(14):
            px_ = (t * 6 + k * 1.3) % (w - 3)
            py_ = 1 + int(2 + 1.8 * math.sin((t * 6 + k * 1.3) * 0.5))
            cv.put(x + 1 + px_, y + py_, 'o' if k == 0 else '~', scale(GREEN if k else WHITE, a))


# ----------------------------------------------------------------------------- the scheduler

def draw_eggs(S, layer):
    """layer 'bg' draws pop-ups, comments, stamps and mini panels under the scene; 'fg' draws the walkers over it"""
    m, t = S.m, S.t
    W, H = S.W, S.H
    bar = m.bar_at(t)
    if bar < 0.5 or W < 80 or H < 24:
        return
    nslots = 5 + int(7 * clamp(S.e / 1.2))
    for slot in range(14):
        period = 2.0 + 2.0 * h(slot, 1)                # bars
        off = h(slot, 2) * period
        epoch = math.floor((bar + off) / period)
        start = epoch * period - off
        u = (bar - start) / period
        if slot >= nslots and (slot + epoch) % 3:        # quiet sections keep fewer slots alive
            continue
        r = h(slot, epoch, 3)
        kind = 'popup' if r < 0.34 else 'walker' if r < 0.58 else 'comment' if r < 0.74 else 'stamp' if r < 0.84 else 'mini'
        x = 2 + int(h(slot, epoch, 4) * (W - 40))
        y = 3 + int(h(slot, epoch, 10) * (H - 14))
        if y < 7 and x > W - 56:                         # keep the processes panel readable
            y += 5
        if layer == 'fg':
            if kind == 'walker':
                dir_ = 1 if h(slot, epoch, 13) < 0.5 else -1
                row = H - 2 if h(slot, epoch, 14) < 0.5 else y
                draw_walker(S, slot, epoch, u, row, dir_)
            continue
        if kind == 'popup':
            draw_popup(S, slot, epoch, u, x, y, bar)
        elif kind == 'comment':
            draw_comment(S, slot, epoch, u, x, y, bar)
        elif kind == 'stamp':
            draw_stamp(S, slot, epoch, u, x, y)
        elif kind == 'mini':
            draw_mini(S, slot, epoch, u, x, y, start)

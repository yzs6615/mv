#!/usr/bin/env python3
"""LOVE STORY — terminal edition.  A TUI / ASCII music video, played live in your terminal.

    python3 tui/lovestory.py --audio path/to/love_story.flac        # play with music (ffplay / mpv / afplay)
    python3 tui/lovestory.py --edition classic --audio ...          # the older two-process edition
    python3 tui/lovestory.py --mute                                  # visuals only, same clock
    python3 tui/lovestory.py --audio song.flac --start 185           # jump to a moment (seconds)
    python3 tui/lovestory.py --export out.mp4 --audio song.flac      # offline render to video (needs Pillow + ffmpeg)
    python3 tui/lovestory.py --stills 20,62,190 --sheet qa.png       # QA stills

Keys: q / Ctrl-C quit.   Needs a terminal ≥ 60×18; best at 160×45 or larger with a truecolor terminal.
Standard library only for live playback. The song file is not included — bring your own copy.
"""
import argparse
import os
import shutil
import signal
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from core import Canvas, Music, WIDE_TAIL, data_path   # noqa: E402

EDITIONS = {'eternity': 'matrix.scenes', 'matrix': 'matrix.scenes', 'classic': 'scenes'}


def load_edition(name):
    """each edition is a module with build_edit(music) and render(canvas, music, t, edit)"""
    import importlib
    return importlib.import_module(EDITIONS[name])

CSI = '\x1b['


# ----------------------------------------------------------------------------- ANSI output

def to256(c):
    r, g, b = c
    if abs(r - g) < 10 and abs(g - b) < 10:
        if r < 8:
            return 16
        if r > 248:
            return 231
        return 232 + round((r - 8) / 247 * 24)
    q = lambda v: 0 if v < 48 else 1 if v < 115 else (v - 35) // 40
    return 16 + 36 * q(r) + 6 * q(g) + q(b)


class Term:
    def __init__(self, truecolor=True):
        self.true = truecolor
        self.prev = None
        self.size = None
        self.cache = {}

    def code(self, fg, bg):
        key = (fg, bg)
        c = self.cache.get(key)
        if c is None:
            parts = ['0']
            if fg is not None:
                parts.append(f'38;2;{fg[0]};{fg[1]};{fg[2]}' if self.true else f'38;5;{to256(fg)}')
            if bg is not None:
                parts.append(f'48;2;{bg[0]};{bg[1]};{bg[2]}' if self.true else f'48;5;{to256(bg)}')
            c = CSI + ';'.join(parts) + 'm'
            self.cache[key] = c
        return c

    def frame(self, cv):
        w, h = cv.w, cv.h
        out = []
        full = self.prev is None or self.size != (w, h)
        if full:
            out.append(CSI + '0m' + CSI + '2J')
        prev = self.prev
        for y in range(h):
            a, b = y * w, (y + 1) * w
            rc, rf, rb = cv.ch[a:b], cv.fg[a:b], cv.bg[a:b]
            if not full and prev[0][y] == rc and prev[1][y] == rf and prev[2][y] == rb:
                continue
            out.append(f'{CSI}{y + 1};1H')
            last = None
            for c, f, g in zip(rc, rf, rb):
                if c == WIDE_TAIL:
                    continue
                k = (f, g) if c != ' ' or g is not None else (None, None)
                if k != last:
                    out.append(self.code(*k))
                    last = k
                out.append(c)
        rows = ([cv.ch[y * w:(y + 1) * w] for y in range(h)], [cv.fg[y * w:(y + 1) * w] for y in range(h)],
                [cv.bg[y * w:(y + 1) * w] for y in range(h)])
        self.prev, self.size = rows, (w, h)
        out.append(CSI + '0m')
        return ''.join(out)


# ----------------------------------------------------------------------------- audio

def start_audio(path, start):
    if not path:
        return None
    if not os.path.exists(path):
        sys.exit(f'audio file not found: {path}')
    cands = []
    if shutil.which('ffplay'):
        cands.append(['ffplay', '-nodisp', '-autoexit', '-loglevel', 'quiet', '-ss', f'{start:.3f}', path])
    if shutil.which('mpv'):
        cands.append(['mpv', '--no-video', '--really-quiet', f'--start={start:.3f}', path])
    if shutil.which('afplay') and start < 0.01:
        cands.append(['afplay', path])
    if not cands:
        print('no audio player found (install ffmpeg/ffplay or mpv) — playing visuals only', file=sys.stderr)
        time.sleep(1.5)
        return None
    return subprocess.Popen(cands[0], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


# ----------------------------------------------------------------------------- live player

def play(args):
    m = Music(data_path('music_map.json'))
    scenes = load_edition(args.edition)
    edit = scenes.build_edit(m)
    end = edit[-1][1]
    truecolor = args.color == 'true' or (args.color == 'auto' and os.environ.get('COLORTERM', '') in ('truecolor', '24bit'))
    if args.color == 'auto' and os.environ.get('TERM_PROGRAM') in ('iTerm.app', 'WezTerm', 'vscode', 'ghostty', 'Apple_Terminal'):
        truecolor = os.environ.get('TERM_PROGRAM') != 'Apple_Terminal'
    term = Term(truecolor)
    out = sys.stdout
    fd = sys.stdin.fileno() if sys.stdin.isatty() else None
    old = None
    if fd is not None:
        import termios
        import tty
        old = termios.tcgetattr(fd)
        tty.setcbreak(fd)
    out.write('\x1b[?1049h\x1b[?25l\x1b[2J')
    out.flush()
    audio = None

    def cleanup(*_):
        if audio and audio.poll() is None:
            audio.terminate()
        out.write('\x1b[0m\x1b[?25h\x1b[?1049l')
        out.flush()
        if old is not None:
            import termios
            termios.tcsetattr(fd, termios.TCSADRAIN, old)

    signal.signal(signal.SIGTERM, lambda *a: (cleanup(), sys.exit(0)))
    try:
        audio = None if args.mute else start_audio(args.audio, args.start)
        t_wall0 = time.perf_counter() - args.start + args.sync
        frame_dt = 1.0 / args.fps
        cv = None
        while True:
            t = time.perf_counter() - t_wall0
            if t >= end:
                break
            cols, rows = shutil.get_terminal_size((120, 36))
            if cv is None or (cv.w, cv.h) != (cols, rows):
                cv = Canvas(cols, rows)
                term.prev = None
            scenes.render(cv, m, t, edit)
            out.write(term.frame(cv))
            out.flush()
            if fd is not None:
                import select
                r, _, _ = select.select([sys.stdin], [], [], 0)
                if r and sys.stdin.read(1) in ('q', 'Q', '\x1b'):
                    break
            nxt = t_wall0 + (int(t / frame_dt) + 1) * frame_dt
            time.sleep(max(0.0, nxt - time.perf_counter()))
    except KeyboardInterrupt:
        pass
    finally:
        cleanup()


# ----------------------------------------------------------------------------- offline rendering (QA + video)

class Raster:
    def __init__(self, cols, rows, size=16):
        from PIL import ImageFont
        here = os.path.dirname(os.path.abspath(__file__))
        mono = next((p for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
                                 '/usr/share/fonts/TTF/DejaVuSansMono.ttf', '/Library/Fonts/Menlo.ttc',
                                 'C:/Windows/Fonts/consola.ttf') if os.path.exists(p)), None)
        if not mono:
            sys.exit('no monospace font found; install DejaVu Sans Mono')
        cjk_cands = [os.environ.get('LS_CJK_FONT', ''), os.path.join(here, '..', 'build', 'cjk.otf'),
                     '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
                     '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc', '/System/Library/Fonts/PingFang.ttc',
                     'C:/Windows/Fonts/msyh.ttc']
        cjk = next((p for p in cjk_cands if p and os.path.exists(p)), None)
        if not cjk:
            print('warning: no CJK font found (set LS_CJK_FONT); Chinese text will render as boxes', file=sys.stderr)
        self.font = ImageFont.truetype(mono, size)
        self.cjk = ImageFont.truetype(cjk, size) if cjk else self.font
        self.cw = int(round(self.font.getlength('M')))
        self.chh = int(size * 1.25)
        self.cols, self.rows = cols, rows
        self.W, self.H = self.cw * cols, self.chh * rows

    def image(self, cv):
        from PIL import Image, ImageDraw
        img = Image.new('RGB', (self.W, self.H), (6, 7, 10))
        d = ImageDraw.Draw(img)
        for y in range(cv.h):
            row = cv.bg[y * cv.w:(y + 1) * cv.w]
            x = 0
            while x < cv.w:
                g = row[x]
                if g is None:
                    x += 1
                    continue
                x1 = x
                while x1 + 1 < cv.w and row[x1 + 1] == g:
                    x1 += 1
                d.rectangle([x * self.cw, y * self.chh, (x1 + 1) * self.cw - 1, (y + 1) * self.chh - 1], fill=g)
                x = x1 + 1
        for y in range(cv.h):
            x = 0
            while x < cv.w:
                i = y * cv.w + x
                c = cv.ch[i]
                if c in (' ', WIDE_TAIL) or cv.fg[i] is None:
                    x += 1
                    continue
                col = cv.fg[i]
                o = ord(c)
                if 0x2800 <= o <= 0x28FF:
                    self.braille(d, x, y, o - 0x2800, col)
                    x += 1
                    continue
                if c in '█▓▒░▌▪▀▄':
                    self.block(d, x, y, c, col)
                    x += 1
                    continue
                f = self.cjk if ord(c) > 0x2E80 and not (0x2800 <= ord(c) <= 0x28FF) else self.font
                d.text((x * self.cw, y * self.chh + 1), c, font=f, fill=col)
                x += 1
        return img

    def braille(self, d, x, y, bits, col):
        dx = self.cw / 2.0
        dy = self.chh / 4.0
        r = max(1.0, self.cw * 0.14)
        for (bx, by, bit) in ((0, 0, 1), (0, 1, 2), (0, 2, 4), (1, 0, 8), (1, 1, 16), (1, 2, 32), (0, 3, 64), (1, 3, 128)):
            if bits & bit:
                px = x * self.cw + (bx + 0.5) * dx
                py = y * self.chh + (by + 0.5) * dy
                d.ellipse([px - r, py - r, px + r, py + r], fill=col)

    def block(self, d, x, y, c, col):
        x0, y0, x1, y1 = x * self.cw, y * self.chh, (x + 1) * self.cw - 1, (y + 1) * self.chh - 1
        if c == '▌':
            d.rectangle([x0, y0, x0 + self.cw // 2 - 1, y1], fill=col)
        elif c == '▀':
            d.rectangle([x0, y0, x1, y0 + self.chh // 2 - 1], fill=col)
        elif c == '▄':
            d.rectangle([x0, y0 + self.chh // 2, x1, y1], fill=col)
        elif c == '▪':
            d.rectangle([x0 + 2, y0 + self.chh // 3, x1 - 2, y1 - self.chh // 3], fill=col)
        else:
            k = {'█': 1.0, '▓': 0.75, '▒': 0.5, '░': 0.25}[c]
            if k == 1.0:
                d.rectangle([x0, y0, x1, y1], fill=col)
            else:
                step = 2
                for yy in range(y0, y1 + 1, step):
                    for xx in range(x0 + (yy // step) % 2, x1 + 1, step):
                        if (xx * 7 + yy * 13) % 100 < k * 100 * 1.6:
                            d.point((xx, yy), fill=col)


def stills(args):
    m = Music(data_path('music_map.json'))
    scenes = load_edition(args.edition)
    edit = scenes.build_edit(m)
    cols, rows = map(int, args.grid.split('x'))
    ras = Raster(cols, rows, args.font_size)
    cv = Canvas(cols, rows)
    os.makedirs(args.outdir, exist_ok=True)
    imgs = []
    for s in args.stills.split(','):
        t = float(s)
        scenes.render(cv, m, t, edit)
        im = ras.image(cv)
        p = os.path.join(args.outdir, f't{t:07.2f}.png')
        im.save(p)
        imgs.append((t, im))
    if args.sheet:
        from PIL import Image, ImageDraw
        tw = 800
        th = int(tw * imgs[0][1].height / imgs[0][1].width)
        n = len(imgs)
        c = 2 if n > 1 else 1
        r = (n + c - 1) // c
        sheet = Image.new('RGB', (c * tw, r * (th + 20)), (30, 30, 30))
        dd = ImageDraw.Draw(sheet)
        for k, (t, im) in enumerate(imgs):
            x, y = (k % c) * tw, (k // c) * (th + 20)
            sheet.paste(im.resize((tw, th)), (x, y + 20))
            dd.text((x + 6, y + 3), f't={t:.2f}s', fill=(220, 220, 220))
        sheet.save(args.sheet)
        print('sheet', args.sheet)


def export(args):
    m = Music(data_path('music_map.json'))
    scenes = load_edition(args.edition)
    edit = scenes.build_edit(m)
    cols, rows = map(int, args.grid.split('x'))
    ras = Raster(cols, rows, args.font_size)
    W, H = ras.W - ras.W % 2, ras.H - ras.H % 2
    cv = Canvas(cols, rows)
    fps = args.export_fps
    t0, t1 = args.start, min(edit[-1][1], args.end or edit[-1][1])
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(fps), '-i', '-']
    if args.audio:
        cmd += ['-ss', f'{t0:.3f}', '-i', args.audio, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '256k', '-af', 'apad', '-t', f'{t1 - t0:.3f}']
    cmd += ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', args.export]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    n = int((t1 - t0) * fps)
    tic = time.time()
    for i in range(n):
        t = t0 + i / fps
        scenes.render(cv, m, t, edit)
        im = ras.image(cv)
        if im.size != (W, H):
            im = im.crop((0, 0, W, H))
        ff.stdin.write(im.tobytes())
        if i % (fps * 10) == 0:
            el = time.time() - tic
            print(f'{i}/{n} frames  {el / (i + 1):.3f}s/frame', file=sys.stderr)
    ff.stdin.close()
    ff.wait()
    print('wrote', args.export)


def main():
    ap = argparse.ArgumentParser(description='LOVE STORY — terminal edition')
    ap.add_argument('--edition', choices=sorted(EDITIONS), default='eternity',
                    help='eternity: the Eternity Protocol edition, Core_Juliet / Patch_Romeo (default; matrix is an alias); classic: the two-process edition')
    ap.add_argument('--seed', type=int, default=None,
                    help='easter-egg seed (matrix edition): a different seed gives a different set of pop-ups, walkers and panels; '
                         'default: random for live play, 0 for --stills/--export')
    ap.add_argument('--audio', help='path to the song file (not included)')
    ap.add_argument('--mute', action='store_true')
    ap.add_argument('--start', type=float, default=0.0, help='start time in seconds')
    ap.add_argument('--end', type=float, default=None)
    ap.add_argument('--fps', type=float, default=30.0)
    ap.add_argument('--sync', type=float, default=0.0, help='audio latency compensation in seconds (+ delays visuals)')
    ap.add_argument('--color', choices=['auto', 'true', '256'], default='auto')
    ap.add_argument('--stills', help='comma separated times → PNG stills')
    ap.add_argument('--sheet', help='contact sheet path for --stills')
    ap.add_argument('--outdir', default='build/tui_stills')
    ap.add_argument('--export', help='render an mp4 offline')
    ap.add_argument('--export-fps', type=int, default=24)
    ap.add_argument('--grid', default='160x45', help='columns x rows for offline rendering')
    ap.add_argument('--font-size', type=int, default=16)
    args = ap.parse_args()
    seed = args.seed if args.seed is not None else (0 if (args.stills or args.export) else int(time.time()) % 100000)
    try:
        from matrix import eggs as _eggs
        _eggs.set_seed(seed)
    except ImportError:
        pass
    if args.stills:
        stills(args)
    elif args.export:
        export(args)
    else:
        if not args.audio and not args.mute:
            here = os.path.dirname(os.path.abspath(__file__))
            guess = os.path.join(here, '..', 'assets', 'love_story.flac')
            if os.path.exists(guess):
                args.audio = guess
            else:
                args.mute = True
        play(args)


if __name__ == '__main__':
    main()

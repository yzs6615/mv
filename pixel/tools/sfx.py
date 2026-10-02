#!/usr/bin/env python3
"""8-bit sound effects for the pixel MV, synthesized with numpy and mixed under the song.

Reads the cue list the film exports (node pixel/render.mjs --cues -> pixel/build/cues.json): every
cue is {t, name, v (volume), p (pitch factor), dur}. Each name maps to a little synth recipe built
from square / triangle / noise channels with envelopes and pitch sweeps, like a game sound chip.
Musical effects (level up, item get, stage clear...) are in the song's key, B-flat major.

Output: pixel/build/audio/mix.wav (song + effects, limited) and sfx.wav (effects only).
"""
import argparse
import json
import os
import subprocess

import numpy as np

SR = 44100
rng_global = np.random.default_rng(7)


def n2f(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# B-flat major, MIDI numbers
Bb4, C5, D5, Eb5, F5, G5, A5, Bb5, C6, D6, Eb6, F6, G6, A6, Bb6 = 70, 72, 74, 75, 77, 79, 81, 82, 84, 86, 87, 89, 91, 93, 94
Bb3, D4, F4 = 58, 62, 65


def T(d):
    return np.arange(max(1, int(d * SR))) / SR


def phase(f, d):
    f = np.broadcast_to(np.asarray(f, dtype=np.float64), (len(T(d)),))
    return np.cumsum(2 * np.pi * f / SR)


def square(f, d, duty=0.5):
    ph = phase(f, d) / (2 * np.pi)
    return np.where((ph % 1.0) < duty, 1.0, -1.0) * 0.5


def tri(f, d):
    ph = phase(f, d) / (2 * np.pi)
    return (2 * np.abs(2 * (ph % 1.0) - 1) - 1) * 0.6


def sine(f, d):
    return np.sin(phase(f, d)) * 0.6


def noise(d, rate=SR, seed=None):
    """sample-and-hold noise at `rate` Hz (low rates sound like the NES noise channel)"""
    r = np.random.default_rng(seed if seed is not None else int(rng_global.integers(1 << 30)))
    n = len(T(d))
    step = max(1, int(SR / rate))
    v = r.uniform(-1, 1, n // step + 2)
    return np.repeat(v, step)[:n] * 0.5


def sweep(f0, f1, d, curve=1.0):
    k = np.linspace(0, 1, len(T(d))) ** curve
    return f0 * (f1 / f0) ** k


def env(d, a=0.003, decay=None, hold=0.0, r=0.02):
    n = len(T(d))
    t = T(d)
    e = np.ones(n)
    if a > 0:
        e = np.minimum(e, t / a)
    if decay:
        e *= np.exp(-np.maximum(0, t - a - hold) / decay)
    if r > 0:
        e *= np.clip((d - t) / r, 0, 1)
    return e


def lp(x, fc):
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def lp_fast(x, fc):
    """one-pole lowpass via scipy if available"""
    try:
        from scipy.signal import lfilter
        a = np.exp(-2 * np.pi * fc / SR)
        return lfilter([1 - a], [1, -a], x)
    except Exception:
        return lp(x, fc)


def hp_fast(x, fc):
    return x - lp_fast(x, fc)


def seq(parts):
    """concatenate (signal, gap_after) pairs"""
    out = []
    for sgl, gap in parts:
        out.append(sgl)
        if gap > 0:
            out.append(np.zeros(int(gap * SR)))
    return np.concatenate(out)


def mixat(base, sig, at):
    i = int(at * SR)
    if i >= len(base):
        return base
    j = min(len(base), i + len(sig))
    base[i:j] += sig[: j - i]
    return base


def blank(d):
    return np.zeros(len(T(d)))


def tone(m, d, kind='sq', duty=0.5, dec=None, a=0.002, vib=0.0):
    f = n2f(m)
    if vib:
        f = f * (1 + vib * np.sin(2 * np.pi * 6 * T(d)))
    w = square(f, d, duty) if kind == 'sq' else tri(f, d) if kind == 'tri' else sine(f, d)
    return w * env(d, a=a, decay=dec if dec else d * 0.6, r=0.01)


def arp(notes, step, kind='sq', duty=0.5, last=None, dec=None):
    s = blank(step * len(notes) + (last or step))
    for k, m in enumerate(notes):
        d = (last if (last and k == len(notes) - 1) else step) + 0.02
        mixat(s, tone(m, d, kind, duty, dec=dec or d * 0.7), k * step)
    return s


# ---------------------------------------------------------------- recipes
def fx_boot(p=1, **k):
    return arp([Bb4, F5, Bb5, D6], 0.07, 'sq', 0.25, last=0.5) * 0.6 + arp([Bb3, F4, Bb4, D5], 0.07, 'tri', last=0.5) * 0.5


def fx_tick(p=1, **k):
    return square(n2f(Bb6) * p, 0.03, 0.25) * env(0.03, decay=0.01) * 0.5


def fx_plip(p=1, **k):
    d = 0.14
    return sine(sweep(500 * p, 1600 * p, d, 0.6), d) * env(d, decay=0.05)


def fx_sprout(p=1, **k):
    d = 0.18
    return square(sweep(300 * p, 1100 * p, d), d, 0.25) * env(d, decay=0.07) * 0.6


def fx_bloom(p=1, **k):
    s = arp([Bb5, D6, F6, Bb6], 0.05, 'tri', last=0.6) * 0.7
    sp = fx_sparkle(p, n=6) * 0.6
    out = np.zeros(max(len(s), len(sp)))
    out[: len(s)] += s
    out[: len(sp)] += sp
    return out


def fx_shine(p=1, **k):
    s = blank(0.9)
    for i, m in enumerate([F6, Bb6, D6, F6, A6, Bb6]):
        mixat(s, tone(m + 12 * (p > 1.1), 0.25, 'tri', dec=0.08) * 0.5, i * 0.08)
    return s


def fx_start(p=1, **k):
    return arp([Bb5, F6], 0.06, 'sq', 0.5, last=0.25) * 0.7


def fx_iris(p=1, **k):
    d = 0.35
    return tri(sweep(200, 900, d, 0.7), d) * env(d, decay=0.15) * 0.5


def fx_step(p=1, **k):
    d = 0.05
    return (noise(d, 4000) * 0.6 + square(90 * p, d, 0.25) * 0.4) * env(d, decay=0.015)


def fx_step8(p=1, **k):
    d = 0.09
    s = noise(d, 9000) * env(d, decay=0.012) * 0.8 + square(sweep(260 * p, 140 * p, d), d, 0.25) * env(d, decay=0.03) * 0.7
    return s


def pad_to(x, d):
    n = len(T(d))
    return np.pad(x, (0, max(0, n - len(x))))[:n]


def fx_bonk(p=1, **k):
    d = 0.35
    return square(sweep(330, 70, d, 0.5), d, 0.5) * env(d, decay=0.12) * 0.8 + pad_to(noise(0.06, 3000) * env(0.06, decay=0.02), d)


def fx_buzz(p=1, **k):
    d = 0.35
    s = square(120, d, 0.1) * (0.5 + 0.5 * (np.sin(2 * np.pi * 37 * T(d)) > 0)) + noise(d, 2000) * 0.3
    return lp_fast(s, 3000) * env(d, decay=0.2) * 0.5


def fx_neon(p=1, **k):
    d = 0.6
    clunk = pad_to(noise(0.05, 1500) * env(0.05, decay=0.02), d)
    hum = square(119, d, 0.08) * env(d, a=0.05, decay=0.3) * 0.3
    return clunk * 0.8 + lp_fast(hum, 2500)


def fx_blinkall(p=1, **k):
    return arp([F6, Bb6], 0.05, 'tri', last=0.15) * 0.5


def fx_coin(p=1, **k):
    return seq([(tone(Bb5, 0.07, 'sq', 0.5, dec=0.5), 0), (tone(F6, 0.35, 'sq', 0.5, dec=0.12), 0)]) * 0.55


def fx_pop(p=1, **k):
    d = 0.08
    return square(sweep(900 * p, 300 * p, d), d, 0.5) * env(d, decay=0.03) * 0.6


def fx_question(p=1, **k):
    return seq([(tone(D5, 0.09, 'tri', dec=0.2), 0), (tone(A5, 0.25, 'tri', dec=0.12, vib=0.01), 0)]) * 0.9


def fx_scan(p=1, **k):
    d = 1.1
    f = sweep(400, 1400, d) * (1 + 0.03 * np.sign(np.sin(2 * np.pi * 18 * T(d))))
    return square(f, d, 0.25) * env(d, a=0.05, decay=0.8, r=0.1) * 0.25


def fx_error(p=1, **k):
    d = 0.18
    b = square(110, d, 0.5) * env(d, a=0.005, decay=0.5)
    return seq([(b, 0.06), (b, 0)]) * 0.6


fx_buzzer = fx_error


def fx_toss(p=1, **k):
    d = 0.35
    return hp_fast(noise(d, 20000), 1500) * env(d, a=0.15, decay=0.1) * 0.5 + tri(sweep(300, 800, d), d) * env(d, decay=0.15) * 0.3


def fx_boing(p=1, **k):
    d = 0.3
    f = 220 * p * (1 + 0.6 * np.exp(-8 * T(d)) * np.sin(2 * np.pi * 14 * T(d)))
    return tri(f, d) * env(d, decay=0.12)


def fx_itemget(p=1, **k):
    s = blank(1.5)
    mixat(s, arp([F5, Bb5, D6], 0.09, 'sq', 0.5, last=0.15) * 0.5, 0)
    mixat(s, arp([C6, D6, F6], 0.09, 'sq', 0.25, last=0.6, dec=0.4) * 0.5, 0.36)
    mixat(s, arp([Bb4, D5, F5], 0.09, 'tri', last=0.9) * 0.6, 0.36)
    return s


def fx_whoosh(p=1, **k):
    d = 0.8
    n = noise(d, 30000)
    lo = lp_fast(n, 600 + 2500 * p)
    return lo * env(d, a=0.3, decay=0.2, r=0.2) * 1.2


def fx_whip(p=1, **k):
    d = 0.45
    return hp_fast(noise(d, 30000), 800) * env(d, a=0.08, decay=0.1) * 0.8


def fx_blip(p=1, **k):
    d = 0.04
    return square(n2f(F6) * p, d, 0.25) * env(d, decay=0.015) * 0.5


def fx_machine(p=1, **k):
    s = blank(1.25)
    for i in range(10):
        mixat(s, noise(0.05, 2500 + 1500 * (i % 2)) * env(0.05, decay=0.015) * 0.8, i * 0.12)
        mixat(s, square(80 + 40 * (i % 3), 0.08, 0.3) * env(0.08, decay=0.03) * 0.5, i * 0.12 + 0.03)
    return s


def fx_ding(p=1, **k):
    d = 0.9
    f = n2f(F6) * p
    s = sine(f, d) + 0.4 * sine(f * 2.76, d) + 0.25 * sine(f * 5.4, d)
    return s * env(d, decay=0.25) * 0.6


def fx_surprise(p=1, **k):
    d = 0.12
    return square(sweep(700, 1700, d), d, 0.5) * env(d, decay=0.06) * 0.6


def fx_steam(p=1, **k):
    d = 0.8
    return hp_fast(noise(d, 30000), 3000) * env(d, a=0.02, decay=0.3) * 0.4


def fx_memory(p=1, **k):
    s = blank(1.6)
    notes = [Bb6, F6, D6, Bb5, F5, D5, Bb4]
    for i, m in enumerate(notes):
        mixat(s, tone(m + round(12 * np.log2(p)), 0.5, 'tri', dec=0.3) * 0.45, i * 0.07)
    return s


def fx_crawl(p=1, **k):
    d = 0.05
    return tri(260 * p, d) * env(d, decay=0.02) * 0.6


def fx_cold(p=1, **k):
    d = 0.9
    return sine(sweep(900, 120, d, 0.5), d) * env(d, decay=0.4) * 0.6 + lp_fast(noise(d, 20000), 1200) * env(d, a=0.2, decay=0.3) * 0.4


def fx_beep(p=1, **k):
    return tone(Bb5, 0.12, 'sq', 0.5, dec=0.5) * 0.6


def fx_go(p=1, **k):
    return tone(Bb6, 0.45, 'sq', 0.5, dec=0.4) * 0.6


def fx_gun(p=1, **k):
    d = 0.4
    return lp_fast(noise(d, 8000), 4000) * env(d, decay=0.07) * 1.0


def fx_slowmo(p=1, **k):
    d = 1.2
    return sine(sweep(300, 60, d, 0.5), d) * env(d, a=0.05, decay=0.5) * 0.8


def fx_heart(p=1, **k):
    def thump(a):
        d = 0.14
        return sine(sweep(90, 45, d), d) * env(d, decay=0.05) * a
    return seq([(thump(1.0), 0.06), (thump(0.7), 0)]) * 1.2


def fx_skid(p=1, **k):
    d = 0.45
    n = noise(d, 12000)
    return hp_fast(n, 1200) * env(d, a=0.01, decay=0.2) * 0.6 + square(sweep(700, 300, d), d, 0.125) * env(d, decay=0.15) * 0.15


def fx_turn(p=1, **k):
    d = 0.2
    return hp_fast(noise(d, 20000), 2000) * env(d, a=0.05, decay=0.06) * 0.5


def fx_dig(p=1, **k):
    d = 0.12
    return lp_fast(noise(d, 3000), 1800) * env(d, decay=0.04) * 1.0


def fx_pat(p=1, **k):
    d = 0.08
    return lp_fast(noise(d, 1500), 700) * env(d, decay=0.03) * 1.0


def fx_sparkle(p=1, n=8, **k):
    s = blank(0.2 + n * 0.06)
    r = np.random.default_rng(int(p * 1000) + n)
    for i in range(n):
        m = int(r.choice([F6, Bb6, D6, A6, C6])) + 12
        mixat(s, tone(m, 0.08, 'tri', dec=0.03) * 0.35, i * 0.055)
    return s


def fx_itempop(p=1, **k):
    return np.concatenate([fx_pop(1.3), fx_sparkle(1.0, 4) * 0.6])


def fx_drop(p=1, **k):
    d = 0.09
    return sine(sweep(700 * p, 1800 * p, d, 0.5), d) * env(d, decay=0.03) * 0.5


def fx_levelup(p=1, **k):
    s = blank(1.3)
    up = [Bb4, D5, F5, Bb5, D6, F6, Bb6]
    for i, m in enumerate(up):
        mixat(s, tone(m + round(12 * np.log2(p)), 0.12, 'sq', 0.25, dec=0.08) * 0.45, i * 0.055)
    mixat(s, tone(Bb5 + round(12 * np.log2(p)), 0.7, 'sq', 0.5, dec=0.35, vib=0.006) * 0.3, 0.4)
    mixat(s, tone(D6 + round(12 * np.log2(p)), 0.7, 'tri', dec=0.35) * 0.4, 0.4)
    return s


def fx_colorwave(p=1, **k):
    s = blank(1.6)
    for i, m in enumerate([Bb4, D5, F5, A5, Bb5, D6, F6, A6]):
        mixat(s, tone(m, 0.6, 'tri', dec=0.35) * 0.35, i * 0.09)
    return s


def fx_pops(p=1, **k):
    s = blank(1.0)
    for i in range(6):
        mixat(s, fx_pop(1 + i * 0.15) * 0.7, i * 0.12)
    return s


def fx_splash(p=1, **k):
    d = 0.3
    s = hp_fast(noise(d, 20000), 2500) * env(d, decay=0.08) * 0.5
    for i in range(3):
        mixat(s, fx_drop(1 + i * 0.3) * 0.6, 0.05 + i * 0.06)
    return s


def fx_sit(p=1, **k):
    return fx_pat() * 0.8


def fx_dayflip(p=1, **k):
    d = 0.06
    return square(n2f(F5) * p * 2, d, 0.25) * env(d, decay=0.02) * 0.5 + pad_to(noise(0.02, 6000) * 0.3, d)


def fx_warning(p=1, **k):
    s = blank(0.6)
    for i in range(4):
        mixat(s, tone(A5 if i % 2 == 0 else D6, 0.14, 'sq', 0.5, dec=0.5) * 0.4, i * 0.15)
    return s


def fx_wind(p=1, **k):
    d = 3.5
    n = noise(d, 30000)
    mod = 0.5 + 0.5 * np.sin(2 * np.pi * 0.7 * T(d)) * np.sin(2 * np.pi * 0.23 * T(d) + 1)
    return lp_fast(n, 900) * (0.3 + 0.7 * mod) * env(d, a=0.8, decay=None, r=0.8) * 1.2


def fx_thunder(p=1, **k):
    d = 2.4
    n = lp_fast(noise(d, 6000), 380)
    crack = pad_to(hp_fast(noise(0.15, 20000), 1500) * env(0.15, decay=0.04), d)
    rumble = n * env(d, a=0.04, decay=0.7) * (1 + 0.5 * np.sin(2 * np.pi * 3 * T(d)))
    return crack * 0.8 + rumble * 3.0


def fx_freeze(p=1, **k):
    d = 1.0
    return tri(sweep(1600, 200, d, 0.6), d) * env(d, decay=0.35) * 0.5


def fx_panel(p=1, **k):
    d = 0.18
    return (lp_fast(noise(d, 4000), 1500) * 1.2 + square(sweep(160 * p, 60, d), d, 0.5) * 0.4) * env(d, decay=0.05)


def fx_rainloop(p=1, dur=4.0, **k):
    d = max(0.5, float(dur))
    n = hp_fast(noise(d, 30000), 1800) * 0.45 + lp_fast(noise(d, 8000), 900) * 0.6
    s = n * env(d, a=0.4, decay=None, r=0.5)
    r = np.random.default_rng(3)
    for at in r.uniform(0, d - 0.1, int(d * 9)):
        mixat(s, fx_drop(r.uniform(0.8, 1.6)) * 0.12, at)
    return s


def fx_hit(p=1, **k):
    d = 0.25
    return square(sweep(600, 90, d, 0.6), d, 0.5) * env(d, decay=0.08) * 0.6 + pad_to(noise(0.08, 5000) * env(0.08, decay=0.03), d)


def fx_guts(p=1, **k):
    s = blank(1.2)
    mixat(s, arp([Bb4, F5, Bb5, D6, F6], 0.06, 'sq', 0.5, last=0.6) * 0.5, 0)
    mixat(s, tri(sweep(200, 800, 0.6), 0.6) * env(0.6, decay=0.3) * 0.4, 0)
    return s


def fx_sunbreak(p=1, **k):
    d = 2.6
    s = blank(d)
    for m in [Bb4, D5, F5, A5, C6]:
        mixat(s, tri(n2f(m) * (1 + 0.004 * np.sin(2 * np.pi * 5 * T(d))), d) * env(d, a=0.6, decay=1.4, r=0.4) * 0.22, 0)
    return s


def fx_flip(p=1, **k):
    d = 0.035
    return square(n2f(Bb6) * p, d, 0.25) * env(d, decay=0.012) * 0.45


def fx_hop(p=1, **k):
    d = 0.1
    return square(sweep(300 * p, 600 * p, d), d, 0.25) * env(d, decay=0.04) * 0.5


def fx_mapopen(p=1, **k):
    return arp([F5, Bb5, D6, F6], 0.05, 'tri', last=0.3) * 0.6


def fx_notice(p=1, **k):
    d = 0.14
    return square(n2f(D6) * p, d, 0.5) * env(d, decay=0.06) * 0.5


def fx_flap(p=1, **k):
    s = blank(1.0)
    for i in range(5):
        mixat(s, lp_fast(noise(0.08, 3000), 800) * env(0.08, decay=0.03) * 0.8, i * 0.18)
    return s


def fx_twinkle(p=1, **k):
    s = blank(0.5)
    for i, m in enumerate([Bb6, F6, D6 + 12]):
        mixat(s, tone(m + round(12 * np.log2(p)), 0.2, 'tri', dec=0.08) * 0.4, i * 0.06)
    return s


def fx_alarm(p=1, **k):
    d = 1.2
    f = 700 + 250 * np.sign(np.sin(2 * np.pi * 3 * T(d)))
    return square(f, d, 0.5) * env(d, a=0.02, decay=0.6) * 0.25


def fx_wave(p=1, **k):
    d = 0.9
    s = sine(n2f(F6) * p * (1 + 0.02 * np.sin(2 * np.pi * 9 * T(d))), d) * env(d, decay=0.35) * 0.4
    return s + tri(n2f(Bb5) * p, d) * env(d, decay=0.25) * 0.3


def fx_crack(p=1, **k):
    d = 0.2
    c = hp_fast(noise(d, 30000), 4000) * env(d, decay=0.03) * 1.0
    return c + sine(2800 + 600 * p, d) * env(d, decay=0.04) * 0.2


def fx_shatter(p=1, **k):
    d = 2.0
    s = hp_fast(noise(d, 30000), 2500) * env(d, decay=0.25) * 1.2
    r = np.random.default_rng(11)
    for at in np.cumsum(r.uniform(0.03, 0.12, 22)):
        if at < d - 0.2:
            mixat(s, sine(r.uniform(2500, 6000), 0.15) * env(0.15, decay=0.04) * 0.35, at)
    mixat(s, sine(sweep(120, 40, 0.5), 0.5) * env(0.5, decay=0.15) * 1.0, 0)
    return s


def fx_colorize(p=1, **k):
    d = 0.3
    return tri(sweep(500 * p, 1500 * p, d), d) * env(d, decay=0.1) * 0.4


def fx_bigbloom(p=1, **k):
    s = blank(2.0)
    mixat(s, fx_colorwave() * 0.8, 0)
    for m in [Bb4, D5, F5, Bb5]:
        mixat(s, tone(m, 1.6, 'tri', dec=0.8) * 0.25, 0.1)
    mixat(s, fx_sparkle(1.3, 10) * 0.7, 0.2)
    return s


def fx_get(p=1, **k):
    return arp([F5 + round(12 * np.log2(p)), Bb5 + round(12 * np.log2(p))], 0.06, 'sq', 0.25, last=0.2) * 0.45


def fx_fanfare(p=1, **k):
    s = blank(1.9)
    melody = [(F5, 0.15), (F5, 0.15), (F5, 0.15), (Bb5, 0.6), (C6, 0.15), (D6, 0.7)]
    at = 0
    for m, d in melody:
        mixat(s, tone(m, d + 0.03, 'sq', 0.5, dec=d) * 0.35, at)
        mixat(s, tone(m - 12, d + 0.03, 'tri', dec=d) * 0.35, at)
        at += d
    return s


def fx_combo(p=1, **k):
    d = 0.12
    return square(n2f(Bb5) * p, d, 0.25) * env(d, decay=0.05) * 0.4 + square(n2f(F6) * p, d, 0.5) * env(d, a=0.03, decay=0.04) * 0.2


def fx_allbloom(p=1, **k):
    s = blank(2.4)
    mixat(s, fx_bigbloom() * 0.9, 0)
    mixat(s, fx_pops() * 0.6, 0.05)
    return s


def fx_rainbow(p=1, **k):
    s = blank(1.6)
    notes = [Bb4, C5, D5, F5, G5, Bb5, C6, D6, F6, G6, Bb6]
    for i, m in enumerate(notes):
        mixat(s, tone(m, 0.5, 'tri', dec=0.25) * 0.3, i * 0.05)
    return s


def fx_jump(p=1, **k):
    d = 0.2
    return square(sweep(250 * p, 900 * p, d, 0.7), d, 0.25) * env(d, decay=0.08) * 0.5


def fx_card(p=1, **k):
    return np.concatenate([fx_turn() * 0.7, fx_tick(p) * 1.2])


def fx_clear(p=1, **k):
    s = blank(2.8)
    run = [Bb4, C5, D5, Eb5, F5, G5, A5, Bb5]
    for i, m in enumerate(run):
        mixat(s, tone(m, 0.09, 'sq', 0.5, dec=0.1) * 0.35, i * 0.06)
    at = len(run) * 0.06
    for m in [D5, F5, Bb5, D6]:
        mixat(s, tone(m, 1.9, 'sq' if m == D6 else 'tri', 0.25, dec=0.9, vib=0.005) * 0.25, at)
    mixat(s, tone(Bb3, 1.9, 'tri', dec=1.0) * 0.4, at)
    return s


FX = {k[3:]: v for k, v in globals().items() if k.startswith('fx_')}
FX['buzzer'] = fx_error


# ---------------------------------------------------------------- mixing
def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ar', str(SR), '-ac', '2', '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)


def write_wav(path, x):
    x = np.clip(x, -1, 1)
    pcm = (x * 32767).astype(np.int16)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(SR), '-ac', '2', '-i', '-', path], input=pcm.tobytes(), check=True)


def limit(x, ceil=0.95, release=0.08):
    peak = np.max(np.abs(x), axis=1)
    g = np.minimum(1.0, ceil / np.maximum(peak, 1e-9))
    # smooth: instant attack, exponential release (min-filter then one-pole up)
    from scipy.ndimage import minimum_filter1d
    g = minimum_filter1d(g, size=int(0.004 * SR))
    a = np.exp(-1 / (release * SR))
    try:
        from scipy.signal import lfilter
        # release smoothing on 1-g (gain reduction), keeping the attack instant
        red = 1 - g
        sm = lfilter([1 - a], [1, -a], red)
        red = np.maximum(red, sm)
        g = 1 - red
    except Exception:
        pass
    return x * g[:, None]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cues', default='pixel/build/cues.json')
    ap.add_argument('--song', default='assets/song.mp3')
    ap.add_argument('--out', default='pixel/build/audio')
    ap.add_argument('--gain', type=float, default=0.42, help='effects bus level under the song')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    cues = json.load(open(a.cues))
    song = decode(a.song)
    n = max(len(song), int(279 * SR))
    bus = np.zeros((n, 2))
    missing = set()
    r = np.random.default_rng(5)
    for c in cues:
        name = c['name']
        f = FX.get(name)
        if f is None:
            missing.add(name)
            continue
        s = f(p=c.get('p', 1.0), dur=c.get('dur', 4.0)).astype(np.float64)
        v = c.get('v', 1.0)
        pan = float(np.clip(r.normal(0, 0.15), -0.4, 0.4))
        i = int(c['t'] * SR)
        j = min(n, i + len(s))
        if i >= n:
            continue
        bus[i:j, 0] += s[: j - i] * v * (1 - pan) * 0.5 * 2
        bus[i:j, 1] += s[: j - i] * v * (1 + pan) * 0.5 * 2
    if missing:
        print('no recipe for:', ', '.join(sorted(missing)))
    sfx = bus * a.gain
    write_wav(os.path.join(a.out, 'sfx.wav'), limit(sfx.copy(), 0.95))
    mix = np.zeros((n, 2))
    mix[: len(song)] += song
    mix += sfx
    mix = limit(mix, 0.97)
    write_wav(os.path.join(a.out, 'mix.wav'), mix)
    print(f'{len(cues)} cues, {len(FX)} recipes -> {a.out}/mix.wav ({n / SR:.2f} s)')


if __name__ == '__main__':
    main()

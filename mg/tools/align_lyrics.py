#!/usr/bin/env python3
"""Map the corrected lyric text back onto the recognizer's timestamps.

Inputs
  mg/data/lyrics.txt        corrected lines, grouped by section (local only)
  mg/build/asr/asr_raw.json SenseVoice output with one timestamp per character
  mg/build/asr/vocals.wav   vocal stem (onsets and line endings)
  mg/data/music_map.json    sections, beat grid
Output
  mg/data/lyrics.json       lines with per-character onset times (local only)

Steps: global sequence alignment of corrected units vs recognized units; matched units take the
recognizer time, the rest are interpolated (pickups before a line get one eighth note each); every
time then snaps to the nearest sung onset within 120 ms; line ends come from the vocal envelope.
"""
import argparse
import difflib
import json
import re

import librosa
import numpy as np

CJK = re.compile(r"[㐀-鿿]")


def units_of(text):
    """'春夏 秋冬 Hello world' -> [('春',False),('夏',True),('秋',False),('冬',True),('Hello',False),('world',False)].
    The flag marks a visual break (a space in the text) after the unit."""
    out = []
    for tok in re.findall(r"[A-Za-z']+|[㐀-鿿]| ", text):
        if tok == " ":
            if out:
                out[-1] = (out[-1][0], True)
        else:
            out.append((tok, False))
    return out


def key(u):
    return u if CJK.match(u) else "#" + u[:2].lower()


def parse_lyrics(path):
    secs, order, cur = {}, [], None
    for raw in open(path, encoding="utf-8"):
        line = raw.strip()
        head = re.fullmatch(r"#\s*([A-Za-z0-9_]+)", line)
        if head:
            cur = head.group(1)
            order.append(cur)
            secs[cur] = []
        elif not line or line.startswith("#"):
            continue  # blank or comment
        elif line.startswith("="):
            secs[cur] = list(secs[line[1:].strip()])
        else:
            secs[cur].append(line)
    return [(s, l) for s in order for l in secs[s]]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lyrics", default="mg/data/lyrics.txt")
    ap.add_argument("--asr", default="mg/build/asr/asr_raw.json")
    ap.add_argument("--vocals", default="mg/build/asr/vocals.wav")
    ap.add_argument("--map", default="mg/data/music_map.json")
    ap.add_argument("--out", default="mg/data/lyrics.json")
    a = ap.parse_args()

    mm = json.load(open(a.map))
    eighth = mm["beat"] / 2
    lines = parse_lyrics(a.lyrics)
    U = []  # flat list of (line index, unit, brk)
    for li, (_, text) in enumerate(lines):
        for u, brk in units_of(text):
            U.append((li, u, brk))

    asr = [(tok.strip(), t) for seg in json.load(open(a.asr)) for tok, t in zip(seg["tokens"], seg["ts"])
           if tok.strip() and not re.fullmatch(r"[，。？！、,.?!]", tok.strip())]
    sm = difflib.SequenceMatcher(a=[key(u) for _, u, _ in U], b=[key(u) for u, _ in asr], autojunk=False)
    T = [None] * len(U)
    for blk in sm.get_matching_blocks():
        for k in range(blk.size):
            T[blk.a + k] = asr[blk.b + k][1]
    matched = sum(t is not None for t in T)

    # interpolate gaps inside a line, pickups at line start, tails at line end
    for li in range(len(lines)):
        ids = [i for i, (l, _, _) in enumerate(U) if l == li]
        known = [i for i in ids if T[i] is not None]
        if not known:
            raise SystemExit(f"line {li} has no recognized units: {lines[li][1]}")
        for i in ids:
            if T[i] is not None:
                continue
            prev = [k for k in known if k < i]
            nxt = [k for k in known if k > i]
            if prev and nxt:
                p, n = prev[-1], nxt[0]
                T[i] = T[p] + (T[n] - T[p]) * (i - p) / (n - p)
            elif nxt:
                T[i] = T[nxt[0]] - eighth * (nxt[0] - i)
            else:
                T[i] = T[prev[-1]] + eighth * (i - prev[-1])

    # snap to sung onsets
    y, sr = librosa.load(a.vocals, sr=22050, mono=True)
    hop = 128
    oenv = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop, n_mels=64, fmax=8000, lag=2, max_size=3)
    ons = librosa.onset.onset_detect(onset_envelope=oenv, sr=sr, hop_length=hop, units="time", delta=0.04, wait=4)
    for i, t in enumerate(T):
        j = int(np.argmin(np.abs(ons - t)))
        if abs(ons[j] - t) < 0.12:
            T[i] = float(ons[j])
    for i in range(1, len(T)):  # keep order inside a line, at least 60 ms apart
        if U[i][0] == U[i - 1][0] and T[i] < T[i - 1] + 0.06:
            T[i] = T[i - 1] + 0.06

    # line endings from the vocal envelope (20 dB under the line's peak, or the next line)
    rhop = 220
    rms = librosa.feature.rms(y=y, frame_length=1024, hop_length=rhop)[0]
    rt = np.arange(len(rms)) * rhop / sr
    db = 20 * np.log10(rms + 1e-9)
    secs = mm["sections"]

    def section_at(t):
        for s in secs:
            if s["start"] <= t < s["end"]:
                return s["id"]
        return secs[-1]["id"]

    out = []
    for li, (sec, text) in enumerate(lines):
        ids = [i for i, (l, _, _) in enumerate(U) if l == li]
        t0, tl = T[ids[0]], T[ids[-1]]
        nxt = T[ids[-1] + 1] if ids[-1] + 1 < len(U) else tl + 3
        m = (rt >= t0) & (rt <= tl + 0.3)
        peak = db[m].max()
        after = np.where((rt > tl + 0.12) & (db < peak - 20))[0]
        t1 = rt[after[0]] if len(after) else tl + 1.0
        t1 = float(min(t1, nxt - 0.04, tl + 2.2))
        chars = []
        for n, i in enumerate(ids):
            end = T[ids[n + 1]] if n + 1 < len(ids) else t1
            chars.append(dict(c=U[i][1], t=round(T[i], 3), d=round(max(0.05, end - T[i]), 3), brk=U[i][2]))
        out.append(dict(i=li, section=sec, songSection=section_at(t0 + 0.2), text=text,
                        t0=round(t0, 3), t1=round(t1, 3), chars=chars))
        print(f"{li:2d} {sec:9s} {t0:7.2f}-{t1:7.2f}  {text}")

    # la-la outro: syllable onsets + rough melody so the tail can be animated note by note
    outro = next(s for s in secs if s["id"] == "outro")
    la = [round(float(t), 3) for t in ons if outro["start"] + 4 < t < mm["end"]["lastVocal"]]
    json.dump(dict(lines=out, outroSyllables=la, matched=matched, units=len(U)),
              open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"matched {matched}/{len(U)} units; {len(la)} outro syllables -> {a.out}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Music map for LOVE STORY — Op. 5.5
----------------------------------
Analyses the song once and writes engine/data/music_map.json, the single source of
musical truth for the renderer (cuts, camera beats, light pulses) and the sound design.

Only numbers are exported (beat grid, sections, envelopes); no audio or lyric content.

Findings (verified 2026-10-01 against the supplied FLAC, 236.27 s):
  * constant tempo 119.01 BPM (click-tracked), beat period 0.50415675 s
  * first beat 0.18993 s, downbeat phase 0 (chord changes + kick on beats 1/3)
  * D major; modulation to E major lands on the downbeat of bar 94 (189.75 s)
  * sections by self-similarity (verse 2 / chorus 2 repeat verse 1 / chorus 1 at a 26-bar lag)
"""
import json, os, sys
import numpy as np
import librosa

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets', 'love_story.flac')
OUT = os.path.join(ROOT, 'engine', 'data', 'music_map.json')
FPS = 24

PERIOD = 0.50415675          # seconds per beat (least-squares fit over 421 tracked beats)
T0 = 0.18993                 # first downbeat
BAR = 4 * PERIOD

# (id, first bar, end bar (exclusive), description) — bars counted from T0
SECTIONS = [
    ('intro',    0,   8,  'solo guitar intro, delicate'),
    ('introB',   8,  16,  'band enters; dips at bar 12'),
    ('verse1',  16,  24,  'verse (repeats at bar 42)'),
    ('pre1',    24,  30,  'pre-chorus build'),
    ('chorus1', 30,  40,  'first chorus'),
    ('inter1',  40,  42,  'two-bar breath'),
    ('verse2',  42,  50,  'second verse'),
    ('pre2',    50,  56,  'second pre-chorus'),
    ('chorus2', 56,  66,  'second chorus'),
    ('post2',   66,  74,  'chorus material continues, high energy'),
    ('bridgeA', 74,  82,  'bridge, still driving'),
    ('bridgeB', 82,  89,  'bridge drops, intimate'),
    ('bridgeC', 89,  94,  'quietest passage, lift into modulation'),
    ('chorus3', 94, 102,  'KEY CHANGE to E major — climax'),
    ('chorus4', 102, 114, 'final chorus'),
    ('tail',   114, 117,  'last chord rings out'),
]
KEY_CHANGE_BAR = 94


def main():
    y, sr = librosa.load(SRC, sr=22050, mono=True)
    dur = len(y) / sr
    hop = 256

    # --- envelopes ---------------------------------------------------------
    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
    t_frames = librosa.frames_to_time(np.arange(S.shape[1]), sr=sr, hop_length=hop)

    def band(lo, hi):
        return S[(freqs >= lo) & (freqs < hi)].sum(axis=0)

    rms = librosa.feature.rms(S=S, frame_length=2048)[0]
    low = band(20, 140)
    high = band(3000, 9000)
    flux = librosa.onset.onset_strength(S=librosa.amplitude_to_db(S, ref=np.max), sr=sr, hop_length=hop)
    low_on = np.maximum(0, np.diff(low, prepend=low[0]))
    high_on = np.maximum(0, np.diff(high, prepend=high[0]))

    def resample(x, smooth=0.0):
        """sample feature at video frame times (max-pool over each frame window)"""
        n = int(np.ceil(dur * FPS))
        out = np.zeros(n)
        for i in range(n):
            a, b = i / FPS, (i + 1) / FPS
            m = (t_frames >= a) & (t_frames < b)
            out[i] = x[m].max() if m.any() else 0
        if smooth > 0:  # one-pole release, attack instant
            k = np.exp(-1.0 / (smooth * FPS))
            for i in range(1, n):
                out[i] = max(out[i], out[i - 1] * k)
        p = np.percentile(out, 99.5)
        return np.clip(out / (p + 1e-9), 0, 1)

    env = {
        'rms': resample(rms, 0.25),
        'low': resample(low_on, 0.12),
        'high': resample(high_on, 0.08),
        'onset': resample(flux, 0.10),
    }
    # slow "intensity" curve for grading decisions
    k = int(FPS * 2)
    inten = np.convolve(env['rms'], np.ones(k) / k, mode='same')
    env['intensity'] = inten / inten.max()

    onsets = librosa.onset.onset_detect(y=y, sr=sr, units='time', backtrack=False)

    nbars = int((dur - T0) / BAR) + 1
    bars = [round(T0 + BAR * i, 5) for i in range(nbars)]
    sections = [dict(id=s, bar0=a, bar1=b, start=round(T0 + a * BAR, 4), end=round(T0 + b * BAR, 4), note=d)
                for s, a, b, d in SECTIONS]

    # last audible sample (> -40 dBFS rms)
    loud = t_frames[rms > 0.01]
    data = dict(
        source=os.path.basename(SRC), duration=round(dur, 4), fps=FPS,
        bpm=round(60 / PERIOD, 4), beat=PERIOD, t0=T0, bar=BAR, beatsPerBar=4,
        bars=bars, sections=sections,
        keyChange=dict(bar=KEY_CHANGE_BAR, time=round(T0 + KEY_CHANGE_BAR * BAR, 4), from_='D major', to='E major'),
        lastAudible=round(float(loud.max()), 3),
        finalHit=round(float(onsets[-1]), 3),
        onsets=[round(float(o), 3) for o in onsets],
        env={k: [round(float(v), 3) for v in a] for k, a in env.items()},
    )
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as f:
        json.dump(data, f, separators=(',', ':'))
    print(f'wrote {OUT}: {nbars} bars, {len(onsets)} onsets, {len(env["rms"])} frames, final hit {data["finalHit"]}s')


if __name__ == '__main__':
    main()

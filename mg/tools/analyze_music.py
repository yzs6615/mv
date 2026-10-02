#!/usr/bin/env python3
"""Music map for the MG edition: beat grid, bars, sections, envelopes, vocal melody.

Findings that are baked in below (from a first pass over the song):
  * The track sits on a fixed 99 BPM grid. A linear fit over 414 tracked beats leaves a median error
    of about 4 ms, so every beat is computed from t0 and the period rather than read from the tracker.
  * Bars are 4/4, but the interlude after the first chorus is eight and a half bars long. Every
    lyric line before it starts on beat index 0 mod 4, every line after it on 2 mod 4. The half bar
    is placed on beats 216-217, right before verse 2 lands on the drop in the accompaniment.
  * Section boundaries are bar numbers taken from where the vocal phrases start.

Usage:
  python3 mg/tools/analyze_music.py --audio assets/song.mp3 --stems mg/build/asr --out mg/data/music_map.json
"""
import argparse
import json
import os
import subprocess
import tempfile

import librosa
import numpy as np

BPM = 99.0
SHIFT_BEAT = 216          # 2/4 bar here; downbeats move from 0 mod 4 to 2 mod 4
SECTIONS = [              # (id, first beat, end beat, note)
    ("hook", 0, 20, "a cappella-like hook over a light pickup bar"),
    ("intro", 20, 52, "instrumental intro, band in"),
    ("verse1", 52, 116, "verse 1, 8 lines of 2 bars"),
    ("pre1", 116, 148, "pre-chorus build"),
    ("chorus1", 148, 184, "chorus, 9 bars (one-bar lead-in line)"),
    ("interlude", 184, 218, "instrumental, 8.5 bars"),
    ("verse2", 218, 282, "verse 2 opens on a breakdown"),
    ("pre2", 282, 314, "pre-chorus build"),
    ("chorus2", 314, 350, "chorus"),
    ("coda", 350, 382, "final chorus variant, ends on 'Only one'"),
    ("outro", 382, 452, "la-la outro over the band"),
]
FPS = 50


def load(path, sr):
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, "in.wav")
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", path, "-ar", str(sr), "-ac", "1", wav], check=True)
        y, _ = librosa.load(wav, sr=sr, mono=True)
    return y


def fit_grid(acc, sr):
    hop = 256
    oenv = librosa.onset.onset_strength(y=acc, sr=sr, hop_length=hop, aggregate=np.median)
    _, beats = librosa.beat.beat_track(onset_envelope=oenv, sr=sr, hop_length=hop, tightness=400, units="time")
    per = 60.0 / BPM
    step = np.median(np.diff(beats))
    idx = np.concatenate([[0], np.cumsum(np.round(np.diff(beats) / step).astype(int))])
    t0 = float(np.median(beats[5:] - per * idx[5:]))
    res = beats[5:] - (t0 + per * idx[5:])
    print(f"grid: t0={t0:.4f}s period={per:.6f}s  |err| median {1000 * np.median(np.abs(res)):.1f} ms")
    return t0, per


def envelope(y, sr, n):
    hop = sr // FPS
    r = librosa.feature.rms(y=y, frame_length=2048, hop_length=hop, center=True)[0][:n]
    r = np.pad(r, (0, max(0, n - len(r))))
    return r / (np.percentile(r, 99) + 1e-9)


def q(a, d=3):
    return [round(float(x), d) for x in a]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", default="assets/song.mp3")
    ap.add_argument("--stems", default="mg/build/asr")
    ap.add_argument("--out", default="mg/data/music_map.json")
    a = ap.parse_args()

    sr = 22050
    mix = load(a.audio, sr)
    voc, _ = librosa.load(os.path.join(a.stems, "vocals.wav"), sr=sr, mono=True)
    acc, _ = librosa.load(os.path.join(a.stems, "accomp.wav"), sr=sr, mono=True)
    dur = len(mix) / sr

    t0, per = fit_grid(acc, sr)
    nbeats = int((dur - t0) / per) + 1
    beats = t0 + per * np.arange(nbeats)
    down = [b for b in range(0, SHIFT_BEAT + 1, 4)] + [b for b in range(SHIFT_BEAT + 2, nbeats, 4)]
    bars = [float(beats[b]) for b in down]

    n = int(dur * FPS) + 1
    env = dict(fps=FPS, mix=q(envelope(mix, sr, n)), voc=q(envelope(voc, sr, n)), acc=q(envelope(acc, sr, n)))
    # low band of the accompaniment (kick + bass) and a percussive "hit" list for accents
    S = np.abs(librosa.stft(acc, n_fft=2048, hop_length=sr // FPS))
    f = librosa.fft_frequencies(sr=sr, n_fft=2048)
    low = S[f < 150].sum(0)[:n]
    env["low"] = q(np.pad(low, (0, max(0, n - len(low)))) / (np.percentile(low, 99) + 1e-9))
    perc = librosa.effects.percussive(acc, margin=3.0)
    oenv = librosa.onset.onset_strength(y=perc, sr=sr, hop_length=256)
    hits = librosa.onset.onset_detect(onset_envelope=oenv, sr=sr, hop_length=256, units="time", delta=0.25, wait=8)
    strength = oenv[librosa.time_to_frames(hits, sr=sr, hop_length=256)]
    strength = strength / (np.percentile(strength, 95) + 1e-9)

    # vocal melody (MIDI, 0 = unvoiced) for type that floats with the tune
    f0, vflag, _ = librosa.pyin(voc, fmin=80, fmax=900, sr=sr, frame_length=2048, hop_length=sr // FPS)
    midi = np.where(vflag & np.isfinite(f0), librosa.hz_to_midi(np.nan_to_num(f0, nan=1.0)), 0.0)[:n]
    midi = np.pad(midi, (0, max(0, n - len(midi))))

    sections = [dict(id=s, start=round(float(beats[b0]) if b0 else 0.0, 4), end=round(float(beats[min(b1, nbeats - 1)]), 4),
                     beat0=b0, beat1=b1, note=note) for s, b0, b1, note in SECTIONS]
    out = dict(source=os.path.basename(a.audio), duration=round(dur, 4), bpm=BPM, beat=round(per, 6), t0=round(t0, 4),
               beats=q(beats, 4), bars=q(bars, 4), shiftBeat=SHIFT_BEAT, sections=sections,
               end=dict(lastVocal=274.0, stop=round(float(beats[452]), 4), silence=275.5),
               hits=[[round(float(t), 3), round(float(s), 2)] for t, s in zip(hits, strength)],
               env=env, pitch=dict(fps=FPS, midi=q(midi, 1)))
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "w") as fh:
        json.dump(out, fh, separators=(",", ":"))
    print(f"wrote {a.out}: {nbeats} beats, {len(bars)} bars, {len(hits)} hits, {dur:.2f}s")


if __name__ == "__main__":
    main()

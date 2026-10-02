#!/usr/bin/env python3
"""Vocal separation + lyric recognition for the MG edition.

Pipeline (all offline, sherpa-onnx):
  1. UVR MDX-Net (Voc_FT) splits the song into vocals / accompaniment.
  2. Silero VAD cuts the vocal stem into sung phrases.
  3. SenseVoice (CTC) transcribes each phrase and gives a timestamp per character.

The raw transcript is only a starting point: sung Chinese loses its tones, so the
recognizer confuses words that share syllables. The corrected text lives in
mg/data/lyrics.txt (local only) and align_lyrics.py maps it back onto these timestamps.

Models (GitHub releases of k2-fsa/sherpa-onnx):
  source-separation-models/UVR-MDX-NET-Voc_FT.onnx
  asr-models/silero_vad.onnx
  asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2

Usage:
  python3 mg/tools/transcribe.py --audio assets/song.mp3 --models /path/to/models --out mg/build/asr
"""
import argparse
import json
import os
import subprocess
import tempfile

import librosa
import numpy as np
import sherpa_onnx as so
import soundfile as sf


def load_stereo(path, sr=44100):
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, "in.wav")
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", path, "-ar", str(sr), "-ac", "2", wav], check=True)
        x, _ = sf.read(wav, dtype="float32", always_2d=True)
    return np.ascontiguousarray(x.T), sr


def separate(audio, models, out):
    cfg = so.OfflineSourceSeparationConfig(model=so.OfflineSourceSeparationModelConfig(
        uvr=so.OfflineSourceSeparationUvrModelConfig(model=os.path.join(models, "UVR-MDX-NET-Voc_FT.onnx")),
        num_threads=os.cpu_count() or 4))
    x, sr = load_stereo(audio)
    res = so.OfflineSourceSeparation(cfg).process(sample_rate=sr, samples=x)
    stems = [np.array(s.data) for s in res.stems]
    # The vocal stem is the one with (almost) no bass.
    def bass_share(st):
        m = st.mean(0)[: res.sample_rate * 60]
        spec = np.abs(librosa.stft(m, n_fft=2048))
        f = librosa.fft_frequencies(sr=res.sample_rate, n_fft=2048)
        return spec[f < 150].sum() / spec.sum()
    order = sorted(range(len(stems)), key=lambda i: bass_share(stems[i]))
    sf.write(os.path.join(out, "vocals.wav"), stems[order[0]].T, res.sample_rate)
    sf.write(os.path.join(out, "accomp.wav"), stems[order[1]].T, res.sample_rate)
    return stems[order[0]].mean(0), res.sample_rate


def vad_segments(v16, models):
    vc = so.VadModelConfig()
    vc.silero_vad.model = os.path.join(models, "silero_vad.onnx")
    vc.silero_vad.threshold = 0.35
    vc.silero_vad.min_silence_duration = 0.35
    vc.silero_vad.min_speech_duration = 0.25
    vc.silero_vad.max_speech_duration = 12
    vc.sample_rate = 16000
    vad = so.VoiceActivityDetector(vc, buffer_size_in_seconds=600)
    segs = []
    win = vc.silero_vad.window_size
    for i in range(0, len(v16), win):
        vad.accept_waveform(v16[i:i + win])
        while not vad.empty():
            segs.append((vad.front.start, np.array(vad.front.samples)))
            vad.pop()
    vad.flush()
    while not vad.empty():
        segs.append((vad.front.start, np.array(vad.front.samples)))
        vad.pop()
    return segs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--models", required=True)
    ap.add_argument("--out", default="mg/build/asr")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)

    vocals, sr = separate(a.audio, a.models, a.out)
    v16 = librosa.resample(vocals, orig_sr=sr, target_sr=16000).astype(np.float32)
    sv = os.path.join(a.models, "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17")
    rec = so.OfflineRecognizer.from_sense_voice(model=os.path.join(sv, "model.onnx"),
                                                tokens=os.path.join(sv, "tokens.txt"),
                                                num_threads=os.cpu_count() or 4, language="zh", use_itn=True)
    out = []
    for start, samples in vad_segments(v16, a.models):
        st = rec.create_stream()
        st.accept_waveform(16000, samples)
        rec.decode_stream(st)
        r = st.result
        t0 = start / 16000
        out.append(dict(start=round(t0, 3), end=round(t0 + len(samples) / 16000, 3), text=r.text,
                        tokens=list(r.tokens), ts=[round(t0 + t, 3) for t in r.timestamps]))
        print(f"{t0:7.2f}  {r.text}")
    with open(os.path.join(a.out, "asr_raw.json"), "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()

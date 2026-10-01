# Sound design & score — cue sheet

All sound except the song is synthesized in code (Python/NumPy/SciPy). The song (`assets/love_story.flac`,
44.1 kHz, 236.27 s, mastered) is placed **unaltered** at film time **44.000 s**. Film length: **306.0 s**.

Musical grid shared by everything: 119.0106 BPM, beat = 0.50415675 s, bar = 2.016627 s.
Downbeat of song bar *n* (n may be negative = prologue) = `44.18993 + 2.016627·n` (film seconds).
Song key: D major; modulates to **E major at 233.75 s** (bar 94). Song ends: last hit 273.60 s, ring-out to ~275.3 s.

Deliverables: `build/audio/mix.wav` (48 kHz, 24-bit stereo, exactly 306.0 s), stems in `build/audio/stems/`,
QA in `build/audio/qa/` (spectrograms of key cues, loudness report). Code in `audio/`.

## Mix rules
* Prologue/epilogue: cinematic, dynamic. Ambience beds around −32 LUFS short-term, the title hit should feel as big
  as the song's chorus (short-term loudness of the hit ≈ the song's loudest chorus), true peak ≤ −1 dBTP overall.
* During the song (44.0–275.3): SFX are **sparse, subtle accents**, mixed 18–26 dB under the song and side-chain
  ducked by the song's envelope. Nothing may mask the vocal; keep SFX energy out of 1–4 kHz where possible.
* Everything pitched must be consonant with the song: D major before 233.75 s, E major after.
* Never alter the song's audio (no EQ/compression/time-stretch); only resample 44.1→48 kHz with a high-quality
  resampler and place it sample-accurately.

## PROLOGUE (0–44 s)
| time (s) | cue | notes |
|---|---|---|
| 0.0–2.0 | room tone fade-in | dark, almost silent air |
| 0.3 → 40.16 | **sub drone** | D1+D2 (36.7/73.4 Hz) with slow beating, very low at first; grows into the title hit |
| 1.85 + 0.049057·k, k=1..53 | **typewriter keys** | card A, text `This story has been told for over four hundred years.` (53 chars incl. spaces/punctuation; spaces = softer thump). Cinematic, warm, intimate, not an office keyboard |
| 6.95 + 0.051515·k, k=1..33 | typewriter keys | card B, `It has always ended the same way.` (33 chars) |
| 9.4–11.9 | **letters dissolve into stars** | rising airy shimmer, granular sparkle gliding upward |
| 9.91 + 0.252078·i, i=0..12 | **constellation motif** (one note per star connection) | glass harmonica / celesta timbre, notes: D5 F#5 E5 A5 · B5 A5 F#5 E5 · D5 F#5 E5 A5 · D6 (the last one rings) — this is the film's *Opus motif* |
| 13.94 | ident completion | soft low bloom + shimmer swell under "OPUS 5.5 · presents" |
| 13.94–28.06 | night ambience | gentle wind, river water lapping; very low |
| 17.97–19.99 | tilt-down air swell | slow whoosh |
| 19.99 | **Verona bell** | single church bell strike in D (hum D3, prime D4, tierce F4, quint A4, nominal D5), long decay |
| 22.01 | floating 3D credit appears | faint airy shimmer |
| 24.02–34.11 | warm pad | D major add9, slow swell, strings-like (supersaw + filtering + reverb) |
| 28.06–40.16 | **clock tick on every beat** (28.06 + 0.50416·k) | the study's clock already ticks at the song's tempo; fade in |
| 28.06–34.11 | study ambience | candle flame flutter, a paper rustle at 29.5 |
| 34.11–40.16 | **riser** | reversed-cymbal + string crescendo + rising shimmer; the cursor of light "writes" (glassy scribble texture) |
| **40.16** | **TITLE HIT** | warm detuned brass stack on D (D2/A2/D3/A3) + sub boom + taiko + long hall tail; clock stops at the hit |
| 40.16–44.0 | tail | the hit decays under silence; the song enters at 44.0 |

## SONG (44.0–275.3) — accents only
| time (s) | cue |
|---|---|
| 44.3–45.4 | page turn (soft paper swish) |
| 45.0–50.0 | pop-up paper unfolding: 6 soft paper flaps at 45.20, 45.70, 46.21, 46.71, 47.22, 47.72 |
| 96.62 | fingertips touch: delicate high crystalline shimmer (quiet) |
| 104.69 | ballroom walls fold: soft low whoosh |
| 124.86–127.5 | shadow eclipse: low rumble swell |
| 185.35–188.2 | **paper tear**: long slow rip, moderately audible |
| 193.42–209.55 | ink rain bed (low) + thunder at 195.0, 199.1, 203.6, 206.5 (distant, rolling) |
| 209.55–223.67 | quiet wind outside the window, candle |
| 217.62–223.67 | pen scratching on paper (the couplet writes itself) |
| 231.74, 232.24 | two soft cursor ticks; 232.70 soft "select" click |
| **233.75** | **the rewrite strike**: bright swish of light + deep warm sub impact (felt, under the song) |
| 233.9–237.5 | eruption: ascending sparkle glissando |
| 245.85 | colour shockwave: soft airy impact |
| 249.89, 251.91, 253.92, 255.94 | **city bells** in E major (tuned major-third bells: hum E3, prime E4, tierce G#4, quint B4, nominal E5), sparse, panned, low |
| 266.0–273.6 | ascension shimmer; small sparkle swell at 273.60 |

## EPILOGUE (274.09–306)
| time (s) | cue |
|---|---|
| 276.0–281.0 | study room tone, candle; **book closes** with a soft thump at 279.50 (dust) |
| 281.4 + 0.059259·k, k=1..27 | typewriter keys: `Fate is only a first draft.` (27 chars) |
| 287.0–303.0 | **music box** plays the Opus motif in E major, slow (~66 BPM): E5 G#5 F#5 B5 · C#6 B5 G#5 F#5 · E5 G#5 F#5 B5 · E6, with a soft pad bed |
| 303.0 | the constellation glints one last time: echo of the motif's last note + a soft bell, long decay |
| 306.0 | silence |
